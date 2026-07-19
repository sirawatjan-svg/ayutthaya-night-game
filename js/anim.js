// ============================================================
// Sound — เสียงสังเคราะห์ผ่าน Web Audio API (ไม่ต้องโหลดไฟล์)
// FX — อนิเมชั่นเหตุการณ์เต็มจอ (สังหาร ปล้น รักษา สืบ แจกที่ดิน ฯลฯ)
// ============================================================

const Sound = (() => {
  let ctx = null, ambGain = null, ambNodes = [];
  let musGain = null, musTimer = null, musNodes = [], musMode = null, musMuted = false, musStep = 0;
  function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); }
  function tone(freq, type, dur, vol, when, bend) {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + (when || 0);
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(bend, t + dur);
    env(g, t, 0.01, vol || 0.2, dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, when, filterFreq, q) {
    const c = ac(), t = c.currentTime + (when || 0);
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq || 800; f.Q.value = q || 1;
    const g = c.createGain(); env(g, t, 0.01, vol || 0.15, dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  // ---------- ดนตรีประกอบ: เพนทาโทนิกไทยสังเคราะห์ (คล้ายระนาด/ขลุ่ย ไม่ใช้ไฟล์) ----------
  const PENTA = [0, 2, 5, 7, 9];
  const noteHz = (root, deg) => root * Math.pow(2, (PENTA[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12);
  function pluck(freq, when, vol, dur, type) {
    if (!musGain) return;
    const c = ac(), t = c.currentTime + when;
    [0, 4].forEach((det, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq * (1 + det / 1200);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * (i ? 0.35 : 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(musGain); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function stopMusic() {
    if (musTimer) { clearInterval(musTimer); musTimer = null; }
    musNodes.forEach(n => { try { n.stop(); } catch (e) {} }); musNodes = [];
    if (musGain) {
      const c = ac(), old = musGain; musGain = null;
      try { old.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1); } catch (e) {}
      setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 1400);
    }
  }
  function startMusic(mode) {
    const c = ac();
    musGain = c.createGain(); musGain.gain.value = 0.0001; musGain.connect(c.destination);
    musGain.gain.linearRampToValueAtTime(mode === 'night' ? 0.5 : 0.4, c.currentTime + 2.5);
    musStep = 0;
    const root = mode === 'night' ? 147 : 196; // D3 กลางคืน / G3 กลางวัน
    let deg = 5;
    if (mode === 'night') {
      // โดรนเบาๆ (root + คู่ห้า) ให้บรรยากาศลึกลับ
      [root / 2, (root / 2) * 1.498].forEach(f => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.045;
        o.connect(g).connect(musGain); o.start(); musNodes.push(o);
      });
    }
    musTimer = setInterval(() => {
      if (!musGain) return;
      const s = musStep++;
      if (mode === 'night') {
        if (Math.random() < 0.34) return; // เว้นวรรคให้โปร่ง ไม่รบกวนสมาธิ
        deg = Math.max(0, Math.min(9, deg + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
        pluck(noteHz(root, deg), 0, 0.15, 2.4, 'sine');       // ขลุ่ยโทนต่ำ
        if (Math.random() < 0.22) pluck(noteHz(root, deg - 5), 0.03, 0.06, 3, 'sine');
      } else {
        const pat = [0, 2, 4, 2, 5, 4, 2, 1];                  // ทำนองระนาดสว่างๆ
        if (s % 8 === 7 && Math.random() < 0.5) return;
        deg = pat[s % 8] + (s % 32 >= 16 ? 2 : 0);
        pluck(noteHz(root, deg + 5), 0, 0.12, 0.55, 'triangle');
        if (s % 4 === 0) pluck(noteHz(root, deg), 0, 0.07, 1.1, 'sine');
      }
    }, mode === 'night' ? 900 : 400);
  }

  // เพลงจริงจาก Higgsfield (sonilo_music) — ถ้าไฟล์โหลดไม่ได้ ใช้เพลงสังเคราะห์แทนอัตโนมัติ
  let musEl = null;
  const MUSIC_FILES = { night: 'assets/music-night.m4a', day: 'assets/music-day.m4a' };
  function stopAllMusic() { stopMusic(); if (musEl) { try { musEl.pause(); } catch (e) {} musEl = null; } }
  function playMusic(mode) {
    const src = MUSIC_FILES[mode];
    if (!src) { startMusic(mode); return; }
    const el = new Audio(src);
    el.loop = true;
    el.volume = mode === 'night' ? 0.25 : 0.2; // เบาๆ อยู่เบื้องหลัง ไม่กวนสมาธิ
    el.onerror = () => { if (musMode === mode && !musMuted) startMusic(mode); };
    el.play().then(() => { musEl = el; }).catch(() => { if (musMode === mode && !musMuted) startMusic(mode); });
  }

  return {
    unlock() { try { ac(); } catch (e) {} },
    music(mode) { musMode = mode; stopAllMusic(); if (mode && !musMuted) playMusic(mode); },
    toggleMute() { musMuted = !musMuted; stopAllMusic(); if (!musMuted && musMode) playMusic(musMode); return musMuted; },
    gong() { tone(160, 'sine', 2.2, 0.3); tone(240, 'sine', 1.8, 0.12, 0.02); tone(90, 'sine', 2.6, 0.18, 0.01); },
    drum() { tone(120, 'sine', 0.3, 0.5, 0, 45); noise(0.12, 0.2, 0, 300, 0.8); },
    chime() { [880, 1174, 1568].forEach((f, i) => tone(f, 'sine', 0.9, 0.12, i * 0.12)); },
    whoosh() { noise(0.5, 0.25, 0, 1200, 0.6); },
    slash() { noise(0.22, 0.3, 0, 2400, 1.2); tone(200, 'sawtooth', 0.18, 0.1, 0.02, 60); },
    coins() { for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 1200, 'triangle', 0.14, 0.08, i * 0.07); },
    heal() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.7, 0.1, i * 0.14)); },
    mystery() { tone(320, 'sine', 1.2, 0.12, 0, 480); tone(160, 'triangle', 1.4, 0.08, 0.1); },
    death() { tone(220, 'sawtooth', 1.2, 0.16, 0, 70); tone(110, 'sine', 1.5, 0.2, 0.05, 55); this.drum(); },
    crazy() { for (let i = 0; i < 8; i++) tone(400 + Math.random() * 900, 'square', 0.16, 0.06, i * 0.09); },
    fanfare() { const n = [523, 659, 784, 1047, 784, 1047]; n.forEach((f, i) => { tone(f, 'triangle', 0.4, 0.16, i * 0.16); tone(f / 2, 'sine', 0.4, 0.1, i * 0.16); }); this.gong(); },
    lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 'triangle', 0.6, 0.14, i * 0.28)); },
    tick() { tone(1400, 'sine', 0.06, 0.06); },
    ambience(on) {
      const c = ac();
      if (ambGain) { try { ambGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.8); } catch (e) {} ambNodes.forEach(n => { try { n.stop(c.currentTime + 1); } catch (e) {} }); ambGain = null; ambNodes = []; }
      if (!on) return;
      // เบาลงมาก + โทนต่ำลง ไม่แสบหู (feedback จากห้องเรียน: เสียงตึ๊ดยาวหนวกหู)
      ambGain = c.createGain(); ambGain.gain.value = 0.016; ambGain.connect(c.destination);
      [2300, 3050].forEach((f, k) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain(); g.gain.value = 0;
        const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 6 + k * 3;
        const lg = c.createGain(); lg.gain.value = 0.5;
        lfo.connect(lg).connect(g.gain);
        // คลื่นช้าอีกชั้น ให้เสียงจิ้งหรีดดัง-เบาเป็นระลอก ไม่ต่อเนื่องตลอด
        const slow = c.createOscillator(); slow.type = 'sine'; slow.frequency.value = 0.09 + k * 0.05;
        const sg = c.createGain(); sg.gain.value = 0.4;
        slow.connect(sg).connect(g.gain);
        o.connect(g).connect(ambGain);
        o.start(); lfo.start(); slow.start(); ambNodes.push(o, lfo, slow);
      });
    },
    // ---------- เสียงบรรยากาศเบาๆ สุ่มเล่นครั้งเดียว (สังเคราะห์ล้วน ไม่มีไฟล์ ไม่เสียเครดิต) ----------
    ambientCue() {
      const cues = [
        () => { tone(520, 'sine', 3.2, 0.05, 0, 500); tone(1040, 'sine', 2.8, 0.02, 0.05, 1000); }, // ระฆังวัดไกลๆ
        () => { for (let i = 0; i < 3; i++) tone(1800 + Math.random() * 900, 'sine', 0.12, 0.035, i * 0.16 + Math.random() * 0.1); }, // นกร้องกลางคืน
        () => { noise(0.35, 0.05, 0, 350, 0.7); tone(140, 'sine', 0.3, 0.03, 0.03, 90); }, // ไม้พายกระทบน้ำ
        () => { noise(2.2, 0.045, 0, 500, 0.5); }, // ลมพัดผ่านกำแพง
        () => { tone(300, 'sawtooth', 0.18, 0.035, 0, 180); tone(260, 'sawtooth', 0.22, 0.03, 0.28, 150); }, // หมาเห่าไกลๆ
      ];
      cues[Math.floor(Math.random() * cues.length)]();
    },
  };
})();

