'use strict';

const db = require('./db');
const auth = require('./auth');
const google = require('./google');
const avatar = require('./avatar');
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

/* --- 랭킹 --- */

const PERIOD_MS = { week: 7 * 864e5, month: 30 * 864e5 };

/** 기간 안에서 실제로 벌어들인 포인트를 사건 기록으로 되짚는다 */
function earnedWithin(userId, since) {
  let total = 0;

  for (const v of db.table('visits')) {
    if (v.userId !== userId || v.at < since) continue;
    const h = byId.get(v.heritageId);
    if (!h) continue;
    total += v.method === 'gps' ? h.points : Math.round(h.points * 0.4);
  }

  // 같은 문항을 여러 번 맞혀도 점수는 처음 한 번만 들어간다
  const counted = new Set();
  for (const q of db.table('quizLogs').slice().sort((a, b) => a.at - b.at)) {
    if (q.userId !== userId || !q.correct) continue;
    const key = q.heritageId + ':' + q.qIndex;
    if (counted.has(key)) continue;
    counted.add(key);
    if (q.at >= since) total += QUIZ_POINTS;
  }

  for (const r of db.table('reviews')) {
    if (r.userId === userId && r.at >= since) total += REVIEW_POINTS;
  }
  return total;
}

/** 한 사람의 탐방 기록을 한 줄로 요약한다 */
function statsOf(user, since) {
  const visits = db.table('visits').filter((v) => v.userId === user.id && v.at >= since);
  const quiz = db.table('quizLogs').filter((q) => q.userId === user.id && q.correct && q.at >= since);
  const reviews = db.table('reviews').filter((r) => r.userId === user.id && r.at >= since);
  const times = [...visits, ...quiz, ...reviews].map((x) => x.at);

  return {
    id: user.id,
    nickname: user.nickname,
    avatarSeed: user.avatarSeed,
    points: since > 0 ? earnedWithin(user.id, since) : (user.points || 0),
    stamps: new Set(visits.map((v) => v.heritageId)).size,
    quizCorrect: new Set(quiz.map((q) => q.heritageId + ':' + q.qIndex)).size,
    reviews: reviews.length,
    badges: db.table('badges').filter((b) => b.userId === user.id).length,
    lastAt: times.length ? Math.max(...times) : 0
  };
}

const SORTS = {
  points:  { label: '종합', unit: 'P',  pick: (r) => r.points },
  stamps:  { label: '스탬프', unit: '개', pick: (r) => r.stamps },
  quiz:    { label: '퀴즈',  unit: '문제', pick: (r) => r.quizCorrect },
  reviews: { label: '기록',  unit: '편', pick: (r) => r.reviews }
};

on('GET', '/api/leaderboard', (ctx) => {
  const sort = SORTS[ctx.query.sort] ? ctx.query.sort : 'points';
  const period = PERIOD_MS[ctx.query.period] ? ctx.query.period : 'all';
  const since = period === 'all' ? 0 : Date.now() - PERIOD_MS[period];
  const pick = SORTS[sort].pick;

  const rows = db.table('users')
    .map((u) => statsOf(u, since))
    .filter((r) => period === 'all' || pick(r) > 0)     // 기간 랭킹에는 활동한 사람만
    .sort((a, b) => pick(b) - pick(a) || b.points - a.points || a.lastAt - b.lastAt);

  // 같은 점수는 같은 등수 (공동 순위)
  let lastScore = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    const score = pick(r);
    if (score !== lastScore) { lastRank = i + 1; lastScore = score; }
    r.rank = lastRank;
    r.score = score;
  });

  const mine = ctx.user ? rows.find((r) => r.id === ctx.user.id) : null;
  const strip = (r) => {
    const { id, ...rest } = r;
    return ctx.user && id === ctx.user.id ? { ...rest, isMe: true } : rest;
  };

  // 방문자가 많은 문화유산
  const visitors = new Map();
  for (const v of db.table('visits')) {
    if (v.at < since) continue;
    if (!visitors.has(v.heritageId)) visitors.set(v.heritageId, new Set());
    visitors.get(v.heritageId).add(v.userId);
  }
  const popular = HERITAGE
    .map((h) => ({
      id: h.id, name: h.name, short: h.short, category: h.category,
      palette: h.palette, model: h.model,
      visitors: visitors.has(h.id) ? visitors.get(h.id).size : 0
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 5);

  return {
    sort, period,
    sorts: Object.entries(SORTS).map(([k, v]) => ({ key: k, label: v.label, unit: v.unit })),
    total: rows.length,
    rows: rows.slice(0, 50).map(strip),
    me: mine ? strip(mine) : null,
    popular,
    updatedAt: Date.now()
  };
});

