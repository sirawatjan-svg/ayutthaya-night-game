// ============================================================
// Art — ภาพวาด SVG: ฉากพระนคร, ตัวละครชุดอยุธยา, ตราอาชีพ, ไอคอน
// ============================================================

const Art = (() => {

  // ---------- โครงเมือง (skyline) ใช้ซ้ำทุกฉาก ----------
  // prang เจดีย์ทรงปรางค์
  function prang(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <path d="M0,0 L8,-14 L6,-16 L10,-30 L8,-32 L12,-46 L10,-48 L13,-60 L16,-74 Q17,-80 18,-84 Q19,-80 20,-74 L23,-60 L26,-48 L24,-46 L28,-32 L26,-30 L30,-16 L28,-14 L36,0 Z"/>
      <rect x="-6" y="0" width="48" height="10"/>
      <rect x="-12" y="10" width="60" height="8"/>
    </g>`;
  }
  // chedi เจดีย์ทรงระฆัง
  function chedi(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <path d="M0,0 Q2,-10 4,-14 Q0,-16 4,-20 Q16,-30 16,-42 Q16,-52 20,-58 L21,-70 Q21.6,-76 22,-79 Q22.4,-76 23,-70 L24,-58 Q28,-52 28,-42 Q28,-30 40,-20 Q44,-16 40,-14 Q42,-10 44,0 Z"/>
      <rect x="-6" y="0" width="56" height="8"/>
    </g>`;
  }
  // หลังคาโบสถ์ + ช่อฟ้า
  function wat(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <path d="M0,0 L6,-18 L10,-16 L9,-22 L14,-20 Q30,-34 46,-20 L51,-22 L50,-16 L54,-18 L60,0 Z"/>
      <path d="M14,-20 L16,-30 L18,-21 Z M46,-20 L44,-30 L42,-21 Z"/>
      <rect x="4" y="0" width="52" height="14"/>
    </g>`;
  }
  // กำแพงเมือง + ใบเสมา
  function wall(x, y, w, s) {
    let teeth = '';
    for (let i = 0; i < w; i += 14) teeth += `<path d="M${i},-10 L${i + 4},-16 L${i + 8},-10 Z"/>`;
    return `<g transform="translate(${x},${y}) scale(${s})"><rect x="0" y="-10" width="${w}" height="14"/>${teeth}</g>`;
  }
  function boat(x, y, s, flip) {
    return `<g transform="translate(${x},${y}) scale(${flip ? -s : s},${s})">
      <path d="M0,0 Q14,8 34,8 Q54,8 66,-2 Q60,4 54,4 L10,4 Q4,4 0,0 Z"/>
      <path d="M30,4 L30,-14 L32,-14 L32,4 Z"/><path d="M32,-14 Q42,-10 32,-4 Z"/>
    </g>`;
  }

  const SKYLINE_FAR = [prang(240, 560, 1.1), chedi(420, 560, 1.0), wat(560, 560, 1.2),
    prang(760, 555, 0.9), chedi(950, 560, 1.2), prang(1180, 560, 1.3), chedi(1380, 558, 0.9)].join('');
  const SKYLINE_MID = [wall(0, 640, 420, 1.6), wat(120, 622, 2.0), chedi(360, 622, 1.8),
    prang(620, 618, 2.2), wall(760, 640, 300, 1.6), chedi(1060, 622, 1.5), wat(1260, 620, 2.2), wall(1360, 640, 260, 1.6)].join('');

  const PALETTES = {
    day:   { sky: ['#79c2e8', '#cde9f2', '#f2ecd8'], orb: '#fff6d8', orbGlow: '#ffffff', far: '#8fa3ae', mid: '#5d6b74', water: ['#7fb8d8', '#a8d0e0'], fg: '#3d4a50', stars: 0, clouds: 1, orbY: 150 },
    dusk:  { sky: ['#2c1e4e', '#93447c', '#f0894a'], orb: '#ffd9a0', orbGlow: '#ff9c50', far: '#553d66', mid: '#31243e', water: ['#6a4470', '#e8945e'], fg: '#221a2c', stars: 40, clouds: 1, orbY: 470 },
    night: { sky: ['#060a24', '#101a40', '#1c2c56'], orb: '#e8ecf8', orbGlow: '#aab8e0', far: '#1a2444', mid: '#101830', water: ['#0c1430', '#26386a'], fg: '#080e20', stars: 110, clouds: 0, orbY: 170 },
    dawn:  { sky: ['#3a3060', '#c06888', '#f2c078'], orb: '#fff0c0', orbGlow: '#ffcf80', far: '#6a5578', mid: '#403450', water: ['#7a5878', '#f0c090'], fg: '#2a2238', stars: 12, clouds: 1, orbY: 520 },
  };

  function scene(mode) {
    const p = PALETTES[mode] || PALETTES.night;
    const u = 'sc-' + mode;
    let stars = '';
    if (p.stars) {
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < p.stars; i++) {
        stars += `<circle class="star" cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 440).toFixed(0)}" r="${(0.6 + rnd() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.3 + rnd() * 0.7).toFixed(2)}" style="animation-delay:${(rnd() * 4).toFixed(1)}s"/>`;
      }
    }
    let clouds = '';
    if (p.clouds) clouds = `
      <g class="cloud c1" fill="#ffffff" opacity="0.55"><ellipse cx="300" cy="180" rx="90" ry="22"/><ellipse cx="360" cy="164" rx="60" ry="18"/></g>
      <g class="cloud c2" fill="#ffffff" opacity="0.4"><ellipse cx="1100" cy="120" rx="110" ry="24"/><ellipse cx="1170" cy="104" rx="70" ry="18"/></g>
      <g class="cloud c3" fill="#ffffff" opacity="0.3"><ellipse cx="750" cy="250" rx="80" ry="18"/></g>`;
    let fireflies = '';
    if (mode === 'night') {
      for (let i = 0; i < 14; i++) {
        fireflies += `<circle class="firefly" cx="${100 + i * 110}" cy="${680 + (i % 4) * 40}" r="2.4" fill="#ffe89a" style="animation-delay:${(i * 0.6).toFixed(1)}s;animation-duration:${(4 + (i % 5)).toFixed(0)}s"/>`;
      }
    }
    // สัญลักษณ์เฉพาะกลางวัน — ธงไหว/ใบไม้ไหว/ฝุ่นลอย ให้เมืองยังมีชีวิตตอนสนทนา (นิ่งที่สุดของเกม)
    let dayAmbient = '';
    if (mode === 'day') {
      const flags = [280, 560, 950, 1350].map((x, i) =>
        `<g class="daflag" style="animation-delay:${(i * 0.4).toFixed(1)}s"><rect x="${x}" y="806" width="3" height="52" fill="#6a4a2a"/>
          <path d="M${x + 3},808 L${x + 32},816 L${x + 3},826 Z" fill="#a03028"/></g>`).join('');
      const leaves = Array.from({ length: 7 }, (_, i) =>
        `<ellipse class="daleaf" cx="${180 + i * 210}" cy="${120 + (i % 3) * 60}" rx="5" ry="3" fill="#6a8c4a" opacity="0.55"
          style="animation-delay:${(i * 1.3).toFixed(1)}s;animation-duration:${(9 + (i % 4) * 2).toFixed(0)}s"/>`).join('');
      const dust = Array.from({ length: 16 }, (_, i) =>
        `<circle class="dadust" cx="${(i * 97) % 1600}" cy="${560 + (i * 53) % 200}" r="1.3" fill="#fff6d8" opacity="0.4"
          style="animation-delay:${(i * 0.5).toFixed(1)}s;animation-duration:${(6 + (i % 5)).toFixed(0)}s"/>`).join('');
      dayAmbient = flags + leaves + dust;
    }
    const moonMask = mode === 'night' ? `<circle cx="1244" cy="${p.orbY - 16}" r="46" fill="${p.sky[0]}"/>` : '';
    return `<svg class="scene-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${p.sky[0]}"/><stop offset="0.6" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/>
        </linearGradient>
        <linearGradient id="${u}-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${p.water[1]}"/><stop offset="1" stop-color="${p.water[0]}"/>
        </linearGradient>
        <radialGradient id="${u}-glow"><stop offset="0" stop-color="${p.orbGlow}" stop-opacity="0.9"/><stop offset="1" stop-color="${p.orbGlow}" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#${u}-sky)"/>
      ${stars}${clouds}
      <circle cx="1220" cy="${p.orbY}" r="150" fill="url(#${u}-glow)"/>
      <circle cx="1220" cy="${p.orbY}" r="52" fill="${p.orb}"/>${moonMask}
      <g class="layer-far" fill="${p.far}">${SKYLINE_FAR}<rect x="0" y="566" width="1600" height="120" /></g>
      <g class="layer-mid" fill="${p.mid}">${SKYLINE_MID}<rect x="0" y="648" width="1600" height="60"/></g>
      <rect x="0" y="700" width="1600" height="200" fill="url(#${u}-water)"/>
      <g fill="${p.mid}" opacity="0.5">
        <ellipse cx="400" cy="760" rx="120" ry="5"/><ellipse cx="900" cy="800" rx="160" ry="6"/><ellipse cx="1300" cy="770" rx="100" ry="4"/>
      </g>
      <g class="boat-drift" fill="${p.fg}">${boat(500, 742, 1.4)}${boat(1150, 760, 1.1, true)}</g>
      ${fireflies}${dayAmbient}
      <g fill="${p.fg}"><rect x="0" y="852" width="1600" height="48"/>
        <path d="M0,860 Q200,838 420,856 Q700,836 980,856 Q1240,838 1600,858 L1600,900 L0,900 Z"/>
        <rect x="120" y="800" width="8" height="60"/><rect x="180" y="812" width="8" height="48"/>
        <rect x="1420" y="806" width="8" height="56"/><rect x="1480" y="818" width="8" height="44"/>
      </g>
    </svg>`;
  }

  // ---------- ตัวละครชุดอยุธยา ----------
  // ทรงผม 4 แบบ — 0/1 คือของเดิม (ผมสั้น/มวยผม) ต่อยอดจากฐานเดิมเป๊ะ, 2/3 เป็นของใหม่ (โพกผ้า/ผมเปีย) ต่อยอดจากทรงฐานเดียวกันเพื่อความเสี่ยงต่ำ
  const HAIR_FNS = [
    (c) => `<path d="M32,18 Q32,6 50,6 Q68,6 68,18 L66,24 Q50,18 34,24 Z" fill="#1c1410"/>`, // ผมสั้น
    (c) => `<path d="M33,20 Q32,8 50,7 Q68,8 67,20 L66,26 Q50,20 34,26 Z" fill="#1c1410"/><circle cx="50" cy="7" r="7" fill="#1c1410"/><circle cx="50" cy="6" r="2.4" fill="${c.accent}"/>`, // มวยผม
    (c) => `<path d="M31,20 Q31,8 50,7 Q69,8 69,20 L67,25 Q50,19 33,25 Z" fill="${c.cloth}"/>
      <path d="M31,18 Q50,24 69,18 L69,14 Q50,20 31,14 Z" fill="${c.accent}" opacity="0.9"/>
      <circle cx="68" cy="16" r="3.5" fill="${c.cloth}"/>`, // โพกผ้า
    (c) => `<path d="M32,18 Q32,6 50,6 Q68,6 68,18 L66,24 Q50,18 34,24 Z" fill="#1c1410"/>
      <path d="M64,20 Q72,34 68,52 Q65,58 61,54 Q66,36 60,22 Z" fill="#1c1410"/>`, // ผมเปีย
    (c) => `<path d="M32,18 Q32,6 50,6 Q68,6 68,18 L66,24 Q50,18 34,24 Z" fill="#1c1410"/>
      <path d="M33,20 Q26,34 30,50 Q32,55 35,52 Q31,38 36,22 Z" fill="#1c1410"/>
      <path d="M67,20 Q74,34 70,50 Q68,55 65,52 Q69,38 64,22 Z" fill="#1c1410"/>`, // ผมยาวสยาย
    (c) => `<path d="M33,20 Q32,8 50,7 Q68,8 67,20 L66,26 Q50,20 34,26 Z" fill="#1c1410"/><circle cx="50" cy="5" r="8" fill="#1c1410"/>
      <path d="M46,10 Q44,20 46,30" stroke="${c.accent}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M54,10 Q56,20 54,30" stroke="${c.accent}" stroke-width="2" fill="none" stroke-linecap="round"/>`, // มวยผมพู่ห้อย
  ];
  // เสื้อ 2 แบบ — แยกอิสระจากผมแล้ว (เดิมผูกกับผมเป็นสวิตช์เดียว)
  const TOP_FNS = [
    (c) => `<path d="M36,52 Q50,46 64,52 L66,92 L34,92 Z" fill="${c.skin}"/>
      <path d="M62,50 L38,88 L44,92 L66,58 Z" fill="${c.accent}" opacity="0.95"/>`, // ห่มธรรมดา
    (c) => `<path d="M36,52 Q50,46 64,52 L66,92 L34,92 Z" fill="${c.skin}"/>
      <path d="M63,49 L36,86 L36,94 L48,94 L67,60 Z" fill="${c.cloth}"/>
      <path d="M63,49 L67,60 L64,64 L60,52 Z" fill="${c.accent}"/>`, // สไบเฉวียง
    (c) => `<path d="M36,52 Q50,46 64,52 L66,92 L34,92 Z" fill="${c.skin}"/>
      <path d="M63,49 L36,86 L36,94 L48,94 L67,60 Z" fill="${c.cloth}"/>
      <path d="M63,49 L67,60 L64,64 L60,52 Z" fill="${c.accent}"/>
      <path d="M58,55 L40,84 L43,86 L61,58 Z" fill="${c.accent}" opacity="0.6"/>`, // สไบขลิบคู่
    (c) => `<path d="M36,52 Q50,46 64,52 L66,92 L34,92 Z" fill="${c.skin}"/>
      <path d="M62,50 L38,88 L44,92 L66,58 Z" fill="${c.accent}" opacity="0.95"/>
      <path d="M37,74 L63,74 L63,82 L37,82 Z" fill="${c.cloth}" opacity="0.9"/>`, // ห่มคาดพุง
  ];
  // ผ้านุ่ง 2 แบบ — 0 โจงกระเบน (เดิม), 1 ผ้าถุง (ใหม่ ทรงกระบอกตรง ไม่มีจีบขา ต่างจากโจงกระเบนชัดเจน)
  const BOTTOM_FNS = [
    (c) => `<path d="M40,92 L60,92 L62,120 Q56,124 50,124 Q44,124 38,120 Z" fill="${c.cloth}"/>
      <path d="M38,92 L62,92 L64,116 Q60,132 54,130 L52,120 L48,120 L46,130 Q40,132 36,116 Z" fill="${c.cloth}"/>
      <path d="M46,120 L48,124 L47,128 L45,126 Z" fill="${c.accent}" opacity="0.8"/>`, // โจงกระเบน
    (c) => `<path d="M37,92 L63,92 L67,134 Q50,140 33,134 Z" fill="${c.cloth}"/>
      <path d="M37,92 L63,92 L64,100 L36,100 Z" fill="${c.accent}" opacity="0.85"/>`, // ผ้าถุง
    (c) => `<path d="M40,92 L60,92 L62,120 Q56,124 50,124 Q44,124 38,120 Z" fill="${c.cloth}"/>
      <path d="M38,92 L62,92 L64,116 Q60,132 54,130 L52,120 L48,120 L46,130 Q40,132 36,116 Z" fill="${c.cloth}"/>
      <path d="M46,120 L48,124 L47,128 L45,126 Z" fill="${c.accent}" opacity="0.8"/>
      <path d="M39,114 L61,114 L60,119 L40,119 Z" fill="${c.accent}" opacity="0.55"/>`, // โจงกระเบนลายเชิง
    (c) => `<path d="M37,92 L63,92 L67,134 Q50,140 33,134 Z" fill="${c.cloth}"/>
      <path d="M37,92 L63,92 L64,100 L36,100 Z" fill="${c.accent}" opacity="0.85"/>
      <path d="M35,122 L65,122 L64,128 L36,128 Z" fill="${c.accent}" opacity="0.55"/>`, // ผ้าถุงลายเชิง
  ];
  function character(c, opts) {
    const o = opts || {};
    const hairFn = HAIR_FNS[c.hair % HAIR_FNS.length] || HAIR_FNS[0];
    const topFn = TOP_FNS[c.top % TOP_FNS.length] || TOP_FNS[0];
    const bottomFn = BOTTOM_FNS[c.bottom % BOTTOM_FNS.length] || BOTTOM_FNS[0];
    return `<svg viewBox="0 0 100 170" xmlns="http://www.w3.org/2000/svg" ${o.attrs || ''}>
      <ellipse cx="50" cy="160" rx="26" ry="6" fill="#000" opacity="0.18"/>
      ${bottomFn(c)}
      <rect x="42" y="128" width="6" height="26" rx="3" fill="${c.skin}"/>
      <rect x="52" y="128" width="6" height="26" rx="3" fill="${c.skin}"/>
      <path d="M40,152 L49,152 L49,158 L38,158 Z" fill="#7a5a3a"/>
      <path d="M51,152 L60,152 L62,158 L51,158 Z" fill="#7a5a3a"/>
      <path d="M34,54 Q30,58 28,76 Q27,84 32,86 Q36,86 36,80 L38,60 Z" fill="${c.skin}"/>
      <path d="M66,54 Q70,58 72,76 Q73,84 68,86 Q64,86 64,80 L62,60 Z" fill="${c.skin}"/>
      ${topFn(c)}
      <path d="M36,88 L64,88 L64,94 L36,94 Z" fill="${c.accent}"/>
      <rect x="44" y="40" width="12" height="12" fill="${c.skin}"/>
      <circle cx="50" cy="30" r="17" fill="${c.skin}"/>
      <path d="M33,30 a3,4 0 1,0 0.1,0 Z M67,30 a3,4 0 1,0 -0.1,0 Z" fill="${c.skin}"/>
      ${hairFn(c)}
      <circle cx="44" cy="30" r="1.8" fill="#241a12"/><circle cx="56" cy="30" r="1.8" fill="#241a12"/>
      <path d="M41,25.6 q3,-2.4 6,-0.6 M53,25 q3,-1.8 6,0.6" stroke="#241a12" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M45,37 Q50,40.6 55,37" stroke="#8c5a40" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`;
  }
  // รับได้ทั้ง 2 แบบ: เลขชุดสำเร็จรูปเดิม (จากข้อมูลเก่า/บอทซ้อม) หรืออ็อบเจ็กต์ผสมเองแบบใหม่ {skin,hair,top,bottom,cloth,accent}
  function normalizeAvatar(a) {
    if (a && typeof a === 'object') {
      return {
        skin: SKIN_TONES[(a.skin || 0) % SKIN_TONES.length],
        cloth: CLOTH_COLORS[(a.cloth || 0) % CLOTH_COLORS.length].hex,
        accent: ACCENT_COLORS[(a.accent || 0) % ACCENT_COLORS.length].hex,
        hair: (a.hair || 0) % HAIR_STYLES.length,
        top: (a.top || 0) % TOP_STYLES.length,
        bottom: (a.bottom || 0) % BOTTOM_STYLES.length,
      };
    }
    const row = COSTUMES[(Number(a) || 0) % COSTUMES.length];
    const isFemale = row.hair === 'bun';
    return { skin: row.skin, cloth: row.cloth, accent: row.accent, hair: isFemale ? 1 : 0, top: isFemale ? 1 : 0, bottom: 0 };
  }
  function avatar(a, attrs) {
    return character(normalizeAvatar(a), { attrs: attrs || '' });
  }

  // ---------- ไอคอนอาชีพ (วาดใน viewBox 100x100) ----------
  const ICONS = {
    chatra: `<g><rect x="47" y="18" width="6" height="66" rx="3" fill="#c8a24a"/>
      <path d="M50,8 L28,26 L72,26 Z" fill="#f5c518"/><path d="M50,20 L20,42 L80,42 Z" fill="#e8b520"/>
      <path d="M50,36 L12,62 L88,62 Z" fill="#d8a418"/><circle cx="50" cy="8" r="4" fill="#fff0b0"/>
      <path d="M28,26 L26,32 M72,26 L74,32 M20,42 L18,48 M80,42 L82,48" stroke="#c8a24a" stroke-width="2"/></g>`,
    swirl: `<g fill="none" stroke="#c9a0e8" stroke-width="6" stroke-linecap="round">
      <path d="M50,50 m0,-26 a26,26 0 1,1 -18,44"/><path d="M50,50 m0,-12 a12,12 0 1,0 10,18"/></g>
      <circle cx="50" cy="50" r="4" fill="#e8d0f8"/>
      <text x="76" y="34" font-size="24" fill="#e8d0f8" font-weight="bold">?</text>`,
    lantern: `<g><path d="M50,10 L50,20" stroke="#8fb0d0" stroke-width="3"/>
      <path d="M38,22 L62,22 L58,60 L42,60 Z" fill="#ffe8a0" stroke="#3ba7e8" stroke-width="3"/>
      <path d="M40,60 L60,60 L57,70 L43,70 Z" fill="#3ba7e8"/>
      <path d="M46,74 L54,74 L50,86 Z" fill="#8fd0f8"/>
      <path d="M34,34 L14,44 M66,34 L86,44" stroke="#ffe8a0" stroke-width="4" stroke-linecap="round" opacity="0.8"/></g>`,
    sword: `<g><path d="M30,74 L64,26 Q70,18 76,14 Q74,22 68,30 L36,78 Z" fill="#d8dde8"/>
      <path d="M76,14 Q74,22 68,30 L64,26 Q70,18 76,14 Z" fill="#f0f4fa"/>
      <rect x="24" y="70" width="18" height="7" rx="3" transform="rotate(-54 33 73)" fill="#8b5a2b"/>
      <circle cx="27" cy="80" r="5" fill="#c8a24a"/>
      <path d="M22,86 Q30,92 38,86" stroke="#8b5a2b" stroke-width="4" fill="none"/></g>`,
    sack: `<g><path d="M40,28 Q50,20 60,28 L56,34 L44,34 Z" fill="#b07030"/>
      <path d="M44,34 L56,34 Q76,52 70,74 Q64,86 50,86 Q36,86 30,74 Q24,52 44,34 Z" fill="#d8944a"/>
      <path d="M42,32 Q50,28 58,32" stroke="#6b4a20" stroke-width="4" fill="none"/>
      <text x="50" y="68" font-size="26" text-anchor="middle" fill="#6b4a20" font-weight="bold">฿</text>
      <circle cx="74" cy="82" r="7" fill="#f5c518" stroke="#c8a24a" stroke-width="2"/>
      <circle cx="86" cy="74" r="5" fill="#f5c518" stroke="#c8a24a" stroke-width="2"/></g>`,
    dagger: `<g><path d="M50,14 Q60,34 54,58 L46,58 Q40,34 50,14 Z" fill="#d8dde8"/>
      <path d="M50,14 Q55,32 52,52 L50,52 Z" fill="#f0f4fa"/>
      <rect x="38" y="58" width="24" height="6" rx="3" fill="#a02828"/>
      <rect x="45" y="64" width="10" height="16" rx="4" fill="#6b1a1a"/>
      <circle cx="50" cy="84" r="5" fill="#e03131"/>
      <path d="M26,30 Q20,40 26,50 M74,30 Q80,40 74,50" stroke="#e03131" stroke-width="4" fill="none" opacity="0.6" stroke-linecap="round"/></g>`,
    jar: `<g><path d="M40,22 L60,22 L58,30 Q72,38 70,58 Q68,80 50,80 Q32,80 30,58 Q28,38 42,30 Z" fill="#b06838"/>
      <path d="M40,22 L60,22 L59,27 L41,27 Z" fill="#8c4e28"/>
      <path d="M36,40 Q50,46 64,40" stroke="#8c4e28" stroke-width="3" fill="none"/>
      <ellipse cx="43" cy="52" rx="4" ry="8" fill="#c8845a" opacity="0.6"/></g>`,
    herb: `<g><path d="M32,58 L68,58 Q66,80 50,80 Q34,80 32,58 Z" fill="#8c6239"/>
      <path d="M28,52 L72,52 L70,60 L30,60 Z" fill="#a0764a"/>
      <rect x="56" y="20" width="7" height="34" rx="3.5" transform="rotate(24 60 37)" fill="#b08050"/>
      <path d="M36,44 Q30,28 44,22 Q46,36 36,44 Z" fill="#2faf66"/>
      <path d="M50,42 Q52,26 66,26 Q62,42 50,42 Z" fill="#48c880"/></g>`,
    rice: `<g stroke="#d8b84a" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M50,84 L50,36 M44,84 L38,40 M56,84 L62,40"/>
      </g><g fill="#f0d060">
      <ellipse cx="50" cy="30" rx="5" ry="10"/><ellipse cx="37" cy="34" rx="5" ry="10" transform="rotate(-14 37 34)"/>
      <ellipse cx="63" cy="34" rx="5" ry="10" transform="rotate(14 63 34)"/></g>
      <path d="M40,72 L60,72" stroke="#8c6239" stroke-width="5" stroke-linecap="round"/>`,
  };

  // เหรียญตราอาชีพ (medallion)
  function roleMedallion(roleId, size) {
    const r = ROLES[roleId];
    const s = size || 120;
    let ring = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 * Math.PI / 180;
      ring += `<path d="M${(60 + 52 * Math.cos(a)).toFixed(1)},${(60 + 52 * Math.sin(a)).toFixed(1)} l${(4 * Math.cos(a)).toFixed(1)},${(4 * Math.sin(a)).toFixed(1)}" stroke="${r.color}" stroke-width="3" stroke-linecap="round"/>`;
    }
    return `<svg viewBox="0 0 120 120" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="med-${roleId}"><stop offset="0" stop-color="#2a2440"/><stop offset="1" stop-color="#141020"/></radialGradient></defs>
      <circle cx="60" cy="60" r="56" fill="url(#med-${roleId})" stroke="${r.color}" stroke-width="3"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="${r.color}" stroke-width="1" opacity="0.5"/>
      ${ring}
      <g transform="translate(10,10)">${ICONS[r.icon]}</g>
    </svg>`;
  }

  function icon(name, size) {
    return `<svg viewBox="0 0 100 100" width="${size || 28}" height="${size || 28}" xmlns="http://www.w3.org/2000/svg">${ICONS[name]}</svg>`;
  }

  return { scene, avatar, character, roleMedallion, icon, ICONS };
})();
