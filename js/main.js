// ============================================================
// App — เริ่มระบบ, สลับหน้า, ฉากหลัง, ฟอร์ม, สไลด์สอนบทบาท
// ============================================================

const App = (() => {
  const $ = (id) => document.getElementById(id);
  let curScene = '', expTimer = null, activeLayer = 'a';

  // ---------------- สลับหน้า ----------------
  function show(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== id));
    const isPlayerGame = id === 'v-player';
    $('chat-dock').classList.toggle('hidden', !isPlayerGame);
  }

  // ---------------- ฉากหลังตามเฟส (ครอสเฟด 2 วิ + ซูมกล้องเบาๆ ตามช่วงเวลา) ----------------
  const SCENE_OF = { lobby: 'dusk', reveal: 'night', night: 'night', nightfx: 'night', day: 'day', dawnfx: 'dawn', vote: 'dusk', duskfx: 'dusk', end: 'dawn', home: 'dusk' };
  const SCENE_ZOOM = { night: 'zoom-in', dawn: 'zoom-out' }; // คืน=เข้าใกล้ 2% (ลึกลับ) / รุ่งเช้า=ถอยออก 2% (คลี่คลาย)
  function scene(phase) {
    const m = SCENE_OF[phase] || 'dusk';
    if (m === curScene) return;
    curScene = m;
    LivingEnv.setMode(m);
    const showEl = $('bg-scene-' + (activeLayer === 'a' ? 'b' : 'a'));
    const hideEl = $('bg-scene-' + activeLayer);
    activeLayer = activeLayer === 'a' ? 'b' : 'a';
    showEl.innerHTML = Art.scene(m);
    showEl.className = 'scene-layer ' + (SCENE_ZOOM[m] || '');
    void showEl.offsetHeight; // บังคับ reflow ก่อน toggle class เพื่อให้ transition ทำงานแน่นอน
    showEl.classList.add('on');
    hideEl.classList.remove('on');
  }

  // ---------------- modal / toast ----------------
  function modal(html) {
    $('modal').innerHTML = html;
    $('modal-wrap').classList.remove('hidden');
  }
  function closeModal() { $('modal-wrap').classList.add('hidden'); }
  function toast(text) {
    const d = document.createElement('div');
    d.className = 'toast-msg';
    d.textContent = text;
    $('toast').appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity 0.5s'; setTimeout(() => d.remove(), 500); }, 3200);
  }

  // ---------------- สไลด์สอนบทบาท (ตอนรอในล็อบบี้) ----------------
  function startExplainer() {
    const box = $('explainer');
    if (box.dataset.on) return;
    box.dataset.on = '1';
    box.innerHTML = ROLE_ORDER.map((rid, i) => {
      const r = ROLES[rid];
      const head = r.portrait
        ? `<img class="portrait-img" src="${r.portrait}" alt=""><span class="portrait-badge">${Art.roleMedallion(rid, 40)}</span>`
        : `<span class="medal">${Art.roleMedallion(rid, 96)}</span>`;
      return `<div class="exp-card ${i === 0 ? 'on' : ''} ${r.portrait ? 'has-portrait' : ''}" style="--tint:${r.color}">
        ${head}
        <h3 style="color:${r.color}">${r.name}</h3>
        <div class="cn">ป้ายสี: ${r.colorName} • ศักดินา ${r.sakdina ? r.sakdina.toLocaleString() + ' ไร่' : 'ไม่มี'}</div>
        <p>${r.desc}</p>
        <div class="ab">✨ ${r.ability}</div>
        ${r.warn ? `<div class="wr">⚠️ ${r.warn}</div>` : ''}
      </div>`;
    }).join('') + `<div class="exp-dots">${ROLE_ORDER.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>`;
    let idx = 0;
    if (expTimer) clearInterval(expTimer);
    expTimer = setInterval(() => {
      if (!document.body.contains(box) || box.closest('.hidden')) return;
      idx = (idx + 1) % ROLE_ORDER.length;
      box.querySelectorAll('.exp-card').forEach((c, i) => c.classList.toggle('on', i === idx));
      box.querySelectorAll('.exp-dots i').forEach((d, i) => d.classList.toggle('on', i === idx));
    }, 5200);
  }

  // ---------------- ฟอร์มครู ----------------
  let dayMin = 3, nightMin = 3;
  function chipRow(el, cur, onSet) {
    el.innerHTML = TIMER_CHOICES.map(m => `<span class="chip ${m === cur ? 'sel' : ''}" data-m="${m}">${m} นาที</span>`).join('');
    el.querySelectorAll('.chip').forEach(c => c.onclick = () => { onSet(+c.dataset.m); chipRow(el, +c.dataset.m, onSet); Sound.tick(); });
  }

  // ---------------- ฟอร์มนักเรียน: ผสมชุดเอง (v1 2026-07-22, ขยาย v1.2 เพิ่มศีรษะ/สไบ/รองเท้าเป็นชั้นอิสระ) ----------------
  // เดิมเลือก 1 ใน 10 ชุดสำเร็จรูป — เปลี่ยนเป็นผสมเองหลายส่วนอิสระตามฟีดแบ็กนักเรียน+Art Direction
  // headwear/sash ตั้งต้นที่ 0 (ไม่มี) เสมอ ไม่สุ่ม — กันดูรกเกินไปตั้งแต่แรกเห็น ให้เด็กกดเพิ่มเองถ้าอยากได้
  let av = {
    skin: Math.floor(Math.random() * SKIN_TONES.length),
    hair: Math.floor(Math.random() * HAIR_STYLES.length),
    headwear: 0,
    top: Math.floor(Math.random() * TOP_STYLES.length),
    sash: 0,
    bottom: Math.floor(Math.random() * BOTTOM_STYLES.length),
    cloth: Math.floor(Math.random() * CLOTH_COLORS.length),
    accent: Math.floor(Math.random() * ACCENT_COLORS.length),
    shoe: Math.floor(Math.random() * SHOE_COLORS.length),
  };
  function swatchRow(id, colors, key) {
    const row = $(id);
    row.innerHTML = colors.map((col, i) =>
      `<div class="sw-opt ${i === av[key] ? 'sel' : ''}" data-i="${i}" style="background:${col.hex || col}"></div>`).join('');
    row.querySelectorAll('.sw-opt').forEach(o => o.onclick = () => { av[key] = +o.dataset.i; Sound.tick(); renderAvatarPicker(); });
  }
  function pieceRow(id, list, key) {
    const row = $(id);
    row.innerHTML = list.map((it, i) => {
      const preview = Object.assign({}, av); preview[key] = i;
      return `<div class="costume-opt ${i === av[key] ? 'sel' : ''}" data-i="${i}">${Art.avatar(preview)}</div>`;
    }).join('');
    row.querySelectorAll('.costume-opt').forEach(o => o.onclick = () => { av[key] = +o.dataset.i; Sound.tick(); renderAvatarPicker(); });
  }
  // ทุกแถวมี try/catch แยกกัน — user รายงานว่าบางเครื่องจริง (Android+iPhone) แถวว่างหมดเลือกไม่ได้ แต่ทดสอบซ้ำในเครื่องมือหลายแบบแล้วไม่เจอ
  // ทำเป็นข้อความ error โชว์บนจอเลย (ไม่ต้องง้อ devtools) เพื่อให้ user ถ่ายภาพ/บอกข้อความจริงกลับมาได้ ถ้าเกิดพังอีก
  function safeRow(fn, label) {
    try { fn(); } catch (e) {
      const box = document.createElement('div');
      box.style.cssText = 'color:#ff8080;font-size:0.75rem;padding:6px;border:1px solid #ff8080;border-radius:8px;margin:4px 0';
      box.textContent = `⚠️ ${label} โหลดพลาด: ${e.message}`;
      document.querySelector('#v-join .field').appendChild(box);
    }
  }
  function renderAvatarPicker() {
    safeRow(() => { $('av-preview').innerHTML = Art.avatar(av); }, 'ตัวอย่างตัวละคร');
    safeRow(() => swatchRow('av-skin', SKIN_TONES, 'skin'), 'สีผิว');
    safeRow(() => pieceRow('av-hair', HAIR_STYLES, 'hair'), 'ทรงผม');
    safeRow(() => pieceRow('av-headwear', HEADWEAR_STYLES, 'headwear'), 'เครื่องประดับศีรษะ');
    safeRow(() => pieceRow('av-top', TOP_STYLES, 'top'), 'เสื้อ');
    safeRow(() => pieceRow('av-sash', SASH_STYLES, 'sash'), 'ผ้าพาด/สไบ');
    safeRow(() => pieceRow('av-bottom', BOTTOM_STYLES, 'bottom'), 'ผ้านุ่ง');
    safeRow(() => swatchRow('av-cloth', CLOTH_COLORS, 'cloth'), 'สีผ้า');
    safeRow(() => swatchRow('av-accent', ACCENT_COLORS, 'accent'), 'สีขลิบ');
    safeRow(() => swatchRow('av-shoe', SHOE_COLORS, 'shoe'), 'สีรองเท้า');
  }

  // ---------------- เริ่มระบบ ----------------
  function init() {
    Net.init();
    scene('home');
    document.body.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
    LivingEnv.start(); // เหตุการณ์สุ่มเบาๆ พื้นหลัง — วิ่งตลอด ไม่โชว์ผลถ้าโดนบังด้วยภาพปก/พาเนล

    if (Net.isLocal) $('mode-note').textContent = '🔧 โหมดทดสอบในเครื่อง (ยังไม่ตั้งค่า Firebase) — เปิดหลายแท็บบนเครื่องนี้เพื่อลองเล่น';

    // ภาพปก Key Visual: โหลดสำเร็จค่อยสลับหน้าแรกเป็นโหมดภาพเต็ม (โหลดพลาด = หน้าเดิม)
    const hero = new Image();
    hero.onload = () => {
      $('v-home').classList.add('has-hero');
      const hh = $('home-hero');
      for (let i = 0; i < 6; i++) {
        const l = document.createElement('span');
        l.className = 'h-lantern';
        l.style.left = (8 + Math.random() * 84) + '%';
        l.style.animationDuration = (11 + Math.random() * 9) + 's';
        l.style.animationDelay = (Math.random() * 12) + 's';
        hh.appendChild(l);
      }
      // แสงดาบบนตราสัญลักษณ์ + ดวงจันทร์เปล่งประกาย (ตำแหน่งประมาณตามภาพ)
      const glint = document.createElement('div'); glint.className = 'h-swordglint'; hh.appendChild(glint);
      const moon = document.createElement('div'); moon.className = 'h-moonglow'; hh.appendChild(moon);
      // นกบินผ่านดวงจันทร์เป็นครั้งคราว
      const bird = document.createElement('div'); bird.className = 'h-bird';
      bird.innerHTML = '<svg viewBox="0 0 24 12"><path d="M0,6 Q6,0 12,6 Q18,0 24,6 Q18,3 12,6 Q6,3 0,6"/></svg>';
      hh.appendChild(bird);
      // ยามเฝ้ากำแพง + คำพูดลอย (ไม่มีเสียง — แค่บรรยากาศ)
      const guard = document.createElement('div'); guard.className = 'h-guard';
      guard.innerHTML = '<svg viewBox="0 0 20 30"><circle cx="10" cy="6" r="5"/><path d="M2,30 Q10,10 18,30 Z"/><rect x="8" y="0" width="6" height="10"/></svg>';
      hh.appendChild(guard);
      const watchLines = ['ยามสามแล้ว... พระนครยังไม่หลับใหล', 'ค่ำคืนนี้... อย่าไว้ใจผู้ใดง่ายนัก', 'ประตูเมืองปิดสนิท... ทุกอย่างสงบดี'];
      const wt = document.createElement('div'); wt.className = 'h-watchtext';
      wt.textContent = watchLines[Math.floor(Math.random() * watchLines.length)];
      hh.appendChild(wt);
    };
    hero.src = 'assets/hero2.jpg';

    document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => show('v-home'));
    $('btn-host').onclick = () => { show('v-create'); chipRow($('day-mins'), dayMin, v => dayMin = v); chipRow($('night-mins'), nightMin, v => nightMin = v); };
    $('btn-join').onclick = () => { show('v-join'); renderAvatarPicker(); };
    $('modal-wrap').onclick = (e) => { if (e.target.id === 'modal-wrap') closeModal(); };

    $('btn-create-room').onclick = async () => {
      const name = $('host-name').value.trim() || 'ครูผู้คุมเกม';
      $('btn-create-room').disabled = true;
      try { await Host.create(name, dayMin, nightMin); }
      catch (e) { toast('สร้างห้องไม่สำเร็จ: ' + e); $('btn-create-room').disabled = false; }
    };

    $('btn-join-room').onclick = async () => {
      const codeV = $('join-code').value.trim();
      const name = $('join-name').value.trim();
      const err = $('join-err');
      err.textContent = '';
      if (!/^\d{6}$/.test(codeV)) { err.textContent = 'กรอกรหัสห้อง 6 หลัก'; return; }
      if (!name) { err.textContent = 'กรอกชื่อของเจ้าก่อน'; return; }
      $('btn-join-room').disabled = true;
      try { await Player.join(codeV, name, av); }
      catch (e) { err.textContent = String(e); $('btn-join-room').disabled = false; }
    };

    // กลับเข้าห้องเดิมหลังรีเฟรช (hash: h=ครู, p=นักเรียน)
    const h = location.hash.slice(1);
    if (/^h\d{6}$/.test(h)) {
      Host.resume(h.slice(1)).then(ok => { if (!ok) { toast('ไม่พบห้องเดิม'); location.hash = ''; } });
      return;
    }
    if (/^p\d{6}$/.test(h)) {
      Player.resume(h.slice(1)).then(ok => { if (!ok) { toast('ไม่พบข้อมูลผู้เล่นเดิม'); location.hash = ''; show('v-home'); } });
      return;
    }

    // เข้าจากลิงก์/QR: ?room=xxxxxx
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (room && /^\d{6}$/.test(room)) {
      show('v-join');
      renderCostumes();
      $('join-code').value = room;
      $('join-name').focus();
    }
    $('chat-dock').classList.add('hidden');
  }

  document.addEventListener('DOMContentLoaded', init);
  return { show, scene, modal, closeModal, toast, startExplainer };
})();
