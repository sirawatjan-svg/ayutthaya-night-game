// ============================================================
// Sound — เสียงสังเคราะห์ผ่าน Web Audio API (ไม่ต้องโหลดไฟล์)
// FX — อนิเมชั่นเหตุการณ์เต็มจอ (สังหาร ปล้น รักษา สืบ แจกที่ดิน ฯลฯ)
// ============================================================

const Sound = (() => {
  let ctx = null, ambGain = null, ambNodes = [];
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
  return {
    unlock() { try { ac(); } catch (e) {} },
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
      ambGain = c.createGain(); ambGain.gain.value = 0.05; ambGain.connect(c.destination);
      // เสียงจิ้งหรีด: pulse สองตัวความถี่สูง
      [4200, 5300].forEach((f, k) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = c.createGain(); g.gain.value = 0;
        const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 14 + k * 5;
        const lg = c.createGain(); lg.gain.value = 0.5;
        lfo.connect(lg).connect(g.gain);
        o.connect(g).connect(ambGain);
        o.start(); lfo.start(); ambNodes.push(o, lfo);
      });
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
    night(o) {
      Sound.gong();
      return show(card(`
        <div class="fx-art">${Art.icon('lantern', 90)}</div>
        <h2>คืนที่ ${o.night}</h2>
        <div class="fx-sub">${o.text || STORY.nightIntro}</div>`, '#3ba7e8'), 3800, 'fx-dark');
    },
    dawn(o) {
      Sound.gong(); setTimeout(() => Sound.chime(), 900);
      return show(card(`
        <div class="fx-art fx-float">${Art.icon('rice', 90)}</div>
        <h2>เช้าวันที่ ${o.day} ณ ${o.loc.name}</h2>
        <div class="fx-sub fx-story">${o.loc.story}</div>`, '#f5c518'), 6000, 'fx-warm');
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
