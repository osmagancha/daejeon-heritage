/* ══════════════════════════════════════════════════════════════════
   절차적 3D 뷰어 — 문화유산을 직접 돌려 보는 체험
   three.js r128 (UMD 전역) 사용. 외부 모델 파일 없이 코드로 짓는다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const has3D = typeof THREE !== 'undefined';

  /* ─────────────────────────── 텍스처 ─────────────────────────── */

  const texCache = {};

  function tileTexture(color) {
    const key = 'tile' + color;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) {
      const g = x.createLinearGradient(i * 16, 0, i * 16 + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,.34)');
      g.addColorStop(.42, 'rgba(255,255,255,.16)');
      g.addColorStop(1, 'rgba(0,0,0,.34)');
      x.fillStyle = g; x.fillRect(i * 16, 0, 16, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache[key] = t;
    return t;
  }

  function latticeTexture(paper, frame) {
    const key = 'lat' + paper + frame;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = paper; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = frame; x.lineWidth = 7;
    for (let i = 1; i < 5; i++) {
      x.beginPath(); x.moveTo(i * 25.6, 0); x.lineTo(i * 25.6, 128); x.stroke();
      x.beginPath(); x.moveTo(0, i * 25.6); x.lineTo(128, i * 25.6); x.stroke();
    }
    x.lineWidth = 10; x.strokeStyle = frame;
    x.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    texCache[key] = t;
    return t;
  }

  function stoneTexture(color) {
    const key = 'stone' + color;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 128, 128);
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let row = 0; row < 5; row++) {
      const y = row * 25.6, off = row % 2 ? 16 : 0;
      for (let col = -1; col < 5; col++) {
        const w = 32 + rnd() * 8, xx = col * 32 + off;
        x.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.14})`;
        x.fillRect(xx + 1.5, y + 1.5, w - 3, 22);
      }
      x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache[key] = t;
    return t;
  }

  /* ─────────────────────── 한국 기와지붕 지오메트리 ─────────────────────── */

  /**
   * 처마가 들리고 지붕선이 오목한 팔작지붕.
   * 링(고리)을 위로 쌓아 올리며 로프팅한다.
   */
  function curvedRoofGeometry(W, D, H, opt) {
    opt = opt || {};
    const rings = opt.rings || 10;
    const seg = opt.seg || 72;
    const ridgeW = opt.ridgeW != null ? opt.ridgeW : W * 0.16;
    const ridgeD = opt.ridgeD != null ? opt.ridgeD : D * 0.035;
    const up = opt.up != null ? opt.up : Math.min(W, D) * 0.1;
    const pow = opt.pow || 1.38;
    const sq = opt.square || 6;   // 클수록 사각형에 가깝다

    const pos = [], uv = [], idx = [];
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const hw = W / 2 + (ridgeW - W / 2) * t;
      const hd = D / 2 + (ridgeD - D / 2) * t;
      const y = H * Math.pow(t, pow);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        const sx = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / sq);
        const sz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / sq);
        const corner = Math.pow(Math.min(1, Math.abs(cs * sn) * 2), 2.4);
        const lift = up * corner * Math.pow(1 - t, 2.2);
        pos.push(hw * sx, y + lift, hd * sz);
        uv.push((j / seg) * 12, t);
      }
    }
    const per = seg + 1;
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * per + j, b = a + 1, c = a + per, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // 꼭대기 마감
    const topStart = pos.length / 3;
    pos.push(0, H, 0); uv.push(6, 1);
    for (let j = 0; j < seg; j++) {
      const a = (rings - 1) * per + j;
      idx.push(a, a + 1, topStart);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** 맞배/박공 지붕 (일본식 관사, 근대 부속) */
  function gableGeometry(W, D, H) {
    const g = new THREE.BufferGeometry();
    const w = W / 2, d = D / 2;
    const v = [
      -w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d,   // 0-3 처마
      0, H, -d, 0, H, d                          // 4-5 마루
    ];
    const idx = [0, 4, 1, 1, 4, 5, 1, 5, 2, 3, 2, 5, 3, 5, 4, 0, 3, 4, 0, 1, 2, 0, 2, 3];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ────────────────────────── 부품 ────────────────────────── */

  function M(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
  }

  function stoneMat(P, rx, ry) {
    const t = stoneTexture(P.stoneHex).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ color: P.stone, map: t });
  }

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function cyl(r1, r2, h, mat, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 16), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function makeTree(x, z, scale, P, kind) {
    const g = new THREE.Group();
    const trunk = cyl(0.09 * scale, 0.13 * scale, 1.1 * scale, M(P.trunk), 0, 0.55 * scale, 0);
    g.add(trunk);
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((0.62 - i * 0.14) * scale, 0.85 * scale, 8), M(P.leaf));
        c.position.y = (1.05 + i * 0.5) * scale;
        c.castShadow = true;
        g.add(c);
      }
    } else {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.62 * scale, 12, 9), M(P.leaf));
      s.position.y = 1.55 * scale; s.scale.y = 0.86; s.castShadow = true;
      g.add(s);
      const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.42 * scale, 10, 8), M(P.leaf2));
      s2.position.set(0.3 * scale, 1.25 * scale, 0.22 * scale); s2.castShadow = true;
      g.add(s2);
    }
    g.position.set(x, 0, z);
    return g;
  }

  /** 담장 (기와를 얹은 흙담) */
  function makeWall(w, d, P) {
    const g = new THREE.Group();
    const h = 1.1, t = 0.26;
    const sides = [
      { w: w, d: t, x: 0, z: -d / 2 },
      { w: w, d: t, x: 0, z: d / 2 },
      { w: t, d: d, x: -w / 2, z: 0 },
      { w: t, d: d, x: w / 2, z: 0 }
    ];
    sides.forEach((s) => {
      g.add(box(s.w, h, s.d, M(P.plaster), s.x, h / 2, s.z));
      const cap = box(s.w + 0.16, 0.13, s.d + 0.16, M(P.roof), s.x, h + 0.06, s.z);
      g.add(cap);
    });
    return g;
  }

  /* ─────────────────────── 모델 빌더 ─────────────────────── */

  function buildHanok(m, P, ann) {
    const g = new THREE.Group();
    const bays = m.bays || 3;
    const W = bays * 1.6, D = (m.depth || 2) * 1.5;
    const platH = 0.45 * (m.platform || 1);
    const colH = 2.0;

    // 기단
    const stone = stoneMat(P, 3, 1);
    g.add(box(W + 1.5, platH, D + 1.5, stone, 0, platH / 2, 0));
    g.add(box(W + 1.8, 0.1, D + 1.8, M(P.stoneDark), 0, 0.05, 0));

    // 마루
    g.add(box(W + 0.9, 0.14, D + 0.9, M(P.floor), 0, platH + 0.07, 0));

    // 벽 + 창호
    const wallMat = M(P.plaster);
    const latMat = new THREE.MeshLambertMaterial({ map: latticeTexture(P.paperHex, P.woodHex) });
    g.add(box(W, colH, D - 0.5, wallMat, 0, platH + colH / 2, -0.16));
    for (let i = 0; i < bays; i++) {
      const x = -W / 2 + (W / bays) * (i + 0.5);
      const p = new THREE.Mesh(new THREE.PlaneGeometry((W / bays) * 0.78, colH * 0.78), latMat);
      p.position.set(x, platH + colH * 0.47, (D - 0.5) / 2 - 0.16 + 0.01);
      g.add(p);
    }

    // 기둥
    const woodMat = M(P.wood);
    for (let i = 0; i <= bays; i++) {
      const x = -W / 2 + (W / bays) * i;
      g.add(cyl(0.13, 0.15, colH, woodMat, x, platH + colH / 2, (D + 0.9) / 2 - 0.2, 12));
      g.add(cyl(0.13, 0.15, colH, woodMat, x, platH + colH / 2, -(D + 0.9) / 2 + 0.2, 12));
      g.add(cyl(0.17, 0.19, 0.12, M(P.stoneDark), x, platH + 0.13, (D + 0.9) / 2 - 0.2, 12));
      g.add(cyl(0.17, 0.19, 0.12, M(P.stoneDark), x, platH + 0.13, -(D + 0.9) / 2 + 0.2, 12));
    }

    // 창방 (단청 여부에 따라 색)
    const bandColor = m.dancheong ? P.dancheong : P.wood;
    g.add(box(W + 1.1, 0.24, D + 1.1, M(bandColor), 0, platH + colH + 0.12, 0));
    if (m.dancheong) {
      for (let i = 0; i < bays * 3; i++) {
        const x = -W / 2 + (W / (bays * 3)) * (i + 0.5);
        g.add(box(0.16, 0.16, 0.06, M(P.dancheong2), x, platH + colH + 0.12, (D + 1.1) / 2 + 0.02));
      }
    }

    // 공포 (기둥 위 받침)
    for (let i = 0; i <= bays; i++) {
      const x = -W / 2 + (W / bays) * i;
      [1, -1].forEach((s) => {
        g.add(box(0.5, 0.16, 0.5, M(m.dancheong ? P.dancheong2 : P.woodDark), x, platH + colH + 0.3, s * ((D + 0.9) / 2 - 0.2)));
      });
    }

    // 지붕
    const roofMat = new THREE.MeshLambertMaterial({ map: tileTexture(P.roofHex) });
    roofMat.map.repeat.set(1, 1);
    const roof = new THREE.Mesh(curvedRoofGeometry(W + 2.6, D + 2.4, 1.7, { ridgeW: W * 0.34, up: 0.42 }), roofMat);
    roof.position.y = platH + colH + 0.4;
    roof.castShadow = true;
    g.add(roof);
    // 용마루
    g.add(box(W * 0.42, 0.2, 0.34, M(P.roofDark), 0, platH + colH + 0.4 + 1.68, 0));

    // 굴뚝
    if (m.chimney) {
      g.add(box(0.42, 1.7, 0.42, stone, W / 2 + 1.3, 0.85, -D / 2 - 0.4));
      g.add(box(0.56, 0.14, 0.56, M(P.roofDark), W / 2 + 1.3, 1.75, -D / 2 - 0.4));
      ann.push({ p: [W / 2 + 1.3, 1.9, -D / 2 - 0.4], t: '굴뚝' });
    } else {
      ann.push({ p: [0, platH * 0.5, D / 2 + 0.9], t: '연기 구멍' });
    }

    // 연못
    if (m.pond) {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(3.4, 40),
        new THREE.MeshLambertMaterial({ color: P.water, transparent: true, opacity: 0.82 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.04, D / 2 + 4.4);
      water.receiveShadow = true;
      g.add(water);
      ann.push({ p: [0, 0.3, D / 2 + 4.4], t: '연못' });
    }

    ann.push({ p: [0, platH + colH + 1.7, 0], t: '팔작지붕' });
    ann.push({ p: [-W / 2, platH + colH / 2, D / 2 + 0.4], t: '툇마루' });

    if (m.fence) {
      const f = makeWall(W + 5, D + 5, P);
      g.add(f);
    }
    return g;
  }

  function buildFortress(m, P, ann) {
    const g = new THREE.Group();
    const len = 16, h = m.wallHeight ? Math.min(3.4, m.wallHeight) : 3;
    const stone = stoneMat(P, 6, 2);

    // 능선 지형
    const terrain = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 13.5, 1.6, 40),
      M(P.ground)
    );
    terrain.position.y = -0.8; terrain.receiveShadow = true;
    g.add(terrain);

    // 곡선 성벽
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 1.45 - Math.PI * 0.72;
      const r = 8.4;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const drop = Math.sin(i * 0.8) * 0.35;
      const seg = box(len / segs + 0.9, h + drop, 1.5, stone, x, (h + drop) / 2 - 0.1, z);
      seg.rotation.y = -a + Math.PI / 2;
      g.add(seg);
      // 여장
      const par = box(len / segs + 0.9, 0.55, 1.0, M(P.stoneDark), x, h + drop + 0.18, z);
      par.rotation.y = -a + Math.PI / 2;
      g.add(par);
    }

    // 치 (성벽 밖으로 돌출한 방어 구조)
    [-0.45, 0.25].forEach((k) => {
      const a = k * Math.PI;
      const x = Math.cos(a) * 9.4, z = Math.sin(a) * 9.4;
      const t = box(2.2, h + 0.5, 2.2, stone, x, (h + 0.5) / 2 - 0.1, z);
      t.rotation.y = -a;
      g.add(t);
    });
    ann.push({ p: [Math.cos(-0.45 * Math.PI) * 9.4, h + 0.8, Math.sin(-0.45 * Math.PI) * 9.4], t: '치(雉)' });

    // 문루 / 장대
    if (m.gate || m.pavilion) {
      const px = 0, pz = -8.4;
      const base = box(4.2, h + 0.2, 2.6, stone, px, (h + 0.2) / 2 - 0.1, pz);
      g.add(base);
      const py = h + 0.1;
      for (let i = -1; i <= 1; i += 2) {
        for (let j = -1; j <= 1; j += 2) {
          g.add(cyl(0.14, 0.16, 1.7, M(P.wood), px + i * 1.5, py + 0.85, pz + j * 0.85, 10));
        }
      }
      g.add(box(3.9, 0.12, 2.3, M(P.floor), px, py + 0.06, pz));
      g.add(box(4.1, 0.22, 2.5, M(P.dancheong), px, py + 1.78, pz));
      const roofMat = new THREE.MeshLambertMaterial({ map: tileTexture(P.roofHex) });
      const roof = new THREE.Mesh(curvedRoofGeometry(5.6, 3.8, 1.35, { ridgeW: 1.5, up: 0.38 }), roofMat);
      roof.position.set(px, py + 1.9, pz); roof.castShadow = true;
      g.add(roof);
      ann.push({ p: [px, py + 3.2, pz], t: m.pavilion ? '장대루' : '문루' });
    }

    // 봉수대
    if (m.beacon) {
      const bx = 6.6, bz = 4.4;
      g.add(cyl(0.95, 1.25, 1.9, M(P.stoneDark), bx, 0.95, bz, 12));
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 10), new THREE.MeshBasicMaterial({ color: 0xe8663a }));
      fire.position.set(bx, 2.5, bz);
      fire.name = 'fire';
      g.add(fire);
      ann.push({ p: [bx, 3.3, bz], t: '봉수대' });
    }

    ann.push({ p: [0, h + 0.6, 8.4], t: '테뫼식 석축' });
    return g;
  }

  function buildHyanggyo(m, P, ann) {
    const g = new THREE.Group();
    const roofMat = new THREE.MeshLambertMaterial({ map: tileTexture(P.roofHex) });
    const stone = stoneMat(P, 3, 1);
    const bandColor = m.dancheong ? P.dancheong : P.wood;

    function hall(w, d, z, h, label) {
      const grp = new THREE.Group();
      grp.add(box(w + 1.2, 0.4, d + 1.2, stone, 0, 0.2, 0));
      grp.add(box(w, h, d, M(P.plaster), 0, 0.4 + h / 2, 0));
      const bays = Math.max(3, Math.round(w / 1.6));
      const latMat = new THREE.MeshLambertMaterial({ map: latticeTexture(P.paperHex, P.woodHex) });
      for (let i = 0; i < bays; i++) {
        const x = -w / 2 + (w / bays) * (i + 0.5);
        const p = new THREE.Mesh(new THREE.PlaneGeometry((w / bays) * 0.74, h * 0.72), latMat);
        p.position.set(x, 0.4 + h * 0.46, d / 2 + 0.02);
        grp.add(p);
        grp.add(cyl(0.12, 0.14, h, M(P.wood), -w / 2 + (w / bays) * i, 0.4 + h / 2, d / 2 + 0.12, 10));
      }
      grp.add(cyl(0.12, 0.14, h, M(P.wood), w / 2, 0.4 + h / 2, d / 2 + 0.12, 10));
      grp.add(box(w + 0.8, 0.22, d + 0.8, M(bandColor), 0, 0.4 + h + 0.11, 0));
      const roof = new THREE.Mesh(curvedRoofGeometry(w + 2.2, d + 2.0, 1.45, { ridgeW: w * 0.34, up: 0.36 }), roofMat);
      roof.position.y = 0.4 + h + 0.3; roof.castShadow = true;
      grp.add(roof);
      grp.add(box(w * 0.4, 0.18, 0.3, M(P.roofDark), 0, 0.4 + h + 0.3 + 1.43, 0));
      grp.position.z = z;
      if (label) ann.push({ p: [0, 0.4 + h + 1.9, z], t: label });
      return grp;
    }

    // 뒤: 대성전 (제향), 앞: 명륜당 (강학)
    g.add(hall(6.4, 3.6, -5.2, 2.5, '대성전(제향)'));
    g.add(hall(8.2, 3.4, 3.4, 2.1, '명륜당(강학)'));

    // 내삼문
    const gateGrp = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      gateGrp.add(box(1.5, 2.0, 0.34, M(P.woodDark), i * 1.7, 1.0, 0));
      gateGrp.add(cyl(0.12, 0.13, 2.2, M(P.wood), i * 1.7 - 0.85, 1.1, 0, 10));
    }
    gateGrp.add(cyl(0.12, 0.13, 2.2, M(P.wood), 2.55, 1.1, 0, 10));
    const gRoof = new THREE.Mesh(curvedRoofGeometry(6.4, 1.9, 0.85, { ridgeW: 2.2, up: 0.3 }), roofMat);
    gRoof.position.y = 2.25; gRoof.castShadow = true;
    gateGrp.add(gRoof);
    gateGrp.position.z = -1.4;
    g.add(gateGrp);
    ann.push({ p: [0, 3.1, -1.4], t: '내삼문' });

    // 담장
    g.add(makeWall(13, 15, P));

    // 홍살문
    if (m.hongsalmun) {
      const hg = new THREE.Group();
      const red = M(P.dancheong);
      hg.add(cyl(0.11, 0.11, 4.2, red, -1.1, 2.1, 0, 10));
      hg.add(cyl(0.11, 0.11, 4.2, red, 1.1, 2.1, 0, 10));
      hg.add(box(3.0, 0.14, 0.14, red, 0, 3.5, 0));
      for (let i = 0; i < 9; i++) {
        hg.add(box(0.07, 0.9, 0.07, red, -1.0 + i * 0.25, 3.95, 0));
      }
      hg.position.z = 8.6;
      g.add(hg);
      ann.push({ p: [0, 4.6, 8.6], t: '홍살문' });
    }

    // 은행나무
    g.add(makeTree(-5.4, 5.6, 1.5, P, 'broad'));
    g.add(makeTree(5.6, 6.2, 1.3, P, 'broad'));
    return g;
  }

  function buildModernHall(m, P, ann) {
    const g = new THREE.Group();
    const floors = m.floors || 3;
    const W = 14, D = 6, fh = 1.5, H = floors * fh;
    const wallMat = M(P.brick);
    const winMat = M(P.window);

    g.add(box(W + 1, 0.3, D + 1, M(P.stoneDark), 0, 0.15, 0));
    g.add(box(W, H, D, wallMat, 0, 0.3 + H / 2, 0));

    // 창 그리드
    const cols = 13;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (c > 4 && c < 8 && f === 0) continue;
        const x = -W / 2 + (W / cols) * (c + 0.5);
        const y = 0.3 + fh * (f + 0.55);
        [1, -1].forEach((s) => {
          const w = box((W / cols) * 0.52, fh * 0.6, 0.12, winMat, x, y, s * (D / 2 + 0.01));
          g.add(w);
        });
      }
      g.add(box(W + 0.3, 0.14, D + 0.3, M(P.stone), 0, 0.3 + fh * (f + 1), 0));
    }

    // 중앙 현관 돌출
    const pw = 4.2, pd = 1.6;
    g.add(box(pw, H + 0.7, pd + D / 2, M(P.brickLight), 0, 0.3 + (H + 0.7) / 2, D / 2 - (D / 2 - pd) / 2 + 0.4));
    g.add(box(pw + 0.5, 0.3, pd + 0.5, M(P.stone), 0, 0.3 + H + 0.85, D / 2 + pd / 2 + 0.2));
    // 수직 창
    for (let i = -1; i <= 1; i++) {
      g.add(box(0.72, H - 1.6, 0.12, winMat, i * 1.2, 0.3 + H / 2 + 0.5, D / 2 + pd + 0.02));
    }
    // 출입구
    g.add(box(2.0, 1.5, 0.14, M(P.woodDark), 0, 1.05, D / 2 + pd + 0.03));
    for (let i = -1; i <= 1; i += 2) {
      g.add(cyl(0.22, 0.24, 2.0, M(P.stone), i * 1.5, 1.3, D / 2 + pd + 0.3, 14));
    }
    ann.push({ p: [0, 2.6, D / 2 + pd + 0.6], t: '중앙 현관 포치' });
    ann.push({ p: [0, 0.3 + H + 1.4, 0], t: '좌우대칭 입면' });
    ann.push({ p: [-W / 2 - 0.4, 0.3 + H * 0.6, D / 2], t: '스크래치 타일' });

    // 옥상 난간
    g.add(box(W + 0.6, 0.5, D + 0.6, M(P.stone), 0, 0.3 + H + 0.25, 0));

    g.add(makeTree(-8.5, 5.5, 1.4, P, 'broad'));
    g.add(makeTree(8.5, 5.8, 1.2, P, 'pine'));
    return g;
  }

  function buildModernBank(m, P, ann) {
    const g = new THREE.Group();
    const W = 11, D = 8, H = 6;
    const wallMat = M(P.brickLight);
    g.add(box(W + 0.8, 0.3, D + 0.8, M(P.stoneDark), 0, 0.15, 0));

    // 본체 (모서리를 깎기 위해 두 덩어리 + 원기둥)
    g.add(box(W - 2.2, H, D, wallMat, 1.1, 0.3 + H / 2, 0));
    g.add(box(W, H, D - 2.6, wallMat, 0, 0.3 + H / 2, 1.3));
    const corner = cyl(2.6, 2.6, H, wallMat, -W / 2 + 2.6, 0.3 + H / 2, -D / 2 + 2.6, 28);
    g.add(corner);
    ann.push({ p: [-W / 2 + 1.4, 0.3 + H * 0.55, -D / 2 + 1.4], t: '둥글게 깎은 모서리' });

    // 입구 열주
    const n = m.columns || 4;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.62 + (i / (n - 1)) * 0.76);
      const x = -W / 2 + 2.6 + Math.cos(a) * 2.75;
      const z = -D / 2 + 2.6 + Math.sin(a) * 2.75;
      g.add(cyl(0.28, 0.3, H - 1.4, M(P.stone), x, 0.3 + (H - 1.4) / 2, z, 16));
      g.add(cyl(0.36, 0.32, 0.3, M(P.stoneDark), x, 0.3 + H - 1.25, z, 16));
    }
    ann.push({ p: [-W / 2 + 0.4, 3.0, -D / 2 + 3.6], t: '고전주의 열주' });

    // 출입문
    const doorMat = M(P.window);
    const door = box(2.6, 3.0, 0.2, doorMat, 0, 1.8, 0);
    door.position.set(-W / 2 + 2.6 + Math.cos(Math.PI * 1.25) * 2.6, 1.8, -D / 2 + 2.6 + Math.sin(Math.PI * 1.25) * 2.6);
    door.rotation.y = -Math.PI * 0.25;
    g.add(door);

    // 창
    for (let i = 0; i < 5; i++) {
      g.add(box(0.9, 1.9, 0.14, doorMat, -1.6 + i * 2.1, 4.4, D / 2 - 1.3 + 0.01 + 1.3));
    }
    for (let i = 0; i < 4; i++) {
      g.add(box(0.14, 1.9, 0.9, doorMat, W / 2 - 1.1 + 1.1, 4.4, -2.2 + i * 1.7));
    }
    // 코니스
    g.add(box(W + 0.7, 0.55, D + 0.7, M(P.stone), 0, 0.3 + H + 0.2, 0.4));
    ann.push({ p: [0, 0.3 + H + 0.9, 0], t: '코니스' });

    g.add(makeTree(-8, 6, 1.3, P, 'broad'));
    return g;
  }

  function buildWaterTower(m, P, ann) {
    const g = new THREE.Group();
    const H = 9, r = 1.1;
    const conc = stoneMat(P, 4, 6);

    g.add(cyl(r * 1.5, r * 1.7, 0.5, M(P.stoneDark), 0, 0.25, 0, 24));
    g.add(cyl(r, r * 1.08, H, conc, 0, H / 2 + 0.4, 0, 28));
    // 탱크
    g.add(cyl(r * 2.1, r * 1.05, 1.5, M(P.stone), 0, H + 1.15, 0, 28));
    g.add(cyl(r * 2.15, r * 2.15, 1.7, M(P.stone), 0, H + 2.75, 0, 28));
    g.add(cyl(r * 2.35, r * 2.2, 0.35, M(P.stoneDark), 0, H + 3.75, 0, 28));
    ann.push({ p: [0, H + 3.0, r * 2.2], t: '물탱크' });

    // 창
    [0.35, 0.6, 0.85].forEach((k) => {
      g.add(box(0.6, 0.8, 0.2, M(P.window), 0, H * k, r * 1.02));
    });
    // 급수관
    g.add(cyl(0.16, 0.16, 6.5, M(P.stoneDark), r * 2.0, H - 1.6, 0, 10));
    const arm = cyl(0.14, 0.14, 3.2, M(P.stoneDark), r * 2.0 + 1.4, H + 1.5, 0, 10);
    arm.rotation.z = Math.PI / 2.4;
    g.add(arm);
    ann.push({ p: [r * 2.0 + 2.2, H + 0.6, 0], t: '급수 암' });

    // 선로
    if (m.rails) {
      const rail = M(P.stoneDark);
      [-0.72, 0.72].forEach((z) => {
        g.add(box(26, 0.12, 0.16, rail, 0, 0.06, z + 5.5));
      });
      for (let i = -12; i <= 12; i += 1.6) {
        g.add(box(0.3, 0.14, 2.1, M(P.woodDark), i, 0.03, 5.5));
      }
      ann.push({ p: [5, 0.5, 5.5], t: '경부선 선로' });
    }
    ann.push({ p: [0, H * 0.5, r], t: '콘크리트 원통' });
    return g;
  }

  function buildJapaneseHouse(m, P, ann) {
    const g = new THREE.Group();
    const units = m.units || 3;
    for (let i = 0; i < units; i++) {
      const gx = (i - (units - 1) / 2) * 6.4;
      const gz = i % 2 ? -1.6 : 1.6;
      const W = 5.0, D = 4.2, H = 2.3;
      const grp = new THREE.Group();
      grp.add(box(W + 0.5, 0.35, D + 0.5, M(P.stoneDark), 0, 0.17, 0));
      grp.add(box(W, H, D, M(i % 2 ? P.plasterDark : P.plaster), 0, 0.35 + H / 2, 0));
      // 미닫이문
      const latMat = new THREE.MeshLambertMaterial({ map: latticeTexture(P.paperHex, P.woodHex) });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, H * 0.62), latMat);
      p.position.set(0, 0.35 + H * 0.44, D / 2 + 0.02);
      grp.add(p);
      // 박공지붕
      const roofMat = new THREE.MeshLambertMaterial({ map: tileTexture(P.roofHex) });
      const roof = new THREE.Mesh(gableGeometry(W + 1.3, D + 1.1, 1.5), roofMat);
      roof.position.y = 0.35 + H; roof.castShadow = true;
      grp.add(roof);
      grp.add(box(W + 1.4, 0.12, 0.2, M(P.roofDark), 0, 0.35 + H + 1.48, 0));
      grp.position.set(gx, 0, gz);
      g.add(grp);
    }
    // 골목 담장
    const wallMat = M(P.plaster);
    for (let i = -2; i <= 2; i++) {
      g.add(box(5.6, 0.95, 0.22, wallMat, i * 6.4, 0.48, 6.2));
      g.add(box(5.8, 0.1, 0.34, M(P.roofDark), i * 6.4, 0.98, 6.2));
    }
    // 골목 바닥
    const road = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.2), M(P.stoneDark));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 8.4); road.receiveShadow = true;
    g.add(road);
    ann.push({ p: [0, 3.2, 1.6], t: '낮은 박공지붕' });
    ann.push({ p: [-6.4, 1.3, 6.2], t: '직급별 관사' });
    ann.push({ p: [0, 0.5, 8.4], t: '계획된 골목' });
    g.add(makeTree(-9.5, 7.5, 1.2, P, 'broad'));
    g.add(makeTree(9.5, 7.2, 1.0, P, 'pine'));
    return g;
  }

  const BUILD = {
    hanok: buildHanok,
    hanok_water: buildHanok,
    hanok_terrace: buildHanok,
    fortress: buildFortress,
    hyanggyo: buildHyanggyo,
    seowon: buildHyanggyo,
    modern_hall: buildModernHall,
    modern_bank: buildModernBank,
    water_tower: buildWaterTower,
    japanese_house: buildJapaneseHouse
  };

  /** 각 형식의 특징이 가장 잘 보이는 기본 시점 */
  const VIEW_HINT = {
    modern_bank:    { theta: -0.78, phi: 0.36, dist: 1.85 },
    modern_hall:    { theta: -0.62, phi: 0.36, dist: 2.0 },
    water_tower:    { theta: -0.7,  phi: 0.42, dist: 2.0 },
    japanese_house: { theta: -0.6,  phi: 0.34, dist: 1.9 },
    fortress:       { theta: -0.68, phi: 0.3,  dist: 2.1 },
    hyanggyo:       { theta: -0.55, phi: 0.32, dist: 2.05 },
    seowon:         { theta: -0.55, phi: 0.32, dist: 2.05 }
  };

  /* ────────────────────── 팔레트 (테마 대응) ────────────────────── */

  function palette(item) {
    const p = item.palette || ['#8c5a3c', '#2f3a45', '#d8c9ae', '#5b7c55'];
    const woodHex = p[0], roofHex = p[1], plasterHex = p[2], leafHex = p[3];
    const stoneHex = '#a9a294';
    return {
      wood: new THREE.Color(woodHex),
      woodDark: new THREE.Color(woodHex).multiplyScalar(0.65),
      roof: new THREE.Color(roofHex),
      roofDark: new THREE.Color(roofHex).multiplyScalar(0.7),
      plaster: new THREE.Color(plasterHex),
      plasterDark: new THREE.Color(plasterHex).multiplyScalar(0.86),
      stone: new THREE.Color(stoneHex),
      stoneDark: new THREE.Color(stoneHex).multiplyScalar(0.66),
      floor: new THREE.Color(woodHex).multiplyScalar(1.15),
      leaf: new THREE.Color(leafHex),
      leaf2: new THREE.Color(leafHex).multiplyScalar(1.2),
      trunk: new THREE.Color('#6b5340'),
      ground: new THREE.Color('#8fa07a'),
      water: new THREE.Color('#6fa6bb'),
      window: new THREE.Color('#4a5a68'),
      brick: new THREE.Color('#bfae95'),
      brickLight: new THREE.Color('#cfc0a8'),
      dancheong: new THREE.Color('#b8392c'),
      dancheong2: new THREE.Color('#1f6e8c'),
      roofHex, woodHex, stoneHex,
      paperHex: '#f3ead6'
    };
  }

  /* ────────────────────────── 뷰어 ────────────────────────── */

  function mount(container, item) {
    if (!has3D) {
      container.innerHTML =
        '<div class="viewer-fallback"><b>3D 뷰를 불러올 수 없습니다</b>' +
        '<span>네트워크 연결을 확인한 뒤 다시 열어 주세요.</span></div>';
      return { dispose() {} };
    }

    const dark = document.documentElement.dataset.theme === 'dark';
    const P = palette(item);
    const model = item.model || { type: 'hanok' };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? 0x1a1d22 : 0xdfe6e9);
    scene.fog = new THREE.Fog(dark ? 0x1a1d22 : 0xdfe6e9, 34, 74);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    /* 조명 */
    const hemi = new THREE.HemisphereLight(dark ? 0x5d7490 : 0xdff0ff, dark ? 0x20242b : 0x8b8168, dark ? 0.85 : 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(dark ? 0xcfe0f0 : 0xfff2d8, dark ? 0.85 : 1.05);
    sun.position.set(11, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 60;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, dark ? 0.24 : 0.22);
    fill.position.set(-9, 6, -7);
    scene.add(fill);

    /* 지면 */
    const groundMat = new THREE.MeshLambertMaterial({ color: dark ? 0x38402f : P.ground });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 56), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(29.4, 30, 56),
      new THREE.MeshBasicMaterial({ color: dark ? 0x2a3026 : 0x7d8c6a, side: THREE.DoubleSide })
    );
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.01;
    scene.add(rim);

    /* 모델 */
    const annotations = [];
    const build = BUILD[model.type] || buildHanok;
    const root = build(model, P, annotations);
    scene.add(root);

    // 주변 나무
    const treeCount = Math.min(model.trees || 4, 9);
    for (let i = 0; i < treeCount; i++) {
      const a = (i / treeCount) * Math.PI * 2 + 0.6;
      const r = 15 + (i % 3) * 3.2;
      scene.add(makeTree(Math.cos(a) * r, Math.sin(a) * r, 1.4 + (i % 3) * 0.35, P, i % 2 ? 'pine' : 'broad'));
    }

    /* 바운딩으로 카메라 거리 계산 */
    const bboxAll = new THREE.Box3().setFromObject(root);
    const size = bboxAll.getSize(new THREE.Vector3());
    const center = bboxAll.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.62 + size.y * 0.4;
    const target = new THREE.Vector3(center.x, size.y * 0.42, center.z);

    /* 궤도 컨트롤 (직접 구현 — 의존성 없음) */
    const hint = VIEW_HINT[model.type] || { theta: -0.72, phi: 0.34, dist: 2.1 };
    const home = {
      theta: Math.PI * hint.theta,
      phi: Math.PI * hint.phi,
      radius: radius * hint.dist
    };
    const state = {
      theta: home.theta,
      phi: home.phi,
      radius: home.radius,
      tTheta: home.theta,
      tPhi: home.phi,
      tRadius: home.radius,
      auto: true
    };
    const minR = radius * 1.0, maxR = radius * 5.2;

    let dragging = false, lastX = 0, lastY = 0, pinch = 0, moved = false;
    const dom = renderer.domElement;

    function onDown(e) {
      dragging = true; moved = false; state.auto = false;
      const t = e.touches ? e.touches[0] : e;
      lastX = t.clientX; lastY = t.clientY;
      if (e.touches && e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
      hintEl.style.opacity = '0';
    }
    function onMove(e) {
      if (!dragging) return;
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) state.tRadius = Math.max(minR, Math.min(maxR, state.tRadius * (pinch / d)));
        pinch = d;
        e.preventDefault();
        return;
      }
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      lastX = t.clientX; lastY = t.clientY;
      state.tTheta -= dx * 0.008;
      state.tPhi = Math.max(0.12, Math.min(Math.PI * 0.49, state.tPhi - dy * 0.006));
      if (e.cancelable) e.preventDefault();
    }
    function onUp() { dragging = false; pinch = 0; }
    function onWheel(e) {
      e.preventDefault();
      state.auto = false;
      state.tRadius = Math.max(minR, Math.min(maxR, state.tRadius * (1 + Math.sign(e.deltaY) * 0.12)));
    }

    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dom.addEventListener('touchstart', onDown, { passive: true });
    dom.addEventListener('touchmove', onMove, { passive: false });
    dom.addEventListener('touchend', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    /* 힌트 + 도구 + 주석 오버레이 */
    const hintEl = document.createElement('div');
    hintEl.className = 'viewer-hint';
    hintEl.textContent = '드래그로 회전 · 두 손가락/휠로 확대';
    container.appendChild(hintEl);

    const annLayer = document.createElement('div');
    annLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    container.appendChild(annLayer);

    const annEls = annotations.map((a) => {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:10.5px;font-weight:700;' +
        'color:#fff;background:rgba(16,18,22,.72);padding:3px 8px;border-radius:999px;backdrop-filter:blur(6px);' +
        'transition:opacity .3s;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      el.textContent = a.t;
      const dot = document.createElement('i');
      dot.style.cssText = 'display:inline-block;width:5px;height:5px;border-radius:50%;background:#e8a33a;margin-right:5px;vertical-align:middle';
      el.prepend(dot);
      annLayer.appendChild(el);
      return { el, v: new THREE.Vector3(a.p[0], a.p[1], a.p[2]) };
    });

    let showAnn = true;
    const tools = document.createElement('div');
    tools.className = 'viewer-tools';
    tools.innerHTML =
      '<button class="vt on" data-t="auto" title="자동 회전"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg></button>' +
      '<button class="vt on" data-t="ann" title="설명 표시"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg></button>' +
      '<button class="vt" data-t="reset" title="시점 초기화"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 1 3 6.7M3 20v-5h5"/></svg></button>';
    container.appendChild(tools);

    tools.addEventListener('click', (e) => {
      const b = e.target.closest('.vt');
      if (!b) return;
      const t = b.dataset.t;
      if (t === 'auto') { state.auto = !state.auto; b.classList.toggle('on', state.auto); }
      else if (t === 'ann') { showAnn = !showAnn; b.classList.toggle('on', showAnn); annLayer.style.display = showAnn ? '' : 'none'; }
      else if (t === 'reset') {
        state.tTheta = home.theta; state.tPhi = home.phi; state.tRadius = home.radius;
      }
    });

    /* 범례 */
    const legend = document.createElement('div');
    legend.className = 'viewer-legend';
    legend.innerHTML = [
      ['기와', P.roofHex],
      ['목재', P.woodHex],
      ['석재', P.stoneHex]
    ].map(([n, c]) => `<span class="vl"><i style="background:${c}"></i>${n}</span>`).join('');
    container.appendChild(legend);

    /* 리사이즈 */
    function resize() {
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 320;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container);
    window.addEventListener('resize', resize);

    /* 루프 */
    let raf = 0, alive = true, t0 = performance.now();
    const proj = new THREE.Vector3();

    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;

      if (state.auto) state.tTheta += dt * 0.22;
      state.theta += (state.tTheta - state.theta) * 0.12;
      state.phi += (state.tPhi - state.phi) * 0.12;
      state.radius += (state.tRadius - state.radius) * 0.1;

      camera.position.set(
        target.x + state.radius * Math.sin(state.phi) * Math.cos(state.theta),
        target.y + state.radius * Math.cos(state.phi),
        target.z + state.radius * Math.sin(state.phi) * Math.sin(state.theta)
      );
      camera.lookAt(target);

      const fire = scene.getObjectByName('fire');
      if (fire) {
        fire.scale.setScalar(1 + Math.sin(now / 120) * 0.12);
        fire.rotation.y += dt * 2;
      }

      renderer.render(scene, camera);

      // 주석 위치 갱신
      if (showAnn) {
        const w = container.clientWidth, h = container.clientHeight;
        const placed = [];
        annEls.forEach((a) => {
          proj.copy(a.v).project(camera);
          const visible = proj.z < 1;
          let x = (proj.x * 0.5 + 0.5) * w;
          let y = (-proj.y * 0.5 + 0.5) * h;
          // 가까이 붙은 라벨은 아래로 밀어 겹치지 않게 한다
          for (const q of placed) {
            if (Math.abs(q.x - x) < 92 && Math.abs(q.y - y) < 20) y = q.y + 22;
          }
          placed.push({ x, y });
          a.el.style.opacity = visible ? '1' : '0';
          a.el.style.left = x + 'px';
          a.el.style.top = y + 'px';
        });
      }
    }
    frame();

    setTimeout(() => { hintEl.style.opacity = '0'; }, 4200);

    return {
      dispose() {
        alive = false;
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
          }
        });
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        container.innerHTML = '';
      }
    };
  }

  window.Viewer = { mount, available: has3D };
})();
