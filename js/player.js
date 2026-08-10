// ============================================================
// Player — จอนักเรียน (มือถือ)
// ============================================================

const Player = (() => {
  let code = null, R = null, pid = null, me = null;
  let meta = null, players = {}, roles = {}, alive = {}, sak = {};
  let goalP = 450, results = {}, votesAll = {}, actsAll = {}, fullHistory = {};
  let myRole = null, revealShown = false, lastPhaseKey = '', prevMetaPhase = null;
  let inboxKeys = new Set(), inboxMsgs = [], firstInbox = true;
  let chatCh = 'all', chatUnsub = null, chatOpen = false, unread = 0, chatCount = {};
  let unsubs = [], tickTimer = null, submitted = {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const alivePids = () => Object.keys(players).filter(p => alive[p]);

  // ---------------- เข้าร่วม ----------------
  async function join(roomCode, name, avatar) {
    code = roomCode; R = 'rooms/' + code;
    const m = await Net.once(R + '/meta');
    if (!m) throw 'ไม่พบห้องนี้ ตรวจสอบรหัสอีกครั้ง';
    const saveKey = 'ayn-p-' + code;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch (e) {}
    const existing = await Net.once(R + '/players');
    if (saved && existing && existing[saved.pid]) {
      pid = saved.pid; // กลับเข้าห้องเดิม (จำจากเครื่องนี้)
    } else {
      // หลุดแล้วกลับเข้าด้วย "ชื่อเดิม" — เสียบกลับตำแหน่ง/บทบาทเดิมได้แม้เกมเริ่มแล้ว
      const nameKey = name.trim().toLowerCase();
      const match = existing && Object.entries(existing).find(([, pl]) => (pl.name || '').trim().toLowerCase() === nameKey);
      if (match) {
        pid = match[0];
        localStorage.setItem(saveKey, JSON.stringify({ pid, name: match[1].name, avatar: match[1].avatar }));
      } else {
        if (m.state !== 'lobby') throw 'เกมเริ่มไปแล้ว — ถ้าเจ้าหลุดจากเกม ให้พิมพ์ "ชื่อเดิมให้ตรงเป๊ะ" เพื่อกลับเข้าตำแหน่งเดิม';
        if (existing && Object.keys(existing).length >= MAX_PLAYERS) throw 'ห้องเต็ม (40 คน)';
        pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await Net.set(R + '/players/' + pid, { name, avatar, ts: Net.now() });
        localStorage.setItem(saveKey, JSON.stringify({ pid, name, avatar }));
      }
    }
    location.hash = 'p' + code;
    bind();
  }

  function bind() {
    unsubs.push(
      Net.on(R + '/meta', v => {
        if (!v) { App.toast('ครูปิดห้องแล้ว'); setTimeout(() => location.href = location.pathname, 1500); return; }
        // เข้า "reveal" ใหม่ทุกครั้ง (เกมแรกหรือเริ่มใหม่หลังจบ) = รีเซ็ตธงที่บล็อกไม่ให้ popup/หน้าจบเกมโชว์ซ้ำ
        if (v.phase === 'reveal' && prevMetaPhase !== 'reveal') {
          revealShown = false; endShown = false;
          inboxKeys = new Set(); inboxMsgs = []; firstInbox = true;
        }
        prevMetaPhase = v.phase;
        meta = v; render();
      }),
      // เจอบั๊กจริงระหว่างเทสต์ฟีเจอร์ทายผีคืนนี้: ถ้าโหลดหน้าตอนตายอยู่แล้ว+กลางคืน แล้ว meta มาถึงก่อน players/alive จะโดน gate ของ render()
      // บล็อกไม่ให้ renderMain() รันซ้ำเลย เพราะ key ใช้ (alive[pid]?1:0) ซึ่งเป็น 0 เหมือนกันทั้งตอนข้อมูลยังไม่มาและตอนข้อมูลจริงมาแล้ว (คนนี้ตายจริง)
      // ต่างจากคนเป็นที่ค่าจะพลิกจาก 0→1 เมื่อข้อมูลจริงมาถึง ทำให้ได้ re-render รอบสองฟรีๆ — คนตายไม่มีโอกาสนั้นเลย ต้อง bypass gate ตรงๆ เฉพาะตอนกลางคืน+ตายอยู่
      Net.on(R + '/players', v => { players = v || {}; me = players[pid] || me; render(); if (meta && meta.phase === 'night' && !alive[pid]) renderMain(); }),
      Net.on(R + '/roles/' + pid, v => { if (v) { myRole = v; bindChat(); render(); } }),
      Net.on(R + '/roles', v => { roles = v || {}; }),
      Net.on(R + '/alive', v => { alive = v || {}; render(); if (meta && meta.phase === 'night' && !alive[pid]) renderMain(); }),
      Net.on(R + '/sak/' + pid, v => { sak[pid] = v; renderSak(); }),
      Net.on(R + '/winner', v => { if (v) showEnd(v); }),
      Net.on(R + '/private/' + pid, v => { onInbox(v); }),
      Net.on(R + '/goal', v => { if (v) goalP = v; }),
      Net.on(R + '/history', v => { fullHistory = v || {}; }), // ใช้สร้างประวัติการรักษาของแพทย์ย้อนหลัง
      // เรียก renderMain() ตรงๆ ไม่ใช่ render() — render() มี dedup gate (key ผูกกับ phase/night/day/alive/role เท่านั้น)
      // ถ้า results มาถึงหลัง render() รอบแรกไปแล้วโดย phase ไม่เปลี่ยน จะโดนกันไม่ให้ renderMain() รันซ้ำ ทำให้สรุปเช้า/ผลสืบสวนไม่โผล่เลย
      Net.on(R + '/results', v => { results = v || {}; if (meta && meta.phase === 'day') renderMain(); }),
      Net.on(R + '/votes', v => { votesAll = v || {}; updateVoteLive(); }),
      // โจรเห็นเป้าที่โจรคนอื่นเลือกไปแล้วแบบสด (กันเผลอเลือกซ้ำ — server กันซ้ำอยู่แล้วแต่โจรมองไม่เห็นกัน)
      Net.on(R + '/act', v => { actsAll = v || {}; updateStealLive(); }),
    );
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(renderTimer, 600);
    setupChatUI();
  }

  // ---------------- ข่าวลับ ----------------
  function onInbox(v) {
    const entries = Object.entries(v || {});
    const fresh = entries.filter(([k]) => !inboxKeys.has(k));
    entries.forEach(([k]) => inboxKeys.add(k));
    inboxMsgs = entries.map(([, m]) => m);
    if (firstInbox) { firstInbox = false; render(); return; }
    for (const [, m] of fresh) {
      // ผลสืบสวน: ผู้เล่นเห็นเอฟเฟกต์ไปแล้วทันทีตอนเลือกเป้า (submitInvestigate) — ข้อความลับนี้มาถึงไวมาก
      // (เขียนก่อนคัตซีนเงาของครูจะเล่นด้วยซ้ำ) ถ้าเด้งเอฟเฟกต์ซ้ำอีกจะรู้สึกไวเกินและชนจังหวะคัตซีน — เก็บลงประวัติเงียบๆ พอ
      if (m.text.includes('ผลสืบสวน')) continue;
      App.toast('📜 ' + m.text); Sound.chime();
    }
    render();
  }

  // ---------------- เรนเดอร์หลัก ----------------
  const PHASE_TH = { lobby: 'ห้องรอ', reveal: '🌌 คืนที่ 1 — รับบทบาท', night: '🌙 กลางคืน', day: '☀️ กลางวัน', vote: '🗳️ ลงมติ', end: '🏁 จบเกม', dawnfx: '🌅 รุ่งอรุณ...', duskfx: '🌆 พลบค่ำ...', nightfx: '🌙 ราตรีมาเยือน...' };
  function render() {
    if (!meta) return;
    if (meta.phase === 'lobby') { renderLobby(); return; }
    App.show('v-player');
    App.scene(meta.phase);
    let t = PHASE_TH[meta.phase] || '';
    if (meta.phase === 'night') t += ` คืนที่ ${meta.night}`;
    if (meta.phase === 'day' || meta.phase === 'vote') t += ` วันที่ ${meta.day}`;
    $('p-phase').textContent = t;
    renderSak();
    renderRoleStrip();
    const key = meta.phase + ':' + meta.night + ':' + meta.day + ':' + (alive[pid] ? 1 : 0) + ':' + (myRole || '');
    if (key !== lastPhaseKey) {
      lastPhaseKey = key; submitted = {}; renderMain();
      // แจ้งเตือนแรงๆ ตอนถึงตาต้องทำอะไร (เสียง+สั่น+เรืองแสง) — ช่วยเด็กที่เผลอวางมือถือ ไม่ต้องมานั่งเดา
      if (alive[pid] && ((meta.phase === 'night' && hasNightAction()) || meta.phase === 'vote')) {
        Sound.yourTurn();
        const badge = $('p-phase');
        badge.classList.remove('yourturn'); void badge.offsetWidth; badge.classList.add('yourturn');
      }
    }
    renderBoardArea();
  }
  function hasNightAction() {
    if (!myRole || myRole === 'mad' || myRole === 'slave' || myRole === 'serf') return false;
    if (myRole === 'thief') return true; // โจรทุกคนที่ยังไม่ตายมีแอ็กชันทุกคืน (เดิม: เฉพาะคนที่ถูกสุ่ม)
    if (myRole === 'lord') return !!meta.giftNight;
    return true; // enemy, doctor, noble, spy — มีแอ็กชันทุกคืนที่ยังไม่ตาย
  }

  function renderLobby() {
    App.show('v-plobby');
    App.scene('lobby');
    if (me) {
      $('pl-avatar').innerHTML = Art.avatar(me.avatar || 0);
      $('pl-name').textContent = me.name;
    }
    $('pl-count').textContent = `มาแล้ว ${Object.keys(players).length}/40 คน — รอครูเริ่มเกม`;
    const pp = $('pl-practice');
    if (pp) pp.onclick = () => { if (typeof Practice !== 'undefined') Practice.pick({ name: me && me.name, avatar: me && me.avatar }); };
    App.startExplainer();
  }

  function renderSak() {
    // กันชะโงก: ไม่โชว์ศักดินา/บทบาทบนแถบสาธารณะ (ศักดินา 0 = ศัตรู, 50000 = เจ้าเมือง เดาได้ทันที)
    $('p-sak').textContent = '';
  }

  function peekCardHtml() {
    const r = ROLES[myRole];
    const s = myRole === 'enemy' ? 'ไร้ศักดินา' : `${sak[pid] != null ? sak[pid] : r.sakdina} ไร่`;
    const head = r.portrait
      ? `<img class="portrait-img" src="${r.portrait}" alt=""><span class="portrait-badge">${Art.roleMedallion(myRole, 36)}</span>`
      : `<div class="medal">${Art.roleMedallion(myRole, 80)}</div>`;
    return `<div class="peek-card ${r.portrait ? 'has-portrait' : ''}" style="--tint:${r.color}">
      ${head}
      <h3 style="color:${r.color}">${r.name}</h3>
      <div class="cn">🏞️ ศักดินา ${s} • ป้ายสี: ${r.colorName}</div>
      <div class="ab">✨ ${r.ability}</div>
      ${r.warn ? `<div class="wr">⚠️ ${r.warn}</div>` : ''}
      ${teammatesHtml()}
    </div>`;
  }
  let peekOv = null, peekShownAt = 0, peekHideTimer = null;
  function renderRoleStrip() {
    const el = $('p-rolestrip');
    if (!myRole) { el.innerHTML = ''; return; }
    el.innerHTML = `<span class="rs-peek">🎭 กดค้างเพื่อดูบทบาทลับ</span>
      ${!alive[pid] ? '<span style="color:#ff8080">✝ ถูกกำจัดแล้ว</span>' : ''}`;
    const show = (e) => {
      e.preventDefault();
      if (peekOv) return;
      clearTimeout(peekHideTimer);
      peekOv = document.createElement('div');
      peekOv.className = 'peek-ov';
      peekOv.innerHTML = peekCardHtml();
      document.body.appendChild(peekOv);
      peekShownAt = Date.now();
    };
    // กันแตะไวเกินจนการ์ดวูบหายก่อนอ่านทัน — ค้างแสดงอย่างน้อย 650ms เสมอ
    const hide = () => {
      if (!peekOv) return;
      const remove = () => { if (peekOv) { peekOv.remove(); peekOv = null; } };
      const left = 650 - (Date.now() - peekShownAt);
      if (left <= 0) remove(); else peekHideTimer = setTimeout(remove, left);
    };
    el.onpointerdown = show;
    el.onpointerup = hide; el.onpointerleave = hide; el.onpointercancel = hide;
    el.oncontextmenu = (e) => e.preventDefault();
  }

  // ---------------- การ์ดบทบาท ----------------
  function teammatesHtml() {
    const r = ROLES[myRole];
    if (myRole === 'serf' || !myRole) return '';
    const mates = Object.keys(players).filter(p => p !== pid && roles[p] === myRole);
    if (!mates.length) return `<div class="teammates">เจ้าคือ${r.name}เพียงหนึ่งเดียว</div>`;
    return `<div class="teammates">พวกเดียวกับเจ้า (${r.colorName}): ` +
      mates.map(p => `<b style="--tint2:${r.color}">${esc(players[p].name)}${alive[p] ? '' : ' ✝'}</b>`).join(', ') + '</div>';
  }
  // การ์ดที่มี Character Key Art (ตอนนี้: เจ้าเมือง, คนบ้า) โชว์ภาพเต็มด้านบน+ตราไอคอนมุม
  // บทบาทที่ยังไม่มีภาพ ใช้ไอคอนวงกลมกลางการ์ดเหมือนเดิม
  function rcFrontInner(r) {
    const body = `<h2>${r.name}</h2><div class="cn">ป้ายสีประจำพวก: ${r.colorName}</div>
      <p>${r.desc}</p><div class="ab">✨ ${r.ability}</div>
      ${r.warn ? `<div class="wr">⚠️ ${r.warn}</div>` : ''}`;
    return r.portrait
      ? `<img class="portrait-img" src="${r.portrait}" alt=""><span class="portrait-badge">${Art.roleMedallion(r.id, 44)}</span><div class="portrait-body">${body}</div>`
      : `<div class="medal">${Art.roleMedallion(r.id, 110)}</div>${body}`;
  }
  function roleCardHtml(r) {
    return `<div class="reveal-wrap"><div class="reveal-card flip" style="--tint:${r.color}">
      <div class="rc-face rc-front ${r.portrait ? 'has-portrait' : ''}" style="--tint:${r.color}">
        ${rcFrontInner(r)}
      </div></div></div>` + teammatesHtml();
  }
  function showRoleCard(withFlip) {
    const r = ROLES[myRole];
    if (!r) return;
    if (withFlip) {
      // สับไพ่ก่อนเผยชะตา — ให้ความรู้สึกจับสลาก ก่อนค่อยเข้าสู่การ์ดจริงที่แตะเพื่อเปิด
      App.modal(`<div class="shuffle-wrap">
        <div class="shuffle-card sc1"></div><div class="shuffle-card sc2"></div><div class="shuffle-card sc3"></div>
        <div class="shuffle-txt">กำลังจับสลากชะตา...</div>
      </div>`);
      Sound.whoosh();
      setTimeout(() => {
        // การ์ดเปิดวาบเดียว: กด "รับชะตา" → พลิกการ์ด → โชว์แค่ชื่อ+สัญลักษณ์อาชีพสั้นๆ ~1 วิ → เลือนหายเอง
        // (รายละเอียดเต็ม/เพื่อนร่วมทีมยังดูซ้ำได้เสมอผ่านกดค้างที่แถบด้านบน — peekCardHtml)
        App.modal(`<div class="reveal-wrap"><div class="reveal-card" id="rvcard" style="--tint:${r.color}">
          <div class="rc-face rc-back"><div class="orn">๑๙๑</div><h2 style="color:var(--gold)">ชะตาของเจ้า</h2><p>กดปุ่มด้านล่างเพื่อรับชะตา<br>อย่าให้ใครเห็นหน้าจอ!</p></div>
          <div class="rc-face rc-front brief" style="--tint:${r.color}">
            <div class="medal">${Art.roleMedallion(r.id, 120)}</div><h2>${r.name}</h2>
          </div></div></div><button class="btn btn-gold w100" id="rv-accept">รับชะตา</button>`);
        const c = document.getElementById('rvcard');
        const reveal = () => {
          if (c.classList.contains('flip')) return;
          c.classList.add('flip');
          Sound.whoosh();
          const btn = document.getElementById('rv-accept');
          if (btn) btn.remove();
          setTimeout(() => {
            setTimeout(() => {
              const wrap = document.querySelector('.reveal-wrap');
              if (wrap) { wrap.style.transition = 'opacity 0.4s ease'; wrap.style.opacity = '0'; }
              setTimeout(() => App.closeModal(), 400);
            }, 1100);
          }, 1100);
        };
        c.onclick = reveal;
        document.getElementById('rv-accept').onclick = reveal;
      }, 1100);
    } else {
      App.modal(roleCardHtml(r) + '<button class="btn btn-ghost w100" onclick="App.closeModal()">ปิด</button>');
    }
  }

  // ---------------- ส่วนกลางจอ ----------------
  function trivia() {
    const f = NIGHT_FACTS[(meta.night * 3 + meta.day) % NIGHT_FACTS.length];
    return `<div class="trivia"><b>📜 เกร็ดกรุงศรี:</b> ${f}</div>`;
  }
  let revealTriviaTimer = null, revealTriviaIdx = 0;
  function startRevealTrivia() {
    clearInterval(revealTriviaTimer);
    const show = () => {
      const el = document.getElementById('reveal-trivia');
      if (!el) { clearInterval(revealTriviaTimer); return; } // ออกจากหน้านี้ไปแล้ว หยุดตัวเอง
      el.style.opacity = '0';
      setTimeout(() => {
        el.innerHTML = `<b>📜 เกร็ดกรุงศรี:</b> ${NIGHT_FACTS[revealTriviaIdx % NIGHT_FACTS.length]}`;
        el.style.opacity = '1';
        revealTriviaIdx++;
      }, 300);
    };
    show();
    revealTriviaTimer = setInterval(show, 6000);
  }
  function inboxPanel() {
    if (!inboxMsgs.length) return '';
    const last = inboxMsgs.slice(-3).reverse();
    return `<div class="trivia" style="border-color:var(--blue)"><b>🕊️ ข่าวลับของเจ้า:</b><br>` +
      last.map(m => `• ${esc(m.text)}`).join('<br>') + '</div>';
  }

  // ---------------- ผลสืบสวนสาธารณะ — ทุกคนรู้ตอนเช้า ไม่บอกว่าใครเป็นผู้สืบ ----------------
  function invLine(iv) {
    const t = players[iv.target] ? players[iv.target].name : '?';
    return iv.type === 'noble'
      ? `⚖️ ขุนนางสืบพบ: <b>${esc(t)}</b> ${iv.yes ? '<span style="color:var(--red)">⚠️ เป็นโจร!</span>' : '<span style="color:var(--green)">✔ ไม่ใช่โจร</span>'}`
      : `🕵️ จารชนสืบพบ: <b>${esc(t)}</b> ${iv.yes ? '<span style="color:var(--red)">⚠️ เป็นศัตรู!</span>' : '<span style="color:var(--green)">✔ ไม่ใช่ศัตรู</span>'}`;
  }
  function publicInvestigationHtml(res) {
    const list = res && res.investigations;
    if (!list || !list.length) return '';
    return `<div class="trivia" style="border-color:var(--gold)"><b>📯 ประกาศราชการ:</b><br>` +
      list.map(iv => `• ${invLine(iv)}`).join('<br>') + '</div>';
  }
  function showInvestigationHistory() {
    const nights = Object.keys(results).map(Number).sort((a, b) => a - b);
    const rows = [];
    nights.forEach(n => {
      const list = (results[n] && results[n].investigations) || [];
      list.forEach(iv => rows.push(`<div class="cmsg"><b style="color:var(--gold-dim)">คืนที่ ${n}</b> — ${invLine(iv)}</div>`));
    });
    App.modal(`<h2 class="panel-title sm">📜 ประวัติการสืบสวนทั้งหมด</h2>
      <div class="p-board" style="max-height:50dvh;overflow-y:auto;display:block">${rows.length ? rows.join('') : '<p class="p-note">ยังไม่มีผลสืบสวน</p>'}</div>
      <button class="btn btn-ghost w100" onclick="App.closeModal()">ปิด</button>`);
  }
  // ---------------- ประวัติการรักษาของแพทย์ (ลับเฉพาะตัวเอง — อาชีพจริงของทุกคนที่เคยรักษา) ----------------
  function showHealHistory() {
    // แคบลงตามที่ user ปรับ (2026-07-20) — โชว์แค่คืนที่เจอศัตรูจากการรักษาเท่านั้น ไม่ใช่ทุกอาชีพที่เคยรักษา
    const nights = Object.keys(fullHistory).map(Number).sort((a, b) => a - b);
    const rows = [];
    nights.forEach(n => {
      const t = fullHistory[n] && fullHistory[n].protects && fullHistory[n].protects[pid];
      if (!t || !players[t] || roles[t] !== 'enemy') return;
      rows.push(`<div class="cmsg"><b style="color:var(--gold-dim)">คืนที่ ${n}</b> — รักษา <b>${esc(players[t].name)}</b>: <b style="color:${ROLES.enemy.color}">เป็นศัตรู!</b></div>`);
    });
    App.modal(`<h2 class="panel-title sm">💊 ประวัติเจอศัตรูจากการรักษา</h2>
      <div class="p-board" style="max-height:50dvh;overflow-y:auto;display:block">${rows.length ? rows.join('') : '<p class="p-note">ยังไม่เคยเจอศัตรูจากการรักษาเลย</p>'}</div>
      <button class="btn btn-ghost w100" onclick="App.closeModal()">ปิด</button>`);
  }

  function renderMain() {
    const el = $('p-main');
    if (!meta || !myRole) { el.innerHTML = '<p class="p-note">กำลังรับบทบาท...</p>'; return; }
    if (meta.phase === 'end') return;
    if (!alive[pid]) {
      // คนตายตอนกลางคืน: ให้ทายว่าศัตรูจะเลือกฆ่าใคร (ไม่บังคับ) แทนจอนิ่งๆ — เฟสอื่นยังเป็นข้อความเดิม
      if (meta.phase === 'night') { renderGhostGuess(el); return; }
      el.innerHTML = `<div class="p-note">✝ เจ้าถูกกำจัดแล้ว... วิญญาณของเจ้ายังคงเฝ้ามองพระนคร<br>ดูเหตุการณ์ต่อได้ แต่ห้ามบอกใบ้เพื่อนเด็ดขาด!</div>${inboxPanel()}`;
      return;
    }
    switch (meta.phase) {
      case 'reveal':
        // ช่วงนี้ครูมักอธิบายกติกาปากเปล่านานหลายนาที — เดิมจอนิ่งสนิท เด็กเบื่อหยิบมือถือไปทำอื่น
        // แก้ด้วยเกร็ดความรู้หมุนอัตโนมัติ ให้มีอะไรอ่าน/รอดูต่อระหว่างฟังครู แทนจอว่างเปล่า
        el.innerHTML = `<div class="p-note" style="animation:revealFade 0.8s ease">${STORY.opening}</div>
          <p class="p-note" style="color:var(--gold)">ฟังครูแนะนำบทบาทแต่ละฝ่าย แล้วแตะแถบด้านบนเพื่อดูบทบาทของเจ้าอีกครั้งได้เสมอ</p>
          <button class="btn btn-gold w100" id="p-practice">🎯 ลองฝึกเล่นบทบาทของเจ้า (สั้นๆ ก่อนเริ่มจริง)</button>
          <div class="trivia" id="reveal-trivia"></div>`;
        const pb = $('p-practice');
        if (pb) pb.onclick = () => { if (typeof Practice !== 'undefined') Practice.start(myRole, { name: me && me.name, avatar: me && me.avatar }); };
        startRevealTrivia();
        if (!revealShown) { revealShown = true; setTimeout(() => showRoleCard(true), 600); }
        break;
      case 'night': renderNightAction(el); break;
      case 'day': {
        const loc = locationOfDay(meta.day);
        // สรุปเมื่อคืนแบบไอคอน อ่านแวบเดียวเข้าใจ
        const res = results[meta.night];
        const chips = res ? `<div class="morn-chips">
            ${res.deaths && res.deaths.length ? `<span class="mchip bad">☠️ เสียชีวิต ${res.deaths.length}</span>` : '<span class="mchip ok">🕊️ ไม่มีใครตาย</span>'}
            ${res.saved ? `<span class="mchip ok">💚 หมอช่วยไว้ ${res.saved}</span>` : ''}
            ${res.lordSaved ? '<span class="mchip ok">⚔️ องครักษ์ปกป้องเจ้าเมือง</span>' : ''}
            ${res.stealTotal ? `<span class="mchip warn">🪙 โจรปล้นได้ ${res.stealTotal} ไร่</span>` : ''}
            ${res.gifted ? '<span class="mchip">👑 เจ้าเมืองแจกศักดินา</span>' : ''}
          </div>` : '';
        // แพทย์ตายคืนนี้ = เปิดโปงศัตรูที่ฆ่าให้ทุกคนเห็นเลย (ไม่ต้องรอส่วนตัว)
        const doctorReveal = res && res.doctorReveal && players[res.doctorReveal.killer]
          ? `<div class="trivia" style="border-color:var(--red)"><b style="color:var(--red)">⚕️🔍 แพทย์เปิดโปงก่อนสิ้นใจ:</b> <b style="color:var(--red)">${esc(players[res.doctorReveal.killer].name)}</b> คือศัตรู!</div>`
          : '';
        // ผลสืบสวนคืนนี้ — ประกาศให้ทุกคนรู้ (ไม่บอกว่าใครเป็นผู้สืบ แค่บอกประเภทอาชีพ+เป้า+ผล)
        const invPublic = publicInvestigationHtml(res);
        // ข่าวลือจากไพร่ — ความเห็นหมู่มาก ไม่ใช่ข้อมูลยืนยัน แค่คนที่โดนชี้เยอะสุด
        const rumorHtml = res && res.rumor && players[res.rumor.target]
          ? `<div class="trivia" style="border-color:var(--silver)"><b>🗣️ ข่าวลือในหมู่บ้าน:</b> มีคนพูดถึง <b>${esc(players[res.rumor.target].name)}</b> กันเยอะเมื่อคืน... (ข่าวลือเฉยๆ อาจไม่จริงก็ได้)</div>`
          : '';
        const healHistBtn = myRole === 'doctor'
          ? '<button class="btn btn-ghost w100 btn-sm" id="btn-heal-history" style="margin:6px 0">💊 ดูประวัติเจอศัตรูจากการรักษา</button>' : '';
        el.innerHTML = `<div class="action-panel">${chips}${doctorReveal}${invPublic}${rumorHtml}
          <div class="action-title">☀️ วันที่ ${meta.day} ณ ${loc.name}</div>
          <div class="action-sub">${loc.hook}</div>
          <div class="trivia" style="margin:8px 0"><b>💡 รู้หรือไม่?</b> ${loc.fact}</div>
          <button class="btn btn-ghost w100 btn-sm" id="btn-inv-history" style="margin:6px 0">📜 ดูประวัติการสืบสวนทั้งหมด</button>
          ${healHistBtn}
          <div class="action-sub" style="color:var(--gold)">สนทนากับเพื่อนในแชท หาตัวผู้ต้องสงสัย ก่อนถึงเวลาลงมติ!</div></div>${inboxPanel()}`;
        const ihBtn = $('btn-inv-history');
        if (ihBtn) ihBtn.onclick = showInvestigationHistory;
        const hhBtn = $('btn-heal-history');
        if (hhBtn) hhBtn.onclick = showHealHistory;
        break;
      }
      case 'vote': renderVote(el); break;
      default: el.innerHTML = '<p class="p-note">...</p>';
    }
  }

  // ---------------- เลือกเป้าหมาย ----------------
  function computeVoteCounts() {
    if (!meta || meta.phase !== 'vote') return {};
    const dv = votesAll[meta.day] || {};
    const counts = {};
    for (const v in dv) (Array.isArray(dv[v]) ? dv[v] : []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    return counts;
  }
  // เป้าที่โจรคนอื่น (ไม่ใช่ตัวเอง) เลือกไปแล้วคืนนี้ — server กันซ้ำเป้าอยู่แล้ว (host.js) นี่แค่ให้โจรมองเห็นกันเฉยๆ
  function computeStealClaims() {
    if (!meta) return {};
    const st = (actsAll[meta.night] || {}).steal || {};
    const claims = {};
    for (const th in st) {
      if (th === pid) continue;
      (Array.isArray(st[th]) ? st[th] : []).forEach(t => { claims[t] = (claims[t] || 0) + 1; });
    }
    return claims;
  }
  function targetGrid(sel, opts) {
    const o = opts || {};
    const vc = o.showVoteCounts ? computeVoteCounts() : null;
    const claims = o.showStealClaims ? computeStealClaims() : null;
    const list = alivePids().filter(p => (o.includeSelf || p !== pid) && !(o.exclude || []).includes(p) && !((o.excludeRoles || []).includes(roles[p])));
    return list.map((p, i) => {
      const bc = badgeColor(myRole, roles[p]);
      const cnt = vc ? (vc[p] || 0) : 0;
      const claimed = claims ? claims[p] : 0;
      return `<div class="tgt selectable ${sel.has(p) ? 'sel' : ''} ${p === pid ? 'me' : ''}" data-t="${p}" style="--bcol:${bc};--bi:${i}">
        <span class="badge"></span>${Art.avatar(players[p].avatar || 0)}<div class="nm">${esc(players[p].name)}</div>
        ${cnt ? `<div class="votes">🗳️${cnt}</div>` : ''}
        ${claimed ? `<div class="votes">🔒 มีคนเลือกแล้ว</div>` : ''}</div>`;
    }).join('');
  }
  function bindPick(container, sel, max, onChange) {
    container.querySelectorAll('.tgt').forEach(t => {
      t.onclick = () => {
        const id = t.dataset.t;
        if (sel.has(id)) sel.delete(id);
        else { if (sel.size >= max) { if (max === 1) sel.clear(); else { App.toast(`เลือกได้สูงสุด ${max} คน`); return; } } sel.add(id); }
        Sound.tick(); onChange();
      };
    });
  }
  function actionUI(el, cfg) {
    const sel = new Set();
    const draw = () => {
      el.innerHTML = `<div class="action-panel"><div class="action-title">${cfg.title}</div>
        <div class="action-sub">${cfg.sub}</div>
        <div class="p-board">${targetGrid(sel, cfg)}</div>
        <div class="confirm-row">
          <button class="btn btn-gold w100" id="act-ok" ${sel.size === 0 && !cfg.allowEmpty ? 'disabled' : ''}>ยืนยัน (${sel.size}/${cfg.max})</button>
          ${cfg.skippable ? '<button class="btn btn-ghost" id="act-skip">ข้ามคืนนี้</button>' : ''}
        </div></div>${trivia()}${inboxPanel()}`;
      bindPick(el, sel, cfg.max, draw);
      el.querySelector('#act-ok').onclick = () => { cfg.submit([...sel]); };
      const sk = el.querySelector('#act-skip');
      if (sk) sk.onclick = () => cfg.submit('-');
    };
    draw();
    return draw;
  }
  async function submitAct(node, val, doneText) {
    await Net.set(`${R}/act/${meta.night}/${node}/${pid}`, val);
    submitted[node] = true;
    $('p-main').innerHTML = `<div class="done-note">✔ ${doneText}<br>รอรุ่งอรุณ...</div>${trivia()}${inboxPanel()}`;
    Sound.chime();
  }
  // สืบสวนแล้วรู้ผลทันที — คำนวณจาก roles ที่มีอยู่ในเครื่องอยู่แล้ว ไม่ต้องรอรุ่งอรุณ (เดิมต้องรอผลทางข้อความลับตอนเช้า)
  async function revealInvestigate(val, checkFn, yesText, noText) {
    if (val !== '-' && players[val]) {
      const yes = checkFn(val);
      await FX.play('investigate', { title: 'ผลการสืบสวน', name: players[val].name, yes, text: yes ? yesText : noText });
    }
  }
  async function submitInvestigate(node, val, checkFn, yesText, noText) {
    await Net.set(`${R}/act/${meta.night}/${node}/${pid}`, val);
    submitted[node] = true;
    await revealInvestigate(val, checkFn, yesText, noText);
    $('p-main').innerHTML = `<div class="done-note">✔ สืบสวนแล้ว รอรุ่งอรุณ...</div>${trivia()}${inboxPanel()}`;
    Sound.chime();
  }

  // ---------------- มินิเกมทาส: งานหนักยามค่ำคืน (ไม่บังคับ ไม่กันไม่ให้คืนเดินต่อ) ----------------
  function renderLaborGame(el) {
    // สุ่มความยาก/รางวัลใหม่ทุกคืน (5 หรือ 10 ไร่) กันเบื่อโดยไม่ต้องทำหลายมินิเกม — ยากขึ้นถ้ารางวัลเยอะขึ้น
    const reward = Math.random() < 0.5 ? 5 : 10;
    const target = reward === 10 ? (12 + Math.floor(Math.random() * 6)) : (6 + Math.floor(Math.random() * 5));
    let count = 0;
    let done = false;
    const draw = () => {
      el.innerHTML = `<div class="action-panel">
        <div class="action-title">🌾 ทำงานหนักคืนนี้ — แบกข้าวสาร ${target} กระสอบ</div>
        <div class="action-sub">แตะปุ่มให้ครบจำนวน ได้ศักดินาเพิ่ม ${reward} ไร่ (ไม่บังคับ ข้ามได้)</div>
        <div style="text-align:center;margin:24px 0">
          <div style="font-size:2.4rem;color:var(--gold);margin-bottom:14px" id="labor-count">${count} / ${target}</div>
          <button class="btn btn-gold" id="labor-tap" style="width:140px;height:140px;border-radius:50%;font-size:1.2rem">แตะ!</button>
        </div>
        <button class="btn btn-ghost w100" id="labor-skip">ข้ามคืนนี้</button>
      </div>${trivia()}${inboxPanel()}`;
      $('labor-tap').onclick = () => {
        if (done) return;
        count++;
        $('labor-count').textContent = `${count} / ${target}`;
        Sound.tick();
        if (count >= target) finish();
      };
      $('labor-skip').onclick = () => { if (!done) submitAct('labor', '-', 'ข้ามงานคืนนี้'); };
    };
    const finish = async () => {
      done = true;
      submitted.labor = true;
      await Net.set(`${R}/act/${meta.night}/labor/${pid}`, reward);
      $('p-main').innerHTML = `<div class="done-note">✔ ทำงานสำเร็จ! ได้ศักดินาเพิ่ม ${reward} ไร่<br>รอรุ่งอรุณ...</div>${trivia()}${inboxPanel()}`;
      Sound.coins();
    };
    draw();
  }

  // ---------------- วิญญาณผู้ตาย: ทายว่าศัตรูจะเลือกฆ่าใครคืนนี้ (ไม่บังคับ ไม่กระทบเกมจริง) ----------------
  function renderGhostGuess(el) {
    actionUI(el, {
      title: '👻 ทายว่าศัตรูจะเลือกฆ่าใครคืนนี้',
      sub: 'ทายถูกได้ 3 แต้มสะสมไปตอนจบเกม (ไม่บังคับ) — เฉลยตอนเช้า',
      max: 1, includeSelf: false, skippable: true,
      submit: (v) => submitAct('ghostGuess', v === '-' ? '-' : v[0], 'ส่งคำทายแล้ว'),
    });
  }

  function renderNightAction(el) {
    const n = meta.night;
    const doneWrap = (txt) => { el.innerHTML = `<div class="done-note">✔ ${txt}</div>${trivia()}${inboxPanel()}`; };
    switch (myRole) {
      case 'enemy': {
        const q = meta.killQuota || 1;
        actionUI(el, {
          title: `🩸 เลือกเหยื่อ (สังหารได้ ${q} คน)`,
          sub: 'เสียงมากสุดโดน คุยแผนในแชท "ฝ่ายศัตรู"',
          max: q, excludeRoles: ['enemy'], allowEmpty: true, skippable: false,
          submit: (v) => submitAct('enemyVotes', (Array.isArray(v) && v.length) ? v : '-', 'ส่งเสียงโหวตแล้ว'),
        });
        break;
      }
      case 'thief': {
        // โจรทุกคนที่ยังไม่ตายลงมือพร้อมกันทุกคืน (เดิม: สุ่ม 1 คนต่อคืน) — จำนวนเป้า/คนลดลงถ้ามีโจรพร้อมกันเยอะ กันปล้นรวมกันโหดเกิน
        const aliveThieves = Object.keys(roles).filter(p => roles[p] === 'thief' && alive[p]).length;
        const cap = perThiefTargets(aliveThieves || 1);
        stealRedraw = actionUI(el, {
          title: `🏴 เลือก ${cap} คนที่จะปล้น`,
          sub: `ได้คนละ 25 ไร่ (ไม่มีศักดินา=ได้ 0) — แชท "แก๊งโจร" กันเลือกซ้ำ — สะสมครบ ${goalP} ไร่ชนะ`,
          max: cap, excludeRoles: ['thief'], skippable: true, showStealClaims: true,
          submit: (v) => { stealRedraw = null; submitAct('steal', (v === '-' || !v.length) ? '-' : v, 'ลงมือปล้นแล้ว รอผลตอนเช้ามืด'); },
        });
        break;
      }
      case 'doctor':
        actionUI(el, {
          title: '🩺 เลือกคนที่จะรักษา',
          sub: 'เดาเอง ถ้าเขาโดนกำจัดคืนนี้จะรอด (เลือกตัวเองได้)',
          max: 1, includeSelf: true, skippable: true,
          submit: async (v) => {
            const t = v === '-' ? '-' : v[0];
            await Net.set(`${R}/act/${n}/protect/${pid}`, t);
            submitted.protect = true;
            // เดิมเปิดอาชีพจริงทุกครั้ง (รู้ครบทั้ง 9 อาชีพ) แรงเกินไป แย่งบทบาทจารชน/ขุนนางที่รู้แค่ใช่/ไม่ใช่ 1 อย่าง
            // แก้ให้แคบลง: เปิดเฉพาะกรณีเจอศัตรูเท่านั้น (ขอบเขตใกล้เคียงจารชน) นอกนั้นเงียบ ไม่มีเอฟเฟกต์อะไรเลย
            if (t !== '-' && t !== pid && roles[t] === 'enemy') {
              await FX.play('healReveal', { name: players[t].name, roleName: ROLES.enemy.name, roleColor: ROLES.enemy.color });
            }
            $('p-main').innerHTML = `<div class="done-note">✔ จัดยาสมุนไพรเฝ้าคุ้มครองแล้ว<br>รอรุ่งอรุณ...</div>${trivia()}${inboxPanel()}`;
            Sound.chime();
          },
        });
        break;
      case 'noble': {
        if (meta.execNight && !submitted.nobleInv) {
          // คืนประหาร: สืบก่อน แล้วค่อยเลือกประหาร
          actionUI(el, {
            title: '⚖️ ตรวจสอบ 1 คน',
            sub: 'คืนประหาร! สืบก่อนแล้วค่อยเลือกประหาร',
            max: 1, skippable: true,
            submit: async (v) => {
              const t = v === '-' ? '-' : v[0];
              await Net.set(`${R}/act/${n}/nobleInv/${pid}`, t);
              submitted.nobleInv = true;
              await revealInvestigate(t, (x) => roles[x] === 'thief' || roles[x] === 'mad', '⚠️ เป็นโจร!', '✔ ไม่ใช่โจร');
              renderNightAction(el);
            },
          });
        } else if (meta.execNight) {
          actionUI(el, {
            title: '🗡️ ประหารโจร (ชี้ผิด = เจ้าตายแทน!)',
            sub: 'เลือก 1 คน หรือข้ามถ้าไม่มั่นใจ',
            max: 1, skippable: true,
            submit: (v) => submitAct('nobleExec', v === '-' ? '-' : v[0], v === '-' ? 'คืนนี้เก็บดาบไว้ก่อน' : 'ลงดาบแล้ว... รอผลตอนเช้า'),
          });
        } else {
          actionUI(el, {
            title: '⚖️ ตรวจสอบ 1 คน — รู้ผลทันที',
            sub: `อีก ${(4 - (n % 4)) % 4 || 4} คืนถึงคืนประหาร — ผลประกาศตอนเช้า (ไม่มีใครรู้ว่าเจ้าคือผู้สืบ)`,
            max: 1, skippable: true,
            submit: (v) => submitInvestigate('nobleInv', v === '-' ? '-' : v[0], (x) => roles[x] === 'thief' || roles[x] === 'mad', '⚠️ เป็นโจร!', '✔ ไม่ใช่โจร'),
          });
        }
        break;
      }
      case 'spy':
        actionUI(el, {
          title: '🕵️ สืบศัตรู 1 คน — รู้ผลทันที',
          sub: 'ผลประกาศตอนเช้าด้วย (ไม่มีใครรู้ว่าเจ้าคือจารชน)',
          max: 1, skippable: true,
          submit: (v) => submitInvestigate('spyInv', v === '-' ? '-' : v[0], (x) => roles[x] === 'enemy' || roles[x] === 'mad', '⚠️ เป็นศัตรู!', '✔ ไม่ใช่ศัตรู'),
        });
        break;
      case 'lord': {
        if (meta.giftNight) {
          actionUI(el, {
            title: '👑 พระราชทานศักดินา 25 ไร่ (เลือก 1 คน)',
            sub: '⚠️ ถ้าให้โจร ศักดินาเข้าแก๊งโจรทันที',
            max: 1, skippable: true,
            submit: async (v) => {
              const t = v === '-' ? '-' : v[0];
              await Net.set(`${R}/act/${n}/gift/${pid}`, t);
              submitted.gift = true;
              if (t !== '-' && players[t]) await FX.play('gift', { text: `เจ้าได้พระราชทานศักดินา 25 ไร่ให้ ${players[t].name}` });
              $('p-main').innerHTML = `<div class="done-note">✔ พระราชทานเรียบร้อย<br>รอรุ่งอรุณ...</div>${trivia()}${inboxPanel()}`;
              Sound.chime();
            },
          });
        } else {
          doneWrap('คืนนี้พักผ่อน (แจกได้คืนเว้นคืน)<br>ระวังตัว — ถ้าเจ้าถูกกำจัด ศัตรูชนะทันที');
        }
        break;
      }
      case 'serf':
        actionUI(el, {
          title: '👁️ ใครน่าสงสัยที่สุด?',
          sub: 'ปรึกษาในแชท "ชาวบ้าน" — เสียงข้างมากกลายเป็นข่าวลือตอนเช้า (ไม่ใช่ข้อมูลยืนยัน)',
          max: 1, skippable: true,
          submit: (v) => submitAct('rumorVote', v === '-' ? '-' : v[0], 'ส่งความเห็นแล้ว'),
        });
        break;
      case 'slave':
        renderLaborGame(el);
        break;
      default:
        doneWrap(myRole === 'mad'
          ? '🤪 รอคอยในความเงียบ... ทำตัวน่าสงสัยให้โดนโหวตออกให้ได้ (นับจากวันที่ 2)'
          : '💤 หลับตารอข่าวยามเช้า');
    }
  }

  // ---------------- โหวต (ทุกคนเห็นสดว่าใครโหวตใคร) ----------------
  function voteLiveHtmlP() {
    if (!meta || meta.phase !== 'vote') return '';
    const dv = votesAll[meta.day] || {};
    const byTarget = {};
    for (const v in dv) (Array.isArray(dv[v]) ? dv[v] : []).forEach(t => { (byTarget[t] = byTarget[t] || []).push(v); });
    const nm = (p) => players[p] ? esc(players[p].name) : '?';
    const rows = Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length).map(([t, vs]) =>
      `<div class="vl-row"><b class="vl-target">${nm(t)}</b><span class="vl-count">${vs.length}</span><span class="vl-voters">← ${vs.map(nm).join(', ')}</span></div>`).join('');
    return `<div class="vl-wrap"><div class="vl-title">👁 มติสดของทั้งเมือง</div>${rows || '<div class="vl-row">ยังไม่มีใครลงมติ...</div>'}</div>`;
  }
  let stealRedraw = null;
  function updateStealLive() {
    if (stealRedraw) stealRedraw(); // รีเฟรชป้าย 🔒 ใต้รูปเป้าที่โจรคนอื่นเลือกไปแล้วแบบสด
  }
  let voteRedraw = null;
  function updateVoteLive() {
    const box = document.getElementById('p-votelive');
    if (box) box.innerHTML = voteLiveHtmlP();
    if (voteRedraw) voteRedraw(); // รีเฟรชตัวเลข 🗳️ ใต้รูปผู้เล่นในกริดเลือกเป้าหมายด้วย (แบบ Among Us)
    const vb = document.getElementById('p-voteboard'); // กริดแบบอ่านอย่างเดียวหลังลงมติแล้ว
    if (vb) vb.innerHTML = targetGrid(new Set(), { includeSelf: true, showVoteCounts: true });
  }
  function renderVote(el) {
    const q = meta.voteQuota || 1;
    voteRedraw = null;
    Net.once(`${R}/votes/${meta.day}/${pid}`).then(v => {
      if (v) {
        // ลงมติแล้ว — ยังคงเห็นตัวเลขโหวตใต้รูปแต่ละคนสดๆ (แบบ Among Us) ไม่ใช่แค่รายการตัวหนังสือ
        el.innerHTML = `<div class="done-note">✔ ลงมติแล้ว รอเพื่อนๆ...</div>
          <div class="p-board" id="p-voteboard">${targetGrid(new Set(), { includeSelf: true, showVoteCounts: true })}</div>
          <div id="p-votelive">${voteLiveHtmlP()}</div>${inboxPanel()}`;
        return;
      }
      el.innerHTML = '<div id="p-voteui"></div><div id="p-votelive">' + voteLiveHtmlP() + '</div>';
      voteRedraw = actionUI(el.querySelector('#p-voteui'), {
        title: `🗳️ ลงมติขับ (เลือก ${q} คน)`,
        sub: '⚠️ ทุกคนเห็นว่าใครโหวตใคร',
        max: q, allowEmpty: false, skippable: false, showVoteCounts: true,
        submit: async (v) => {
          await Net.set(`${R}/votes/${meta.day}/${pid}`, v);
          voteRedraw = null;
          el.innerHTML = `<div class="done-note">✔ ลงมติแล้ว รอเพื่อนๆ...</div><div id="p-votelive">${voteLiveHtmlP()}</div>`;
          Sound.chime();
        },
      });
    });
  }

  // ---------------- กระดานผู้เล่น (ล่าง) ----------------
  function renderBoardArea() {
    const el = $('p-board');
    if (!meta || meta.phase === 'end') { el.innerHTML = ''; return; }
    if (['night', 'vote'].includes(meta.phase) && alive[pid]) { el.innerHTML = ''; return; } // ช่วงเลือกเป้าหมาย กระดานอยู่ใน action panel แล้ว
    el.innerHTML = Object.entries(players).map(([p, pl], i) => {
      const bc = badgeColor(myRole, roles[p]);
      return `<div class="tgt ${alive[p] ? '' : 'dead'} ${p === pid ? 'me' : ''}" style="--bcol:${bc};--bi:${i}">
        <span class="badge"></span>${Art.avatar(pl.avatar || 0)}<div class="nm">${esc(pl.name)}</div></div>`;
    }).join('');
  }

  function renderTimer() {
    if (!meta) return;
    const el = $('p-timer');
    if (!meta.phaseEnds) { el.textContent = ''; return; }
    const s = Math.max(0, Math.floor((meta.phaseEnds - Net.now()) / 1000));
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', s <= 20);
  }

  // ---------------- จบเกม ----------------
  let endShown = false;
  function showEnd(w) {
    if (endShown) return;
    endShown = true;
    FX.play('win', { team: w.team, title: w.title, text: w.text, sad: false });
    const r = ROLES[myRole];
    const myTeamWon = r && ((w.team === r.team) || (w.team === 'mad' && myRole === 'mad'));
    setTimeout(async () => {
      // โหลดคะแนน (ครูเขียนไว้ก่อนประกาศผู้ชนะ)
      let scoreHtml = '';
      try {
        const scores = await Net.once(R + '/scores');
        if (scores) {
          const sorted = Object.entries(scores).sort((a, b) => b[1].total - a[1].total);
          const myRank = sorted.findIndex(([p]) => p === pid) + 1;
          const mine = scores[pid];
          scoreHtml = `<div class="action-panel" style="margin-top:10px">
            <div class="action-title">🏆 คะแนนของเจ้า: ${mine ? mine.total : 0} แต้ม (อันดับ ${myRank}/${sorted.length})</div>
            ${mine && mine.notes.length ? `<div class="action-sub">${mine.notes.map(esc).join('<br>')}</div>` : ''}
            <div class="action-sub" style="color:var(--gold)">${sorted.slice(0, 3).map(([, s], i) =>
              `${['🥇', '🥈', '🥉'][i]} ${esc(s.name)} — ${s.total} แต้ม`).join('<br>')}</div>
          </div>`;
        }
      } catch (e) {}
      $('p-main').innerHTML = `<div class="action-panel center">
        <h2 style="color:var(--gold);font-size:1.6rem">${w.title}</h2>
        <p class="action-sub">${w.text}</p>
        <p style="font-size:1.2rem;margin-top:8px">${myTeamWon ? '🎉 ฝ่ายของเจ้าชนะ!' : '😢 ฝ่ายของเจ้าพ่ายแพ้'}</p>
        <p class="action-sub">เจ้าคือ <b style="color:${r.color}">${r.name}</b></p></div>
        ${scoreHtml}
        <button class="btn btn-gold w100" onclick="location.href=location.pathname">กลับหน้าแรก</button>`;
      $('p-board').innerHTML = Object.entries(players).map(([p, pl]) => {
        const rr = ROLES[roles[p]];
        return `<div class="tgt ${alive[p] ? '' : 'dead'}" style="--bcol:${rr ? rr.color : '#888'}">
          <span class="badge"></span>${Art.avatar(pl.avatar || 0)}<div class="nm">${esc(pl.name)}</div>
          <div class="nm" style="color:${rr ? rr.color : '#888'}">${rr ? rr.name : ''}</div></div>`;
      }).join('');
    }, 3500);
  }

  // ---------------- แชท ----------------
  function setupChatUI() {
    $('chat-toggle').onclick = () => {
      chatOpen = !chatOpen;
      $('chat-panel').classList.toggle('hidden', !chatOpen);
      if (chatOpen) { unread = 0; updateUnread(); scrollChat(); }
    };
    $('chat-send').onclick = () => sendChat();
    $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    // ปุ่มข้อความด่วน — กดแล้วส่งทันที ช่วยให้เด็กคุยอยู่ในเนื้อเรื่องเกมโดยไม่ต้องพิมพ์เอง
    $('chat-quick').innerHTML = QUICK_CHAT.map((t, i) => `<button class="qc-btn" data-i="${i}">${esc(t)}</button>`).join('');
    $('chat-quick').querySelectorAll('.qc-btn').forEach(b => {
      b.onclick = () => sendChat(QUICK_CHAT[+b.dataset.i]);
    });
  }
  function bindChat() {
    // กันชะโงก: ทุกคนมี 2 แท็บหน้าตาเหมือนกันหมด — "ช่องรวม" + "ช่องลับ" สีเดียวกัน
    // คนมีทีมได้แชททีม คนไม่มีทีมได้สมุดลับส่วนตัว → มองข้างๆ แยกไม่ออกว่าใครอาชีพไหน
    const team = CHAT_CHANNELS.find(c => c.roles && c.roles.includes(myRole));
    const chans = [
      { id: 'all', name: '💬 ช่องรวม' },
      { id: team ? team.id : 'note-' + pid, name: '🔒 ช่องลับ' },
    ];
    if (chatCh !== 'all' && !chans.some(c => c.id === chatCh)) chatCh = 'all';
    $('chat-tabs').innerHTML = chans.map(c =>
      `<div class="chat-tab ${c.id === chatCh ? 'on' : ''}" data-ch="${c.id}" style="--tc:var(--silver)">${c.name}</div>`).join('');
    $('chat-tabs').querySelectorAll('.chat-tab').forEach(t => {
      t.onclick = () => { chatCh = t.dataset.ch; bindChat(); };
    });
    if (chatUnsub) chatUnsub();
    chatUnsub = Net.on(`${R}/chat/${chatCh}`, v => renderChat(v));
  }
  function renderChat(v) {
    const msgs = Object.values(v || {}).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-60);
    const el = $('chat-msgs');
    const prev = chatCount[chatCh] || 0;
    if (!chatOpen && msgs.length > prev) { unread += msgs.length - prev; updateUnread(); if (msgs.length > prev) Sound.tick(); }
    chatCount[chatCh] = msgs.length;
    el.innerHTML = msgs.map(m =>
      `<div class="cmsg ${m.pid === pid ? 'mine' : ''}"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('') ||
      (chatCh.startsWith('note-')
        ? '<div class="cmsg sys">🔒 สมุดลับส่วนตัวของเจ้า — จดข้อสงสัยได้ ไม่มีใครเห็นนอกจากเจ้า</div>'
        : '<div class="cmsg sys">ยังไม่มีข้อความ — เริ่มคุยกันเลย</div>');
    scrollChat();
  }
  function scrollChat() { const el = $('chat-msgs'); el.scrollTop = el.scrollHeight; }
  function updateUnread() {
    const b = $('chat-unread');
    b.classList.toggle('hidden', unread === 0);
    b.textContent = unread;
  }
  async function sendChat(presetText) {
    const inp = $('chat-input');
    const text = presetText || inp.value.trim();
    if (!text) return;
    if (!alive[pid] && meta && meta.phase !== 'lobby' && meta.phase !== 'end' && myRole) { App.toast('วิญญาณส่งเสียงไม่ได้...'); return; }
    // เดิม: เคลียร์กล่องพิมพ์ก่อน await เสมอ ไม่มี try/catch — ถ้า push พลาดไม่ว่าเหตุผลอะไร
    // ข้อความจะหายเงียบๆ ไม่มีอะไรแจ้งผู้เล่นเลย (ดูเหมือน "แชทไม่ทำงาน" ทั้งที่จริงคือส่งพลาดแค่ครั้งเดียว)
    try {
      await Net.ready();
      await Net.push(`${R}/chat/${chatCh}`, { pid, name: (me && me.name) || '?', text, ts: Net.now() });
      if (!presetText) inp.value = '';
    } catch (e) {
      console.error('ส่งแชทพลาด', e);
      App.toast('⚠️ ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  }

  // กลับเข้าเกมเดิมหลังรีเฟรชหน้า
  async function resume(codeArg) {
    code = codeArg; R = 'rooms/' + code;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('ayn-p-' + code) || 'null'); } catch (e) {}
    if (!saved) return false;
    const p = await Net.once(R + '/players/' + saved.pid);
    if (!p) return false;
    pid = saved.pid; me = p;
    bind();
    return true;
  }

  return { join, resume };
})();
