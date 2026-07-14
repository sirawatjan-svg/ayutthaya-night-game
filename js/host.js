// ============================================================
// Host — เอนจินเกมฝั่งครู (เครื่องครูเป็นผู้ประมวลผลทั้งหมด)
// ============================================================

const Host = (() => {
  let code = null, R = null;
  let meta = null, players = {}, roles = {}, alive = {}, sak = {}, loot = 0;
  let acts = null, votes = null, thiefTurns = {};
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

  function renderLobby() {
    const list = Object.entries(players);
    $('hl-count').textContent = list.length;
    $('hl-players').innerHTML = list.map(([pid, p]) =>
      `<div class="lobby-p">${Art.avatar(p.avatar || 0)}<div class="nm">${esc(p.name)}</div></div>`).join('') ||
      '<p class="p-note">ยังไม่มีใครเข้าเมือง...</p>';
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
    await Net.update(R, { roles: rolesW, alive: aliveW, sak: sakW, loot: 0, thiefTurns: turnsW });
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
      killQuota: killQuota(night),
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
      Net.on(R + '/act', v => { acts = v || {}; }),
      Net.on(R + '/votes', v => { votes = v || {}; }),
    );
    $('btn-skip').onclick = () => advance(true);
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tick, 600);
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
    await FX.play('dawn', { day, loc });
    await setPhase('day', meta.night, day, meta0().day);
    log(`🌅 เช้าวันที่ ${day} ณ ${loc.name}`);
  }

  async function toVote() {
    await setPhase('vote', meta.night, meta.day, 1.5, { voteQuota: voteQuota(alivePids().length) });
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
    await Net.set(R + '/voteresults/' + day, { out: out.map(p => ({ pid: p, role: roles[p] })), tally });

    for (const t of out) {
      alive[t] = false;
      await Net.set(R + '/alive/' + t, false);
      await FX.play('voteout', { name: players[t].name, avatar: players[t].avatar, role: roles[t] });
      log(`⚖️ ชาวเมืองขับ ${players[t].name} (${ROLES[roles[t]].name}) ออกจากพระนคร — ${tally[t]} เสียง`);
      if (roles[t] === 'mad') {
        await FX.play('madwin', { name: players[t].name });
        return endGame('mad', 'คนบ้าชนะ!', `${players[t].name} หลอกทั้งเมืองให้โหวตขับตนเองสำเร็จ`);
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
    await FX.play('night', { night: n });
    await setPhase('night', n, meta.day, meta0().night, { activeThief: active || null });
    log(`🌙 คืนที่ ${n} เริ่มขึ้น — ทุกบทบาทลงมือในความมืด`);
    Sound.ambience(true);
  }

  async function resolveNight() {
    Sound.ambience(false);
    const n = meta.night, a = (acts && acts[n]) || {};
    const ev = [];           // เหตุการณ์ FX ตามลำดับ
    const deaths = new Map(); // pid -> cause
    const pub = { deaths: [], saved: 0, stealTotal: 0, stealCount: 0, gifted: null, exec: [] };
    const inbox = [];        // {pid, text}

    await setPhase('dawnfx', n, meta.day, 0);

    // 1) เจ้าเมืองแจกศักดินา (คืนเว้นคืน)
    if (meta.giftNight) {
      const lord = aliveOf('lord')[0];
      const t = lord && a.gift && a.gift[lord];
      if (t && t !== '-' && alive[t]) {
        sak[t] = (sak[t] || 0) + 25;
        sak[lord] -= 25;
        pub.gifted = true;
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
          inbox.push({ pid: nb, text: `เจ้าลงดาบถูกคน! ${players[t].name} คือโจรจริง` });
        } else {
          deaths.set(nb, 'misjudge');
          pub.exec.push({ ok: false });
          inbox.push({ pid: nb, text: `เจ้าชี้ตัวผิด... ${players[t].name} ไม่ใช่โจร เจ้าต้องรับโทษแทน` });
        }
      }
    }

    // 4) ศัตรูโหวตสังหาร
    const evotes = {};
    for (const en of aliveOf('enemy')) {
      const arr = Array.isArray(a.enemyVotes && a.enemyVotes[en]) ? a.enemyVotes[en] : [];
      arr.forEach(t => { if (alive[t] && roles[t] !== 'enemy') evotes[t] = (evotes[t] || 0) + 1; });
    }
    const kq = killQuota(n);
    const kranked = shuffle(Object.keys(evotes)).sort((x, y) => evotes[y] - evotes[x]);
    const killed = kranked.slice(0, kq);
    killed.forEach(t => { if (!deaths.has(t)) deaths.set(t, 'kill'); });

    // 5) แพทย์คุ้มครอง
    const protectedSet = new Set();
    for (const dc of aliveOf('doctor')) {
      const t = a.protect && a.protect[dc];
      if (t && t !== '-') protectedSet.add(t);
    }
    for (const [pid, cause] of [...deaths]) {
      if (protectedSet.has(pid)) {
        deaths.delete(pid);
        pub.saved++;
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
        inbox.push({ pid: nb, text: `ผลสืบสวนคืนที่ ${n}: ${players[t].name} ${yes ? '⚠️ เป็นโจร!' : '✔ ไม่ใช่โจร'}` });
      }
    }
    for (const sp of aliveOf('spy')) {
      const t = a.spyInv && a.spyInv[sp];
      if (t && t !== '-') {
        const yes = roles[t] === 'enemy';
        inbox.push({ pid: sp, text: `ผลสืบสวนคืนที่ ${n}: ${players[t].name} ${yes ? '⚠️ เป็นศัตรู!' : '✔ ไม่ใช่ศัตรู'}` });
      }
    }

    // เขียนสถานะทั้งหมด
    const upd = { loot };
    for (const p in sak) upd['sak/' + p] = sak[p];
    for (const p in alive) upd['alive/' + p] = alive[p];
    upd['results/' + n] = pub;
    await Net.update(R, upd);
    for (const m of inbox) await Net.push(R + '/private/' + m.pid, { night: n, text: m.text });

    // เล่นอนิเมชั่นสรุปเช้าบนจอครู
    for (const e of ev) await FX.play(e.type, e);
    for (const x of pub.exec) await FX.play('execute', { name: '...', text: x.ok ? 'ตำรวจหลวงกำจัดโจรได้สำเร็จ!' : 'ขุนนางชี้ตัวผิด จึงต้องรับโทษเสียเอง' });
    for (const d of pub.deaths) {
      const nm = players[d.pid].name;
      if (d.cause === 'kill') { await FX.play('kill', { name: nm, role: d.role }); log(`☠️ ${nm} (${ROLES[d.role].name}) ถูกลอบสังหาร`); }
      else if (d.cause === 'bankrupt') { await FX.play('bankrupt', { name: nm, role: d.role }); log(`🪙 ${nm} (${ROLES[d.role].name}) สิ้นเนื้อประดาตัว ถูกกำจัด`); }
      else { await FX.play('kill', { name: nm, role: d.role }); log(`⚔️ ${nm} (${ROLES[d.role].name}) ถูกประหาร/รับโทษ`); }
    }
    if (pub.saved) { await FX.play('heal', { text: `หมอหลวงช่วยชีวิตผู้เคราะห์ร้ายไว้ได้ ${pub.saved} คน` }); log(`💚 หมอหลวงช่วยชีวิตไว้ ${pub.saved} คน`); }
    if (pub.deaths.length === 0 && !pub.saved) log('🕊️ เช้านี้ทุกคนปลอดภัย');

    if (loot > 0) log(`🪙 ชุมโจรสะสมศักดินาแล้ว ${loot}/${THIEF_GOAL} ไร่`);
    if (await checkWin()) return;
    await toDay(n);
  }

  // ---------------- เงื่อนไขชนะ ----------------
  async function checkWin() {
    const en = aliveOf('enemy').length;
    const others = alivePids().length - en;
    const lord = aliveOf('lord').length;
    if (lord === 0) return endGame('enemy', 'ศัตรูชนะ!', 'เจ้าเมืองสิ้นชีพ พระนครไร้ผู้นำ ไส้ศึกเปิดประตูเมืองรับทัพใหญ่');
    if (loot >= THIEF_GOAL) return endGame('thief', 'แก๊งโจรชนะ!', `ชุมโจรยึดศักดินาครบ ${THIEF_GOAL} ไร่ กลายเป็นผู้มีอิทธิพลเหนือพระนคร`);
    if (en > others) return endGame('enemy', 'ศัตรูชนะ!', 'ไส้ศึกมีจำนวนมากกว่าชาวเมือง พระนครถูกยึดจากภายใน');
    if (en === 0 && aliveOf('thief').length === 0) return endGame('villager', 'ชาวเมืองชนะ!', 'ทั้งไส้ศึกและชุมโจรถูกกวาดล้างจนหมดสิ้น กรุงศรีอยุธยากลับคืนสู่ความสงบ');
    return false;
  }

  async function endGame(team, title, text) {
    await Net.set(R + '/winner', { team, title, text });
    await setPhase('end', meta.night, meta.day, 0);
    await FX.play('win', { team, title, text, sad: team === 'enemy' });
    log(`🏁 ${title} — ${text}`);
    $('h-narration').innerHTML = `<b style="color:var(--gold)">${title}</b><br>${text}<br><br>เปิดเผยบทบาททั้งหมดบนกระดานด้านขวา`;
    renderBoard(true);
    return true;
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
  function renderNarration() {
    if (!meta) return;
    const el = $('h-narration'), loc = $('h-loc-name');
    if (meta.phase === 'end') return;
    if (meta.phase === 'reveal') { loc.textContent = 'เปิดเรื่อง'; el.textContent = STORY.opening; }
    else if (meta.phase === 'night') { loc.textContent = `คืนที่ ${meta.night}`; el.textContent = STORY.nightIntro + (meta.execNight ? ' — คืนนี้ขุนนางประหารโจรได้!' : '') + (meta.giftNight ? ' — คืนนี้เจ้าเมืองแจกศักดินา' : ''); }
    else if (meta.day) { const l = locationOfDay(meta.day); loc.textContent = `วันที่ ${meta.day} — ${l.name}`; el.textContent = l.story; }
  }
  function renderLoot() {
    $('h-loot').textContent = loot;
    $('h-loot-bar').style.width = Math.min(100, loot / THIEF_GOAL * 100) + '%';
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
      return `<div class="pb-card ${dead ? 'dead' : ''}">${Art.avatar(p.avatar || 0)}
        <div class="nm">${esc(p.name)}</div>${roleTag}</div>`;
    }).join('');
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
