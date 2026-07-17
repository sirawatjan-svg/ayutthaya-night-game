// ============================================================
// Host — เอนจินเกมฝั่งครู (เครื่องครูเป็นผู้ประมวลผลทั้งหมด)
// ============================================================

const Host = (() => {
  let code = null, R = null;
  let meta = null, players = {}, roles = {}, alive = {}, sak = {}, loot = 0;
  let acts = null, votes = null, thiefTurns = {};
  let goal = 450, lordShield = false; // เป้าโจร (ตามขนาดห้อง) + องครักษ์เจ้าเมือง (ใช้ได้ 1 ครั้ง)
  let busy = false, tickTimer = null, unsubs = [];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const alivePids = () => Object.keys(players).filter(p => alive[p]);
  const aliveOf = (role) => alivePids().filter(p => roles[p] === role);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------------- สร้างห้อง ----------------
  async function create(hostName, dayMin, nightMin) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    R = 'rooms/' + code;
    await Net.set(R, {
      meta: {
        hostName, createdAt: Net.now(), state: 'lobby', phase: 'lobby',
        settings: { day: dayMin, night: nightMin }, night: 0, day: 0,
      },
    });
    location.hash = 'h' + code;
    bindLobby();
  }

  function bindLobby() {
    App.show('v-hostlobby');
    unsubs.push(Net.on(R + '/meta', v => { meta = v; }));
    $('hl-code').textContent = code;
    const url = location.origin + location.pathname + '?room=' + code;
    $('hl-url').textContent = url;
    $('qr-box').innerHTML = '';
    try { new QRCode($('qr-box'), { text: url, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
    unsubs.push(Net.on(R + '/players', (v) => {
      players = v || {};
      renderLobby();
    }));
    $('btn-start').onclick = start;
    $('btn-close-room').onclick = async () => { if (confirm('ปิดห้องนี้?')) { await Net.remove(R); location.href = location.pathname; } };
  }

  let lobbyPrevCount = -1, lobbySeenPids = new Set();
  function renderLobby() {
    const list = Object.entries(players);
    const countEl = $('hl-count');
    countEl.textContent = list.length;
    if (lobbyPrevCount !== -1 && list.length !== lobbyPrevCount) {
      countEl.classList.remove('pop'); void countEl.offsetWidth; countEl.classList.add('pop');
    }
    lobbyPrevCount = list.length;
    // เฉพาะคนที่เพิ่งเข้าใหม่ค่อยเด้ง+เฟดเข้า — คนเดิมอยู่นิ่งไม่กระพริบซ้ำทุกครั้งที่มีคนใหม่
    $('hl-players').innerHTML = list.map(([pid, p]) =>
      `<div class="lobby-p ${lobbySeenPids.has(pid) ? 'still' : ''}" data-pid="${pid}" title="แตะเพื่อเปลี่ยนชื่อ/เตะออก">${Art.avatar(p.avatar || 0)}<div class="nm">${esc(p.name)}</div></div>`).join('') ||
      '<p class="p-note">ยังไม่มีใครเข้าเมือง...</p>';
    list.forEach(([pid]) => lobbySeenPids.add(pid));
    $('hl-players').querySelectorAll('.lobby-p').forEach(el => {
      el.onclick = () => {
        const pid = el.dataset.pid, p = players[pid];
        if (!p) return;
        App.modal(`<h2 class="panel-title sm">จัดการ: ${esc(p.name)}</h2>
          <div class="field"><label>เปลี่ยนชื่อ (กรณีชื่อไม่เหมาะสม)</label>
            <input id="lm-name" maxlength="14" value="${esc(p.name)}"></div>
          <button class="btn btn-gold w100" id="lm-rename">💾 บันทึกชื่อใหม่</button>
          <button class="btn btn-red w100" id="lm-kick">🚪 เตะออกจากห้อง</button>
          <button class="btn btn-ghost w100" onclick="App.closeModal()">ปิด</button>`);
        document.getElementById('lm-rename').onclick = async () => {
          const nm = document.getElementById('lm-name').value.trim();
          if (nm) { await Net.set(R + '/players/' + pid + '/name', nm); App.toast('เปลี่ยนชื่อแล้ว'); }
          App.closeModal();
        };
        document.getElementById('lm-kick').onclick = async () => { await Net.remove(R + '/players/' + pid); App.toast('เตะออกแล้ว'); App.closeModal(); };
      };
    });
    const n = list.length;
    const btn = $('btn-start');
    btn.disabled = n < MIN_PLAYERS;
    btn.textContent = n < MIN_PLAYERS ? `เริ่มเกม (ต้องมี ${MIN_PLAYERS} คนขึ้นไป — ตอนนี้ ${n})` : `⚔️ เริ่มเกม (${n} คน)`;
    if (n >= MIN_PLAYERS) {
      const setup = roleSetup(n);
      $('hl-roles').innerHTML = ROLE_ORDER.filter(r => setup[r]).map(r =>
        `<span class="role-pill"><span class="dot" style="background:${ROLES[r].color}"></span>${ROLES[r].name} ×${setup[r]}</span>`).join('');
    } else $('hl-roles').innerHTML = '<p class="p-note">รอผู้เล่นครบก่อน จะแสดงการกระจายบทบาทที่นี่</p>';
  }

  // ---------------- เริ่มเกม: แจกบทบาท ----------------
  async function start() {
    const pids = shuffle(Object.keys(players));
    if (pids.length < MIN_PLAYERS) return;
    if (pids.length > MAX_PLAYERS) { App.toast('เกิน 40 คน!'); return; }
    const setup = roleSetup(pids.length);
    const bag = [];
    for (const r of ROLE_ORDER) for (let i = 0; i < (setup[r] || 0); i++) bag.push(r);
    shuffle(bag);
    const rolesW = {}, aliveW = {}, sakW = {}, turnsW = {};
    pids.forEach((pid, i) => {
      rolesW[pid] = bag[i];
      aliveW[pid] = true;
      sakW[pid] = ROLES[bag[i]].sakdina;
      if (bag[i] === 'thief') turnsW[pid] = 0;
    });
    goal = thiefGoal(pids.length);
    lordShield = true;
    await Net.update(R, { roles: rolesW, alive: aliveW, sak: sakW, loot: 0, thiefTurns: turnsW, goal, lordShield: true });
    await setPhase('reveal', 1, 1, meta0().night);
    bindGame();
  }
  function meta0() { return (meta && meta.settings) || { day: 5, night: 3 }; }

  async function setPhase(phase, night, day, minutes, extra) {
    const upd = Object.assign({
      state: phase === 'end' ? 'end' : 'playing',
      phase, night, day,
      phaseEnds: minutes ? Net.now() + minutes * 60000 : 0,
      execNight: nobleExecNight(night), giftNight: lordGiftNight(night),
      killQuota: killQuota(alivePids().length - aliveOf('enemy').length),
    }, extra || {});
    await Net.update(R + '/meta', upd);
  }

  // ---------------- ผูกจอเกม ----------------
  function bindGame() {
    App.show('v-host');
    unsubs.push(
      Net.on(R + '/players', v => { players = v || {}; renderBoard(); renderStats(); }),
      Net.on(R + '/meta', v => { meta = v || {}; renderTop(); renderNarration(); }),
      Net.on(R + '/roles', v => { roles = v || {}; }),
      Net.on(R + '/alive', v => { alive = v || {}; renderBoard(); renderStats(); }),
      Net.on(R + '/sak', v => { sak = v || {}; renderBoard(); }),
      Net.on(R + '/loot', v => { loot = v || 0; renderLoot(); }),
      Net.on(R + '/thiefTurns', v => { thiefTurns = v || {}; }),
      Net.on(R + '/goal', v => { if (v) goal = v; renderLoot(); }),
      Net.on(R + '/lordShield', v => { lordShield = !!v; }),
      Net.on(R + '/act', v => { acts = v || {}; }),
      Net.on(R + '/votes', v => { votes = v || {}; if (meta && meta.phase === 'vote') renderNarration(); }),
    );
    $('btn-skip').onclick = () => advance(true);
    $('btn-music').onclick = () => { const m = Sound.toggleMute(); $('btn-music').textContent = m ? '🔇 ปิดเพลง' : '🔊 เพลง'; };
    // QR + รหัสห้อง โชว์ตลอดเกม — เด็กหลุดสแกนกลับเข้าได้ (พิมพ์ชื่อเดิม)
    const joinUrl = location.origin + location.pathname + '?room=' + code;
    $('hr-code').textContent = code;
    $('hr-qr').innerHTML = '';
    try { new QRCode($('hr-qr'), { text: joinUrl, width: 56, height: 56, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
    $('h-rejoin').onclick = () => {
      App.modal(`<h2 class="panel-title">กลับเข้าเกม / เข้าห้องนี้</h2>
        <div class="room-code">${code}</div>
        <div id="qr-big" style="display:flex;justify-content:center;padding:12px;background:#fff;border-radius:14px;width:fit-content;margin:0 auto 10px"></div>
        <div class="join-url">${joinUrl}</div>
        <p class="p-note" style="color:var(--gold)">📢 เด็กที่หลุดจากเกม: สแกนแล้วพิมพ์ "ชื่อเดิมให้ตรงเป๊ะ" จะกลับเข้าตำแหน่งเดิมทันที</p>
        <button class="btn btn-gold w100" onclick="App.closeModal()">ปิด</button>`);
      try { new QRCode(document.getElementById('qr-big'), { text: joinUrl, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {}
    };
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tick, 600);
  }

  // ---------------- แผงควบคุมครู: แตะชื่อผู้เล่นบนกระดาน ----------------
  function playerMenu(pid) {
    const p = players[pid];
    if (!p) return;
    App.modal(`<h2 class="panel-title sm">จัดการ: ${esc(p.name)}</h2>
      <div class="field"><label>เปลี่ยนชื่อ (กรณีชื่อไม่เหมาะสม)</label>
        <input id="pm-name" maxlength="14" value="${esc(p.name)}"></div>
      <button class="btn btn-gold w100" id="pm-rename">💾 บันทึกชื่อใหม่</button>
      ${alive[pid]
        ? '<button class="btn btn-red w100" id="pm-kill">✝ กำจัดออกจากเกม (เด็กออกจากห้อง/ป่วน)</button>'
        : '<button class="btn btn-blue w100" id="pm-revive">💚 ชุบชีวิตกลับเข้าเกม</button>'}
      <button class="btn btn-ghost w100" onclick="App.closeModal()">ปิด</button>`);
    document.getElementById('pm-rename').onclick = async () => {
      const nm = document.getElementById('pm-name').value.trim();
      if (nm) { await Net.set(R + '/players/' + pid + '/name', nm); App.toast('เปลี่ยนชื่อแล้ว'); }
      App.closeModal();
    };
    const k = document.getElementById('pm-kill'), rv = document.getElementById('pm-revive');
    if (k) k.onclick = async () => { await Net.set(R + '/alive/' + pid, false); log(`👨‍🏫 ครูกำจัด ${p.name} ออกจากเกม`); App.closeModal(); await checkWin(); };
    if (rv) rv.onclick = async () => { await Net.set(R + '/alive/' + pid, true); log(`👨‍🏫 ครูชุบชีวิต ${p.name} กลับเข้าเกม`); App.closeModal(); };
  }

  // ---------------- นาฬิกา + เดินเฟสอัตโนมัติ ----------------
  function tick() {
    if (!meta || busy) return;
    renderTimer();
    const ends = meta.phaseEnds || 0;
    if (meta.phase === 'end') return;
    if (ends && Net.now() >= ends) { advance(); return; }
    // จบเฟสก่อนเวลาเมื่อทุกคนทำครบ
    if (meta.phase === 'night' && allNightDone()) advance();
    if (meta.phase === 'vote' && allVotesDone()) advance();
  }

  function allNightDone() {
    const n = meta.night, a = (acts && acts[n]) || {};
    const need = [];
    aliveOf('enemy').forEach(p => need.push(((a.enemyVotes || {})[p]) != null));
    if (meta.activeThief && alive[meta.activeThief]) need.push(((a.steal || {})[meta.activeThief]) != null);
    aliveOf('doctor').forEach(p => need.push(((a.protect || {})[p]) != null));
    aliveOf('noble').forEach(p => need.push(((a.nobleInv || {})[p]) != null));
    aliveOf('spy').forEach(p => need.push(((a.spyInv || {})[p]) != null));
    if (meta.giftNight) aliveOf('lord').forEach(p => need.push(((a.gift || {})[p]) != null));
    return need.length > 0 && need.every(Boolean);
  }
  function allVotesDone() {
    const v = (votes && votes[meta.day]) || {};
    return alivePids().every(p => v[p] != null);
  }

  async function advance(manual) {
    if (busy || !meta) return;
    busy = true;
    try {
      switch (meta.phase) {
        case 'reveal': await toDay(1); break;
        case 'day': await toVote(); break;
        case 'vote': await resolveVote(); break;
        case 'night': await resolveNight(); break;
      }
    } catch (e) { console.error(e); }
    busy = false;
  }

  // ---------------- กลางวัน / โหวต ----------------
  async function toDay(day) {
    const loc = locationOfDay(day);
    await setPhase('dawnfx', meta.night, day, 0);
    await FX.play('dawn', { day, loc, npc: npcLine('dawn', day) });
    await setPhase('day', meta.night, day, meta0().day);
    log(`🌅 เช้าวันที่ ${day} ณ ${loc.name}`);
    Sound.music('day');
  }

  async function toVote() {
    await setPhase('vote', meta.night, meta.day, 1, { voteQuota: voteQuota(alivePids().length) }); // 60 วิ — สั้น กดดัน
    log(`🗳️ เริ่มการลงมติขับไล่ (ออก ${voteQuota(alivePids().length)} คน)`);
  }

  async function resolveVote() {
    const day = meta.day, q = meta.voteQuota || 1;
    const v = (votes && votes[day]) || {};
    const tally = {};
    for (const pid of alivePids()) {
      const arr = Array.isArray(v[pid]) ? v[pid] : [];
      arr.forEach(t => { if (alive[t]) tally[t] = (tally[t] || 0) + 1; });
    }
    const ranked = shuffle(Object.keys(tally)).sort((a, b) => tally[b] - tally[a]);
    const out = ranked.slice(0, q).filter(t => tally[t] > 0);
    await setPhase('duskfx', meta.night, day, 0);
    await Net.set(R + '/voteresults/' + day, { day, out: out.map(p => ({ pid: p, role: roles[p] })), tally });

    for (const t of out) {
      alive[t] = false;
      await Net.set(R + '/alive/' + t, false);
      await FX.play('voteout', { name: players[t].name, avatar: players[t].avatar, role: roles[t] });
      log(`⚖️ ชาวเมืองขับ ${players[t].name} (${ROLES[roles[t]].name}) ออกจากพระนคร — ${tally[t]} เสียง`);
      if (roles[t] === 'mad') {
        if (day >= 2) {
          await FX.play('madwin', { name: players[t].name });
          return endGame('mad', 'คนบ้าชนะ!', `${players[t].name} หลอกทั้งเมืองให้โหวตขับตนเองสำเร็จ`);
        }
        // วันแรกยังไม่นับ — คนบ้าถูกขับออกเฉยๆ
        log(`🤪 ${players[t].name} เป็นคนบ้า... แต่ถูกขับวันแรก จึงยังไม่ถือว่าชนะ`);
      }
      if (roles[t] === 'lord') {
        return endGame('enemy', 'ศัตรูชนะ!', 'เจ้าเมืองถูกขับออกจากพระนคร บ้านเมืองระส่ำระสาย ไส้ศึกยึดเมืองสำเร็จ');
      }
    }
    if (out.length === 0) log('⚖️ วันนี้ไม่มีผู้ถูกขับออก (ไม่มีเสียงโหวต)');
    if (await checkWin()) return;
    await toNight(meta.night + 1);
  }

  // ---------------- กลางคืน ----------------
  async function toNight(n) {
    // สุ่มโจรผู้ลงมือ: คนที่ได้ลงมือน้อยครั้งสุดได้สิทธิ์ก่อน
    const th = aliveOf('thief');
    let active = null;
    if (th.length) {
      const min = Math.min(...th.map(p => thiefTurns[p] || 0));
      active = shuffle(th.filter(p => (thiefTurns[p] || 0) === min))[0];
      thiefTurns[active] = (thiefTurns[active] || 0) + 1;
      await Net.set(R + '/thiefTurns/' + active, thiefTurns[active]);
    }
    await setPhase('nightfx', n, meta.day, 0);
    await FX.play('night', { night: n, npc: npcLine('night', n) });
    await setPhase('night', n, meta.day, meta0().night, { activeThief: active || null });
    log(`🌙 คืนที่ ${n} เริ่มขึ้น — ทุกบทบาทลงมือในความมืด`);
    Sound.music('night');
  }

  async function resolveNight() {
    Sound.music(null);
    const n = meta.night, a = (acts && acts[n]) || {};
    const ev = [];           // เหตุการณ์ FX ตามลำดับ
    const deaths = new Map(); // pid -> cause
    const pub = { deaths: [], saved: 0, stealTotal: 0, stealCount: 0, gifted: null, exec: [] };
    const inbox = [];        // {pid, text}
    // ประวัติละเอียดสำหรับสรุปท้ายเกม + คิดคะแนน
    const hist = { night: n, gift: null, protects: {}, steals: [], execs: [], deaths: [], saved: [], invNoble: [], invSpy: [], enemyVotes: {} };

    await setPhase('dawnfx', n, meta.day, 0);

    // 1) เจ้าเมืองแจกศักดินา (คืนเว้นคืน)
    if (meta.giftNight) {
      const lord = aliveOf('lord')[0];
      const t = lord && a.gift && a.gift[lord];
      if (t && t !== '-' && alive[t]) {
        sak[t] = (sak[t] || 0) + 25;
        sak[lord] -= 25;
        pub.gifted = true;
        hist.gift = { from: lord, to: t, toRole: roles[t] };
        if (roles[t] === 'thief') { loot += 25; inbox.push({ pid: t, text: 'เจ้าเมืองพระราชทานศักดินาให้เจ้า 25 ไร่ — เข้าคลังแก๊งโจรโดยปริยาย!' }); }
        else inbox.push({ pid: t, text: 'เจ้าเมืองพระราชทานศักดินาให้เจ้า 25 ไร่' });
        ev.push({ type: 'gift', text: 'มีราษฎรผู้หนึ่งได้รับพระราชทานศักดินา 25 ไร่' });
      }
    }

    // 2) โจรลงมือ (เฉพาะโจรที่ถูกสุ่ม)
    const th = meta.activeThief;
    if (th && alive[th]) {
      const targets = (Array.isArray(a.steal && a.steal[th]) ? a.steal[th] : []).slice(0, STEAL_TARGETS);
      let got = 0, lines = [];
      for (const t of targets) {
        if (!alive[t] || t === th) continue;
        const amt = Math.min(STEAL_PER_TARGET, Math.max(0, sak[t] || 0));
        sak[t] = (sak[t] || 0) - amt;
        sak[th] = (sak[th] || 0) + amt;
        got += amt; pub.stealCount++;
        hist.steals.push({ thief: th, victim: t, amt });
        lines.push(`${players[t].name}: ได้ ${amt} ไร่${amt === 0 ? ' (คนผู้นี้ไม่มีศักดินา!)' : ''}`);
        if ((sak[t] || 0) <= 0 && roles[t] !== 'enemy') deaths.set(t, 'bankrupt');
      }
      loot += got; pub.stealTotal = got;
      if (targets.length) {
        inbox.push({ pid: th, text: `ผลการปล้นคืนนี้ — ${lines.join(' / ')} รวม ${got} ไร่` });
        ev.push({ type: 'steal', text: `ศักดินาราษฎรถูกปล้นไป ${got} ไร่ในความมืด...` });
      }
    }

    // 3) ขุนนางประหาร (ทุกคืนที่ 4)
    if (meta.execNight) {
      for (const nb of aliveOf('noble')) {
        const t = a.nobleExec && a.nobleExec[nb];
        if (!t || t === '-' || !alive[t] || deaths.has(nb)) continue;
        if (roles[t] === 'thief') {
          deaths.set(t, 'execute');
          pub.exec.push({ ok: true });
          hist.execs.push({ noble: nb, target: t, ok: true });
          inbox.push({ pid: nb, text: `เจ้าลงดาบถูกคน! ${players[t].name} คือโจรจริง` });
        } else {
          deaths.set(nb, 'misjudge');
          pub.exec.push({ ok: false });
          hist.execs.push({ noble: nb, target: t, ok: false });
          inbox.push({ pid: nb, text: `เจ้าชี้ตัวผิด... ${players[t].name} ไม่ใช่โจร เจ้าต้องรับโทษแทน` });
        }
      }
    }

    // 4) ศัตรูโหวตสังหาร
    const evotes = {};
    for (const en of aliveOf('enemy')) {
      const arr = Array.isArray(a.enemyVotes && a.enemyVotes[en]) ? a.enemyVotes[en] : [];
      if (arr.length) hist.enemyVotes[en] = arr;
      arr.forEach(t => { if (alive[t] && roles[t] !== 'enemy') evotes[t] = (evotes[t] || 0) + 1; });
    }
    const kq = killQuota(n);
    const kranked = shuffle(Object.keys(evotes)).sort((x, y) => evotes[y] - evotes[x]);
    const killed = kranked.slice(0, kq);
    killed.forEach(t => { if (!deaths.has(t)) deaths.set(t, 'kill'); });

    // 4.5) องครักษ์เจ้าเมือง: รับดาบแทนการลอบสังหารได้ 1 ครั้งต่อเกม
    const lordPid = aliveOf('lord')[0];
    if (lordShield && lordPid && deaths.get(lordPid) === 'kill') {
      deaths.delete(lordPid);
      lordShield = false;
      await Net.set(R + '/lordShield', false);
      pub.lordSaved = true;
      hist.lordSaved = true;
      inbox.push({ pid: lordPid, text: 'เมื่อคืนศัตรูบุกถึงตัวเจ้า! องครักษ์สละชีพปกป้องไว้ — ครั้งต่อไปไม่มีใครช่วยแล้ว' });
    }

    // 5) แพทย์คุ้มครอง
    const protectedSet = new Set();
    for (const dc of aliveOf('doctor')) {
      const t = a.protect && a.protect[dc];
      if (t && t !== '-') { protectedSet.add(t); hist.protects[dc] = t; }
    }
    for (const [pid, cause] of [...deaths]) {
      if (protectedSet.has(pid)) {
        deaths.delete(pid);
        pub.saved++;
        hist.saved.push(pid);
        if (cause === 'bankrupt') sak[pid] = Math.max(sak[pid] || 0, 25);
        inbox.push({ pid, text: 'เมื่อคืนเจ้าเกือบถูกกำจัด... แต่หมอหลวงมาช่วยชีวิตไว้ทัน!' });
      }
    }

    // 6) ผลตาย
    for (const [pid, cause] of deaths) {
      alive[pid] = false;
      pub.deaths.push({ pid, role: roles[pid], cause });
    }

    // 7) การสืบสวน (ส่งผลลับ)
    for (const nb of aliveOf('noble')) {
      const t = a.nobleInv && a.nobleInv[nb];
      if (t && t !== '-') {
        const yes = roles[t] === 'thief';
        hist.invNoble.push({ noble: nb, target: t, yes });
        inbox.push({ pid: nb, text: `ผลสืบสวนคืนที่ ${n}: ${players[t].name} ${yes ? '⚠️ เป็นโจร!' : '✔ ไม่ใช่โจร'}` });
      }
    }
    for (const sp of aliveOf('spy')) {
      const t = a.spyInv && a.spyInv[sp];
      if (t && t !== '-') {
        const yes = roles[t] === 'enemy';
        hist.invSpy.push({ spy: sp, target: t, yes });
        inbox.push({ pid: sp, text: `ผลสืบสวนคืนที่ ${n}: ${players[t].name} ${yes ? '⚠️ เป็นศัตรู!' : '✔ ไม่ใช่ศัตรู'}` });
      }
    }

    // เขียนสถานะทั้งหมด
    hist.deaths = pub.deaths;
    const upd = { loot };
    for (const p in sak) upd['sak/' + p] = sak[p];
    for (const p in alive) upd['alive/' + p] = alive[p];
    upd['results/' + n] = pub;
    upd['history/' + n] = hist;
    await Net.update(R, upd);
    for (const m of inbox) await Net.push(R + '/private/' + m.pid, { night: n, text: m.text });

    // คัตซีนเงาสั้นๆ (ไร้ชื่อ สร้างอารมณ์) → ปิดท้ายด้วย "รายงานยามเช้า" ใบเดียวอ่านง่าย
    if (pub.gifted) await FX.play('cutGift');
    if (pub.stealCount) await FX.play('cutSteal');
    if (pub.exec.length) await FX.play('cutExec');
    if (pub.deaths.some(d => d.cause === 'kill') || pub.lordSaved) await FX.play('cutKill');
    if (pub.saved) await FX.play('cutHeal');
    for (const d of pub.deaths) {
      const nm = players[d.pid].name;
      if (d.cause === 'kill') log(`☠️ ${nm} (${ROLES[d.role].name}) ถูกลอบสังหาร`);
      else if (d.cause === 'bankrupt') log(`🪙 ${nm} (${ROLES[d.role].name}) สิ้นเนื้อประดาตัว ถูกกำจัด`);
      else log(`⚔️ ${nm} (${ROLES[d.role].name}) ถูกประหาร/รับโทษ`);
    }
    if (pub.lordSaved) log('⚔️ องครักษ์ปกป้องเจ้าเมืองไว้ได้ — โล่หมดแล้ว');
    if (pub.saved) log(`💚 หมอหลวงช่วยชีวิตไว้ ${pub.saved} คน`);
    if (pub.deaths.length === 0 && !pub.saved) log('🕊️ เช้านี้ทุกคนปลอดภัย');
    await FX.play('morning', {
      night: n, saved: pub.saved, lordSaved: pub.lordSaved, stealTotal: pub.stealTotal, gifted: pub.gifted,
      deaths: pub.deaths.map(d => ({ name: players[d.pid].name, role: d.role, cause: d.cause })),
    });

    if (loot > 0) log(`🪙 ชุมโจรสะสมศักดินาแล้ว ${loot}/${goal} ไร่`);
    if (await checkWin()) return;
    await toDay(n);
  }

  // ---------------- เงื่อนไขชนะ ----------------
  async function checkWin() {
    const en = aliveOf('enemy').length;
    const others = alivePids().length - en;
    const lord = aliveOf('lord').length;
    if (lord === 0) return endGame('enemy', 'ศัตรูชนะ!', 'เจ้าเมืองสิ้นชีพ พระนครไร้ผู้นำ ไส้ศึกเปิดประตูเมืองรับทัพใหญ่');
    if (loot >= goal) return endGame('thief', 'แก๊งโจรชนะ!', `ชุมโจรยึดศักดินาครบ ${goal} ไร่ กลายเป็นผู้มีอิทธิพลเหนือพระนคร`);
    if (en > others) return endGame('enemy', 'ศัตรูชนะ!', 'ไส้ศึกมีจำนวนมากกว่าชาวเมือง พระนครถูกยึดจากภายใน');
    if (en === 0 && aliveOf('thief').length === 0) return endGame('villager', 'ชาวเมืองชนะ!', 'ทั้งไส้ศึกและชุมโจรถูกกวาดล้างจนหมดสิ้น กรุงศรีอยุธยากลับคืนสู่ความสงบ');
    return false;
  }

  async function endGame(team, title, text) {
    // คิดคะแนน + เขียนก่อนประกาศผู้ชนะ เพื่อให้มือถือนักเรียนเห็นคะแนนพร้อมกัน
    let scores = null;
    try {
      scores = await computeScores(team);
      await Net.set(R + '/scores', scores);
    } catch (e) { console.error('score error', e); }
    Sound.music(null);
    await Net.set(R + '/winner', { team, title, text });
    await setPhase('end', meta.night, meta.day, 0);
    await FX.play('win', { team, title, text, sad: team === 'enemy' });
    log(`🏁 ${title} — ${text}`);
    $('h-narration').innerHTML = `<b style="color:var(--gold)">${title}</b><br>${text}<br><br>
      <button class="btn btn-gold w100" id="btn-summary">📜 สรุปเกม & คะแนน (ฉายให้นักเรียนดู)</button>`;
    $('btn-summary').onclick = () => showSummary(scores, team, title);
    renderBoard(true);
    setTimeout(() => showSummary(scores, team, title), 1500);
    return true;
  }

  // ---------------- คะแนนการเรียนรู้ ----------------
  // +10 ทีมชนะ • +2 รอดชีวิต • +3 โหวตจับคนร้ายถูก • +5 ใช้ความสามารถสำเร็จ
  let lastHist = {}, lastVoteRes = {};
  async function computeScores(winTeam) {
    lastHist = (await Net.once(R + '/history')) || {};
    const votesAll = (await Net.once(R + '/votes')) || {};
    lastVoteRes = (await Net.once(R + '/voteresults')) || {};
    const S = {};
    for (const pid in players) S[pid] = { name: players[pid].name, role: roles[pid] || 'serf', total: 0, notes: [], alive: !!alive[pid] };
    const add = (pid, pts, note) => { if (!S[pid]) return; S[pid].total += pts; S[pid].notes.push(`${note} +${pts}`); };
    for (const pid in S) {
      if (ROLES[S[pid].role].team === winTeam) add(pid, 10, 'ทีมชนะเกม');
      if (S[pid].alive) add(pid, 2, 'รอดชีวิตถึงจบเกม');
    }
    // โหวตจับคนร้าย (ศัตรู/โจร) ถูกตัว
    for (const d in lastVoteRes) {
      const outBad = (lastVoteRes[d].out || []).filter(o => o.role === 'enemy' || o.role === 'thief').map(o => o.pid);
      if (!outBad.length) continue;
      const dv = votesAll[d] || {};
      for (const pid in dv) {
        const arr = Array.isArray(dv[pid]) ? dv[pid] : [];
        if (arr.some(t => outBad.includes(t))) add(pid, 3, `โหวตจับคนร้ายถูก (วัน ${d})`);
      }
    }
    // ความสามารถสำเร็จรายคืน
    for (const n in lastHist) {
      const h = lastHist[n] || {};
      const saved = h.saved || [];
      for (const dc in (h.protects || {})) if (saved.includes(h.protects[dc])) add(dc, 5, `รักษาช่วยชีวิตสำเร็จ (คืน ${n})`);
      (h.invNoble || []).forEach(iv => { if (iv.yes) add(iv.noble, 5, `สืบเจอโจร (คืน ${n})`); });
      (h.invSpy || []).forEach(iv => { if (iv.yes) add(iv.spy, 5, `สืบเจอศัตรู (คืน ${n})`); });
      (h.execs || []).forEach(e => { if (e.ok) add(e.noble, 5, `ประหารโจรถูกตัว (คืน ${n})`); });
      const byThief = {};
      (h.steals || []).forEach(s => { byThief[s.thief] = (byThief[s.thief] || 0) + (s.amt || 0); });
      for (const th in byThief) if (byThief[th] > 0) add(th, 5, `ปล้นได้ ${byThief[th]} ไร่ (คืน ${n})`);
      const killed = (h.deaths || []).filter(x => x.cause === 'kill').map(x => x.pid);
      for (const en in (h.enemyVotes || {})) {
        const arr = Array.isArray(h.enemyVotes[en]) ? h.enemyVotes[en] : [];
        const hits = arr.filter(t => killed.includes(t)).length;
        if (hits) add(en, 5 * hits, `ลอบสังหารสำเร็จ ${hits} คน (คืน ${n})`);
      }
      if (h.gift && h.gift.toRole && h.gift.toRole !== 'thief' && h.gift.toRole !== 'enemy') add(h.gift.from, 5, `แจกศักดินาให้ชาวเมือง (คืน ${n})`);
    }
    return S;
  }

  // ---------------- หน้าสรุปเกม (ไทม์ไลน์ + อันดับ + CSV) ----------------
  const TEAM_TH = { villager: 'ชาวเมือง', enemy: 'ศัตรู', thief: 'โจร', mad: 'คนบ้า' };
  const nameOf = (pid) => players[pid] ? esc(players[pid].name) : '?';
  const roleTag = (pid) => { const r = ROLES[roles[pid]]; return r ? `<b style="color:${r.color}">${r.name}</b>` : ''; };

  function timelineHtml() {
    const days = Object.keys(lastVoteRes).map(Number);
    const nights = Object.keys(lastHist).map(Number);
    const maxD = Math.max(0, ...days, ...nights.map(n => n - 1));
    let out = `<div class="tl-day"><div class="tl-title">🌌 คืนที่ 1 — ทุกคนรับบทบาทลับของตน</div></div>`;
    for (let d = 1; d <= maxD + 1; d++) {
      const vr = lastVoteRes[d];
      if (vr) {
        let lines = (vr.out || []).map(o => `⚖️ ชาวเมืองขับ <b>${nameOf(o.pid)}</b> (${roleTag(o.pid)}) — ${(vr.tally || {})[o.pid] || 0} เสียง`);
        if (!lines.length) lines = ['⚖️ ไม่มีผู้ถูกขับออก'];
        out += `<div class="tl-day"><div class="tl-title">☀️ วันที่ ${d} ณ ${locationOfDay(d).name}</div>${lines.map(l => `<div class="tl-line">${l}</div>`).join('')}</div>`;
      }
      const h = lastHist[d + 1];
      if (h) {
        const L = [];
        if (h.gift) L.push(`👑 เจ้าเมืองแจกศักดินา 25 ไร่ให้ <b>${nameOf(h.gift.to)}</b>${h.gift.toRole === 'thief' ? ' <span style="color:var(--orange)">(เผลอให้โจร!)</span>' : ''}`);
        (h.steals || []).forEach(s => L.push(`🪙 <b>${nameOf(s.thief)}</b> ปล้น <b>${nameOf(s.victim)}</b> ได้ ${s.amt} ไร่`));
        (h.invNoble || []).forEach(iv => L.push(`🔎 ขุนนาง <b>${nameOf(iv.noble)}</b> สืบ <b>${nameOf(iv.target)}</b>: ${iv.yes ? '⚠️ เป็นโจร' : 'ไม่ใช่โจร'}`));
        (h.invSpy || []).forEach(iv => L.push(`🏮 จารชน <b>${nameOf(iv.spy)}</b> สืบ <b>${nameOf(iv.target)}</b>: ${iv.yes ? '⚠️ เป็นศัตรู' : 'ไม่ใช่ศัตรู'}`));
        (h.execs || []).forEach(e => L.push(e.ok ? `⚔️ ขุนนาง <b>${nameOf(e.noble)}</b> ประหาร <b>${nameOf(e.target)}</b> (โจรตัวจริง!)` : `⚔️ ขุนนาง <b>${nameOf(e.noble)}</b> ชี้ตัว <b>${nameOf(e.target)}</b> ผิด จึงถูกกำจัดแทน`));
        (h.deaths || []).forEach(x => {
          if (x.cause === 'kill') L.push(`☠️ <b>${nameOf(x.pid)}</b> (${roleTag(x.pid)}) ถูกศัตรูลอบสังหาร`);
          else if (x.cause === 'bankrupt') L.push(`🪙 <b>${nameOf(x.pid)}</b> (${roleTag(x.pid)}) ถูกปล้นจนสิ้นเนื้อประดาตัว`);
        });
        if (h.lordSaved) L.push('⚔️ องครักษ์สละชีพปกป้องเจ้าเมืองจากการลอบสังหาร');
        (h.saved || []).forEach(p => L.push(`💚 หมอหลวงช่วยชีวิต <b>${nameOf(p)}</b> ไว้ได้`));
        if (!L.length) L.push('🕊️ คืนนี้สงบ ไม่มีเหตุการณ์');
        out += `<div class="tl-day night"><div class="tl-title">🌙 คืนที่ ${d + 1}</div>${L.map(l => `<div class="tl-line">${l}</div>`).join('')}</div>`;
      }
    }
    return out;
  }

  function showSummary(scores, team, title) {
    if (!scores) { App.toast('ไม่มีข้อมูลคะแนน'); return; }
    const sorted = Object.entries(scores).sort((a, b) => b[1].total - a[1].total);
    const rows = sorted.map(([pid, s], i) => {
      const r = ROLES[s.role];
      return `<tr class="${i === 0 ? 'mvp' : ''}"><td>${i === 0 ? '🏆' : i + 1}</td>
        <td>${esc(s.name)}${i === 0 ? ' <span class="mvp-tag">MVP</span>' : ''}</td>
        <td style="color:${r.color}">${r.name}</td>
        <td>${s.alive ? '💚 รอด' : '✝'}</td>
        <td class="pts">${s.total}</td>
        <td class="notes">${s.notes.map(esc).join('<br>') || '-'}</td></tr>`;
    }).join('');
    let ov = document.getElementById('summary-ov');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'summary-ov';
    ov.className = 'summary-overlay';
    ov.innerHTML = `<div class="sum-panel">
      <h2>📜 สรุปศึกชิงพระนคร — ${title || ''}</h2>
      <div class="sum-grid">
        <div><h3>🏆 อันดับคะแนน</h3>
          <table class="lead-table"><tr><th>#</th><th>ชื่อ</th><th>บทบาท</th><th>สถานะ</th><th>คะแนน</th><th>ที่มาคะแนน</th></tr>${rows}</table>
          <p class="sum-note">เกณฑ์: ทีมชนะ +10 • รอดชีวิต +2 • โหวตจับคนร้ายถูก +3 • ใช้ความสามารถสำเร็จ +5</p>
        </div>
        <div><h3>🕰️ ไทม์ไลน์เหตุการณ์</h3><div class="tl-wrap">${timelineHtml()}</div></div>
      </div>
      <div class="sum-btns">
        <button class="btn btn-gold" id="btn-csv">⬇️ ดาวน์โหลดคะแนน (CSV เปิดใน Excel)</button>
        <button class="btn btn-ghost" id="btn-sum-close">ปิด</button>
      </div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#btn-sum-close').onclick = () => ov.remove();
    ov.querySelector('#btn-csv').onclick = () => downloadCSV(sorted);
  }

  function downloadCSV(sorted) {
    const rows = [['อันดับ', 'ชื่อ', 'บทบาท', 'ฝ่าย', 'สถานะ', 'คะแนนรวม', 'ที่มาคะแนน']];
    sorted.forEach(([pid, s], i) => {
      const r = ROLES[s.role];
      rows.push([i + 1, s.name, r.name, TEAM_TH[r.team] || '', s.alive ? 'รอดชีวิต' : 'ถูกกำจัด', s.total, s.notes.join(' | ')]);
    });
    const csv = '﻿' + rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `คะแนนเกมอยุธยา-ห้อง${code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------------- เรนเดอร์จอครู ----------------
  const PHASE_TH = { reveal: '🌌 คืนที่ 1 — ทำความรู้จักบทบาท', night: '🌙 กลางคืน', day: '☀️ กลางวัน — สนทนา', vote: '🗳️ ลงมติขับไล่', end: '🏁 จบเกม', dawnfx: '🌅 รุ่งอรุณ...', duskfx: '🌆 พลบค่ำ...', nightfx: '🌙 ราตรีมาเยือน...' };
  function renderTop() {
    if (!meta) return;
    let t = PHASE_TH[meta.phase] || '';
    if (meta.phase === 'night') t += ` คืนที่ ${meta.night}`;
    if (meta.phase === 'day' || meta.phase === 'vote') t += ` วันที่ ${meta.day}`;
    $('h-phase').textContent = t;
    App.scene(meta.phase);
  }
  function renderTimer() {
    const el = $('h-timer');
    if (!meta || !meta.phaseEnds) { el.textContent = '--:--'; el.classList.remove('urgent'); return; }
    const s = Math.max(0, Math.floor((meta.phaseEnds - Net.now()) / 1000));
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', s <= 20);
  }
  function voteLiveHtml() {
    const dv = (votes && votes[meta.day]) || {};
    const byTarget = {};
    for (const v in dv) (Array.isArray(dv[v]) ? dv[v] : []).forEach(t => { (byTarget[t] = byTarget[t] || []).push(v); });
    const rows = Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length).map(([t, vs]) =>
      `<div class="vl-row"><b class="vl-target">${nameOf(t)}</b><span class="vl-count">${vs.length} เสียง</span><span class="vl-voters">← ${vs.map(nameOf).join(', ')}</span></div>`).join('');
    return `<div class="vl-wrap">${rows || '<div class="vl-row">ยังไม่มีใครลงมติ...</div>'}</div>`;
  }
  function renderNarration() {
    if (!meta) return;
    const el = $('h-narration'), loc = $('h-loc-name');
    if (meta.phase === 'end') return;
    if (meta.phase === 'reveal') { loc.textContent = 'เปิดเรื่อง'; el.textContent = STORY.opening; }
    else if (meta.phase === 'night') { loc.textContent = `คืนที่ ${meta.night}`; el.textContent = STORY.nightIntro + (meta.execNight ? ' — คืนนี้ขุนนางประหารโจรได้!' : '') + (meta.giftNight ? ' — คืนนี้เจ้าเมืองแจกศักดินา' : ''); }
    else if (meta.phase === 'vote') { loc.textContent = `🗳️ ลงมติ — เห็นกันหมดว่าใครโหวตใคร`; el.innerHTML = voteLiveHtml(); }
    else if (meta.day) { const l = locationOfDay(meta.day); loc.textContent = `วันที่ ${meta.day} — ${l.name}`; el.textContent = `${l.hook} • 💡 ${l.fact}`; }
  }
  function renderLoot() {
    $('h-loot').textContent = loot;
    const gEl = $('h-goal'); if (gEl) gEl.textContent = goal;
    $('h-loot-bar').style.width = Math.min(100, loot / goal * 100) + '%';
  }
  function renderStats() {
    const groups = { villager: 'ฝ่ายชาวเมือง', enemy: 'ศัตรู', thief: 'โจร', mad: 'คนบ้า' };
    const cnt = { villager: 0, enemy: 0, thief: 0, mad: 0 };
    alivePids().forEach(p => cnt[ROLES[roles[p]].team]++);
    $('h-stats').innerHTML = Object.keys(groups).map(g => `<span class="astat">${groups[g]}: <b>${cnt[g]}</b></span>`).join('') +
      `<span class="astat">รวมรอด: <b>${alivePids().length}</b>/${Object.keys(players).length}</span>`;
  }
  function renderBoard(revealAll) {
    // ห้ามโชว์ศักดินารายคนบนจอสาธารณะ — จะเดาบทบาทได้ทันที (50,000=เจ้าเมือง ฯลฯ)
    const showRoles = revealAll || (meta && meta.phase === 'end');
    $('h-board').innerHTML = Object.entries(players).map(([pid, p]) => {
      const dead = !alive[pid];
      const r = roles[pid];
      const roleTag = (showRoles || dead) && r ? `<div class="sk" style="color:${ROLES[r].color}">${ROLES[r].name}</div>` : '<div class="sk">&nbsp;</div>';
      return `<div class="pb-card ${dead ? 'dead' : ''}" data-pid="${pid}" title="แตะเพื่อจัดการผู้เล่นนี้">${Art.avatar(p.avatar || 0)}
        <div class="nm">${esc(p.name)}</div>${roleTag}</div>`;
    }).join('');
    $('h-board').querySelectorAll('.pb-card').forEach(c => { c.onclick = () => playerMenu(c.dataset.pid); });
  }
  function log(text) {
    const el = $('h-log');
    const d = document.createElement('div');
    d.textContent = text;
    el.prepend(d);
  }

  // กลับเข้าห้องเดิมหลังรีเฟรชหน้า (เครื่องครูเป็นเอนจิน — สำคัญมาก)
  async function resume(codeArg) {
    code = codeArg; R = 'rooms/' + code;
    const m = await Net.once(R + '/meta');
    if (!m) return false;
    meta = m;
    if (m.state === 'lobby') bindLobby();
    else bindGame();
    return true;
  }

  return { create, resume };
})();
