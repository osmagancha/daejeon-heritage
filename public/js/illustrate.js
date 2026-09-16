/* ══════════════════════════════════════════════════════════════════
   절차적 SVG 일러스트레이션
   사진 없이도 각 문화유산의 성격이 드러나는 장면을 생성한다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 시드 기반 난수 — 같은 유산은 항상 같은 그림 */
  function rng(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const round = (n) => Math.round(n * 10) / 10;

  /* 한국 기와지붕 윤곽 (처마 끝이 살짝 올라가고 지붕선이 오목하다) */
  function roofPath(cx, y, halfW, h, ridge, up) {
    const lx = round(cx - halfW), rx = round(cx + halfW);
    const lr = round(cx - ridge), rr = round(cx + ridge);
    const ye = round(y - up);
    return `M${lx} ${ye}Q${round(cx - halfW * .6)} ${round(y - h * .55)} ${lr} ${round(y - h)}` +
           `L${rr} ${round(y - h)}Q${round(cx + halfW * .6)} ${round(y - h * .55)} ${rx} ${ye}` +
           `Q${cx} ${round(y + h * .16)} ${lx} ${ye}Z`;
  }

  /* 나무 한 그루 */
  function tree(x, y, s, dark, rand) {
    const k = rand();
    if (k > .62) {
      // 침엽수
      return `<path d="M${x} ${y - 26 * s}L${round(x + 9 * s)} ${y - 8 * s}L${round(x + 4 * s)} ${y - 8 * s}L${round(x + 11 * s)} ${y}L${round(x - 11 * s)} ${y}L${round(x - 4 * s)} ${y - 8 * s}L${round(x - 9 * s)} ${y - 8 * s}Z" fill="${dark}"/>`;
    }
    // 활엽수
    return `<rect x="${round(x - 1.4 * s)}" y="${round(y - 11 * s)}" width="${round(2.8 * s)}" height="${round(11 * s)}" fill="${dark}" opacity=".85"/>` +
           `<ellipse cx="${x}" cy="${round(y - 16 * s)}" rx="${round(11 * s)}" ry="${round(9 * s)}" fill="${dark}"/>`;
  }

  /* 산 능선 */
  function ridgeLine(w, baseY, height, seedFn, fill, opacity) {
    let d = `M0 ${baseY}`;
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const x = (w / steps) * i;
      const y = baseY - height * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + seedFn() * 3)));
      d += i === 0 ? `L${round(x)} ${round(y)}` : `Q${round(x - w / steps / 2)} ${round(y - height * .18)} ${round(x)} ${round(y)}`;
    }
    d += `L${w} ${baseY + 40}L0 ${baseY + 40}Z`;
    return `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt)));
    g = Math.max(0, Math.min(255, Math.round(g + amt)));
    b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ───────────────────────── 건축물 그리기 ───────────────────────── */

  function drawHanok(g, m, C, rand) {
    const { cx, gy, unit } = g;
    const bays = m.bays || 3;
    const w = unit * (bays * 0.9 + 1.6);
    const bodyH = unit * 1.5;
    const platH = unit * (m.platform ? 0.42 : 0.3);
    const roofH = unit * 1.15;
    let s = '';

    // 기단
    s += `<rect x="${round(cx - w / 2 - unit * .3)}" y="${round(gy - platH)}" width="${round(w + unit * .6)}" height="${round(platH)}" fill="${C.stone}"/>`;
    s += `<rect x="${round(cx - w / 2 - unit * .3)}" y="${round(gy - platH)}" width="${round(w + unit * .6)}" height="${round(platH * .28)}" fill="${shade(C.stone, 18)}"/>`;

    const by = gy - platH;
    // 벽/문 칸
    s += `<rect x="${round(cx - w / 2)}" y="${round(by - bodyH)}" width="${round(w)}" height="${round(bodyH)}" fill="${C.wall}"/>`;
    const cw = w / bays;
    for (let i = 0; i < bays; i++) {
      const x = cx - w / 2 + cw * i + cw * 0.16;
      const pw = cw * 0.68;
      s += `<rect x="${round(x)}" y="${round(by - bodyH * .88)}" width="${round(pw)}" height="${round(bodyH * .78)}" fill="${C.door}" opacity=".92"/>`;
      // 창살
      for (let k = 1; k <= 3; k++) {
        s += `<line x1="${round(x + (pw / 4) * k)}" y1="${round(by - bodyH * .88)}" x2="${round(x + (pw / 4) * k)}" y2="${round(by - bodyH * .1)}" stroke="${C.frame}" stroke-width="1.1" opacity=".55"/>`;
      }
      s += `<line x1="${round(x)}" y1="${round(by - bodyH * .5)}" x2="${round(x + pw)}" y2="${round(by - bodyH * .5)}" stroke="${C.frame}" stroke-width="1.1" opacity=".55"/>`;
    }
    // 기둥
    for (let i = 0; i <= bays; i++) {
      const x = cx - w / 2 + cw * i;
      s += `<rect x="${round(x - unit * .07)}" y="${round(by - bodyH)}" width="${round(unit * .14)}" height="${round(bodyH)}" fill="${C.wood}"/>`;
    }
    // 창방 / 단청 띠
    s += `<rect x="${round(cx - w / 2 - unit * .12)}" y="${round(by - bodyH - unit * .18)}" width="${round(w + unit * .24)}" height="${round(unit * .2)}" fill="${m.dancheong ? C.accent : C.wood}"/>`;
    if (m.dancheong) {
      for (let i = 0; i < bays * 2; i++) {
        s += `<circle cx="${round(cx - w / 2 + (w / (bays * 2)) * (i + .5))}" cy="${round(by - bodyH - unit * .08)}" r="${round(unit * .05)}" fill="${C.accent2}"/>`;
      }
    }
    // 지붕
    const ry = by - bodyH - unit * .18;
    s += `<path d="${roofPath(cx, ry, w / 2 + unit * .82, roofH, w * .22, unit * .16)}" fill="${C.roof}"/>`;
    s += `<path d="${roofPath(cx, ry, w / 2 + unit * .82, roofH, w * .22, unit * .16)}" fill="url(#tile)" opacity=".5"/>`;
    // 용마루
    s += `<rect x="${round(cx - w * .22 - unit * .1)}" y="${round(ry - roofH - unit * .12)}" width="${round(w * .44 + unit * .2)}" height="${round(unit * .17)}" rx="${round(unit * .08)}" fill="${shade(C.roof, -22)}"/>`;
    // 굴뚝
    if (m.chimney) {
      s += `<rect x="${round(cx + w / 2 + unit * .5)}" y="${round(gy - unit * 1.5)}" width="${round(unit * .34)}" height="${round(unit * 1.5)}" fill="${C.stone}"/>`;
      s += `<rect x="${round(cx + w / 2 + unit * .44)}" y="${round(gy - unit * 1.62)}" width="${round(unit * .46)}" height="${round(unit * .14)}" fill="${shade(C.stone, -20)}"/>`;
    }
    // 연못
    if (m.pond) {
      s += `<ellipse cx="${round(cx - unit * .2)}" cy="${round(gy + unit * .55)}" rx="${round(w * .62)}" ry="${round(unit * .38)}" fill="${C.water}" opacity=".85"/>`;
      s += `<ellipse cx="${round(cx - unit * .2)}" cy="${round(gy + unit * .5)}" rx="${round(w * .5)}" ry="${round(unit * .22)}" fill="#fff" opacity=".16"/>`;
    }
    return s;
  }

  function drawFortress(g, m, C, rand) {
    const { cx, gy, unit, w: W } = g;
    let s = '';
    const wallY = gy - unit * .2;
    const h = unit * (m.wallHeight ? Math.min(2, m.wallHeight / 2) : 1.5);
    // 계단식 성벽
    const segs = 9;
    const segW = (W * .92) / segs;
    for (let i = 0; i < segs; i++) {
      const x = W * .04 + segW * i;
      const drop = Math.sin(i * .9) * unit * .28;
      s += `<rect x="${round(x)}" y="${round(wallY - h + drop)}" width="${round(segW + 1)}" height="${round(h + unit * .5)}" fill="${i % 2 ? C.stone : shade(C.stone, 10)}"/>`;
      // 성돌 결
      for (let r = 0; r < 4; r++) {
        s += `<line x1="${round(x)}" y1="${round(wallY - h + drop + (h / 4) * r)}" x2="${round(x + segW)}" y2="${round(wallY - h + drop + (h / 4) * r)}" stroke="${shade(C.stone, -18)}" stroke-width=".8" opacity=".5"/>`;
      }
    }
    // 여장(성가퀴)
    for (let i = 0; i < segs * 2; i++) {
      const x = W * .04 + (segW / 2) * i;
      const drop = Math.sin((i / 2) * .9) * unit * .28;
      s += `<rect x="${round(x)}" y="${round(wallY - h + drop - unit * .3)}" width="${round(segW * .34)}" height="${round(unit * .32)}" fill="${shade(C.stone, -8)}"/>`;
    }
    // 문루 / 장대
    if (m.gate || m.pavilion) {
      const px = cx, py = wallY - h - unit * .2;
      s += `<rect x="${round(px - unit * .95)}" y="${round(py - unit * 1.05)}" width="${round(unit * 1.9)}" height="${round(unit * 1.05)}" fill="${C.wall}"/>`;
      for (let i = 0; i <= 3; i++) {
        s += `<rect x="${round(px - unit * .95 + (unit * 1.9 / 3) * i - unit * .05)}" y="${round(py - unit * 1.05)}" width="${round(unit * .1)}" height="${round(unit * 1.05)}" fill="${C.wood}"/>`;
      }
      s += `<rect x="${round(px - unit * 1.05)}" y="${round(py - unit * 1.2)}" width="${round(unit * 2.1)}" height="${round(unit * .16)}" fill="${C.accent}"/>`;
      s += `<path d="${roofPath(px, py - unit * 1.2, unit * 1.65, unit * .82, unit * .5, unit * .14)}" fill="${C.roof}"/>`;
      s += `<path d="${roofPath(px, py - unit * 1.2, unit * 1.65, unit * .82, unit * .5, unit * .14)}" fill="url(#tile)" opacity=".45"/>`;
    }
    // 봉수대
    if (m.beacon) {
      const bx = W * .8;
      s += `<path d="M${round(bx - unit * .5)} ${round(wallY - h - unit * .1)}L${round(bx + unit * .5)} ${round(wallY - h - unit * .1)}L${round(bx + unit * .34)} ${round(wallY - h - unit * 1.1)}L${round(bx - unit * .34)} ${round(wallY - h - unit * 1.1)}Z" fill="${shade(C.stone, -14)}"/>`;
      s += `<path d="M${round(bx)} ${round(wallY - h - unit * 1.15)}c-${round(unit * .2)} -${round(unit * .3)} .1 -${round(unit * .4)} 0 -${round(unit * .62)}c${round(unit * .28)} ${round(unit * .26)} ${round(unit * .26)} ${round(unit * .5)} 0 ${round(unit * .62)}Z" fill="${C.accent}" opacity=".9"/>`;
    }
    return s;
  }

  function drawHyanggyo(g, m, C, rand) {
    const { cx, gy, unit } = g;
    let s = '';
    // 담장
    s += `<rect x="${round(cx - unit * 3.6)}" y="${round(gy - unit * .95)}" width="${round(unit * 7.2)}" height="${round(unit * .95)}" fill="${C.wall}" opacity=".7"/>`;
    s += `<rect x="${round(cx - unit * 3.7)}" y="${round(gy - unit * 1.06)}" width="${round(unit * 7.4)}" height="${round(unit * .16)}" fill="${shade(C.roof, -10)}"/>`;

    // 뒤쪽 대성전 (높게)
    const back = { cx: cx + unit * .2, y: gy - unit * .55, w: unit * 3.1, h: unit * 1.5 };
    s += `<rect x="${round(back.cx - back.w / 2)}" y="${round(back.y - back.h)}" width="${round(back.w)}" height="${round(back.h)}" fill="${shade(C.wall, -6)}"/>`;
    for (let i = 0; i < 3; i++) {
      s += `<rect x="${round(back.cx - back.w / 2 + back.w * (.12 + i * .3))}" y="${round(back.y - back.h * .85)}" width="${round(back.w * .2)}" height="${round(back.h * .7)}" fill="${C.door}"/>`;
    }
    s += `<rect x="${round(back.cx - back.w / 2 - unit * .1)}" y="${round(back.y - back.h - unit * .16)}" width="${round(back.w + unit * .2)}" height="${round(unit * .18)}" fill="${m.dancheong ? C.accent : C.wood}"/>`;
    s += `<path d="${roofPath(back.cx, back.y - back.h - unit * .16, back.w / 2 + unit * .7, unit * 1, back.w * .24, unit * .15)}" fill="${C.roof}"/>`;
    s += `<path d="${roofPath(back.cx, back.y - back.h - unit * .16, back.w / 2 + unit * .7, unit * 1, back.w * .24, unit * .15)}" fill="url(#tile)" opacity=".45"/>`;

    // 앞쪽 명륜당 (넓고 낮게)
    const front = { cx: cx - unit * .3, y: gy + unit * .12, w: unit * 3.9, h: unit * 1.15 };
    s += `<rect x="${round(front.cx - front.w / 2 - unit * .2)}" y="${round(front.y - unit * .28)}" width="${round(front.w + unit * .4)}" height="${round(unit * .28)}" fill="${C.stone}"/>`;
    s += `<rect x="${round(front.cx - front.w / 2)}" y="${round(front.y - unit * .28 - front.h)}" width="${round(front.w)}" height="${round(front.h)}" fill="${C.wall}"/>`;
    for (let i = 0; i <= 4; i++) {
      s += `<rect x="${round(front.cx - front.w / 2 + (front.w / 4) * i - unit * .06)}" y="${round(front.y - unit * .28 - front.h)}" width="${round(unit * .12)}" height="${round(front.h)}" fill="${C.wood}"/>`;
    }
    s += `<rect x="${round(front.cx - front.w / 2 + front.w * .3)}" y="${round(front.y - unit * .28 - front.h * .92)}" width="${round(front.w * .4)}" height="${round(front.h * .74)}" fill="${C.door}" opacity=".9"/>`;
    const fry = front.y - unit * .28 - front.h - unit * .14;
    s += `<rect x="${round(front.cx - front.w / 2 - unit * .1)}" y="${round(fry)}" width="${round(front.w + unit * .2)}" height="${round(unit * .16)}" fill="${m.dancheong ? C.accent : C.wood}"/>`;
    s += `<path d="${roofPath(front.cx, fry, front.w / 2 + unit * .85, unit * .92, front.w * .26, unit * .16)}" fill="${shade(C.roof, 8)}"/>`;
    s += `<path d="${roofPath(front.cx, fry, front.w / 2 + unit * .85, unit * .92, front.w * .26, unit * .16)}" fill="url(#tile)" opacity=".45"/>`;

    // 홍살문
    if (m.hongsalmun) {
      const hx = cx - unit * 4.3;
      s += `<rect x="${round(hx - unit * .5)}" y="${round(gy - unit * 1.9)}" width="${round(unit * .1)}" height="${round(unit * 1.9)}" fill="#b8392c"/>`;
      s += `<rect x="${round(hx + unit * .4)}" y="${round(gy - unit * 1.9)}" width="${round(unit * .1)}" height="${round(unit * 1.9)}" fill="#b8392c"/>`;
      s += `<rect x="${round(hx - unit * .65)}" y="${round(gy - unit * 1.75)}" width="${round(unit * 1.3)}" height="${round(unit * .1)}" fill="#b8392c"/>`;
      for (let i = 0; i < 6; i++) {
        s += `<rect x="${round(hx - unit * .5 + (unit / 6) * i)}" y="${round(gy - unit * 1.95)}" width="${round(unit * .05)}" height="${round(unit * .3)}" fill="#b8392c"/>`;
      }
    }
    return s;
  }

  function drawSeowon(g, m, C, rand) {
    return drawHyanggyo(g, Object.assign({}, m, { dancheong: m.dancheong }), C, rand);
  }

  function drawModernHall(g, m, C, rand) {
    const { cx, gy, unit } = g;
    const floors = m.floors || 3;
    const w = unit * 5.6, h = unit * (0.62 * floors + .4);
    let s = '';
    const by = gy;
    s += `<rect x="${round(cx - w / 2)}" y="${round(by - h)}" width="${round(w)}" height="${round(h)}" fill="${C.wall}"/>`;
    s += `<rect x="${round(cx - w / 2)}" y="${round(by - h)}" width="${round(w)}" height="${round(h)}" fill="url(#brick)" opacity=".35"/>`;
    // 창 그리드
    const cols = 11;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (c > 3 && c < 7 && f === 0) continue;   // 현관 자리
        const x = cx - w / 2 + (w / cols) * c + (w / cols) * .22;
        const y = by - h + unit * .3 + f * (h - unit * .4) / floors;
        s += `<rect x="${round(x)}" y="${round(y)}" width="${round((w / cols) * .56)}" height="${round(((h - unit * .4) / floors) * .58)}" fill="${C.door}" opacity=".85"/>`;
      }
    }
    // 중앙 현관 돌출부
    if (m.porch !== false) {
      const pw = unit * 1.9;
      s += `<rect x="${round(cx - pw / 2)}" y="${round(by - h - unit * .34)}" width="${round(pw)}" height="${round(h + unit * .34)}" fill="${shade(C.wall, 12)}"/>`;
      s += `<rect x="${round(cx - pw / 2 + unit * .22)}" y="${round(by - h + unit * .2)}" width="${round(pw - unit * .44)}" height="${round(h - unit * .95)}" fill="${C.door}" opacity=".8"/>`;
      s += `<rect x="${round(cx - unit * .45)}" y="${round(by - unit * .95)}" width="${round(unit * .9)}" height="${round(unit * .95)}" fill="${shade(C.door, -14)}"/>`;
      s += `<rect x="${round(cx - pw / 2 - unit * .16)}" y="${round(by - h - unit * .46)}" width="${round(pw + unit * .32)}" height="${round(unit * .16)}" fill="${shade(C.wall, -18)}"/>`;
    }
    // 처마선
    s += `<rect x="${round(cx - w / 2 - unit * .18)}" y="${round(by - h - unit * .16)}" width="${round(w + unit * .36)}" height="${round(unit * .17)}" fill="${shade(C.wall, -22)}"/>`;
    s += `<rect x="${round(cx - w / 2 - unit * .1)}" y="${round(by - unit * .18)}" width="${round(w + unit * .2)}" height="${round(unit * .18)}" fill="${C.stone}"/>`;
    return s;
  }

  function drawModernBank(g, m, C, rand) {
    const { cx, gy, unit } = g;
    const w = unit * 4.6, h = unit * 2.5;
    let s = '';
    s += `<path d="M${round(cx - w / 2)} ${round(gy)}L${round(cx - w / 2)} ${round(gy - h + unit * .7)}Q${round(cx - w / 2)} ${round(gy - h)} ${round(cx - w / 2 + unit * .7)} ${round(gy - h)}L${round(cx + w / 2)} ${round(gy - h)}L${round(cx + w / 2)} ${round(gy)}Z" fill="${C.wall}"/>`;
    s += `<path d="M${round(cx - w / 2)} ${round(gy)}L${round(cx - w / 2)} ${round(gy - h + unit * .7)}Q${round(cx - w / 2)} ${round(gy - h)} ${round(cx - w / 2 + unit * .7)} ${round(gy - h)}L${round(cx + w / 2)} ${round(gy - h)}L${round(cx + w / 2)} ${round(gy)}Z" fill="url(#brick)" opacity=".28"/>`;
    // 열주
    const n = m.columns || 4;
    for (let i = 0; i < n; i++) {
      const x = cx - w * .28 + (w * .62 / (n - 1)) * i;
      s += `<rect x="${round(x - unit * .13)}" y="${round(gy - h + unit * .5)}" width="${round(unit * .26)}" height="${round(h - unit * .5)}" fill="${shade(C.wall, 16)}"/>`;
      s += `<rect x="${round(x - unit * .19)}" y="${round(gy - h + unit * .42)}" width="${round(unit * .38)}" height="${round(unit * .12)}" fill="${shade(C.wall, -12)}"/>`;
    }
    // 곡면 모서리 입구
    s += `<path d="M${round(cx - w / 2 + unit * .18)} ${round(gy)}L${round(cx - w / 2 + unit * .18)} ${round(gy - unit * 1.3)}Q${round(cx - w / 2 + unit * .18)} ${round(gy - unit * 1.8)} ${round(cx - w / 2 + unit * .95)} ${round(gy - unit * 1.8)}L${round(cx - w / 2 + unit * .95)} ${round(gy)}Z" fill="${C.door}" opacity=".85"/>`;
    // 상부 코니스
    s += `<rect x="${round(cx - w / 2 - unit * .2)}" y="${round(gy - h - unit * .2)}" width="${round(w + unit * .4)}" height="${round(unit * .22)}" fill="${shade(C.wall, -20)}"/>`;
    // 상층 창
    for (let i = 0; i < 5; i++) {
      s += `<rect x="${round(cx - w * .22 + (w * .56 / 4) * i - unit * .12)}" y="${round(gy - h + unit * .68)}" width="${round(unit * .24)}" height="${round(unit * .5)}" fill="${C.door}" opacity=".6"/>`;
    }
    return s;
  }

  function drawWaterTower(g, m, C, rand) {
    const { cx, gy, unit } = g;
    const h = unit * 4.2, r = unit * .55;
    let s = '';
    s += `<rect x="${round(cx - r * 1.35)}" y="${round(gy - unit * .3)}" width="${round(r * 2.7)}" height="${round(unit * .3)}" fill="${shade(C.stone, -12)}"/>`;
    s += `<rect x="${round(cx - r)}" y="${round(gy - h)}" width="${round(r * 2)}" height="${round(h)}" fill="${C.stone}"/>`;
    s += `<rect x="${round(cx - r)}" y="${round(gy - h)}" width="${round(r * .7)}" height="${round(h)}" fill="#fff" opacity=".1"/>`;
    // 탱크
    const tr = r * 1.75;
    s += `<path d="M${round(cx - r)} ${round(gy - h + unit * .5)}L${round(cx - tr)} ${round(gy - h - unit * .1)}L${round(cx - tr)} ${round(gy - h - unit * 1.15)}L${round(cx + tr)} ${round(gy - h - unit * 1.15)}L${round(cx + tr)} ${round(gy - h - unit * .1)}L${round(cx + r)} ${round(gy - h + unit * .5)}Z" fill="${shade(C.stone, 12)}"/>`;
    s += `<rect x="${round(cx - tr - unit * .12)}" y="${round(gy - h - unit * 1.32)}" width="${round(tr * 2 + unit * .24)}" height="${round(unit * .2)}" fill="${shade(C.stone, -16)}"/>`;
    // 창
    s += `<rect x="${round(cx - unit * .16)}" y="${round(gy - h * .55)}" width="${round(unit * .32)}" height="${round(unit * .46)}" fill="${C.door}"/>`;
    s += `<rect x="${round(cx - unit * .16)}" y="${round(gy - h * .8)}" width="${round(unit * .32)}" height="${round(unit * .46)}" fill="${C.door}"/>`;
    // 선로
    if (m.rails) {
      s += `<rect x="0" y="${round(gy + unit * .3)}" width="100%" height="${round(unit * .1)}" fill="${shade(C.stone, -22)}" opacity=".7"/>`;
      s += `<rect x="0" y="${round(gy + unit * .55)}" width="100%" height="${round(unit * .1)}" fill="${shade(C.stone, -22)}" opacity=".55"/>`;
    }
    return s;
  }

  function drawJapaneseHouse(g, m, C, rand) {
    const { cx, gy, unit } = g;
    let s = '';
    const units = m.units || 3;
    for (let i = 0; i < units; i++) {
      const off = (i - (units - 1) / 2) * unit * 2.15;
      const x = cx + off, w = unit * 1.85, h = unit * 1.25;
      const back = i % 2 === 1;
      const yy = gy - (back ? unit * .35 : 0);
      s += `<rect x="${round(x - w / 2)}" y="${round(yy - h)}" width="${round(w)}" height="${round(h)}" fill="${back ? shade(C.wall, -10) : C.wall}"/>`;
      s += `<rect x="${round(x - w * .32)}" y="${round(yy - h * .8)}" width="${round(w * .64)}" height="${round(h * .55)}" fill="${C.door}" opacity=".9"/>`;
      for (let k = 1; k < 4; k++) {
        s += `<line x1="${round(x - w * .32 + (w * .64 / 4) * k)}" y1="${round(yy - h * .8)}" x2="${round(x - w * .32 + (w * .64 / 4) * k)}" y2="${round(yy - h * .25)}" stroke="${C.frame}" stroke-width="1" opacity=".6"/>`;
      }
      // 박공 지붕
      s += `<path d="M${round(x - w / 2 - unit * .3)} ${round(yy - h)}L${round(x)} ${round(yy - h - unit * .72)}L${round(x + w / 2 + unit * .3)} ${round(yy - h)}Z" fill="${back ? shade(C.roof, -12) : C.roof}"/>`;
      s += `<rect x="${round(x - w / 2 - unit * .34)}" y="${round(yy - h - unit * .06)}" width="${round(w + unit * .68)}" height="${round(unit * .12)}" fill="${shade(C.roof, -20)}"/>`;
    }
    // 낮은 담
    s += `<rect x="0" y="${round(gy + unit * .1)}" width="100%" height="${round(unit * .34)}" fill="${shade(C.stone, 6)}" opacity=".85"/>`;
    return s;
  }

  const DRAW = {
    hanok: drawHanok,
    hanok_water: drawHanok,
    hanok_terrace: drawHanok,
    fortress: drawFortress,
    hyanggyo: drawHyanggyo,
    seowon: drawSeowon,
    modern_hall: drawModernHall,
    modern_bank: drawModernBank,
    water_tower: drawWaterTower,
    japanese_house: drawJapaneseHouse
  };

  /* ───────────────────────── 장면 조립 ───────────────────────── */

  function scene(item, opts) {
    opts = opts || {};
    const W = opts.w || 800;
    const H = opts.h || 420;
    const simple = !!opts.simple;
    const dark = document.documentElement.dataset.theme === 'dark';
    const rand = rng(item.id + (dark ? 'd' : 'l'));
    const p = item.palette || ['#8c5a3c', '#2f3a45', '#d8c9ae', '#5b7c55'];
    const uid = 'g' + item.id.replace(/[^a-z0-9]/gi, '');

    const C = {
      roof: dark ? shade(p[1], 24) : p[1],
      wall: dark ? shade(p[2], -104) : p[2],
      wood: dark ? shade(p[0], 14) : p[0],
      stone: dark ? '#5c6067' : '#b9b3a6',
      door: dark ? '#2a2f36' : shade(p[0], -34),
      frame: dark ? '#8a7a68' : '#efe6d4',
      accent: '#b8392c',
      accent2: '#1f6e8c',
      water: dark ? '#2c4a58' : '#8fbcc9',
      green: dark ? shade(p[3], -20) : p[3]
    };

    const skyTop = dark ? '#1a1f2b' : '#dfe9ef';
    const skyBot = dark ? '#2a2b31' : '#f5efe2';
    const gy = H * (simple ? 0.82 : 0.78);
    const unit = H / (simple ? 7.2 : 8.4);

    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice" role="img" aria-label="${String(item.name || '').replace(/[<>&"]/g, '')} 일러스트">`;
    s += `<defs>
      <linearGradient id="${uid}sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/>
      </linearGradient>
      <pattern id="tile" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 9 Q4.5 3 9 9" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1"/>
      </pattern>
      <pattern id="brick" width="12" height="6" patternUnits="userSpaceOnUse">
        <rect width="12" height="6" fill="none"/>
        <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(0,0,0,.3)" stroke-width=".7"/>
        <line x1="6" y1="0" x2="6" y2="6" stroke="rgba(0,0,0,.22)" stroke-width=".7"/>
      </pattern>
      <radialGradient id="${uid}sun" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="${dark ? '#f4e6c0' : '#fff6da'}" stop-opacity=".95"/>
        <stop offset="1" stop-color="${dark ? '#f4e6c0' : '#fff6da'}" stop-opacity="0"/>
      </radialGradient>
    </defs>`;

    s += `<rect width="${W}" height="${H}" fill="url(#${uid}sky)"/>`;
    s += `<circle cx="${round(W * .78)}" cy="${round(H * .22)}" r="${round(H * .3)}" fill="url(#${uid}sun)"/>`;

    if (!simple) {
      // 원경 산
      s += ridgeLine(W, gy - unit * .3, unit * 2.6, rand, dark ? '#2b3038' : '#c3cece', dark ? .9 : .55);
      s += ridgeLine(W, gy - unit * .1, unit * 1.7, rand, dark ? '#333a44' : '#aebbb8', dark ? .9 : .6);
    }

    // 지면
    s += `<rect x="0" y="${round(gy)}" width="${W}" height="${round(H - gy)}" fill="${dark ? '#22262c' : '#e6dfd0'}"/>`;
    s += `<rect x="0" y="${round(gy)}" width="${W}" height="${round(unit * .12)}" fill="${dark ? '#2b3038' : '#d6cdb9'}"/>`;

    // 뒤 나무
    const trees = Math.min(item.model && item.model.trees || 4, simple ? 3 : 9);
    for (let i = 0; i < trees; i++) {
      const x = W * (0.06 + rand() * 0.88);
      if (Math.abs(x - W / 2) < W * 0.16) continue;
      s += tree(round(x), round(gy + unit * .08), (0.7 + rand() * 0.5) * (unit / 22), C.green, rand);
    }

    // 건축물
    const model = item.model || { type: 'hanok' };
    const draw = DRAW[model.type] || drawHanok;
    s += `<g>${draw({ cx: W / 2, gy, unit, w: W, h: H }, model, C, rand)}</g>`;

    // 앞 잔디 결
    if (!simple) {
      for (let i = 0; i < 26; i++) {
        const x = round(W * rand());
        const y = round(gy + unit * .25 + (H - gy) * rand() * .8);
        s += `<line x1="${x}" y1="${y}" x2="${x}" y2="${round(y - unit * .16)}" stroke="${C.green}" stroke-width="1.4" opacity=".4"/>`;
      }
    }

    s += `</svg>`;
    // 패턴 id 를 SVG 마다 고유하게 (DOM 에 여러 장면이 공존해도 안전)
    return s.replace(/id="tile"/g, 'id="' + uid + 'tile"')
            .replace(/url\(#tile\)/g, 'url(#' + uid + 'tile)')
            .replace(/id="brick"/g, 'id="' + uid + 'brick"')
            .replace(/url\(#brick\)/g, 'url(#' + uid + 'brick)');
  }

  window.Illustrate = { scene, roofPath, shade };
})();
