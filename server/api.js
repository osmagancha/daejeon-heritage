'use strict';

const db = require('./db');
const auth = require('./auth');
const google = require('./google');
const { HERITAGE, COURSES, BADGES } = require('./seed/heritage');
const { GOODS, CITY_INTRO, CITY_FEATURES, NOTICES } = require('./seed/city');

const CHECKIN_RADIUS_M = 800;   // 이 반경 안이면 GPS 인증 방문
const QUIZ_POINTS = 30;
const REVIEW_POINTS = 20;

const byId = new Map(HERITAGE.map((h) => [h.id, h]));
const goodsById = new Map(GOODS.map((g) => [g.id, g]));

/* ------------------------------------------------------------------ utils */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new HttpError(400, msg); };
const needAuth = (user) => { if (!user) throw new HttpError(401, '로그인이 필요합니다.'); return user; };

function distanceM(a, b, c, d) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(c - a);
  const dLng = toRad(d - b);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 목록용 경량 필드 */
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
  const rows = db.table('reviews').filter((r) => r.heritageId === heritageId);
  if (!rows.length) return { avg: 0, count: 0 };
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return { avg: Math.round(avg * 10) / 10, count: rows.length };
}

function nicknameOf(userId) {
  const u = db.table('users').find((x) => x.id === userId);
  return u ? u.nickname : '탈퇴한 사용자';
}

function addPoints(user, amount) {
  user.points = (user.points || 0) + amount;
  db.save();
}

/** 방문/퀴즈 이후 배지 재평가. 새로 얻은 배지 배열을 돌려준다. */
function evaluateBadges(user) {
  const visits = db.table('visits').filter((v) => v.userId === user.id);
  const visitedIds = new Set(visits.map((v) => v.heritageId));
  const correctQuiz = db.table('quizLogs').filter((q) => q.userId === user.id && q.correct).length;
  const owned = new Set(db.table('badges').filter((b) => b.userId === user.id).map((b) => b.badgeId));
  const gained = [];

  for (const badge of BADGES) {
    if (owned.has(badge.id)) continue;
    const r = badge.rule;
    let ok = false;
    if (r.type === 'visits') ok = visitedIds.size >= r.count;
    else if (r.type === 'quiz') ok = correctQuiz >= r.count;
    else if (r.type === 'category') {
      const inCat = HERITAGE.filter((h) => h.category === r.category);
      ok = inCat.length > 0 && inCat.every((h) => visitedIds.has(h.id));
    } else if (r.type === 'course') {
      ok = COURSES.some((c) => c.stops.every((s) => visitedIds.has(s)));
    }
    if (ok) {
      db.table('badges').push({ userId: user.id, badgeId: badge.id, at: Date.now() });
      gained.push(badge);
    }
  }
  if (gained.length) db.save();
  return gained;
}

function courseProgress(userId) {
  const visited = new Set(db.table('visits').filter((v) => v.userId === userId).map((v) => v.heritageId));
  return COURSES.map((c) => ({
    id: c.id,
    done: c.stops.filter((s) => visited.has(s)).length,
    total: c.stops.length
  }));
}

function meSummary(user) {
  const visits = db.table('visits')
    .filter((v) => v.userId === user.id)
    .sort((a, b) => b.at - a.at);
  const badgeRows = db.table('badges').filter((b) => b.userId === user.id);
  const quizLogs = db.table('quizLogs').filter((q) => q.userId === user.id);
  return {
    user: auth.publicUser(user),
    visits: visits.map((v) => ({ heritageId: v.heritageId, at: v.at, method: v.method })),
    favorites: db.table('favorites').filter((f) => f.userId === user.id).map((f) => f.heritageId),
    badges: badgeRows.map((b) => {
      const def = BADGES.find((x) => x.id === b.badgeId);
      return { ...def, at: b.at };
    }),
    quiz: {
      answered: quizLogs.length,
      correct: quizLogs.filter((q) => q.correct).length,
      keys: quizLogs.map((q) => `${q.heritageId}:${q.qIndex}`)
    },
    courses: courseProgress(user.id),
    orders: db.table('orders').filter((o) => o.userId === user.id).sort((a, b) => b.at - a.at)
      .map((o) => ({ ...o, goods: goodsById.get(o.goodsId) || null }))
  };
}

/* ----------------------------------------------------------------- routes */

/**
 * 라우트 테이블: [method, 패턴, 핸들러]
 * 패턴의 :param 은 ctx.params 로 전달된다.
 */
