/* ══════════════════════════════════════════════════════════════════
   선비 아바타 그리기 — 외부 이미지 없이 SVG 로 짓는다.
   단계에 따라 머리쓰개와 옷차림이 달라지고, 손에 든 물건이 바뀐다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SKIN = '#F0D2B2';
  const SKIN_SHADE = '#DDB894';
  const HAIR = '#241F1C';
  const LINE = '#2B2622';

  const ROBE_HEX = {
    white: '#EDE6D6', indigo: '#41617D', ink: '#3A3A40',
    jade: '#5C8574', clay: '#9A6B42', crimson: '#A8403A'
  };

  /** 도포 색에 따라 옷깃을 밝게 혹은 어둡게 */
  function collarOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
    return lum > 0.6 ? '#3A3A40' : '#F3EDE0';
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => Math.max(0, Math.min(255, Math.round(v + amt))));
    return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1);
  }

  /* ───────────────────── 머리쓰개 ───────────────────── */

  function headwear(tier) {
    // 얼굴은 y 39~97, 눈은 y 66. 머리쓰개는 y 58 아래로 내려오지 않는다.
    const hairCap = `<path d="M73 60c0-19 12-31 27-31s27 12 27 31c0 2 0 4-1 6-5-11-14-17-26-17s-21 6-26 17c-1-2-1-4-1-6z" fill="${HAIR}"/>`;

    switch (tier) {
      case 1:   // 댕기머리 — 가운데 가르마에 뒤로 땋은 머리
        return `
          ${hairCap}
          <path d="M100 29v14" stroke="#15120F" stroke-width="2" opacity=".7"/>
          <path d="M127 58c9 6 13 16 12 30-1 12-5 20-11 25" stroke="${HAIR}" stroke-width="7"
                stroke-linecap="round" fill="none"/>
          <circle cx="127" cy="116" r="5.5" fill="#B8392C"/>`;

      case 2:            // 유건 — 부드러운 사각 두건
        return `
          ${hairCap}
          <path d="M75 56V38c0-4 3-7 7-7h36c4 0 7 3 7 7v18c0 2-1 3-3 3H78c-2 0-3-1-3-3z" fill="#3E3A36"/>
          <path d="M78 31h44c3 0 5 2 5 5v4H73v-4c0-3 2-5 5-5z" fill="#4E4945"/>
          <path d="M82 22h36c3 0 5 2 5 5v5H77v-5c0-3 2-5 5-5z" fill="#454039"/>`;

      case 3:            // 갓 — 넓은 챙에 통모자
        return `
          ${hairCap}
          <ellipse cx="100" cy="49" rx="53" ry="10" fill="#241F1B" opacity=".9"/>
          <ellipse cx="100" cy="47" rx="53" ry="10" fill="#3A342E" opacity=".92"/>
          <path d="M83 20c0-6 7-10 17-10s17 4 17 10v27H83z" fill="#2E2924"/>
          <ellipse cx="100" cy="20" rx="17" ry="6" fill="#3E3832"/>
          <path d="M83 34h34" stroke="#1D1A16" stroke-width="1.5" opacity=".55"/>`;

      case 4:            // 사모(관모)와 양각
        return `
          ${hairCap}
          <path d="M81 56V26c0-7 8-12 19-12s19 5 19 12v30z" fill="#1E1B18"/>
          <path d="M81 40h38v16H81z" fill="#2A2623"/>
          <ellipse cx="100" cy="26" rx="19" ry="7" fill="#2A2623"/>
          <path d="M80 40c-15 1-25 5-25 9 0 3 6 5 14 5 7 0 11-3 11-7z" fill="#1E1B18"/>
          <path d="M120 40c15 1 25 5 25 9 0 3-6 5-14 5-7 0-11-3-11-7z" fill="#1E1B18"/>`;

      default:           // 문형 — 사모에 금장
        return `
          ${hairCap}
          <path d="M81 56V26c0-7 8-12 19-12s19 5 19 12v30z" fill="#1E1B18"/>
          <path d="M81 40h38v16H81z" fill="#2A2623"/>
          <ellipse cx="100" cy="26" rx="19" ry="7" fill="#2A2623"/>
          <path d="M80 40c-15 1-25 5-25 9 0 3 6 5 14 5 7 0 11-3 11-7z" fill="#1E1B18"/>
          <path d="M120 40c15 1 25 5 25 9 0 3-6 5-14 5-7 0-11-3-11-7z" fill="#1E1B18"/>
          <ellipse cx="100" cy="15" rx="7" ry="2.5" fill="#C9A227"/>`;
    }
  }

  /* ───────────────────── 손에 든 물건 ───────────────────── */

  function heldItem(item) {
    switch (item) {
      case 'book':
        return `<g transform="translate(150 172) rotate(-8)">
          <rect x="-16" y="-11" width="32" height="22" rx="2" fill="#B8A98C"/>
          <rect x="-16" y="-11" width="32" height="22" rx="2" fill="none" stroke="#8A7B62" stroke-width="1.5"/>
          <path d="M0 -11v22" stroke="#8A7B62" stroke-width="1.5"/>
          <path d="M-11 -5h7M-11 0h7M4 -5h7M4 0h7" stroke="#6E6250" stroke-width="1"/>
        </g>`;
      case 'fan':
        return `<g transform="translate(152 166) rotate(14)">
          <path d="M0 18 A26 26 0 0 1 26 -8 L26 18Z" fill="#E8DFCB" transform="rotate(-135)"/>
          <path d="M0 18l-2 12" stroke="#8A6A42" stroke-width="3.5" stroke-linecap="round"/>
          <path d="M-14 4 L0 18 M-18 -4 L0 18 M-18 -12 L0 18" stroke="#B8A88C" stroke-width="1"/>
        </g>`;
      case 'brush':
        return `<g transform="translate(150 164) rotate(12)">
          <rect x="-2" y="-18" width="4" height="34" rx="2" fill="#8A6A42"/>
          <path d="M-3 16c0 6 1 11 3 14 2-3 3-8 3-14z" fill="#2B2622"/>
          <rect x="-3.5" y="12" width="7" height="5" rx="1" fill="#C9A227"/>
        </g>`;
      case 'staff':
        return `<g transform="translate(150 150)">
          <path d="M0 -22c2 14 -2 28 0 62" stroke="#7A6242" stroke-width="5" stroke-linecap="round" fill="none"/>
          <path d="M-6 -8h12M-5 12h10" stroke="#5F4C34" stroke-width="2"/>
        </g>`;
      case 'lamp':
        return `<g transform="translate(152 176)">
          <path d="M0 -24v6" stroke="#6E6250" stroke-width="2"/>
          <rect x="-12" y="-18" width="24" height="28" rx="4" fill="#E8C86A" opacity=".9"/>
          <rect x="-12" y="-18" width="24" height="28" rx="4" fill="none" stroke="#A8403A" stroke-width="2"/>
          <path d="M-12 -8h24M-12 0h24" stroke="#A8403A" stroke-width="1" opacity=".6"/>
          <ellipse cx="0" cy="-4" rx="16" ry="18" fill="#F5D97E" opacity=".28"/>
        </g>`;
      default:
        return '';
    }
  }

  /* ───────────────────── 전체 조립 ───────────────────── */

  function svg(opts) {
    opts = opts || {};
    const tier = Math.max(1, Math.min(5, opts.tier || 1));
    const robeHex = ROBE_HEX[opts.robe] || ROBE_HEX.white;
    const collar = collarOf(robeHex);
    const item = opts.item || 'none';
    const uid = 'av' + Math.random().toString(36).slice(2, 8);
    const grand = tier === 5;

    return `
<svg viewBox="0 0 200 268" xmlns="http://www.w3.org/2000/svg" class="avatar-art" role="img"
     aria-label="${Util.esc(opts.label || '선비 아바타')}">
  <defs>
    <linearGradient id="${uid}robe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(robeHex, 14)}"/>
      <stop offset="1" stop-color="${shade(robeHex, -18)}"/>
    </linearGradient>
  </defs>

  <ellipse cx="100" cy="248" rx="54" ry="9" fill="#000" opacity=".13"/>

  <g class="av-body">
    <!-- 도포 -->
    <path d="M100 100c-20 0-34 10-38 26l-14 92c-1 7 3 12 10 12h84c7 0 11-5 10-12l-14-92c-4-16-18-26-38-26z"
          fill="url(#${uid}robe)"/>
    <!-- 소매 -->
    <path d="M62 126c-14 3-22 12-25 26l-6 28c-1 6 2 10 8 10h18z" fill="${shade(robeHex, -8)}"/>
    <path d="M138 126c14 3 22 12 25 26l6 28c1 6-2 10-8 10h-18z" fill="${shade(robeHex, -8)}"/>
    <!-- 옷깃 -->
    <path d="M100 100c-9 0-16 2-21 6l21 26 21-26c-5-4-12-6-21-6z" fill="${collar}"/>
    <path d="M100 132l-9-11h18z" fill="${shade(robeHex, -30)}"/>
    <!-- 세조대(띠) -->
    <rect x="58" y="176" width="84" height="9" rx="4" fill="${grand ? '#C9A227' : collar}" opacity=".9"/>
    ${grand ? '<rect x="78" y="140" width="44" height="34" rx="3" fill="#7E1E1C"/>' +
              '<path d="M100 146c8 0 13 5 13 11s-5 11-13 11-13-5-13-11 5-11 13-11z" fill="#C9A227" opacity=".9"/>' : ''}
    <!-- 손 -->
    <circle cx="46" cy="182" r="9" fill="${SKIN}"/>
    <circle cx="154" cy="182" r="9" fill="${SKIN}"/>
    ${heldItem(item)}
  </g>

  <g class="av-head">
    <!-- 목 -->
    <rect x="92" y="88" width="16" height="18" rx="7" fill="${SKIN_SHADE}"/>
    <!-- 얼굴 -->
    <ellipse cx="100" cy="66" rx="27" ry="30" fill="${SKIN}"/>
    <!-- 귀 -->
    <ellipse cx="73" cy="68" rx="5" ry="8" fill="${SKIN_SHADE}"/>
    <ellipse cx="127" cy="68" rx="5" ry="8" fill="${SKIN_SHADE}"/>
    <!-- 눈·코·입 -->
    <g class="av-eyes">
      <path d="M86 66c2-3 7-3 9 0" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M105 66c2-3 7-3 9 0" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    </g>
    <path d="M100 72v5" stroke="${SKIN_SHADE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M95 83c3 2 7 2 10 0" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    ${tier === 5
      ? `<path d="M93 90c2 9 4 16 7 21 3-5 5-12 7-21z" fill="#E8E2D8" opacity=".95"/>
         <path d="M86 78c-2 7-1 13 2 17" stroke="#E8E2D8" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>
         <path d="M114 78c2 7 1 13-2 17" stroke="#E8E2D8" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>` : ''}
    ${headwear(tier)}
  </g>
</svg>`;
  }

  window.AvatarArt = { svg, ROBE_HEX };
})();