/* --- 아바타 --- */

const GREET_POINTS = 10;      // 하루 문안 기본 점수
const GREET_MAX_STREAK = 7;   // 연속 보너스 상한

/** 그 사람의 활동을 해금 조건에 쓰이는 숫자로 모은다 */
function avatarStats(user) {
  const visits = db.table('visits').filter((v) => v.userId === user.id);
  return {
    stamps: new Set(visits.map((v) => v.heritageId)).size,
    visits: visits.filter((v) => v.method === 'gps').length,
    reviews: db.table('reviews').filter((r) => r.userId === user.id).length,
    quiz: new Set(db.table('quizLogs')
      .filter((q) => q.userId === user.id && q.correct)
      .map((q) => q.heritageId + ':' + q.qIndex)).size,
    badges: db.table('badges').filter((b) => b.userId === user.id).length,
    streak: (user.greet && user.greet.streak) || 0,
    level: avatar.stageOf(user.points || 0).level
  };
}

/** 한국 시간 기준의 날짜 문자열 (문안은 하루 한 번) */
function todayKey(ts) {
  return new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);
}

function avatarPayload(user) {
  const stats = avatarStats(user);
  const look = avatar.sanitize(user.avatar, stats);
  if (!user.avatar || user.avatar.robe !== look.robe || user.avatar.item !== look.item) {
    user.avatar = look;            // 조건을 잃은 꾸미기는 조용히 되돌린다
    db.save();
  }
  const greet = user.greet || { streak: 0, lastDay: null, total: 0 };
  return {
    stage: avatar.stageOf(user.points || 0),
    stages: avatar.STAGES.map((x) => ({ key: x.key, level: x.level, name: x.name, hanja: x.hanja, need: x.need, tier: x.tier, emoji: x.emoji, desc: x.desc })),
    tiers: avatar.TIERS,
    points: user.points || 0,
    look,
    stats,
    catalog: avatar.catalog(stats),
    greet: {
      streak: greet.streak,
      total: greet.total || 0,
      doneToday: greet.lastDay === todayKey(Date.now()),
      reward: GREET_POINTS * Math.min(GREET_MAX_STREAK, (greet.streak || 0) + 1)
    },
    seed: user.avatarSeed || 0,
    nickname: user.nickname
  };
}

on('GET', '/api/avatar', (ctx) => avatarPayload(needAuth(ctx.user)));

on('PATCH', '/api/avatar', (ctx) => {
  const user = needAuth(ctx.user);
  const stats = avatarStats(user);
  const b = ctx.body || {};

  const wanted = {
    robe: b.robe !== undefined ? b.robe : (user.avatar && user.avatar.robe),
    item: b.item !== undefined ? b.item : (user.avatar && user.avatar.item)
  };
  const clean = avatar.sanitize(wanted, stats);
  if (b.robe !== undefined && clean.robe !== b.robe) bad('아직 열리지 않은 도포입니다.');
  if (b.item !== undefined && clean.item !== b.item) bad('아직 열리지 않은 물건입니다.');

  user.avatar = clean;
  db.save();
  return avatarPayload(user);
});