const routes = [];
const on = (method, pattern, handler) => {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ method, rx, keys, handler });
};

/* --- 정적 컨텐츠 --- */

on('GET', '/api/bootstrap', () => ({
  heritage: HERITAGE.map(lightHeritage),
  courses: COURSES,
  badges: BADGES,
  notices: NOTICES,
  categories: [...new Set(HERITAGE.map((h) => h.category))],
  ratings: Object.fromEntries(HERITAGE.map((h) => [h.id, ratingOf(h.id)])),
  googleClientId: google.clientId()
}));

on('GET', '/api/heritage', () => HERITAGE.map(lightHeritage));

on('GET', '/api/heritage/:id', (ctx) => {
  const h = byId.get(ctx.params.id);
  if (!h) throw new HttpError(404, '문화유산을 찾을 수 없습니다.');
  const reviews = db.table('reviews')
    .filter((r) => r.heritageId === h.id)
    .sort((a, b) => b.at - a.at)
    .map((r) => ({ id: r.id, userId: r.userId, nickname: nicknameOf(r.userId), rating: r.rating, body: r.body, at: r.at }));
  const visitCount = new Set(db.table('visits').filter((v) => v.heritageId === h.id).map((v) => v.userId)).size;
  return { ...h, reviews, rating: ratingOf(h.id), visitCount, nearby: nearbyOf(h) };
});

