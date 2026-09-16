/* ══════════════════════════════════════════════════════════════════
   로컬 API — 서버 없이 도는 배포판(단일 HTML)용.
   server/api.js 와 같은 엔드포인트를 브라우저 저장소 위에서 구현한다.
   이 파일이 로드되면 api.js 의 fetch 대신 이쪽으로 호출이 흐른다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const KEY = 'hanbat.local.v1';
  const QUIZ_POINTS = 30;
  const REVIEW_POINTS = 20;
  const CHECKIN_RADIUS_M = 800;

  const byId = new Map(HERITAGE.map((h) => [h.id, h]));
  const goodsById = new Map(GOODS.map((g) => [g.id, g]));

  /* ------------------------------------------------------------- 저장소 */

  const EMPTY = {
    user: null,      // {id, nickname, avatarSeed, bio, points, createdAt}
    visits: [],      // {heritageId, at, method, distance}
    favorites: [],   // heritageId[]
    reviews: [],     // {id, heritageId, rating, body, at}
    quizLogs: [],    // {heritageId, qIndex, correct, at}
    orders: [],      // {id, goodsId, qty, pointsSpent, at, status}
    badges: [],      // {badgeId, at}
    avatar: null,    // {robe, item}
    greet: null,     // {streak, lastDay, total}
    rise: null       // {level, fails, tries} — 승급 기록
  };

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = Object.assign({}, EMPTY, JSON.parse(localStorage.getItem(KEY) || '{}'));
      for (const k of Object.keys(EMPTY)) {
        if (Array.isArray(EMPTY[k]) && !Array.isArray(cache[k])) cache[k] = [];
      }
    } catch {
      cache = JSON.parse(JSON.stringify(EMPTY));
    }
    return cache;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { console.warn('[local] 저장 실패', e); }
  }

  const uid = (p) => p + Math.random().toString(36).slice(2, 11);

  /* ------------------------------------------------------------- 도우미 */

  class LocalError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  function distanceM(a, b, c, d) {
    const R = 6371000, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(c - a), dLng = rad(d - b);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function lightHeritage(h) {
    return {
      id: h.id, name: h.name, short: h.short, hanja: h.hanja, designation: h.designation,
      category: h.category, era: h.era, address: h.address,
      lat: h.lat, lng: h.lng, summary: h.summary, tags: h.tags,
      points: h.points, difficulty: h.difficulty, duration: h.duration,
      palette: h.palette, model: h.model
    };
  }

  function ratingOf(heritageId) {
    const rows = load().reviews.filter((r) => r.heritageId === heritageId);
    if (!rows.length) return { avg: 0, count: 0 };
    return { avg: Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10, count: rows.length };
  }

  function needUser() {
    const s = load();
    if (!s.user) throw new LocalError(401, '먼저 이름을 정해 주세요.');
    return s.user;
  }

  function evaluateBadges() {
    const s = load();
    const visited = new Set(s.visits.map((v) => v.heritageId));
    const correct = s.quizLogs.filter((q) => q.correct).length;
    const owned = new Set(s.badges.map((b) => b.badgeId));
    const gained = [];

    for (const badge of BADGES) {
      if (owned.has(badge.id)) continue;
      const r = badge.rule;
      let ok = false;
      if (r.type === 'visits') ok = visited.size >= r.count;
      else if (r.type === 'quiz') ok = correct >= r.count;
      else if (r.type === 'category') {
        const inCat = HERITAGE.filter((h) => h.category === r.category);
        ok = inCat.length > 0 && inCat.every((h) => visited.has(h.id));
      } else if (r.type === 'course') {
        ok = COURSES.some((c) => c.stops.every((x) => visited.has(x)));
      }
      if (ok) { s.badges.push({ badgeId: badge.id, at: Date.now() }); gained.push(badge); }
    }
    if (gained.length) save();
    return gained;
  }

  function courseProgress() {
    const visited = new Set(load().visits.map((v) => v.heritageId));
    return COURSES.map((c) => ({
      id: c.id,
      done: c.stops.filter((x) => visited.has(x)).length,
      total: c.stops.length
    }));
  }

  function meSummary() {
    const s = load();
    return {
      user: s.user,
      visits: s.visits.slice().sort((a, b) => b.at - a.at)
        .map((v) => ({ heritageId: v.heritageId, at: v.at, method: v.method })),
      favorites: s.favorites.slice(),
      badges: s.badges.map((b) => Object.assign({}, BADGES.find((x) => x.id === b.badgeId), { at: b.at })),
      quiz: {
        answered: s.quizLogs.length,
        correct: s.quizLogs.filter((q) => q.correct).length,
        keys: s.quizLogs.map((q) => `${q.heritageId}:${q.qIndex}`)
      },
      courses: courseProgress(),
      orders: s.orders.slice().sort((a, b) => b.at - a.at)
        .map((o) => Object.assign({}, o, { goods: goodsById.get(o.goodsId) || null }))
    };
  }

  function nearbyOf(h) {
    return HERITAGE
      .filter((x) => x.id !== h.id)
      .map((x) => ({
        id: x.id, name: x.name, category: x.category, palette: x.palette, model: x.model,
        d: distanceM(h.lat, h.lng, x.lat, x.lng)
      }))
      .sort((a, b) => a.d - b.d).slice(0, 3)
      .map((x) => Object.assign({}, x, { distanceKm: Math.round(x.d / 100) / 10 }));
  }

  /* ------------------------------------------------------------- 라우트 */

  const routes = [];
  const on = (method, pattern, handler) => {
    const keys = [];
    const rx = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
      keys.push(k); return '([^/]+)';
    }) + '$');
    routes.push({ method, rx, keys, handler });
  };

  on('GET', '/bootstrap', () => ({
    heritage: HERITAGE.map(lightHeritage),
    courses: COURSES,
    badges: BADGES,
    notices: NOTICES,
    categories: [...new Set(HERITAGE.map((h) => h.category))],
    ratings: Object.fromEntries(HERITAGE.map((h) => [h.id, ratingOf(h.id)]))
  }));

  on('GET', '/heritage', () => HERITAGE.map(lightHeritage));

  on('GET', '/heritage/:id', (ctx) => {
    const h = byId.get(ctx.params.id);
    if (!h) throw new LocalError(404, '문화유산을 찾을 수 없습니다.');
    const s = load();
    const reviews = s.reviews.filter((r) => r.heritageId === h.id)
      .sort((a, b) => b.at - a.at)
      .map((r) => Object.assign({}, r, {
        userId: s.user ? s.user.id : 'me',
        nickname: s.user ? s.user.nickname : '나'
      }));
    return Object.assign({}, h, {
      reviews,
      rating: ratingOf(h.id),
      visitCount: s.visits.some((v) => v.heritageId === h.id) ? 1 : 0,
      nearby: nearbyOf(h)
    });
  });

  on('GET', '/courses', () => COURSES);
  on('GET', '/city/intro', () => CITY_INTRO);
  on('GET', '/city/features', () => CITY_FEATURES);
  on('GET', '/notices', () => NOTICES);
  on('GET', '/goods', () => GOODS.map((g) => Object.assign({}, g, {
    sold: load().orders.filter((o) => o.goodsId === g.id).reduce((n, o) => n + o.qty, 0)
  })));

  /* 이름 정하기 = 배포판의 "가입". 비밀번호가 없다. */
  on('POST', '/auth/register', (ctx) => {
    const s = load();
    const nickname = String((ctx.body && ctx.body.nickname) || '').trim();
    if (nickname.length < 2 || nickname.length > 16) throw new LocalError(400, '이름은 2~16자로 입력해 주세요.');
    s.user = {
      id: uid('u_'),
      nickname,
      avatarSeed: Math.floor(Math.random() * 360),
      bio: '',
      points: 100,
      createdAt: Date.now()
    };
    s.rise = { level: 1, fails: 0, tries: 0 };   // 누구나 동몽에서 시작한다
    save();
    return { token: 'local', user: s.user, welcomePoints: 100 };
  });

  on('POST', '/auth/login', (ctx) => routeCall('POST', '/auth/register', ctx.body));
  on('POST', '/auth/logout', () => ({ ok: true }));

  on('GET', '/auth/me', () => (load().user ? meSummary() : { user: null }));

  on('PATCH', '/auth/me', (ctx) => {
    const u = needUser();
    const b = ctx.body || {};
    if (b.nickname !== undefined) {
      const n = String(b.nickname).trim();
      if (n.length < 2 || n.length > 16) throw new LocalError(400, '이름은 2~16자로 입력해 주세요.');
      u.nickname = n;
    }
    if (b.bio !== undefined) u.bio = String(b.bio).slice(0, 140);
    if (b.avatarSeed !== undefined) u.avatarSeed = Math.abs(parseInt(b.avatarSeed, 10) || 0) % 360;
    save();
    return { user: u };
  });

  /* 기록 전체 삭제 */
  on('POST', '/auth/reset', () => {
    cache = JSON.parse(JSON.stringify(EMPTY));
    save();
    return { ok: true };
  });

  on('POST', '/visits', (ctx) => {
    const u = needUser();
    const s = load();
    const b = ctx.body || {};
    const h = byId.get(b.heritageId);
    if (!h) throw new LocalError(400, '알 수 없는 문화유산입니다.');
    if (s.visits.some((v) => v.heritageId === h.id)) throw new LocalError(409, '이미 스탬프를 받은 곳입니다.');

    let method = 'manual', distance = null;
    if (typeof b.lat === 'number' && typeof b.lng === 'number') {
      distance = Math.round(distanceM(b.lat, b.lng, h.lat, h.lng));
      method = distance <= CHECKIN_RADIUS_M ? 'gps' : 'far';
    }
    const earned = method === 'gps' ? h.points : Math.round(h.points * 0.4);
    s.visits.push({ heritageId: h.id, at: Date.now(), method, distance });
    u.points += earned;
    save();
    return { ok: true, method, distance, earned, points: u.points, newBadges: evaluateBadges(), radius: CHECKIN_RADIUS_M };
  });

  on('DELETE', '/visits/:heritageId', (ctx) => {
    needUser();
    const s = load();
    const i = s.visits.findIndex((v) => v.heritageId === ctx.params.heritageId);
    if (i < 0) throw new LocalError(404, '기록이 없습니다.');
    s.visits.splice(i, 1);
    save();
    return { ok: true };
  });

  on('POST', '/favorites/:heritageId', (ctx) => {
    needUser();
    const s = load();
    const id = ctx.params.heritageId;
    if (!byId.has(id)) throw new LocalError(400, '알 수 없는 문화유산입니다.');
    const i = s.favorites.indexOf(id);
    let active;
    if (i >= 0) { s.favorites.splice(i, 1); active = false; }
    else { s.favorites.push(id); active = true; }
    save();
    return { ok: true, active };
  });

  on('POST', '/reviews', (ctx) => {
    const u = needUser();
    const s = load();
    const b = ctx.body || {};
    if (!byId.has(b.heritageId)) throw new LocalError(400, '알 수 없는 문화유산입니다.');
    const r = Math.round(Number(b.rating));
    if (!(r >= 1 && r <= 5)) throw new LocalError(400, '별점은 1~5 사이여야 합니다.');
    const text = String(b.body || '').trim();
    if (text.length < 2) throw new LocalError(400, '감상을 두 글자 이상 적어 주세요.');
    if (text.length > 500) throw new LocalError(400, '500자 이내로 적어 주세요.');

    const prev = s.reviews.find((x) => x.heritageId === b.heritageId);
    let earned = 0;
    if (prev) { prev.rating = r; prev.body = text; prev.at = Date.now(); }
    else {
      s.reviews.push({ id: uid('r_'), heritageId: b.heritageId, rating: r, body: text, at: Date.now() });
      earned = REVIEW_POINTS;
      u.points += earned;
    }
    save();
    return { ok: true, earned, points: u.points, rating: ratingOf(b.heritageId) };
  });

  on('DELETE', '/reviews/:id', (ctx) => {
    needUser();
    const s = load();
    const i = s.reviews.findIndex((r) => r.id === ctx.params.id);
    if (i < 0) throw new LocalError(404, '후기를 찾을 수 없습니다.');
    const heritageId = s.reviews[i].heritageId;
    s.reviews.splice(i, 1);
    save();
    return { ok: true, rating: ratingOf(heritageId) };
  });

  on('POST', '/quiz', (ctx) => {
    const u = needUser();
    const s = load();
    const b = ctx.body || {};
    const h = byId.get(b.heritageId);
    if (!h) throw new LocalError(400, '알 수 없는 문화유산입니다.');
    const idx = Number(b.qIndex);
    const q = h.quiz && h.quiz[idx];
    if (!q) throw new LocalError(400, '문항이 없습니다.');

    const correct = Number(b.choice) === q.answer;
    const already = s.quizLogs.some((x) => x.heritageId === h.id && x.qIndex === idx && x.correct);
    let earned = 0;
    if (correct && !already) { earned = QUIZ_POINTS; u.points += earned; }
    s.quizLogs.push({ heritageId: h.id, qIndex: idx, correct, at: Date.now() });
    save();
    return { correct, answer: q.answer, explain: q.explain, earned, points: u.points, newBadges: evaluateBadges() };
  });

  on('POST', '/orders', (ctx) => {
    const u = needUser();
    const s = load();
    const g = goodsById.get((ctx.body || {}).goodsId);
    if (!g) throw new LocalError(400, '알 수 없는 상품입니다.');
    const n = Math.max(1, Math.min(5, parseInt((ctx.body || {}).qty, 10) || 1));
    const cost = g.pointPrice * n;
    if (u.points < cost) throw new LocalError(402, `포인트가 ${cost - u.points}P 부족합니다.`);
    u.points -= cost;
    const order = { id: uid('o_'), goodsId: g.id, qty: n, pointsSpent: cost, at: Date.now(), status: '교환완료' };
    s.orders.push(order);
    save();
    return { ok: true, order: Object.assign({}, order, { goods: g }), points: u.points };
  });

  /* --- 아바타 --- */

  const GREET_POINTS = 10;
  const GREET_MAX_STREAK = 7;

  /** 승급 기록. 예전 방식으로 자란 단계는 그대로 물려받는다. */
  function riseState() {
    const s = load();
    if (!s.rise) {
      s.rise = { level: AvatarRules.stageOf((s.user && s.user.points) || 0).level, fails: 0, tries: 0 };
    }
    const r = s.rise;
    r.level = Math.min(AvatarRules.STAGES.length, Math.max(1, Math.round(r.level || 1)));
    r.fails = Math.max(0, Math.round(r.fails || 0));
    return r;
  }

  function avatarStats() {
    const s = load();
    return {
      stamps: new Set(s.visits.map((v) => v.heritageId)).size,
      visits: s.visits.filter((v) => v.method === 'gps').length,
      reviews: s.reviews.length,
      quiz: new Set(s.quizLogs.filter((q) => q.correct).map((q) => q.heritageId + ':' + q.qIndex)).size,
      badges: s.badges.length,
      streak: (s.greet && s.greet.streak) || 0,
      level: riseState().level
    };
  }

  const todayKey = (ts) => new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);

  function avatarPayload() {
    const s = load();
    const u = needUser();
    const stats = avatarStats();
    const look = AvatarRules.sanitize(s.avatar, stats);
    s.avatar = look;
    const greet = s.greet || { streak: 0, lastDay: null, total: 0 };
    const rise = riseState();
    return {
      stage: AvatarRules.stageAt(rise.level, u.points || 0, rise.fails),
      tries: rise.tries || 0,
      stages: AvatarRules.STAGES.map((x) => ({
        key: x.key, level: x.level, name: x.name, hanja: x.hanja, need: x.need,
        tier: x.tier, emoji: x.emoji, desc: x.desc,
        cost: AvatarRules.riseCost(x.level),
        rate: x.level < AvatarRules.STAGES.length ? AvatarRules.riseRate(x.level) : null
      })),
      tiers: AvatarRules.TIERS,
      points: u.points || 0,
      look,
      stats,
      catalog: AvatarRules.catalog(stats),
      greet: {
        streak: greet.streak,
        total: greet.total || 0,
        doneToday: greet.lastDay === todayKey(Date.now()),
        reward: GREET_POINTS * Math.min(GREET_MAX_STREAK, (greet.streak || 0) + 1)
      },
      seed: u.avatarSeed || 0,
      nickname: u.nickname
    };
  }

  on('GET', '/avatar', () => { needUser(); const r = avatarPayload(); save(); return r; });

  on('PATCH', '/avatar', (ctx) => {
    needUser();
    const s = load();
    const stats = avatarStats();
    const b = ctx.body || {};
    const wanted = {
      robe: b.robe !== undefined ? b.robe : (s.avatar && s.avatar.robe),
      item: b.item !== undefined ? b.item : (s.avatar && s.avatar.item)
    };
    const clean = AvatarRules.sanitize(wanted, stats);
    if (b.robe !== undefined && clean.robe !== b.robe) throw new LocalError(400, '아직 열리지 않은 도포입니다.');
    if (b.item !== undefined && clean.item !== b.item) throw new LocalError(400, '아직 열리지 않은 물건입니다.');
    s.avatar = clean;
    save();
    return avatarPayload();
  });

  /** 승급 도전 — 포인트를 들이고 확률에 건다. 떨어져도 단계는 내려가지 않는다. */
  on('POST', '/avatar/levelup', () => {
    const u = needUser();
    const r = riseState();
    if (r.level >= AvatarRules.STAGES.length) throw new LocalError(409, '마지막 단계입니다. 더 오를 곳이 없습니다.');

    const info = AvatarRules.riseInfo(r.level, u.points || 0, r.fails);
    if (!info.can) throw new LocalError(402, `포인트가 ${info.short.toLocaleString()}P 부족합니다.`);

    const before = r.level;
    const sure = info.sureIn === 0;
    u.points -= info.cost;
    const ok = Math.random() < info.odds;

    if (ok) { r.level += 1; r.fails = 0; }
    else { r.fails += 1; }
    r.tries = (r.tries || 0) + 1;
    save();

    return {
      ok, sure, before, after: r.level,
      cost: info.cost,
      odds: Math.round(info.odds * 1000) / 10,
      fails: r.fails,
      name: AvatarRules.STAGES[r.level - 1].name,
      avatar: avatarPayload()
    };
  });

  on('POST', '/avatar/greet', () => {
    const u = needUser();
    const s = load();
    const today = todayKey(Date.now());
    const yesterday = todayKey(Date.now() - 864e5);
    const greet = s.greet || { streak: 0, lastDay: null, total: 0 };
    if (greet.lastDay === today) throw new LocalError(409, '오늘은 이미 문안을 드렸습니다.');

    greet.streak = greet.lastDay === yesterday ? (greet.streak || 0) + 1 : 1;
    greet.lastDay = today;
    greet.total = (greet.total || 0) + 1;
    s.greet = greet;

    const earned = GREET_POINTS * Math.min(GREET_MAX_STREAK, greet.streak);
    u.points += earned;
    save();
    return { ok: true, earned, streak: greet.streak, avatar: avatarPayload() };
  });

  /* ------------------------------------------------------------- 디스패치 */

  function routeCall(method, path, body) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.rx.exec(path);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return r.handler({ params, body: body || {} });
    }
    throw new LocalError(404, '없는 엔드포인트입니다.');
  }

  function LocalAPI(method, path, body) {
    return new Promise((resolve, reject) => {
      try { resolve(JSON.parse(JSON.stringify(routeCall(method, path, body)))); }
      catch (e) { reject(e); }
    });
  }

  /** api.js 가 세션 유무를 물어볼 때 쓴다 */
  LocalAPI.token = () => (load().user ? 'local' : '');

  window.LocalAPI = LocalAPI;
})();