/** 하루 한 번 문안 — 연속으로 할수록 점수가 는다 */
on('POST', '/api/avatar/greet', (ctx) => {
  const user = needAuth(ctx.user);
  const today = todayKey(Date.now());
  const yesterday = todayKey(Date.now() - 864e5);
  const greet = user.greet || { streak: 0, lastDay: null, total: 0 };

  if (greet.lastDay === today) throw new HttpError(409, '오늘은 이미 문안을 드렸습니다.');

  greet.streak = greet.lastDay === yesterday ? (greet.streak || 0) + 1 : 1;
  greet.lastDay = today;
  greet.total = (greet.total || 0) + 1;
  user.greet = greet;

  const earned = GREET_POINTS * Math.min(GREET_MAX_STREAK, greet.streak);
  addPoints(user, earned);
  db.save();

  return { ok: true, earned, streak: greet.streak, avatar: avatarPayload(user) };
});

/* --- 관리자 --- */

const needAdmin = (user) => {
  needAuth(user);
  if (!auth.isAdmin(user)) throw new HttpError(403, '관리자만 볼 수 있는 화면입니다.');
  return user;
};

/** 한 사람에게 딸린 기록을 모두 찾아 지운다 */
function purgeUser(userId) {
  const removed = {};
  for (const name of ['sessions', 'visits', 'favorites', 'reviews', 'quizLogs', 'orders', 'badges']) {
    const rows = db.table(name);
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].userId === userId) rows.splice(i, 1);
    }
    removed[name] = before - rows.length;
  }
  const users = db.table('users');
  const i = users.findIndex((u) => u.id === userId);
  if (i >= 0) users.splice(i, 1);
  return removed;
}

function adminUserRow(u) {
  const visits = db.table('visits').filter((v) => v.userId === u.id);
  return {
    id: u.id,
    email: u.email || '',
    nickname: u.nickname,
    avatarSeed: u.avatarSeed,
    provider: u.googleId ? 'google' : 'email',
    isAdmin: auth.isAdmin(u),
    points: u.points || 0,
    stamps: new Set(visits.map((v) => v.heritageId)).size,
    reviews: db.table('reviews').filter((r) => r.userId === u.id).length,
    quizCorrect: db.table('quizLogs').filter((q) => q.userId === u.id && q.correct).length,
    badges: db.table('badges').filter((b) => b.userId === u.id).length,
    createdAt: u.createdAt,
    lastAt: visits.length ? Math.max(...visits.map((v) => v.at)) : 0
  };
}

on('GET', '/api/admin/overview', (ctx) => {
  needAdmin(ctx.user);
  const users = db.table('users');
  const visits = db.table('visits');
  const reviews = db.table('reviews');
  const quiz = db.table('quizLogs');
  const day = 864e5;
  const since = (n) => Date.now() - n * day;

  // 최근 14일 활동 추이
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const from = Date.now() - (i + 1) * day;
    const to = Date.now() - i * day;
    trend.push({
      day: new Date(to).toISOString().slice(5, 10),
      visits: visits.filter((v) => v.at >= from && v.at < to).length,
      signups: users.filter((u) => u.createdAt >= from && u.createdAt < to).length
    });
  }

  const recent = [
    ...visits.map((v) => ({ kind: 'visit', at: v.at, userId: v.userId, heritageId: v.heritageId, method: v.method })),
    ...reviews.map((r) => ({ kind: 'review', at: r.at, userId: r.userId, heritageId: r.heritageId, rating: r.rating })),
    ...users.map((u) => ({ kind: 'signup', at: u.createdAt, userId: u.id }))
  ].sort((a, b) => b.at - a.at).slice(0, 25)
   .map((e) => {
     const u = users.find((x) => x.id === e.userId);
     const h = e.heritageId ? byId.get(e.heritageId) : null;
     return { ...e, nickname: u ? u.nickname : '탈퇴한 사용자', heritageName: h ? h.name : '' };
   });

  return {
    totals: {
      users: users.length,
      activeWeek: new Set(visits.filter((v) => v.at >= since(7)).map((v) => v.userId)).size,
      visits: visits.length,
      reviews: reviews.length,
      quizAnswered: quiz.length,
      quizCorrect: quiz.filter((q) => q.correct).length,
      orders: db.table('orders').length,
      points: users.reduce((n, u) => n + (u.points || 0), 0)
    },
    trend,
    recent,
    google: { enabled: google.enabled() },
    admins: auth.adminCount()
  };
});