function nearbyOf(h) {
  return HERITAGE
    .filter((x) => x.id !== h.id)
    .map((x) => ({ id: x.id, name: x.name, category: x.category, palette: x.palette, model: x.model, d: distanceM(h.lat, h.lng, x.lat, x.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => ({ ...x, distanceKm: Math.round(x.d / 100) / 10 }));
}

on('GET', '/api/courses', () => COURSES);
on('GET', '/api/city/intro', () => CITY_INTRO);
on('GET', '/api/city/features', () => CITY_FEATURES);
on('GET', '/api/notices', () => NOTICES);
on('GET', '/api/goods', () => GOODS.map((g) => ({ ...g, sold: db.table('orders').filter((o) => o.goodsId === g.id).reduce((s, o) => s + o.qty, 0) })));

/* --- 인증 --- */

on('POST', '/api/auth/register', (ctx) => {
  const { email, password, nickname } = ctx.body || {};
  if (!auth.validateEmail(email)) bad('이메일 형식이 올바르지 않습니다.');
  if (typeof password !== 'string' || password.length < 6) bad('비밀번호는 6자 이상이어야 합니다.');
  if (typeof nickname !== 'string' || nickname.trim().length < 2 || nickname.trim().length > 16) {
    bad('닉네임은 2~16자로 입력해 주세요.');
  }
  const mail = email.trim().toLowerCase();
  if (db.table('users').some((u) => u.email === mail)) throw new HttpError(409, '이미 가입된 이메일입니다.');

  const { salt, hash } = auth.hashPassword(password);
  const user = {
    id: db.id('u_'),
    email: mail,
    nickname: nickname.trim(),
    passwordHash: hash,
    salt,
    points: 100,                       // 가입 축하 포인트
    avatarSeed: Math.floor(Math.random() * 360),
    bio: '',
    createdAt: Date.now()
  };
  db.table('users').push(user);
  db.save();
  const token = auth.createSession(user.id, ctx.ua);
  return { token, user: auth.publicUser(user), welcomePoints: 100 };
});

on('POST', '/api/auth/login', (ctx) => {
  const { email, password } = ctx.body || {};
  const mail = String(email || '').trim().toLowerCase();
  const user = db.table('users').find((u) => u.email === mail);
  if (user && !user.passwordHash) {
    throw new HttpError(401, '구글로 가입한 계정입니다. 구글로 계속하기를 눌러 주세요.');
  }
  if (!user || !auth.verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  const token = auth.createSession(user.id, ctx.ua);
  return { token, user: auth.publicUser(user) };
});

on('POST', '/api/auth/google', async (ctx) => {
  if (!google.enabled()) throw new HttpError(503, '이 서버에는 구글 로그인이 설정되어 있지 않습니다.');

  let profile;
  try {
    profile = await google.verify((ctx.body || {}).credential);
  } catch (e) {
    throw new HttpError(401, e.message || '구글 인증에 실패했습니다.');
  }

  const users = db.table('users');
  let user = users.find((u) => u.googleId === profile.googleId);
  let created = false;

  // 같은 이메일로 이미 가입했다면 그 계정에 구글을 연결한다
  if (!user && profile.email) user = users.find((u) => u.email === profile.email);

  if (user) {
    user.googleId = profile.googleId;
    if (profile.picture) user.picture = profile.picture;
  } else {
    const base = (profile.name || (profile.email || '').split('@')[0] || '여행자').trim();
    user = {
      id: db.id('u_'),
      email: profile.email,
      nickname: base.slice(0, 16) || '여행자',
      googleId: profile.googleId,
      picture: profile.picture,
      passwordHash: '',
      salt: '',
      points: 100,
      avatarSeed: Math.floor(Math.random() * 360),
      bio: '',
      createdAt: Date.now()
    };
    users.push(user);
    created = true;
  }
  db.save();

  return { token: auth.createSession(user.id, ctx.ua), user: auth.publicUser(user), created, welcomePoints: created ? 100 : 0 };
});

on('POST', '/api/auth/logout', (ctx) => {
  if (ctx.token) auth.destroySession(ctx.token);
  return { ok: true };
});

on('GET', '/api/auth/me', (ctx) => (ctx.user ? meSummary(ctx.user) : { user: null }));

on('PATCH', '/api/auth/me', (ctx) => {
  const user = needAuth(ctx.user);
  const { nickname, bio, avatarSeed } = ctx.body || {};
  if (nickname !== undefined) {
    const n = String(nickname).trim();
    if (n.length < 2 || n.length > 16) bad('닉네임은 2~16자로 입력해 주세요.');
    user.nickname = n;
  }
  if (bio !== undefined) user.bio = String(bio).slice(0, 140);
  if (avatarSeed !== undefined) user.avatarSeed = Math.abs(parseInt(avatarSeed, 10) || 0) % 360;
  db.save();
  return { user: auth.publicUser(user) };
});

/* --- 방문 인증(스탬프) --- */

on('POST', '/api/visits', (ctx) => {
  const user = needAuth(ctx.user);
  const { heritageId, lat, lng } = ctx.body || {};
  const h = byId.get(heritageId);
  if (!h) bad('알 수 없는 문화유산입니다.');
  if (db.table('visits').some((v) => v.userId === user.id && v.heritageId === h.id)) {
    throw new HttpError(409, '이미 스탬프를 받은 곳입니다.');
  }

  let method = 'manual';
  let distance = null;
  if (typeof lat === 'number' && typeof lng === 'number') {
    distance = Math.round(distanceM(lat, lng, h.lat, h.lng));
    method = distance <= CHECKIN_RADIUS_M ? 'gps' : 'far';
  }
  const earned = method === 'gps' ? h.points : Math.round(h.points * 0.4);

  db.table('visits').push({
    id: db.id('v_'), userId: user.id, heritageId: h.id, at: Date.now(), method, distance
  });
  addPoints(user, earned);
  const gained = evaluateBadges(user);

  return {
    ok: true, method, distance, earned,
    points: user.points,
    newBadges: gained,
    radius: CHECKIN_RADIUS_M
  };
});

on('DELETE', '/api/visits/:heritageId', (ctx) => {
  const user = needAuth(ctx.user);
  const rows = db.table('visits');
  const i = rows.findIndex((v) => v.userId === user.id && v.heritageId === ctx.params.heritageId);
  if (i < 0) throw new HttpError(404, '기록이 없습니다.');
  rows.splice(i, 1);
  db.save();
  return { ok: true };
});

/* --- 즐겨찾기 --- */

on('POST', '/api/favorites/:heritageId', (ctx) => {
  const user = needAuth(ctx.user);
  if (!byId.has(ctx.params.heritageId)) bad('알 수 없는 문화유산입니다.');
  const rows = db.table('favorites');
  const i = rows.findIndex((f) => f.userId === user.id && f.heritageId === ctx.params.heritageId);
  let active;
  if (i >= 0) { rows.splice(i, 1); active = false; }
  else { rows.push({ userId: user.id, heritageId: ctx.params.heritageId, at: Date.now() }); active = true; }
  db.save();
  return { ok: true, active };
});

/* --- 방명록/후기 --- */

on('POST', '/api/reviews', (ctx) => {
  const user = needAuth(ctx.user);
  const { heritageId, rating, body } = ctx.body || {};
  if (!byId.has(heritageId)) bad('알 수 없는 문화유산입니다.');
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) bad('별점은 1~5 사이여야 합니다.');
  const text = String(body || '').trim();
  if (text.length < 2) bad('감상을 두 글자 이상 적어 주세요.');
  if (text.length > 500) bad('500자 이내로 적어 주세요.');

  const rows = db.table('reviews');
  const prev = rows.find((x) => x.userId === user.id && x.heritageId === heritageId);
  let earned = 0;
  if (prev) {
    prev.rating = r; prev.body = text; prev.at = Date.now();
  } else {
    rows.push({ id: db.id('r_'), userId: user.id, heritageId, rating: r, body: text, at: Date.now() });
    earned = REVIEW_POINTS;
    addPoints(user, earned);
  }
  db.save();
  return { ok: true, earned, points: user.points, rating: ratingOf(heritageId) };
});

on('DELETE', '/api/reviews/:id', (ctx) => {
  const user = needAuth(ctx.user);
  const rows = db.table('reviews');
  const i = rows.findIndex((r) => r.id === ctx.params.id && r.userId === user.id);
  if (i < 0) throw new HttpError(404, '후기를 찾을 수 없습니다.');
  const heritageId = rows[i].heritageId;
  rows.splice(i, 1);
  db.save();
  return { ok: true, rating: ratingOf(heritageId) };
});

/* --- 퀴즈 --- */

on('POST', '/api/quiz', (ctx) => {
  const user = needAuth(ctx.user);
  const { heritageId, qIndex, choice } = ctx.body || {};
  const h = byId.get(heritageId);
  if (!h) bad('알 수 없는 문화유산입니다.');
  const idx = Number(qIndex);
  const question = h.quiz && h.quiz[idx];
  if (!question) bad('문항이 없습니다.');

  const correct = Number(choice) === question.answer;
  const already = db.table('quizLogs').some((q) => q.userId === user.id && q.heritageId === h.id && q.qIndex === idx && q.correct);

  let earned = 0;
  if (correct && !already) { earned = QUIZ_POINTS; addPoints(user, earned); }

  db.table('quizLogs').push({
    id: db.id('q_'), userId: user.id, heritageId: h.id, qIndex: idx, correct, at: Date.now()
  });
  db.save();
  const gained = evaluateBadges(user);

  return { correct, answer: question.answer, explain: question.explain, earned, points: user.points, newBadges: gained };
});

/* --- 굿즈 교환 --- */

on('POST', '/api/orders', (ctx) => {
  const user = needAuth(ctx.user);
  const { goodsId, qty } = ctx.body || {};
  const g = goodsById.get(goodsId);
  if (!g) bad('알 수 없는 상품입니다.');
  const n = Math.max(1, Math.min(5, parseInt(qty, 10) || 1));
  const cost = g.pointPrice * n;
  if ((user.points || 0) < cost) throw new HttpError(402, `포인트가 ${cost - (user.points || 0)}P 부족합니다.`);

  user.points -= cost;
  const order = {
    id: db.id('o_'), userId: user.id, goodsId: g.id, qty: n,
    pointsSpent: cost, at: Date.now(), status: '교환완료'
  };
  db.table('orders').push(order);
  db.save();
  return { ok: true, order: { ...order, goods: g }, points: user.points };
});

/* --- 랭킹 --- */

on('GET', '/api/leaderboard', () => {
  const visits = db.table('visits');
  return db.table('users')
    .map((u) => ({
      nickname: u.nickname,
      avatarSeed: u.avatarSeed,
      points: u.points || 0,
      stamps: new Set(visits.filter((v) => v.userId === u.id).map((v) => v.heritageId)).size
    }))
    .sort((a, b) => b.points - a.points || b.stamps - a.stamps)
    .slice(0, 20);
});

/* ------------------------------------------------------------- dispatcher */

/**
 * 바깥에서 부르는 진입점.
 * 저장소가 요청 단위로 최신 상태를 읽고 쓰도록 감싼다.
 * 로그인 사용자 판별도 그 안에서 해야 최신 세션을 본다.
 */
function serve(method, pathname, ctx) {
  const mutating = method !== 'GET';
  return db.runRequest(mutating, () => {
    ctx.user = auth.userFromToken(ctx.token);
    return handle(method, pathname, ctx);
  });
}

function handle(method, pathname, ctx) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.rx.exec(pathname);
    if (!m) continue;
    ctx.params = {};
    r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
    return r.handler(ctx);
  }
  throw new HttpError(404, '없는 엔드포인트입니다.');
}

module.exports = { serve, handle, HttpError };