// ============================================================
const FX = (() => {
  let layer = null;
  function ensure() {
    if (!layer) { layer = document.createElement('div'); layer.id = 'fx-layer'; document.body.appendChild(layer); }
    return layer;
  }
  function sparkles(n, cls) {
    let s = '';
    for (let i = 0; i < n; i++) {
      s += `<span class="fx-p ${cls}" style="left:${(10 + Math.random() * 80).toFixed(0)}%;top:${(20 + Math.random() * 60).toFixed(0)}%;animation-delay:${(Math.random() * 0.8).toFixed(2)}s"></span>`;
    }
    return s;
  }
  // แสดง overlay 1 เหตุการณ์ คืนค่า Promise เมื่อจบ
  function show(html, dur, cls) {
    return new Promise(res => {
      const el = document.createElement('div');
      el.className = 'fx-overlay ' + (cls || '');
      el.innerHTML = html;
      ensure().appendChild(el);
      requestAnimationFrame(() => el.classList.add('fx-in'));
      setTimeout(() => { el.classList.add('fx-out'); setTimeout(() => { el.remove(); res(); }, 500); }, dur);
    });
  }
  const card = (inner, tint) => `<div class="fx-card" style="--tint:${tint || '#c0c4cc'}">${inner}</div>`;

  const FXS = {
    kill(o) {
      Sound.slash(); setTimeout(() => Sound.death(), 350);
      return show(card(`
        <div class="fx-art fx-shake">${Art.icon('dagger', 110)}<div class="fx-slash"></div><div class="fx-slash s2"></div></div>
        <div class="fx-smoke"></div>
        <h2>ถูกลอบสังหารยามวิกาล</h2><div class="fx-name">${o.name}</div>
        ${o.role ? `<div class="fx-sub">แท้จริงคือ <b style="color:${ROLES[o.role].color}">${ROLES[o.role].name}</b></div>` : ''}`, '#e03131'), 3600, 'fx-dark');
    },
    bankrupt(o) {
      Sound.coins(); setTimeout(() => Sound.death(), 500);
      return show(card(`
        <div class="fx-art">${Art.icon('sack', 100)}${sparkles(14, 'fx-coin')}</div>
        <h2>สิ้นเนื้อประดาตัว! ศักดินาหมด</h2><div class="fx-name">${o.name}</div>
        ${o.role ? `<div class="fx-sub">แท้จริงคือ <b style="color:${ROLES[o.role].color}">${ROLES[o.role].name}</b></div>` : ''}`, '#f28c28'), 3600, 'fx-dark');
    },
    steal(o) {
      Sound.whoosh(); setTimeout(() => Sound.coins(), 300);
      return show(card(`
        <div class="fx-art fx-sneak">${Art.icon('sack', 100)}${sparkles(10, 'fx-coin')}</div>
        <h2>โจรออกปล้นยามวิกาล</h2>
        <div class="fx-sub">${o.text || 'ศักดินาบางส่วนหายไปในความมืด...'}</div>`, '#f28c28'), 3200, 'fx-dark');
    },
    heal(o) {
      Sound.heal();
      return show(card(`
        <div class="fx-art fx-glow-g">${Art.icon('herb', 100)}${sparkles(12, 'fx-leaf')}</div>
        <h2>หมอหลวงช่วยชีวิตไว้ได้!</h2>
        <div class="fx-sub">${o.text || 'มีผู้รอดพ้นจากเงื้อมมือมัจจุราชเมื่อคืนนี้'}</div>`, '#2faf66'), 3200, 'fx-dark');
    },
    investigate(o) {
      Sound.mystery();
      return show(card(`
        <div class="fx-art">${Art.icon('lantern', 100)}<div class="fx-beam"></div></div>
        <h2>${o.title || 'ผลการสืบสวน'}</h2>
        <div class="fx-name">${o.name || ''}</div>
        <div class="fx-verdict ${o.yes ? 'v-yes' : 'v-no'}">${o.text}</div>`, o.yes ? '#e03131' : '#2faf66'), 3400, 'fx-dark');
    },
    gift(o) {
      Sound.chime(); setTimeout(() => Sound.coins(), 400);
      return show(card(`
        <div class="fx-art fx-float">${Art.icon('chatra', 100)}${sparkles(12, 'fx-gold')}</div>
        <h2>เจ้าเมืองพระราชทานศักดินา</h2>
        <div class="fx-sub">${o.text || 'มีผู้ได้รับศักดินาเพิ่ม 25 ไร่'}</div>`, '#f5c518'), 3200, 'fx-dark');
    },
    execute(o) {
      Sound.slash(); setTimeout(() => Sound.drum(), 400);
      return show(card(`
        <div class="fx-art fx-shake">${Art.icon('sword', 110)}</div>
        <h2>ขุนนางลงดาบประหาร!</h2><div class="fx-name">${o.name}</div>
        <div class="fx-sub">${o.text || ''}</div>`, '#8b5a2b'), 3600, 'fx-dark');
    },
    voteout(o) {
      Sound.drum(); setTimeout(() => Sound.gong(), 600);
      return show(card(`
        <div class="fx-art">${Art.avatar(o.avatar || 0, 'width="90" height="153"')}</div>
        <h2>ชาวเมืองลงมติขับออกจากพระนคร</h2><div class="fx-name">${o.name}</div>
        ${o.role ? `<div class="fx-sub">แท้จริงคือ <b style="color:${ROLES[o.role].color}">${ROLES[o.role].name}</b></div>` : ''}`, '#c0c4cc'), 4000, 'fx-dark');
    },
    madwin(o) {
      Sound.crazy(); setTimeout(() => Sound.fanfare(), 700);
      return show(card(`
        <div class="fx-art fx-spin">${Art.icon('swirl', 110)}</div>
        ${sparkles(24, 'fx-purple')}
        <h2 class="fx-rainbow">คนบ้าถูกโหวตออก... คนบ้าชนะ!!</h2>
        <div class="fx-name">${o.name}</div>
        <div class="fx-sub">เสียงหัวเราะดังก้องทั่วพระนคร ฮ่าๆๆๆ</div>`, '#9b59b6'), 5000, 'fx-dark');
    },
    // ---------- คัตซีนเงา (สั้น ไร้ชื่อ — สร้างอารมณ์ก่อนรายงานเช้า) ----------
    cutKill() {
      Sound.whoosh(); setTimeout(() => Sound.slash(), 1900); setTimeout(() => Sound.drum(), 2100);
      return show(`<div class="cs-scene">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <defs><linearGradient id="csn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0e2a"/><stop offset="1" stop-color="#1a1235"/></linearGradient></defs>
          <rect width="400" height="200" fill="url(#csn)"/><circle cx="330" cy="38" r="16" fill="#e8e4d0" opacity="0.85"/>
          <path d="M0,150 L60,150 L70,110 L80,150 L400,150 L400,200 L0,200 Z" fill="#05060f"/>
          <g class="cs-victim"><circle cx="290" cy="104" r="9" fill="#05060f"/><path d="M280,112 Q290,106 300,112 L302,150 L278,150 Z" fill="#05060f"/></g>
          <g class="cs-assassin"><circle cx="0" cy="104" r="9" fill="#05060f"/><path d="M-10,112 Q0,106 10,112 L12,150 L-12,150 Z" fill="#05060f"/><path class="cs-dagger" d="M10,100 L26,88 L28,92 L14,104 Z" fill="#05060f"/></g>
          <rect class="cs-flash" width="400" height="200" fill="#fff"/>
        </svg>
        <div class="cs-cap">เงามรณะเคลื่อนไหวในความมืด...</div></div>`, 3400, 'fx-dark fx-cut');
    },
    cutSteal() {
      Sound.whoosh(); setTimeout(() => Sound.coins(), 1100);
      return show(`<div class="cs-scene">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="200" fill="#0d0a22"/><circle cx="70" cy="40" r="14" fill="#e8e4d0" opacity="0.7"/>
          <rect y="150" width="400" height="50" fill="#05060f"/>
          <g><circle cx="160" cy="106" r="9" fill="#05060f"/><path d="M148,114 Q160,104 172,114 L174,150 L146,150 Z" fill="#05060f"/></g>
          <rect x="210" y="122" width="60" height="30" rx="4" fill="#05060f"/>
          <rect class="cs-lid" x="210" y="114" width="60" height="10" rx="4" fill="#05060f"/>
          ${[0, 1, 2, 3, 4].map(i => `<circle class="cs-coin" style="animation-delay:${0.9 + i * 0.18}s" cx="${232 + i * 6}" cy="120" r="4" fill="#f5c518"/>`).join('')}
        </svg>
        <div class="cs-cap">มีมือมืดย่องเข้าปล้นยามวิกาล...</div></div>`, 3000, 'fx-dark fx-cut');
    },
    cutHeal() {
      Sound.heal();
      return show(`<div class="cs-scene">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="200" fill="#081420"/><rect y="150" width="400" height="50" fill="#04070c"/>
          <ellipse cx="230" cy="146" rx="34" ry="8" fill="#04070c"/>
          <g><circle cx="170" cy="112" r="9" fill="#04070c"/><path d="M158,120 Q170,110 182,120 L184,150 L156,150 Z" fill="#04070c"/></g>
          <circle class="cs-glow" cx="230" cy="130" r="26" fill="#2faf66" opacity="0.25"/>
          ${[0, 1, 2].map(i => `<ellipse class="cs-leaf" style="animation-delay:${i * 0.5}s" cx="${215 + i * 14}" cy="135" rx="4" ry="7" fill="#4fd88a"/>`).join('')}
        </svg>
        <div class="cs-cap">หมอหลวงเยียวยาผู้เคราะห์ร้ายในเงียบงัน...</div></div>`, 2800, 'fx-dark fx-cut');
    },
    cutExec() {
      Sound.mystery(); setTimeout(() => Sound.slash(), 1700); setTimeout(() => Sound.gong(), 1900);
      return show(`<div class="cs-scene">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="200" fill="#140d20"/><rect y="150" width="400" height="50" fill="#05060f"/>
          <g><circle cx="250" cy="118" r="8" fill="#05060f"/><path d="M240,126 Q250,118 260,126 L262,150 L238,150 Z" fill="#05060f"/></g>
          <g class="cs-noble"><circle cx="170" cy="100" r="9" fill="#05060f"/><path d="M158,108 Q170,100 182,108 L184,150 L156,150 Z" fill="#05060f"/><rect class="cs-sword" x="182" y="60" width="4" height="46" rx="2" fill="#05060f"/></g>
          <rect class="cs-flash" style="animation-delay:1.7s" width="400" height="200" fill="#fff"/>
        </svg>
        <div class="cs-cap">ดาบหลวงถูกชักออกจากฝัก... คำตัดสินกำลังมาถึง</div></div>`, 3000, 'fx-dark fx-cut');
    },
    cutGift() {
      Sound.chime(); setTimeout(() => Sound.coins(), 900);
      return show(`<div class="cs-scene">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="200" fill="#160f04"/>
          <path d="M120,150 L150,80 L165,110 L200,50 L235,110 L250,80 L280,150 Z" fill="#05060f"/>
          <rect y="150" width="400" height="50" fill="#05060f"/>
          <g class="cs-stamp"><circle cx="200" cy="100" r="30" fill="none" stroke="#f5c518" stroke-width="4"/><text x="200" y="112" text-anchor="middle" font-size="30" fill="#f5c518">👑</text></g>
        </svg>
        <div class="cs-cap">พระราชโองการจากจวนเจ้าเมือง...</div></div>`, 2600, 'fx-dark fx-cut');
    },
    // ---------- รายงานยามเช้าใบเดียว (ค้างนานพอให้ครูเล่า) ----------
    morning(o) {
      Sound.drum(); setTimeout(() => Sound.chime(), 600);
      const CAUSE = { kill: 'ถูกลอบสังหาร', bankrupt: 'สิ้นเนื้อประดาตัว', execute: 'ถูกประหาร (โจรตัวจริง)', misjudge: 'รับโทษแทนที่ชี้ผิด' };
      const dead = (o.deaths || []).map(d =>
        `<div class="mr-line bad">☠️ <b>${d.name}</b> <span style="color:${ROLES[d.role].color}">(${ROLES[d.role].name})</span> — ${CAUSE[d.cause] || ''}</div>`).join('');
      return show(card(`
        <h2>📜 รายงานยามเช้า</h2>
        <div class="mr-list">
        ${dead || '<div class="mr-line ok">🕊️ เมื่อคืนไม่มีผู้เสียชีวิต</div>'}
        ${o.lordSaved ? '<div class="mr-line ok">⚔️ องครักษ์สละชีพปกป้องเจ้าเมืองไว้ได้</div>' : ''}
        ${o.saved ? `<div class="mr-line ok">💚 หมอหลวงช่วยชีวิตไว้ ${o.saved} คน</div>` : ''}
        ${o.stealTotal ? `<div class="mr-line warn">🪙 โจรปล้นศักดินาไป ${o.stealTotal} ไร่</div>` : ''}
        ${o.gifted ? '<div class="mr-line gold">👑 เจ้าเมืองพระราชทานศักดินาแก่ผู้หนึ่ง</div>' : ''}
        </div>`, '#f5c518'), 8500, 'fx-dark');
    },
    night(o) {
      Sound.gong();
      return show(card(`
        <div class="fx-art">${Art.icon('lantern', 90)}</div>
        <h2>คืนที่ ${o.night}</h2>
        <div class="fx-sub">${o.text || STORY.nightIntro}</div>
        ${o.npc ? `<div class="fx-npc">💬 <b>${NPC_NAME}:</b> "${o.npc}"</div>` : ''}`, '#3ba7e8'), 4600, 'fx-dark');
    },
    dawn(o) {
      Sound.gong(); setTimeout(() => Sound.chime(), 900);
      return show(card(`
        <div class="fx-art fx-float">${Art.icon('rice', 90)}</div>
        <h2>เช้าวันที่ ${o.day} ณ ${o.loc.name}</h2>
        <div class="fx-sub fx-story">${o.loc.hook}<br><br>💡 รู้หรือไม่? ${o.loc.fact}</div>
        ${o.npc ? `<div class="fx-npc">💬 <b>${NPC_NAME}:</b> "${o.npc}"</div>` : ''}`, '#f5c518'), 6800, 'fx-warm');
    },
    win(o) {
      if (o.sad) Sound.lose(); else Sound.fanfare();
      const em = { villager: 'rice', enemy: 'dagger', thief: 'sack', mad: 'swirl' }[o.team] || 'rice';
      const col = { villager: '#2faf66', enemy: '#e03131', thief: '#f28c28', mad: '#9b59b6' }[o.team];
      return show(card(`
        <div class="fx-art fx-float">${Art.icon(em, 110)}</div>
        ${sparkles(26, 'fx-gold')}
        <h2 class="fx-big">${o.title}</h2>
        <div class="fx-sub">${o.text || ''}</div>`, col), 6000, 'fx-dark');
    },
  };

  async function play(type, opts) { if (FXS[type]) await FXS[type](opts || {}); }
  async function queue(list) { for (const it of list) await play(it.type, it); }
  return { play, queue };
})();

