/* ══════════════════════════════════════════════════════════════════
   3D 아바타 — 모델 파일 없이 three.js 기본 도형으로 짓는다.
   server/avatar.js 의 form 명세를 읽어 사람·영물·신격을 만든다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const has3D = typeof THREE !== 'undefined';

  const SKIN = 0xF0D2B2;
  const DARK = 0x241F1C;

  const M = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }
  const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const ball = (r, mat, x, y, z, seg) => mesh(new THREE.SphereGeometry(r, seg || 20, seg || 16), mat, x, y, z);
  const cyl = (r1, r2, h, mat, x, y, z, seg) =>
    mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 18), mat, x, y, z);
  const cone = (r, h, mat, x, y, z, seg) => mesh(new THREE.ConeGeometry(r, h, seg || 14), mat, x, y, z);
  const torus = (r, t, mat, x, y, z) =>
    mesh(new THREE.TorusGeometry(r, t, 10, 32), mat, x, y, z);

  /* ─────────────────────────── 부품 ─────────────────────────── */

  /** 도포 자락 — 아래가 퍼지는 원뿔대 */
  function robeBody(g, color, h) {
    const mat = M(color);
    g.add(cyl(0.42, 0.92, h, mat, 0, h / 2, 0, 24));
    // 소매
    const sleeve = M(new THREE.Color(color).multiplyScalar(0.88));
    [-1, 1].forEach((s) => {
      const a = cyl(0.16, 0.3, 0.9, sleeve, s * 0.62, h * 0.62, 0, 14);
      a.rotation.z = s * 0.22;
      g.add(a);
    });
    // 옷깃
    const collar = new THREE.Color(color).getHSL({}).l > 0.6 ? 0x3A3A40 : 0xF3EDE0;
    const v = cyl(0.3, 0.34, 0.2, M(collar), 0, h - 0.12, 0, 20);
    g.add(v);
    return mat;
  }

  function hands(g, y) {
    [-1, 1].forEach((s) => g.add(ball(0.13, M(SKIN), s * 0.72, y, 0.08, 12)));
  }

  function face(g, y, opts) {
    opts = opts || {};
    const skin = opts.skin != null ? opts.skin : SKIN;
    const head = ball(0.42, M(skin), 0, y, 0, 24);
    head.scale.set(1, 1.06, 0.94);
    g.add(head);

    // 눈과 입
    const eye = M(0x1E1A17);
    [-1, 1].forEach((s) => g.add(ball(0.055, eye, s * 0.15, y + 0.05, 0.37, 8)));
    if (!opts.noMouth) g.add(box(0.13, 0.028, 0.03, M(0x8A5A46), 0, y - 0.16, 0.39));
    if (opts.fangs) {
      const white = M(0xF2EFE8);
      [-1, 1].forEach((s) => g.add(cone(0.05, 0.14, white, s * 0.13, y - 0.19, 0.34)
        .rotateX(Math.PI)));
    }
    if (opts.beard) {
      const b = cone(0.22, 0.6, M(0xE8E2D8), 0, y - 0.46, 0.14, 12);
      b.rotation.x = Math.PI;
      g.add(b);
    }
    if (opts.whiskers) {
      [-1, 1].forEach((s) => {
        const w = cyl(0.02, 0.01, 0.8, M(0xE8E2D8), s * 0.3, y - 0.05, 0.3, 6);
        w.rotation.set(0.5, 0, s * 0.9);
        g.add(w);
      });
    }
    return head;
  }

  function horns(g, y, n, color) {
    const mat = M(color || 0xE8DCC0);
    if (n === 1) {
      const h = cone(0.11, 0.5, mat, 0, y + 0.5, 0);
      g.add(h);
    } else {
      [-1, 1].forEach((s) => {
        const h = cone(0.1, 0.44, mat, s * 0.24, y + 0.42, -0.02);
        h.rotation.z = s * -0.34;
        g.add(h);
      });
    }
  }

  function halo(g, y, level, glow) {
    const mat = new THREE.MeshBasicMaterial({
      color: glow, transparent: true, opacity: 0.55, side: THREE.DoubleSide
    });
    for (let i = 0; i < level; i++) {
      const r = torus(0.72 + i * 0.22, 0.03, mat, 0, y + 0.15, -0.1);
      r.name = 'halo' + i;
      g.add(r);
    }
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.66, 28),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.14 })
    );
    disc.position.set(0, y + 0.15, -0.22);
    g.add(disc);
  }

  /* ─────────────────────── 머리쓰개 (사람) ─────────────────────── */

  function hat(g, y, kind) {
    switch (kind) {
      case 'daenggi': {                       // 댕기머리
        const cap = ball(0.46, M(DARK), 0, y + 0.24, 0, 20);
        cap.scale.set(1, 0.58, 1);
        g.add(cap);
        const braid = cyl(0.07, 0.05, 0.9, M(DARK), 0, y - 0.34, -0.40, 8);
        braid.rotation.x = 0.12;
        g.add(braid);
        g.add(ball(0.09, M(0xB8392C), 0, y - 0.80, -0.34, 10));
        break;
      }
      case 'yugeon': {                        // 유건
        const cap = ball(0.45, M(DARK), 0, y + 0.24, 0, 18);
        cap.scale.set(1, 0.56, 1);
        g.add(cap);
        g.add(box(0.62, 0.42, 0.62, M(0x3E3A36), 0, y + 0.42, 0));
        g.add(box(0.68, 0.1, 0.68, M(0x4E4945), 0, y + 0.64, 0));
        break;
      }
      case 'gat': {                           // 갓
        const cap = ball(0.45, M(DARK), 0, y + 0.24, 0, 18);
        cap.scale.set(1, 0.56, 1);
        g.add(cap);
        const brim = cyl(1.05, 1.05, 0.035, M(0x322D28), 0, y + 0.38, 0, 32);
        brim.material.transparent = true;
        brim.material.opacity = 0.94;
        g.add(brim);
        g.add(cyl(0.3, 0.33, 0.5, M(0x2E2924), 0, y + 0.62, 0, 20));
        g.add(cyl(0.3, 0.3, 0.04, M(0x3E3832), 0, y + 0.87, 0, 20));
        break;
      }
      case 'samo': {                          // 사모 — 양쪽에 뿔이 달린 관모
        const cap = ball(0.45, M(DARK), 0, y + 0.24, 0, 18);
        cap.scale.set(1, 0.56, 1);
        g.add(cap);
        g.add(cyl(0.34, 0.4, 0.56, M(0x1F1C19), 0, y + 0.5, 0, 20));
        g.add(cyl(0.34, 0.34, 0.05, M(0x2B2724), 0, y + 0.8, 0, 20));
        [-1, 1].forEach((s) => {
          const wing = box(0.5, 0.09, 0.16, M(0x1F1C19), s * 0.62, y + 0.44, -0.05);
          wing.rotation.y = s * 0.25;
          g.add(wing);
        });
        break;
      }
      case 'crown': {                         // 관 — 신격
        const cap = ball(0.45, M(DARK), 0, y + 0.24, 0, 18);
        cap.scale.set(1, 0.56, 1);
        g.add(cap);
        g.add(cyl(0.36, 0.4, 0.4, M(0x8A6A20), 0, y + 0.44, 0, 20));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          g.add(cone(0.06, 0.26, M(0xC9A227), Math.cos(a) * 0.34, y + 0.76, Math.sin(a) * 0.34, 8));
        }
        break;
      }
      default: {
        const cap = ball(0.46, M(DARK), 0, y + 0.24, 0, 18);
        cap.scale.set(1, 0.58, 1);
        g.add(cap);
      }
    }
  }

  /* ─────────────────────── 손에 드는 물건 ─────────────────────── */

  function heldItem(g, key, y) {
    const x = 0.86;
    switch (key) {
      case 'book':
        g.add(box(0.34, 0.44, 0.1, M(0xB8A98C), x, y, 0.12));
        g.add(box(0.36, 0.06, 0.12, M(0x8A7B62), x, y - 0.2, 0.12));
        break;
      case 'fan': {
        const f = cyl(0.34, 0.34, 0.03, M(0xE8DFCB), x + 0.1, y + 0.2, 0.1, 16, true);
        f.rotation.set(0, 0, 0.5);
        g.add(f);
        g.add(cyl(0.03, 0.03, 0.3, M(0x8A6A42), x, y - 0.06, 0.1, 8));
        break;
      }
      case 'brush':
        g.add(cyl(0.035, 0.035, 0.7, M(0x8A6A42), x, y + 0.1, 0.1, 8));
        g.add(cone(0.06, 0.2, M(0x2B2622), x, y - 0.32, 0.1, 8));
        break;
      case 'staff': {
        const st = cyl(0.05, 0.05, 2.1, M(0x7A6242), x, y + 0.3, 0.1, 8);
        g.add(st);
        break;
      }
      case 'lamp':
        g.add(cyl(0.02, 0.02, 0.4, M(0x6E6250), x, y + 0.34, 0.1, 6));
        g.add(box(0.3, 0.36, 0.3, M(0xE8C86A), x, y, 0.1));
        break;
      case 'inkstone':
        g.add(box(0.36, 0.1, 0.28, M(0x3A3A40), x, y - 0.1, 0.12));
        break;
      case 'gourd':
        g.add(ball(0.19, M(0xC9A05A), x, y - 0.1, 0.12, 14));
        g.add(ball(0.12, M(0xC9A05A), x, y + 0.14, 0.12, 12));
        break;
      case 'crane':
        g.add(ball(0.18, M(0xF2EFE8), x + 0.1, y + 0.5, 0.1, 12));
        g.add(cyl(0.04, 0.04, 0.5, M(0xF2EFE8), x + 0.1, y + 0.2, 0.1, 8));
        g.add(cone(0.05, 0.2, M(0xC9A227), x + 0.28, y + 0.55, 0.1, 8).rotateZ(-Math.PI / 2));
        break;
      default:
        break;
    }
  }

  /* ─────────────────────────── 형태별 ─────────────────────────── */

  function buildHuman(form, robeHex, item) {
    const g = new THREE.Group();
    const h = 2.1;
    robeBody(g, robeHex, h);
    hands(g, h * 0.52);
    if (form.badge) g.add(box(0.5, 0.42, 0.06, M(0x7E1E1C), 0, h * 0.62, 0.42));
    const headY = h + 0.42;
    face(g, headY, { beard: form.beard });
    hat(g, headY, form.hat);
    heldItem(g, item, h * 0.5);
    return g;
  }

  function buildOgre(form, robeHex, item) {
    const g = new THREE.Group();
    const h = 2.2;
    const skin = new THREE.Color(form.skin);
    // 두툼한 몸
    g.add(cyl(0.62, 0.86, h, M(skin), 0, h / 2, 0, 20));
    [-1, 1].forEach((s) => {
      const arm = cyl(0.2, 0.16, 1.1, M(skin), s * 0.82, h * 0.62, 0, 12);
      arm.rotation.z = s * 0.3;
      g.add(arm);
    });
    hands(g, h * 0.28);
    if (form.crown) {
      g.add(box(1.0, 0.5, 0.08, M(0x2B2724), 0, h * 0.66, 0.5));  // 관복 앞자락
    }
    const headY = h + 0.5;
    face(g, headY, { skin: skin.getHex(), fangs: form.fangs, beard: form.beard });
    // 헝클어진 머리
    // 머리털은 이마 위쪽에만 얹는다 (눈이 headY+0.05 라 그 아래로 내려오면 얼굴을 덮는다)
    const mane = ball(0.48, M(DARK), 0, headY + 0.34, -0.04, 16);
    mane.scale.set(1.06, 0.52, 1.06);
    g.add(mane);
    for (let i = 0; i < 7; i++) {                 // 삐죽삐죽한 갈기
      const a = (i / 7) * Math.PI * 2;
      const tuft = cone(0.09, 0.34, M(DARK),
        Math.cos(a) * 0.38, headY + 0.5, Math.sin(a) * 0.38 - 0.04, 6);
      tuft.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(tuft);
    }
    if (form.horns) horns(g, headY, form.horns);
    if (form.crown) hat(g, headY, 'crown');
    if (form.club) {
      const club = cyl(0.12, 0.22, 1.5, M(0x6B5230), 0.95, h * 0.55, 0.1, 10);
      club.rotation.z = -0.3;
      g.add(club);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(cone(0.06, 0.16, M(0xCFC0A0),
          0.95 + Math.cos(a) * 0.2, h * 0.55 + 0.4, 0.1 + Math.sin(a) * 0.2, 6));
      }
    }
    heldItem(g, item, h * 0.4);
    return g;
  }

  function buildBeast(form, robeHex, item) {          // 해태
    const g = new THREE.Group();
    const skin = M(form.skin);
    const body = ball(0.85, skin, 0, 1.1, 0, 20);
    body.scale.set(1, 0.95, 1.25);
    g.add(body);
    // 네 다리
    [[-0.45, 0.5], [0.45, 0.5], [-0.45, -0.55], [0.45, -0.55]].forEach(([x, z]) =>
      g.add(cyl(0.16, 0.14, 0.75, skin, x, 0.38, z, 10)));
    const headY = 2.05;
    const head = ball(0.5, skin, 0, headY, 0.55, 20);
    head.scale.set(1, 0.95, 1.1);
    g.add(head);
    // 갈기
    if (form.mane) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const s = cone(0.13, 0.42, M(0x8A5F26), Math.cos(a) * 0.5, headY + Math.sin(a) * 0.5, 0.32, 6);
        s.rotation.z = -a + Math.PI / 2;
        g.add(s);
      }
    }
    const eye = M(0x1E1A17);
    [-1, 1].forEach((s) => g.add(ball(0.07, eye, s * 0.18, headY + 0.06, 0.98, 8)));
    g.add(ball(0.12, M(0x2B2622), 0, headY - 0.12, 1.02, 10));
    if (form.horns) horns(g, headY, form.horns, 0xF0DFAE);
    // 꼬리
    const tail = cyl(0.1, 0.04, 0.9, skin, 0, 1.5, -0.9, 8);
    tail.rotation.x = -0.9;
    g.add(tail);
    return g;
  }

  function buildBird(form, robeHex, item) {           // 삼족오
    const g = new THREE.Group();
    const skin = M(form.skin);
    const body = ball(0.72, skin, 0, 1.5, 0, 20);
    body.scale.set(1, 1.15, 1);
    g.add(body);
    const headY = 2.5;
    g.add(ball(0.38, skin, 0, headY, 0.1, 18));
    g.add(cone(0.14, 0.42, M(0xF2A23C), 0, headY - 0.02, 0.46, 8).rotateX(Math.PI / 2));
    const eye = M(0xF5D97E);
    [-1, 1].forEach((s) => g.add(ball(0.07, eye, s * 0.16, headY + 0.08, 0.32, 8)));
    // 세 다리
    const legs = form.legs || 2;
    for (let i = 0; i < legs; i++) {
      const x = legs === 3 ? (i - 1) * 0.34 : (i - 0.5) * 0.6;
      g.add(cyl(0.06, 0.05, 0.85, M(0xE08A2A), x, 0.43, i === 1 && legs === 3 ? -0.2 : 0.05, 8));
      g.add(box(0.2, 0.07, 0.3, M(0xE08A2A), x, 0.04, i === 1 && legs === 3 ? -0.12 : 0.13));
    }
    // 날개
    if (form.wings) {
      [-1, 1].forEach((s) => {
        const w = cyl(0.62, 0.14, 0.09, skin, s * 0.92, 1.62, -0.1, 12);
        w.rotation.set(Math.PI / 2, 0, s * 0.5);
        w.scale.set(1, 1, 2.2);
        g.add(w);
      });
    }
    // 꼬리깃
    for (let i = 0; i < 5; i++) {
      const t = cyl(0.1, 0.03, 1.0, skin, (i - 2) * 0.12, 1.25, -0.7, 6);
      t.rotation.set(-1.0, 0, (i - 2) * 0.12);
      g.add(t);
    }
    return g;
  }

  function buildFox(form, robeHex, item) {            // 구미호
    const g = new THREE.Group();
    const skin = M(form.skin);
    const h = 2.0;
    g.add(cyl(0.44, 0.8, h, M(0xF2EDE2), 0, h / 2, 0, 20));   // 흰 소복
    hands(g, h * 0.5);
    const headY = h + 0.42;
    const head = ball(0.4, skin, 0, headY, 0, 20);
    head.scale.set(1, 1, 1.05);
    g.add(head);
    g.add(cone(0.16, 0.34, skin, 0, headY - 0.08, 0.42, 8).rotateX(Math.PI / 2));
    const eye = M(0x1E1A17);
    [-1, 1].forEach((s) => g.add(ball(0.055, eye, s * 0.16, headY + 0.06, 0.35, 8)));
    // 귀
    [-1, 1].forEach((s) => {
      const ear = cone(0.14, 0.4, skin, s * 0.26, headY + 0.42, -0.02, 6);
      ear.rotation.z = s * -0.25;
      g.add(ear);
    });
    // 꼬리 아홉
    const n = form.tails || 9;
    const tip = M(0xF7F2E8);
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * Math.PI * 1.1;
      const grp = new THREE.Group();
      const t = cyl(0.13, 0.05, 1.5, skin, 0, 0.75, 0, 8);
      grp.add(t);
      grp.add(ball(0.09, tip, 0, 1.5, 0, 8));
      grp.position.set(0, h * 0.42, -0.5);
      grp.rotation.set(-1.15, a * 0.85, a * 0.5);
      g.add(grp);
    }
    return g;
  }

  function buildDragon(form, robeHex, item) {         // 청룡
    const g = new THREE.Group();
    const skin = M(form.skin);
    const belly = M(new THREE.Color(form.skin).lerp(new THREE.Color(0xF2EFE8), 0.45));

    // 옆으로 감으며 올라가는 몸통
    const seg = 22;
    let hx = 0, hy = 0, hz = 0;
    for (let i = 0; i < seg; i++) {
      const t = i / (seg - 1);
      const a = t * Math.PI * 2.4;
      const rad = 0.95 * (1 - t * 0.45);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad * 0.55;
      const y = 0.4 + t * 2.2;
      const r = 0.3 * (1 - t * 0.35) + 0.08;
      g.add(ball(r, skin, x, y, z, 12));
      if (i % 3 === 0) g.add(ball(r * 0.55, belly, x, y - r * 0.6, z + r * 0.5, 8));
      hx = x; hy = y; hz = z;
    }

    // 머리 — 몸통 끝에서 앞으로 내민다
    const headY = hy + 0.34;
    const head = ball(0.42, skin, hx, headY, hz + 0.3, 18);
    head.scale.set(1, 0.85, 1.4);
    g.add(head);
    g.add(cone(0.17, 0.46, skin, hx, headY - 0.06, hz + 0.86, 8).rotateX(Math.PI / 2));
    const eye = M(0xF5D97E);
    [-1, 1].forEach((s2) => g.add(ball(0.08, eye, hx + s2 * 0.19, headY + 0.14, hz + 0.55, 8)));
    // 콧등 갈기
    for (let i = 0; i < 4; i++) {
      g.add(cone(0.07, 0.24, M(0x9FE8F5), hx, headY + 0.3 - i * 0.02, hz + 0.1 - i * 0.26, 6));
    }
    if (form.horns) {
      [-1, 1].forEach((s2) => {
        const hn = cone(0.08, 0.55, M(0xE8DCC0), hx + s2 * 0.2, headY + 0.46, hz + 0.1, 6);
        hn.rotation.set(-0.45, 0, s2 * -0.35);
        g.add(hn);
      });
    }
    if (form.whiskers) {
      [-1, 1].forEach((s2) => {
        const w = cyl(0.03, 0.012, 1.3, M(0xE8E2D8), hx + s2 * 0.28, headY - 0.02, hz + 0.6, 6);
        w.rotation.set(1.0, 0, s2 * 0.75);
        g.add(w);
      });
    }
    // 여의주
    const orb = ball(0.24, new THREE.MeshBasicMaterial({ color: 0xF5D97E, transparent: true, opacity: 0.9 }),
      hx + 0.05, headY - 0.7, hz + 1.0, 14);
    orb.name = 'orb';
    g.add(orb);
    return g;
  }

  function buildSpirit(form, robeHex, item) {         // 산신령
    const g = new THREE.Group();
    const h = 2.1;
    robeBody(g, form.skin, h);
    hands(g, h * 0.52);
    const headY = h + 0.44;
    face(g, headY, { beard: true });
    // 긴 수염
    const long = cone(0.26, 1.1, M(0xF2EFE8), 0, headY - 0.72, 0.12, 12);
    long.rotation.x = Math.PI;
    g.add(long);
    hat(g, headY, 'none');
    // 흰 상투
    g.add(ball(0.16, M(0xF2EFE8), 0, headY + 0.44, 0, 12));
    g.add(cyl(0.06, 0.05, 2.3, M(0x7A6242), 0.9, h * 0.6, 0.1, 8));  // 지팡이
    heldItem(g, item, h * 0.5);
    return g;
  }

  function buildStone(form, robeHex, item) {          // 돌부처
    const g = new THREE.Group();
    const stone = M(form.skin, { flatShading: true });
    // 좌대
    g.add(cyl(1.0, 1.15, 0.34, M(0x8A8F84, { flatShading: true }), 0, 0.17, 0, 14));
    // 결가부좌한 몸
    const body = ball(0.9, stone, 0, 1.0, 0, 14);
    body.scale.set(1.05, 0.9, 0.85);
    g.add(body);
    g.add(cyl(0.95, 1.0, 0.3, stone, 0, 0.5, 0, 14));
    // 무릎 위 손
    g.add(ball(0.24, stone, 0, 0.78, 0.5, 10));
    const headY = 2.05;
    const head = ball(0.46, stone, 0, headY, 0, 16);
    head.scale.set(1, 1.12, 0.95);
    g.add(head);
    // 나발(머리 알갱이)
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const ring = i % 2 ? 0.3 : 0.42;
      g.add(ball(0.06, stone, Math.cos(a) * ring, headY + 0.34 - (i % 3) * 0.12, Math.sin(a) * ring, 6));
    }
    g.add(ball(0.13, stone, 0, headY + 0.52, 0, 10));
    // 눈은 지그시 감은 선
    const line = M(0x6E736A);
    [-1, 1].forEach((s) => g.add(box(0.16, 0.03, 0.03, line, s * 0.16, headY + 0.04, 0.44)));
    g.add(ball(0.04, M(0xC9A227), 0, headY + 0.2, 0.44, 8));
    // 이끼
    if (form.moss) {
      const moss = M(0x6E8F5A);
      [[0.5, 1.4, 0.6], [-0.6, 0.9, 0.5], [0.2, 0.42, -0.9], [-0.3, 1.9, -0.4]].forEach(([x, y, z]) => {
        const m = ball(0.16, moss, x, y, z, 8);
        m.scale.set(1, 0.4, 1);
        g.add(m);
      });
    }
    return g;
  }

  function buildCosmos(form, robeHex, item) {         // 천지신명
    const g = new THREE.Group();
    const glow = new THREE.Color(form.glow);
    const shellMat = new THREE.MeshBasicMaterial({
      color: glow, transparent: true, opacity: 0.22, side: THREE.DoubleSide
    });
    const h = 2.2;
    // 형체는 흐릿한 빛
    const bodyMesh = cyl(0.4, 0.9, h, shellMat, 0, h / 2, 0, 24);
    g.add(bodyMesh);
    const core = ball(0.42, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.5 }),
      0, h + 0.42, 0, 20);
    core.name = 'core';
    g.add(core);
    // 별
    const starMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const stars = new THREE.Group();
    stars.name = 'stars';
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 1.4;
      const y = Math.random() * 3.4;
      stars.add(ball(0.03 + Math.random() * 0.03, starMat, Math.cos(a) * r, y, Math.sin(a) * r, 6));
    }
    g.add(stars);
    return g;
  }

  const BUILDERS = {
    human: buildHuman, ogre: buildOgre, beast: buildBeast, bird: buildBird,
    fox: buildFox, dragon: buildDragon, spirit: buildSpirit,
    stone: buildStone, cosmos: buildCosmos
  };

  /* ─────────────────────────── 뷰어 ─────────────────────────── */

  function mount(container, spec) {
    if (!has3D) {
      container.innerHTML =
        '<div class="viewer-fallback"><b>3D 아바타를 불러올 수 없습니다</b>' +
        '<span>네트워크를 확인한 뒤 다시 열어 주세요.</span></div>';
      return { dispose() {} };
    }

    const form = spec.form || { kind: 'human', hat: 'daenggi' };
    const dark = document.documentElement.dataset.theme === 'dark';
    const glow = new THREE.Color(form.glow || '#F5D97E');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(dark ? 0x6E7C90 : 0xE8F2FF, dark ? 0x22242A : 0x8C8270, dark ? 0.9 : 1.05));
    const key = new THREE.DirectionalLight(0xFFF6E4, dark ? 0.75 : 0.95);
    key.position.set(4, 7, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(glow, 0.5);
    rim.position.set(-4, 3, -5);
    scene.add(rim);

    const root = new THREE.Group();
    const build = BUILDERS[form.kind] || buildHuman;
    root.add(build(form, spec.robeHex || '#EDE6D6', spec.item || 'none'));

    if (form.halo) halo(root, (form.kind === 'stone' ? 2.05 : 2.5), form.halo, glow);
    scene.add(root);

    // 발밑 빛무리
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 32),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: dark ? 0.18 : 0.12 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    scene.add(pad);

    /* 시점 */
    const bbox = new THREE.Box3().setFromObject(root);
    const size = bbox.getSize(new THREE.Vector3());
    const target = new THREE.Vector3(0, size.y * 0.5, 0);
    const dist = Math.max(size.x, size.y) * 1.75 + 1.2;

    const st = { theta: Math.PI / 2, phi: Math.PI * 0.44, r: dist,
                 tTheta: Math.PI / 2, tPhi: Math.PI * 0.44, tR: dist, auto: true };
    let dragging = false, lastX = 0, lastY = 0, pinch = 0;
    const dom = renderer.domElement;

    const down = (e) => {
      dragging = true; st.auto = false;
      const t = e.touches ? e.touches[0] : e;
      lastX = t.clientX; lastY = t.clientY;
      if (e.touches && e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
      }
    };
    const move = (e) => {
      if (!dragging) return;
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) st.tR = Math.max(dist * 0.5, Math.min(dist * 2.2, st.tR * (pinch / d)));
        pinch = d;
        if (e.cancelable) e.preventDefault();
        return;
      }
      const t = e.touches ? e.touches[0] : e;
      st.tTheta -= (t.clientX - lastX) * 0.009;
      st.tPhi = Math.max(0.25, Math.min(Math.PI * 0.62, st.tPhi - (t.clientY - lastY) * 0.006));
      lastX = t.clientX; lastY = t.clientY;
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { dragging = false; pinch = 0; };
    const wheel = (e) => {
      e.preventDefault();
      st.auto = false;
      st.tR = Math.max(dist * 0.5, Math.min(dist * 2.2, st.tR * (1 + Math.sign(e.deltaY) * 0.12)));
    };

    dom.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    dom.addEventListener('touchstart', down, { passive: true });
    dom.addEventListener('touchmove', move, { passive: false });
    dom.addEventListener('touchend', up);
    dom.addEventListener('wheel', wheel, { passive: false });

    function resize() {
      const w = container.clientWidth || 300;
      const h = container.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container);
    window.addEventListener('resize', resize);

    let raf = 0, alive = true, t0 = performance.now();
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;

      if (st.auto) st.tTheta += dt * 0.3;
      st.theta += (st.tTheta - st.theta) * 0.12;
      st.phi += (st.tPhi - st.phi) * 0.12;
      st.r += (st.tR - st.r) * 0.1;

      camera.position.set(
        target.x + st.r * Math.sin(st.phi) * Math.cos(st.theta),
        target.y + st.r * Math.cos(st.phi),
        target.z + st.r * Math.sin(st.phi) * Math.sin(st.theta)
      );
      camera.lookAt(target);

      // 숨쉬기 · 떠 있기
      const breathe = 1 + Math.sin(now / 900) * 0.012;
      root.scale.set(1, breathe, 1);
      root.position.y = form.float ? Math.sin(now / 1100) * 0.12 + 0.18 : 0;
      root.children.forEach((c) => {
        if (c.name && c.name.startsWith('halo')) c.rotation.z += dt * 0.3;
      });
      const stars = root.getObjectByName('stars');
      if (stars) stars.rotation.y += dt * 0.25;
      const orb = root.getObjectByName('orb');
      if (orb) orb.position.y += Math.sin(now / 500) * 0.002;

      renderer.render(scene, camera);
    }
    frame();

    return {
      dispose() {
        alive = false;
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        });
        renderer.dispose();
        container.innerHTML = '';
      }
    };
  }

  window.Avatar3D = { mount, available: has3D };
})();