on('GET', '/api/admin/users', (ctx) => {
  needAdmin(ctx.user);
  const q = String(ctx.query.q || '').trim().toLowerCase();
  let rows = db.table('users').map(adminUserRow);
  if (q) {
    rows = rows.filter((r) =>
      r.nickname.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return { total: db.table('users').length, rows };
});

on('PATCH', '/api/admin/users/:id', (ctx) => {
  const me = needAdmin(ctx.user);
  const user = db.table('users').find((u) => u.id === ctx.params.id);
  if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
  const b = ctx.body || {};

  if (b.points !== undefined) {
    const p = Math.round(Number(b.points));
    if (!Number.isFinite(p) || p < 0 || p > 1000000) bad('포인트는 0 이상 1,000,000 이하여야 합니다.');
    user.points = p;
  }
  if (b.nickname !== undefined) {
    const n = String(b.nickname).trim();
    if (n.length < 2 || n.length > 16) bad('이름은 2~16자로 입력해 주세요.');
    user.nickname = n;
  }
  db.save();
  return { ok: true, user: adminUserRow(user), by: me.nickname };
});

on('DELETE', '/api/admin/users/:id', (ctx) => {
  const me = needAdmin(ctx.user);
  const user = db.table('users').find((u) => u.id === ctx.params.id);
  if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
  if (user.id === me.id) throw new HttpError(400, '자기 계정은 여기서 지울 수 없습니다.');
  if (auth.isAdmin(user)) throw new HttpError(400, '다른 관리자 계정은 지울 수 없습니다.');

  const nickname = user.nickname;
  const removed = purgeUser(user.id);
  db.save();
  return { ok: true, nickname, removed };
});

on('GET', '/api/admin/reviews', (ctx) => {
  needAdmin(ctx.user);
  const users = db.table('users');
  return {
    rows: db.table('reviews')
      .slice()
      .sort((a, b) => b.at - a.at)
      .map((r) => {
        const u = users.find((x) => x.id === r.userId);
        const h = byId.get(r.heritageId);
        return {
          id: r.id, at: r.at, rating: r.rating, body: r.body,
          nickname: u ? u.nickname : '탈퇴한 사용자',
          avatarSeed: u ? u.avatarSeed : 0,
          heritageId: r.heritageId,
          heritageName: h ? h.name : r.heritageId
        };
      })
  };
});

on('DELETE', '/api/admin/reviews/:id', (ctx) => {
  needAdmin(ctx.user);
  const rows = db.table('reviews');
  const i = rows.findIndex((r) => r.id === ctx.params.id);
  if (i < 0) throw new HttpError(404, '후기를 찾을 수 없습니다.');
  const gone = rows[i];
  rows.splice(i, 1);
  db.save();
  return { ok: true, heritageId: gone.heritageId };
});

on('GET', '/api/admin/heritage', (ctx) => {
  needAdmin(ctx.user);
  const visits = db.table('visits');
  const reviews = db.table('reviews');
  const quiz = db.table('quizLogs');
  return {
    rows: HERITAGE.map((h) => {
      const vs = visits.filter((v) => v.heritageId === h.id);
      const rs = reviews.filter((r) => r.heritageId === h.id);
      const qs = quiz.filter((q) => q.heritageId === h.id);
      return {
        id: h.id, name: h.name, short: h.short, category: h.category,
        palette: h.palette, model: h.model,
        visitors: new Set(vs.map((v) => v.userId)).size,
        gps: vs.filter((v) => v.method === 'gps').length,
        reviews: rs.length,
        rating: rs.length ? Math.round((rs.reduce((n, r) => n + r.rating, 0) / rs.length) * 10) / 10 : 0,
        quizAccuracy: qs.length ? Math.round((qs.filter((q) => q.correct).length / qs.length) * 100) : null
      };
    }).sort((a, b) => b.visitors - a.visitors)
  };
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