// ============================================================
// LivingEnv — เหตุการณ์สุ่มเล็กๆ ระหว่างเล่นเกม (นก/ค้างคาว/ดาวตก/เมฆบังจันทร์/โคมลอย)
// สุ่มทีละ 1 อย่างเท่านั้น ไม่ให้ซ้อนกัน — เกิดขึ้นแล้วเงียบ ค่อยสุ่มใหม่
// ============================================================
const LivingEnv = (() => {
  let timer = null, layer = null, curMode = 'night', paused = false;
  // แต่ละเหตุการณ์เหมาะกับช่วงเวลาต่างกัน — กันค้างคาว/ดาวตกโผล่ตอนกลางวันแดดจ้า
  const MODE_EVENTS = {
    day: ['bird'],
    dawn: ['bird', 'cloudmoon'],
    dusk: ['bird', 'cloudmoon', 'lantern'],
    night: ['bat', 'shootingstar', 'cloudmoon', 'lantern'],
  };
  const EVENTS = [
    { name: 'bird', dur: 6000, sound: false, svg: '<svg viewBox="0 0 24 12" style="width:26px;height:13px"><path d="M0,6 Q6,0 12,6 Q18,0 24,6 Q18,3 12,6 Q6,3 0,6" fill="rgba(10,10,20,0.75)"/></svg>' },
    { name: 'bat', dur: 5000, sound: false, svg: '<svg viewBox="0 0 28 14" style="width:24px;height:12px"><path d="M14,7 L9,2 L11,7 L2,4 L9,8 L2,11 L11,8.5 L9,13 L14,8.5 L19,13 L17,8 L26,11 L19,8 L26,4 L17,7 L19,2 Z" fill="rgba(6,6,14,0.8)"/></svg>' },
  ];
  const posBand = () => (4 + Math.random() * 24) + '%'; // แถบฟ้าตอนบน ประมาณ ไม่ผูกกับพิกัดจริงของฉากวาด
  function ensureLayer() { if (!layer) layer = document.getElementById('living-env-layer'); return layer; }

  function spawnFlyby(ev) {
    const el = document.createElement('div');
    const fromLeft = Math.random() < 0.5;
    el.style.cssText = `position:absolute;top:${posBand()};${fromLeft ? 'left:-5%' : 'right:-5%'};opacity:0;transition:none;pointer-events:none;`;
    el.innerHTML = ev.svg;
    ensureLayer().appendChild(el);
    const dx = (fromLeft ? 1 : -1) * (30 + Math.random() * 25);
    requestAnimationFrame(() => {
      el.style.transition = `transform ${ev.dur}ms linear, opacity ${Math.round(ev.dur * 0.18)}ms ease`;
      el.style.opacity = '0.85';
      el.style.transform = `translate(${dx}vw, ${(-4 + Math.random() * 8)}vh)`;
      setTimeout(() => { el.style.opacity = '0'; }, ev.dur - Math.round(ev.dur * 0.18));
    });
    setTimeout(() => el.remove(), ev.dur + 300);
  }
  function spawnShootingStar() {
    const el = document.createElement('div');
    const top = 4 + Math.random() * 20, left = 10 + Math.random() * 50;
    el.style.cssText = `position:absolute;top:${top}%;left:${left}%;width:2px;height:2px;border-radius:50%;
      background:#fff;box-shadow:0 0 6px 1px rgba(255,255,255,0.9);opacity:0;pointer-events:none;`;
    ensureLayer().appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'transform 900ms ease-in, opacity 900ms ease-in';
      el.style.opacity = '1';
      el.style.transform = 'translate(14vw, 9vh)';
      el.style.boxShadow = '-40px -26px 12px 1px rgba(255,255,255,0.35), 0 0 6px 1px rgba(255,255,255,0.9)';
    });
    setTimeout(() => el.remove(), 1000);
  }
  function spawnCloudMoon() {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;top:6%;left:-15%;width:16vw;height:6vh;border-radius:50%;
      background:rgba(220,224,240,0.4);filter:blur(6px);opacity:0;pointer-events:none;`;
    ensureLayer().appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'transform 9000ms linear, opacity 1500ms ease';
      el.style.opacity = '0.5';
      el.style.transform = 'translateX(55vw)';
      setTimeout(() => { el.style.opacity = '0'; }, 7200);
    });
    setTimeout(() => el.remove(), 9300);
  }
  function spawnLantern() {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;bottom:-4%;left:${(10 + Math.random() * 80)}%;width:9px;height:13px;border-radius:45% 45% 35% 35%;
      background:radial-gradient(#ffd98a,#e8862a);box-shadow:0 0 12px 3px rgba(255,170,60,0.5);opacity:0;pointer-events:none;`;
    ensureLayer().appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'transform 8000ms linear, opacity 1200ms ease';
      el.style.opacity = '0.85';
      el.style.transform = `translate(${(-4 + Math.random() * 8)}vw, -70vh) scale(0.6)`;
      setTimeout(() => { el.style.opacity = '0'; }, 6500);
    });
    setTimeout(() => el.remove(), 8300);
  }

  function fireOne() {
    const pool = MODE_EVENTS[curMode] || MODE_EVENTS.night;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === 'bird') spawnFlyby(EVENTS[0]);
    else if (pick === 'bat') spawnFlyby(EVENTS[1]);
    else if (pick === 'shootingstar') spawnShootingStar();
    else if (pick === 'cloudmoon') spawnCloudMoon();
    else spawnLantern();
    if (Math.random() < 0.4) Sound.ambientCue(); // บางครั้งมีเสียงคู่กัน ไม่ทุกครั้ง กันรำคาญ
  }
  function scheduleNext() {
    const delay = 20000 + Math.random() * 20000; // 20-40 วิ ต่อ 1 เหตุการณ์ ไม่ซ้อนกัน
    timer = setTimeout(() => { if (!paused) fireOne(); scheduleNext(); }, delay);
  }
  return {
    start() { if (timer) return; scheduleNext(); },
    stop() { if (timer) { clearTimeout(timer); timer = null; } },
    setMode(m) { curMode = MODE_EVENTS[m] ? m : 'night'; },
    // หยุดเหตุการณ์แวดล้อมชั่วคราวตอนคัตซีนเล่น — ประหยัดแบตบนมือถือรุ่นเก่าแม้จะถูกคัตซีนบังอยู่แล้ว
    pause() { paused = true; },
    resume() { paused = false; },
  };
})();
