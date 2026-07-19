// ============================================================
// Practice — โหมดฝึกซ้อมบทบาทก่อนเล่นจริง (Sandbox)
// ------------------------------------------------------------
// ทำงานแยกขาดจากเกมจริงโดยสิ้นเชิง: ใช้ผู้เล่นปลอม (บอท) ข้อมูลปลอมทั้งหมด
// *** ห้ามเรียก Net.* หรือแตะ Firebase เด็ดขาด *** ไม่มีการเขียนสถานะเกมจริงใดๆ
// เปิดจากช่วง "รับบทบาท" (reveal) ให้เด็กลองเล่นหน้าที่ของตัวเองสัก 30 วินาที
// จะได้เข้าใจว่า "อ๋อ อาชีพนี้ทำแบบนี้" ก่อนเกมจริงเริ่ม
// ============================================================

const Practice = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const av = (n) => Art.avatar(n);
  const sfx = (fn) => { try { if (typeof Sound !== 'undefined' && Sound[fn]) Sound[fn](); } catch (e) {} };

  // ผู้เล่นปลอมสำหรับฝึก (ชื่อสไตล์อยุธยา) + "ความจริงลับ" ที่ใช้สอน
  const BOTS = [
    { name: 'ออกญาโหรา', avatar: 6 },
    { name: 'แม่นางจวง', avatar: 1 },
    { name: 'ทิดแก้ว', avatar: 8 },
    { name: 'อีเรือง', avatar: 3 },
    { name: 'ขุนพิเรนทร์', avatar: 4 },
    { name: 'ตาสา', avatar: 2 },
  ];
  const ENEMY_I = 4;   // ขุนพิเรนทร์ = ศัตรู (สำหรับจารชนสืบ)
  const THIEF_I = 2;   // ทิดแก้ว = โจร (สำหรับขุนนางสืบ/ประหาร, เจ้าเมืองเผลอแจก)
  const VICTIM_I = 1;  // แม่นางจวง = เป้าที่ศัตรูจะฆ่าคืนนี้ (สำหรับหมอ)
  const nm = (i) => esc(BOTS[i].name);

  let role = null, meInfo = null, scenes = [], si = 0, sel = new Set(), showingFb = false, fbHtml = '';

  // ---------------- จุดเริ่ม ----------------
  function start(r, info) {
    if (typeof ROLES === 'undefined' || !ROLES[r] || typeof App === 'undefined') return;
    role = r; meInfo = info || { name: 'เจ้า', avatar: 0 };
    scenes = build(r); si = 0; sel = new Set(); showingFb = false;
    sfx('whoosh');
    render();
  }

  // ---------------- ชิ้นส่วน UI ----------------
  function gridHtml(includeSelf) {
    const tiles = [];
    if (includeSelf) {
      tiles.push(`<div class="tgt selectable me ${sel.has('me') ? 'sel' : ''}" data-t="me" style="--bcol:#c0c4cc">
        <span class="badge"></span>${av(meInfo.avatar || 0)}<div class="nm">${esc(meInfo.name || 'เจ้า')} (ตัวเจ้า)</div></div>`);
    }
    BOTS.forEach((b, i) => {
      tiles.push(`<div class="tgt selectable ${sel.has(i) ? 'sel' : ''}" data-t="${i}" style="--bcol:#c0c4cc">
        <span class="badge"></span>${av(b.avatar)}<div class="nm">${esc(b.name)}</div></div>`);
    });
    return tiles.join('');
  }

  function shell(inner) {
    const total = scenes.length;
    return `<div class="prac-modal">
      <div class="prac-badge">🎯 โหมดฝึกซ้อม — ไม่ใช่เกมจริง ผลไม่นับ ลองผิดได้เต็มที่</div>
      <div class="prac-step">ขั้นที่ ${si + 1}/${total} • ฝึกเป็น <b style="color:${ROLES[role].color}">${ROLES[role].name}</b></div>
      <div class="prac-body">${inner}</div>
    </div>`;
  }

  // ---------------- เรนเดอร์ฉาก ----------------
  function render() {
    const sc = scenes[si];
    if (!sc) { App.closeModal(); return; }

    if (showingFb) {
      App.modal(shell(`${fbHtml}
        <button class="btn btn-gold w100" id="prac-next">${si + 1 >= scenes.length ? 'ไปสรุป →' : 'ต่อไป →'}</button>`));
      $('prac-next').onclick = () => { showingFb = false; si++; sel = new Set(); render(); };
      return;
    }

    if (sc.type === 'info') {
      App.modal(shell(`<div class="prac-info">${sc.body}</div>
        <button class="btn btn-gold w100" id="prac-next">${sc.cta || 'ต่อไป →'}</button>`));
      $('prac-next').onclick = () => { si++; sel = new Set(); render(); };
      return;
    }

    if (sc.type === 'summary') {
      App.modal(shell(`<div class="prac-summary">${sc.body}</div>
        <div class="confirm-row">
          <button class="btn btn-ghost" id="prac-again">↺ ฝึกอีกครั้ง</button>
          <button class="btn btn-gold w100" id="prac-done">เข้าใจแล้ว ✓</button>
        </div>`));
      $('prac-again').onclick = () => { si = 0; sel = new Set(); showingFb = false; sfx('whoosh'); render(); };
      $('prac-done').onclick = () => { sfx('chime'); App.closeModal(); };
      return;
    }

    if (sc.type === 'choice') {
      App.modal(shell(`<div class="action-title">${sc.title}</div>
        <div class="action-sub">${sc.sub}</div>
        <div class="prac-choices">${sc.options.map((o, i) => `<button class="qc-btn prac-choice" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`));
      document.querySelectorAll('.prac-choice').forEach(b => {
        b.onclick = () => { sfx('tick'); fbHtml = sc.options[+b.dataset.i].fb; showingFb = true; render(); };
      });
      return;
    }

    // sc.type === 'pick'
    const max = sc.max || 1;
    App.modal(shell(`<div class="action-title">${sc.title}</div>
      <div class="action-sub">${sc.sub}</div>
      <div class="p-board">${gridHtml(sc.includeSelf)}</div>
      <button class="btn btn-gold w100" id="prac-ok" ${sel.size === 0 ? 'disabled' : ''}>ยืนยัน (${sel.size}/${max})</button>`));
    document.querySelectorAll('.prac-modal .tgt').forEach(t => {
      t.onclick = () => {
        const raw = t.dataset.t;
        const id = raw === 'me' ? 'me' : +raw;
        if (sel.has(id)) sel.delete(id);
        else { if (sel.size >= max) { if (max === 1) sel.clear(); else return; } sel.add(id); }
        sfx('tick'); render();
      };
    });
    const ok = $('prac-ok');
    if (ok) ok.onclick = () => { sfx('chime'); fbHtml = sc.feedback([...sel]); showingFb = true; render(); };
  }

  // ---------------- บทฝึกแต่ละอาชีพ ----------------
  function fbBox(kind, html) { return `<div class="prac-fb ${kind}">${html}</div>`; }

  function build(r) {
    switch (r) {
      // ---- ไพร่ & ทาส: ฝึกโหวต ----
      case 'serf':
      case 'slave':
        return [
          { type: 'info', body: `ตอนกลางวัน ชาวเมืองช่วยกันสังเกตและวิเคราะห์ว่าใครน่าสงสัย แล้ว<b>โหวตขับออก</b>จากเมือง<br><br>เจ้าไม่มีพลังพิเศษกลางคืน แต่ <b style="color:var(--gold)">หนึ่งเสียงของเจ้าสำคัญมาก</b> — มาลองโหวตกัน!`, cta: 'ลองโหวต →' },
          {
            type: 'pick', title: '🗳️ ลองลงมติขับผู้ต้องสงสัย (เลือก 1 คน)', sub: 'แตะเลือกคนที่เจ้าคิดว่าน่าสงสัยที่สุด แล้วกดยืนยัน', max: 1,
            feedback: (p) => fbBox('ok', `เจ้าลงมติขับ <b>${nm(p[0])}</b> ✓<br><br>ในเกมจริง คนที่ได้เสียงโหวต<b>มากที่สุด</b>จะถูกขับออกจากเมือง แล้วเปิดเผยว่าเขาอยู่ฝ่ายไหน (ชาวเมือง / ศัตรู / โจร / คนบ้า)`)
          },
          { type: 'summary', body: `เก่งมาก! หน้าที่ของ<b style="color:${ROLES[r].color}">${ROLES[r].name}</b> คือ <b>สังเกต–วิเคราะห์–โหวต</b><br><br>ฟังการสนทนาในแชทดีๆ จับพิรุธคนโกหก แล้วใช้เสียงของเจ้าช่วยเมืองกำจัดศัตรูและโจรให้ได้ 💪` },
        ];

      // ---- ขุนนาง: ตรวจโจร + ประหาร ----
      case 'noble':
        return [
          { type: 'info', body: `<b style="color:${ROLES.noble.color}">ขุนนาง</b>คือตำรวจหลวง! ทุกคืนเจ้า<b>สืบหาโจร</b>ได้ 1 คน และทุกๆ คืนที่ 4 เจ้า<b>ประหารโจร</b>ได้<br><br>⚠️ แต่ถ้าชี้ประหารผิดคน เจ้าจะถูกกำจัดแทน! มาลองกัน` , cta: 'เริ่มสืบ →' },
          {
            type: 'pick', title: '⚖️ สืบสวน: เลือกตรวจ 1 คน ว่าเป็นโจรหรือไม่', sub: 'ลองแตะเลือกใครสักคนเพื่อดูผลสืบ', max: 1,
            feedback: (p) => p[0] === THIEF_I
              ? fbBox('ok', `🔎 ผลสืบ: <b>${nm(p[0])}</b> <b style="color:var(--red)">คือโจร!</b><br><br>เจ้าเจอตัวจริงแล้ว — จำไว้ให้ดี เดี๋ยวจะได้ลองประหาร`)
              : fbBox('warn', `🔎 ผลสืบ: <b>${nm(p[0])}</b> ไม่ใช่โจร<br><br>ในเกมจริงต้องสืบทีละคืน ค่อยๆ ตัดตัวเลือก (โจรตัวจริงในบทฝึกนี้คือ <b>${nm(THIEF_I)}</b> นะ)`)
          },
          {
            type: 'pick', title: '🗡️ คืนประหาร! ชี้ตัวโจรเพื่อลงดาบ', sub: '⚠️ ชี้ถูก = กำจัดโจรได้ / ชี้ผิด = เจ้าตายแทน!', max: 1,
            feedback: (p) => p[0] === THIEF_I
              ? fbBox('ok', `⚔️ ถูกต้อง! เจ้าประหาร <b>${nm(p[0])}</b> ซึ่งเป็นโจรจริงได้สำเร็จ เมืองปลอดภัยขึ้นมาก!`)
              : fbBox('bad', `💀 ชี้ผิด! <b>${nm(p[0])}</b> ไม่ใช่โจร — ในเกมจริง<b>เจ้าจะถูกกำจัดแทนทันที</b><br><br>ดังนั้นอย่าประหารถ้ายังไม่มั่นใจ ถ้าไม่แน่ใจให้ "ข้าม" ไว้ก่อนดีกว่า`)
          },
          { type: 'summary', body: `นี่คือพลังของ<b style="color:${ROLES.noble.color}">ขุนนาง</b> — สืบทุกคืน สะสมข้อมูล แล้วประหารเมื่อมั่นใจจริงๆ เท่านั้น<br><br>เจ้าเป็นกำลังสำคัญของฝ่ายชาวเมืองในการล่าโจร 🛡️` },
        ];

      // ---- คนบ้า: ฝึกโดนไล่ออก ----
      case 'mad':
        return [
          { type: 'info', body: `<b style="color:${ROLES.mad.color}">คนบ้า</b>มีเป้าหมายกลับด้านกับคนอื่น! เจ้าชนะด้วยการ<b>หลอกให้ชาวเมืองโหวตขับเจ้าออก</b> (ตั้งแต่วันที่ 2 เป็นต้นไป)<br><br>ลองทำตัวน่าสงสัยดู` , cta: 'ลองเลย →' },
          {
            type: 'choice', title: '🤪 พูดอะไรให้คนเริ่มสงสัยเจ้า?', sub: 'เลือกประโยคที่จะทำให้เพื่อนโหวตเจ้า', options: [
              { label: '😏 "อย่ามายุ่งกับฉันนะ ฉันมีความลับ"', fb: fbBox('ok', `ชาวเมืองเริ่มจ้องเจ้าเขม็ง... "หมอนี่ท่าทางมีพิรุธ!" 👀`) },
              { label: '🙃 "จริงๆ ฉันก็ไม่รู้ว่าฉันเป็นใคร"', fb: fbBox('ok', `เพื่อนๆ เริ่มกระซิบกัน... "พูดจาแปลกๆ น่าสงสัยจัง" 👀`) },
              { label: '😜 "โหวตฉันสิ กล้าไหมล่ะ!"', fb: fbBox('ok', `ทั้งเมืองหันมามองเจ้าทันที... "ทำไมอยากโดนโหวตขนาดนั้น?" 👀`) },
            ]
          },
          { type: 'info', body: `🗳️ ผลโหวตตอนเช้า: ชาวเมืองพร้อมใจกันโหวตขับ <b>เจ้า</b> ออกจากเมือง!<br><br>🎉 <b style="color:${ROLES.mad.color}">เจ้าชนะทันที!</b> — นี่คือชัยชนะของคนบ้า`, cta: 'ต่อไป →' },
          { type: 'summary', body: `เห็นไหม? <b style="color:${ROLES.mad.color}">คนบ้า</b>ต้องเล่นกลับด้าน — ทำตัวน่าสงสัยแบบพอดีๆ ให้โดนโหวตออก แต่<b>อย่าโจ่งแจ้งจนคนจับได้ว่าเจ้าแกล้ง</b><br><br>⚠️ จำไว้: วันแรกยังไม่นับ ต้องวันที่ 2 ขึ้นไป` },
        ];

      // ---- เจ้าเมือง: แจกศักดินา + รอดลอบสังหาร + เงื่อนไขแพ้ ----
      case 'lord':
        return [
          { type: 'info', body: `<b style="color:${ROLES.lord.color}">เจ้าเมือง</b>คือผู้นำพระนคร! เจ้า<b>พระราชทานศักดินา</b>ให้ชาวเมืองได้ และมี<b>องครักษ์</b>รับดาบแทนได้ 1 ครั้ง<br><br>แต่ถ้าเจ้าถูกกำจัด <b style="color:var(--red)">ศัตรูชนะทันที!</b> มาลองหน้าที่เจ้าเมืองกัน` , cta: 'เริ่ม →' },
          {
            type: 'pick', title: '👑 พระราชทานศักดินา 25 ไร่ ให้ 1 คน', sub: '⚠️ ระวัง! ถ้าเผลอให้โจร ศักดินาจะเข้าแก๊งโจรทันที', max: 1,
            feedback: (p) => p[0] === THIEF_I
              ? fbBox('bad', `😱 เจ้าพระราชทานให้ <b>${nm(p[0])}</b> ซึ่งเป็น<b>โจร</b>โดยไม่รู้ตัว! ศักดินา 25 ไร่เข้าแก๊งโจรทันที<br><br>ในเกมจริงต้องดูให้ดีว่าใครน่าไว้ใจก่อนแจก`)
              : fbBox('ok', `👑 พระราชทานสำเร็จ! <b>${nm(p[0])}</b> ได้รับศักดินา 25 ไร่ และน่าจะเป็นพวกของเจ้ามากขึ้น`)
          },
          { type: 'info', body: `🌙 คืนนั้น... ศัตรูลอบเข้ามาหมายสังหารเจ้า!<br><br>⚔️ แต่ <b>องครักษ์</b>กระโดดเข้ารับดาบแทน — เจ้ารอดมาได้! (ใช้ได้ครั้งเดียวเท่านั้น ครั้งต่อไปต้องพึ่งหมอและการซ่อนตัว)`, cta: 'ต่อไป →' },
          { type: 'summary', body: `<b style="color:${ROLES.lord.color}">เจ้าเมือง</b>คือเป้าหมายอันดับหนึ่งของศัตรู! เคล็ดลับคือ:<br>• อย่าเปิดเผยง่ายๆ ว่าเจ้าคือเจ้าเมือง<br>• แจกศักดินาให้คนที่ไว้ใจ<br>• ให้หมอคอยปกป้อง<br><br>อยู่รอดให้ได้ = ชาวเมืองมีลุ้นชนะ 👑` },
        ];

      // ---- โจร: ปล้นศักดินา ----
      case 'thief':
        return [
          { type: 'info', body: `<b style="color:${ROLES.thief.color}">โจร</b>รวมแก๊งกันปล้นศักดินาชาวเมืองสะสมเข้าแก๊ง! สะสมครบเป้า = <b>ชนะ</b><br><br>แต่ละคืนแก๊งจะสุ่มให้โจร 1 คนออกลงมือ ปล้นได้ 3 คน (คนละ 25 ไร่) — มาลองปล้นกัน` , cta: 'ออกปล้น →' },
          {
            type: 'pick', title: '🏴 เลือก 3 คนเพื่อปล้นศักดินา', sub: 'ปล้นได้คนละ 25 ไร่ (ถ้าเหยื่อไม่มีศักดินาจะได้ 0) — แตะเลือกให้ครบ 3 คน', max: 3,
            feedback: (p) => {
              const gain = p.reduce((s, i) => s + (i === ENEMY_I ? 0 : 25), 0);
              const zero = p.includes(ENEMY_I);
              return fbBox(gain >= 75 ? 'ok' : 'warn', `🪙 เจ้าปล้นได้ <b>${gain} ไร่</b> เข้าแก๊งโจร!` +
                (zero ? `<br><br>สังเกตว่า <b>${nm(ENEMY_I)}</b> ไม่มีศักดินาให้ปล้น (ได้ 0 ไร่) — ในเกมจริงบางคนศักดินาน้อยหรือหมดแล้ว เลือกเป้าให้คุ้ม` : `<br><br>เยี่ยม! เลือกเป้าได้คุ้มค่าทุกคน`));
            }
          },
          { type: 'summary', body: `<b style="color:${ROLES.thief.color}">โจร</b>ต้องทำงานเป็นทีม! คุยวางแผนกับพวกในแชท<b>ช่องแก๊งโจร</b> ว่าจะปล้นใคร<br><br>สะสมศักดินาให้ครบเป้า (300–600 ไร่ ตามขนาดห้อง) แล้วแก๊งโจรจะชนะทั้งเมือง! 🏴` },
        ];

      // ---- ศัตรู: ฆ่า + อยู่รอด ----
      case 'enemy':
        return [
          { type: 'info', body: `<b style="color:${ROLES.enemy.color}">ศัตรู</b>คือไส้ศึกที่แฝงตัวในเมือง! ทุกคืนฝ่ายเจ้า<b>โหวตเลือกเหยื่อ</b>ลอบสังหาร<br><br>เป้าหมาย: กำจัดชาวเมืองให้เหลือน้อยกว่าฝ่ายเจ้า หรือฆ่าเจ้าเมืองให้ได้ — มาลองกัน` , cta: 'ออกล่า →' },
          {
            type: 'pick', title: '🩸 เลือกเหยื่อที่จะลอบสังหารคืนนี้ (1 คน)', sub: 'ในเกมจริงศัตรูทุกคนโหวตร่วมกัน เสียงมากสุดคือเหยื่อ', max: 1,
            feedback: (p) => fbBox('ok', `🌙 คืนนี้ฝ่ายเจ้าลอบสังหาร <b>${nm(p[0])}</b><br><br>รุ่งเช้าชาวเมืองจะพบว่าเขาหายไป... แต่จะไม่มีใครรู้ว่าใครลงมือ (ถ้าหมอไม่ได้ปกป้องเขาไว้พอดี)`)
          },
          { type: 'info', body: `☀️ ตอนกลางวันคือด่านหิน! เจ้าต้อง<b>กลมกลืน</b>กับชาวเมือง แกล้งช่วยหาคนร้าย อย่าให้ใครจับได้ว่าเจ้าคือศัตรู<br><br>⚠️ ถ้าถูกโหวตขับออก เจ้าจะแพ้`, cta: 'ต่อไป →' },
          { type: 'summary', body: `<b style="color:${ROLES.enemy.color}">ศัตรู</b>ต้องเล่น 2 หน้า — กลางคืนโหดเหี้ยม กลางวันเนียนสนิท<br><br>คุยวางแผนกับพวกในแชท<b>ช่องฝ่ายศัตรู</b> และอย่าลืมกำจัด<b>เจ้าเมือง</b>ให้ได้ = ชนะทันที! 🗡️` },
        ];

      // ---- แพทย์: เลือกรักษา ----
      case 'doctor':
        return [
          { type: 'info', body: `<b style="color:${ROLES.doctor.color}">แพทย์</b>คือหมอหลวง! ทุกคืนเจ้าเลือก<b>ปกป้อง 1 คน</b> (เดาเอง) ถ้าคนนั้นถูกศัตรูลอบสังหารคืนนั้น เขาจะ<b>รอดชีวิต</b><br><br>ลองเดาดูว่าคืนนี้ศัตรูจะเล่นงานใคร` , cta: 'เริ่มรักษา →' },
          {
            type: 'pick', title: '🩺 เลือก 1 คนที่จะปกป้องคืนนี้', sub: 'เดาเอาว่าศัตรูจะฆ่าใคร (ปกป้องตัวเจ้าเองก็ได้)', max: 1, includeSelf: true,
            feedback: (p) => p[0] === VICTIM_I
              ? fbBox('ok', `💚 เก่งมาก! คืนนี้ศัตรูหมายจะฆ่า <b>${nm(VICTIM_I)}</b> พอดี — เจ้าปกป้องไว้ทัน ช่วยชีวิตเธอไว้ได้!`)
              : fbBox('warn', `🌙 คืนนี้ศัตรูฆ่า <b>${nm(VICTIM_I)}</b> แต่เจ้าปกป้อง <b>${p[0] === 'me' ? 'ตัวเจ้าเอง' : nm(p[0])}</b> ไว้ — ครั้งนี้เดาพลาด<br><br>ไม่เป็นไร! หมอต้องเดาเอง คิดดีๆ ว่าใครน่าจะเป็นเป้า (เจ้าเมือง? คนสำคัญ?)`)
          },
          { type: 'summary', body: `<b style="color:${ROLES.doctor.color}">แพทย์</b>คือความหวังของเมือง! เคล็ดลับ:<br>• คิดว่าศัตรูอยากฆ่าใคร (มักเป็นคนสำคัญ/เจ้าเมือง)<br>• ปกป้องตัวเองบ้างถ้าถูกสงสัยว่าเป็นหมอ<br><br>เดาแม่นเมื่อไหร่ เจ้าพลิกเกมได้เลย 💚` },
        ];

      // ---- จารชน: สอดแนม ----
      case 'spy':
        return [
          { type: 'info', body: `<b style="color:${ROLES.spy.color}">จารชน</b>คือนักสืบหลวงผู้ปิดทองหลังพระ! ทุกคืนเจ้า<b>สืบว่าใครคือศัตรู</b>ได้ 1 คน โดยไม่มีใครรู้ว่าเจ้าคือจารชน<br><br>มาลองสอดแนมดู` , cta: 'ออกสืบ →' },
          {
            type: 'pick', title: '🕵️ สืบว่าใครคือศัตรู (เลือก 1 คน)', sub: 'แตะเลือกคนที่เจ้าสงสัย ผลจะส่งถึงเจ้าลับๆ', max: 1,
            feedback: (p) => p[0] === ENEMY_I
              ? fbBox('ok', `🔎 ผลสืบลับ: <b>${nm(p[0])}</b> <b style="color:var(--red)">คือศัตรู!</b> ⚠️<br><br>ในเกมจริงให้รีบไปชี้นำเพื่อนในเมืองให้โหวตเขา — แต่<b>อย่าเผยว่าเจ้าคือจารชน</b> ไม่งั้นศัตรูจะฆ่าเจ้าก่อน`)
              : fbBox('warn', `🔎 ผลสืบลับ: <b>${nm(p[0])}</b> ไม่ใช่ศัตรู<br><br>คืนต่อไปลองสืบคนอื่น ค่อยๆ หาตัวจริง (ศัตรูในบทฝึกนี้คือ <b>${nm(ENEMY_I)}</b> นะ)`)
          },
          { type: 'summary', body: `<b style="color:${ROLES.spy.color}">จารชน</b>คืออาวุธลับของเมือง! เจ้ารู้ความจริงก่อนใคร<br><br>เคล็ดลับ: ชี้นำเพื่อนแบบแนบเนียน อย่าเปิดเผยตัว เพราะถ้าศัตรูรู้ว่าเจ้าคือจารชน เจ้าจะตกเป็นเป้าทันที 🔦` },
        ];

      default:
        return [{ type: 'summary', body: 'บทบาทนี้ยังไม่มีบทฝึก' }];
    }
  }

  return { start };
})();
