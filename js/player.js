// ============================================================
// Player — จอนักเรียน (มือถือ)
// ============================================================

const Player = (() => {
  let code = null, R = null, pid = null, me = null;
  let meta = null, players = {}, roles = {}, alive = {}, sak = {};
  let myRole = null, revealShown = false, lastPhaseKey = '';
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
      pid = saved.pid; // กลับเข้าห้องเดิม
    } else {
      if (m.state !== 'lobby') throw 'เกมเริ่มไปแล้ว ไม่สามารถเข้ากลางคันได้';
      if (existing && Object.keys(existing).length >= MAX_PLAYERS) throw 'ห้องเต็ม (40 คน)';
      pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await Net.set(R + '/players/' + pid, { name, avatar, ts: Net.now() });
      localStorage.setItem(saveKey, JSON.stringify({ pid, name, avatar }));
    }
    location.hash = 'p' + code;
    bind();
  }

  function bind() {
    unsubs.push(
      Net.on(R + '/meta', v => {
        if (!v) { App.toast('ครูปิดห้องแล้ว'); setTimeout(() => location.href = location.pathname, 1500); return; }
        meta = v; render();
      }),
      Net.on(R + '/players', v => { players = v || {}; me = players[pid] || me; render(); }),
      Net.on(R + '/roles/' + pid, v => { if (v && v !== myRole) { myRole = v; bindChat(); render(); } }),
      Net.on(R + '/roles', v => { roles = v || {}; }),
      Net.on(R + '/alive', v => { alive = v || {}; render(); }),
      Net.on(R + '/sak/' + pid, v => { sak[pid] = v; renderSak(); }),
      Net.on(R + '/winner', v => { if (v) showEnd(v); }),
      Net.on(R + '/private/' + pid, v => { onInbox(v); }),
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
      const yes = m.text.includes('⚠️');
      if (m.text.includes('ผลสืบสวน')) {
        FX.play('investigate', { title: 'ข่าวลับถึงเจ้า', name: '', yes, text: m.text });
      } else { App.toast('📜 ' + m.text); Sound.chime(); }
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
    const key = meta.phase + ':' + meta.night + ':' + meta.day + ':' + (alive[pid] ? 1 : 0) + ':' + (myRole || '') + ':' + (meta.activeThief || '');
    if (key !== lastPhaseKey) { lastPhaseKey = key; submitted = {}; renderMain(); }
    renderBoardArea();
  }

  function renderLobby() {
    App.show('v-plobby');
    App.scene('lobby');
    if (me) {
      $('pl-avatar').innerHTML = Art.avatar(me.avatar || 0);
      $('pl-name').textContent = me.name;
    }
    $('pl-count').textContent = `มาแล้ว ${Object.keys(players).length}/40 คน — รอครูเริ่มเกม`;
    App.startExplainer();
  }

  function renderSak() {
    const el = $('p-sak');
    if (!myRole) { el.textContent = ''; return; }
    el.innerHTML = myRole === 'enemy' ? '🗡️ ไร้ศักดินา' : `🏞️ ${sak[pid] != null ? sak[pid] : ROLES[myRole].sakdina} ไร่`;
  }

  function renderRoleStrip() {
    const el = $('p-rolestrip');
    if (!myRole) { el.innerHTML = ''; return; }
    const r = ROLES[myRole];
    el.innerHTML = `<span class="medal-sm">${Art.roleMedallion(myRole, 40)}</span>
      <span class="rs-name" style="color:${r.color}">${r.name}</span>
      ${!alive[pid] ? '<span style="color:#ff8080">✝ ถูกกำจัดแล้ว</span>' : ''}
      <span class="rs-hint">แตะดูบทบาท</span>`;
    el.onclick = () => showRoleCard(false);
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
  function roleCardHtml(r) {
    return `<div class="reveal-wrap"><div class="reveal-card flip" style="--tint:${r.color}">
      <div class="rc-face rc-front" style="--tint:${r.color}">
        <div class="medal">${Art.roleMedallion(r.id, 110)}</div>
        <h2>${r.name}</h2><div class="cn">ป้ายสีประจำพวก: ${r.colorName}</div>
        <p>${r.desc}</p><div class="ab">✨ ${r.ability}</div>
        ${r.warn ? `<div class="wr">⚠️ ${r.warn}</div>` : ''}
      </div></div></div>` + teammatesHtml();
  }
  function showRoleCard(withFlip) {
    const r = ROLES[myRole];
    if (!r) return;
    if (withFlip) {
      App.modal(`<div class="reveal-wrap"><div class="reveal-card" id="rvcard" style="--tint:${r.color}">
        <div class="rc-face rc-back"><div class="orn">๑๙๑</div><h2 style="color:var(--gold)">ชะตาของเจ้า</h2><p>แตะการ์ดเพื่อเปิดดูบทบาทลับ<br>อย่าให้ใครเห็นหน้าจอ!</p></div>
        <div class="rc-face rc-front" style="--tint:${r.color}">
          <div class="medal">${Art.roleMedallion(r.id, 110)}</div>
          <h2>${r.name}</h2><div class="cn">ป้ายสีประจำพวก: ${r.colorName}</div>
          <p>${r.desc}</p><div class="ab">✨ ${r.ability}</div>
          ${r.warn ? `<div class="wr">⚠️ ${r.warn}</div>` : ''}
        </div></div></div>${teammatesHtml()}<button class="btn btn-gold w100" onclick="App.closeModal()">รับชะตา</button>`);
      const c = document.getElementById('rvcard');
      c.onclick = () => { c.classList.add('flip'); Sound.whoosh(); };
    } else {
      App.modal(roleCardHtml(r) + '<button class="btn btn-ghost w100" onclick="App.closeModal()">ปิด</button>');
    }
  }

  // ---------------- ส่วนกลางจอ ----------------
  function trivia() {
    const f = NIGHT_FACTS[(meta.night * 3 + meta.day) % NIGHT_FACTS.length];
    return `<div class="trivia"><b>📜 เกร็ดกรุงศรี:</b> ${f}</div>`;
  }
  function inboxPanel() {
    if (!inboxMsgs.length) return '';
    const last = inboxMsgs.slice(-3).reverse();
    return `<div class="trivia" style="border-color:var(--blue)"><b>🕊️ ข่าวลับของเจ้า:</b><br>` +
      last.map(m => `• ${esc(m.text)}`).join('<br>') + '</div>';
  }

  function renderMain() {
    const el = $('p-main');
    if (!meta || !myRole) { el.innerHTML = '<p class="p-note">กำลังรับบทบาท...</p>'; return; }
    if (meta.phase === 'end') return;
    if (!alive[pid]) {
      el.innerHTML = `<div class="p-note">✝ เจ้าถูกกำจัดแล้ว... วิญญาณของเจ้ายังคงเฝ้ามองพระนคร<br>ดูเหตุการณ์ต่อได้ แต่ห้ามบอกใบ้เพื่อนเด็ดขาด!</div>${inboxPanel()}`;
      return;
    }
    switch (meta.phase) {
      case 'reveal':
        el.innerHTML = `<div class="p-note">${STORY.opening}</div><p class="p-note" style="color:var(--gold)">ฟังครูแนะนำบทบาทแต่ละฝ่าย แล้วแตะแถบด้านบนเพื่อดูบทบาทของเจ้าอีกครั้งได้เสมอ</p>`;
        if (!revealShown) { revealShown = true; setTimeout(() => showRoleCard(true), 600); }
        break;
      case 'night': renderNightAction(el); break;
      case 'day': {
        const loc = locationOfDay(meta.day);
        el.innerHTML = `<div class="action-panel"><div class="action-title">☀️ ${loc.name}</div>
          <div class="action-sub">${loc.story}</div>
          <div class="action-sub" style="color:var(--gold)">สนทนากับเพื่อนในแชท หาตัวผู้ต้องสงสัย ก่อนถึงเวลาลงมติ!</div></div>${inboxPanel()}`;
        break;
      }
      case 'vote': renderVote(el); break;
      default: el.innerHTML = '<p class="p-note">...</p>';
    }
  }

  // ---------------- เลือกเป้าหมาย ----------------
  function targetGrid(sel, opts) {
    const o = opts || {};
    const list = alivePids().filter(p => (o.includeSelf || p !== pid) && !(o.exclude || []).includes(p) && !((o.excludeRoles || []).includes(roles[p])));
    return list.map(p => {
      const bc = badgeColor(myRole, roles[p]);
      return `<div class="tgt selectable ${sel.has(p) ? 'sel' : ''} ${p === pid ? 'me' : ''}" data-t="${p}" style="--bcol:${bc}">
        <span class="badge"></span>${Art.avatar(players[p].avatar || 0)}<div class="nm">${esc(players[p].name)}</div></div>`;
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
  }
  async function submitAct(node, val, doneText) {
    await Net.set(`${R}/act/${meta.night}/${node}/${pid}`, val);
    submitted[node] = true;
    $('p-main').innerHTML = `<div class="done-note">✔ ${doneText}<br>รอรุ่งอรุณ...</div>${trivia()}${inboxPanel()}`;
    Sound.chime();
  }

  function renderNightAction(el) {
    const n = meta.night;
    const doneWrap = (txt) => { el.innerHTML = `<div class="done-note">✔ ${txt}</div>${trivia()}${inboxPanel()}`; };
    switch (myRole) {
      case 'enemy': {
        const q = meta.killQuota || 1;
        actionUI(el, {
          title: `🗡️ โหวตลอบสังหาร (คืนนี้สังหารได้ ${q} คน)`,
          sub: 'ศัตรูทุกคนโหวตเลือกเหยื่อ เสียงมากสุดถูกสังหาร เสมอกันระบบสุ่ม — คุยกันในแชทช่อง "ฝ่ายศัตรู"',
          max: q, excludeRoles: ['enemy'], allowEmpty: true, skippable: false,
          submit: (v) => submitAct('enemyVotes', (Array.isArray(v) && v.length) ? v : '-', 'ส่งเสียงโหวตแล้ว'),
        });
        break;
      }
      case 'thief': {
        if (meta.activeThief === pid) {
          actionUI(el, {
            title: '🪙 คืนนี้เจ้าถูกสุ่มให้ลงมือ! เลือกเหยื่อปล้น 3 คน',
            sub: `ปล้นได้คนละ 25 ไร่ (ถ้าเหยื่อไม่มีศักดินา ได้ 0) — แก๊งสะสมครบ ${THIEF_GOAL} ไร่ = ชนะ`,
            max: STEAL_TARGETS, excludeRoles: ['thief'], skippable: true,
            submit: (v) => submitAct('steal', (v === '-' || !v.length) ? '-' : v, 'ลงมือปล้นแล้ว รอผลตอนเช้ามืด'),
          });
        } else {
          const anm = meta.activeThief && players[meta.activeThief] ? players[meta.activeThief].name : '…';
          doneWrap(`คืนนี้แก๊งสุ่มให้ <b style="color:var(--orange)">${esc(anm)}</b> เป็นผู้ลงมือ<br>คุยวางแผนกันในแชทช่อง "แก๊งโจร"`);
        }
        break;
      }
      case 'doctor':
        actionUI(el, {
          title: '💚 เลือกผู้ที่จะคุ้มครองคืนนี้ (1 คน)',
          sub: 'ต้องเดาเอง — ถ้าคนที่เลือกถูกกำจัดคืนนี้ เขาจะรอดชีวิต (เลือกตัวเองก็ได้)',
          max: 1, includeSelf: true, skippable: true,
          submit: (v) => submitAct('protect', v === '-' ? '-' : v[0], 'จัดยาสมุนไพรเฝ้าคุ้มครองแล้ว'),
        });
        break;
      case 'noble': {
        if (meta.execNight && !submitted.nobleInv) {
          // คืนประหาร: สืบก่อน แล้วค่อยเลือกประหาร
          actionUI(el, {
            title: '🔎 สืบสวน: ผู้นี้เป็นโจรหรือไม่ (1 คน)',
            sub: 'คืนนี้เป็นคืนที่ 4! หลังสืบแล้วจะได้เลือกลงดาบประหารโจรด้วย',
            max: 1, skippable: true,
            submit: async (v) => {
              await Net.set(`${R}/act/${n}/nobleInv/${pid}`, v === '-' ? '-' : v[0]);
              submitted.nobleInv = true;
              renderNightAction(el);
            },
          });
        } else if (meta.execNight) {
          actionUI(el, {
            title: '⚔️ ลงดาบประหารโจร (เลือกได้ 1 คน หรือข้าม)',
            sub: '⚠️ ถ้าชี้ผิด (ไม่ใช่โจร) เจ้าจะถูกกำจัดแทน! ไม่มั่นใจให้ข้าม',
            max: 1, skippable: true,
            submit: (v) => submitAct('nobleExec', v === '-' ? '-' : v[0], v === '-' ? 'คืนนี้เก็บดาบไว้ก่อน' : 'ลงดาบแล้ว... รอผลตอนเช้า'),
          });
        } else {
          actionUI(el, {
            title: '🔎 สืบสวน: ผู้นี้เป็นโจรหรือไม่ (1 คน)',
            sub: `ผลจะส่งถึงเจ้าลับๆ ตอนเช้า — อีก ${(4 - (n % 4)) % 4 || 4} คืนจะถึงคืนประหาร`,
            max: 1, skippable: true,
            submit: (v) => submitAct('nobleInv', v === '-' ? '-' : v[0], 'ออกตระเวนสืบแล้ว'),
          });
        }
        break;
      }
      case 'spy':
        actionUI(el, {
          title: '🏮 สืบสวน: ผู้นี้เป็นศัตรูหรือไม่ (1 คน)',
          sub: 'ผลจะส่งถึงเจ้าลับๆ โดยไม่มีใครรู้ว่าเจ้าคือจารชน',
          max: 1, skippable: true,
          submit: (v) => submitAct('spyInv', v === '-' ? '-' : v[0], 'จุดโคมออกสืบแล้ว'),
        });
        break;
      case 'lord': {
        if (meta.giftNight) {
          actionUI(el, {
            title: '👑 พระราชทานศักดินา 25 ไร่ (1 คน)',
            sub: 'ระวัง! ถ้าเผลอให้โจร ศักดินาจะเข้าแก๊งโจรโดยปริยาย',
            max: 1, skippable: true,
            submit: (v) => submitAct('gift', v === '-' ? '-' : v[0], 'พระราชทานเรียบร้อย'),
          });
        } else {
          doneWrap('คืนนี้เจ้าเมืองพักผ่อน (แจกศักดินาได้คืนเว้นคืน)<br>โปรดระวังตัว — ถ้าเจ้าถูกกำจัด ศัตรูชนะทันที');
        }
        break;
      }
      default:
        doneWrap(myRole === 'mad'
          ? 'คืนนี้เจ้านอนหัวเราะคนเดียว ฮิๆๆ... พรุ่งนี้ต้องทำตัวน่าสงสัยให้ถูกโหวตออกให้ได้!'
          : 'เจ้าหลับตาลง... ค่ำคืนนี้ขอให้ปลอดภัย');
    }
  }

  // ---------------- โหวต ----------------
  function renderVote(el) {
    const q = meta.voteQuota || 1;
    Net.once(`${R}/votes/${meta.day}/${pid}`).then(v => {
      if (v) { el.innerHTML = `<div class="done-note">✔ ลงมติแล้ว รอเพื่อนๆ...</div>${inboxPanel()}`; return; }
      actionUI(el, {
        title: `🗳️ ลงมติขับผู้ต้องสงสัย (เลือก ${q} คน)`,
        sub: 'ผู้ได้เสียงมากที่สุดจะถูกขับออกจากพระนคร — เลือกให้ดี ประวัติศาสตร์จะจารึก',
        max: q, allowEmpty: false, skippable: false,
        submit: async (v) => {
          await Net.set(`${R}/votes/${meta.day}/${pid}`, v);
          el.innerHTML = `<div class="done-note">✔ ลงมติแล้ว รอเพื่อนๆ...</div>`;
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
    el.innerHTML = Object.entries(players).map(([p, pl]) => {
      const bc = badgeColor(myRole, roles[p]);
      return `<div class="tgt ${alive[p] ? '' : 'dead'} ${p === pid ? 'me' : ''}" style="--bcol:${bc}">
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
    setTimeout(() => {
      $('p-main').innerHTML = `<div class="action-panel center">
        <h2 style="color:var(--gold);font-size:1.6rem">${w.title}</h2>
        <p class="action-sub">${w.text}</p>
        <p style="font-size:1.2rem;margin-top:8px">${myTeamWon ? '🎉 ฝ่ายของเจ้าชนะ!' : '😢 ฝ่ายของเจ้าพ่ายแพ้'}</p>
        <p class="action-sub">เจ้าคือ <b style="color:${r.color}">${r.name}</b></p>
        <button class="btn btn-gold w100" onclick="location.href=location.pathname">กลับหน้าแรก</button></div>`;
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
    $('chat-send').onclick = sendChat;
    $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  }
  function bindChat() {
    const chans = chatChannelsFor(myRole);
    $('chat-tabs').innerHTML = chans.map(c =>
      `<div class="chat-tab ${c.id === chatCh ? 'on' : ''}" data-ch="${c.id}" style="--tc:${c.color}">${c.name}</div>`).join('');
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
      '<div class="cmsg sys">ยังไม่มีข้อความ — เริ่มคุยกันเลย</div>';
    scrollChat();
  }
  function scrollChat() { const el = $('chat-msgs'); el.scrollTop = el.scrollHeight; }
  function updateUnread() {
    const b = $('chat-unread');
    b.classList.toggle('hidden', unread === 0);
    b.textContent = unread;
  }
  async function sendChat() {
    const inp = $('chat-input');
    const text = inp.value.trim();
    if (!text) return;
    if (!alive[pid] && meta && meta.phase !== 'lobby' && meta.phase !== 'end' && myRole) { App.toast('วิญญาณส่งเสียงไม่ได้...'); return; }
    inp.value = '';
    await Net.push(`${R}/chat/${chatCh}`, { pid, name: (me && me.name) || '?', text, ts: Net.now() });
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
