'use strict';

const db = require('./db');
const auth = require('./auth');
const google = require('./google');
const avatar = require('./avatar');
const battle = require('./battle');
const security = require('./security');
const { HERITAGE, COURSES, BADGES } = require('./seed/heritage');
const { GOODS, CITY_INTRO, CITY_FEATURES, NOTICES } = require('./seed/city');

const CHECKIN_RADIUS_M = 800;   // 이 반경 안이면 GPS 인증 방문
const QUIZ_POINTS = 30;
const REVIEW_POINTS = 20;

const byId = new Map(HERITAGE.map((h) => [h.id, h]));

/** 같은 이름을 쓰는 다른 사람이 있는지. 사칭을 막기 위한 검사다. */
function nicknameTaken(nickname, exceptId) {
  const key = security.nicknameKey(nickname);
  return db.table('users').some((u) => u.id !== exceptId && security.nicknameKey(u.nickname) === key);
}

/** 관리자가 한 일을 남긴다 */
function auditLog(by, action, target, detail) {
  const rows = db.table('adminLogs');
  rows.push({ id: db.id('al_'), at: Date.now(), by, action, target: target || '', detail: detail || '' });
  if (rows.length > 500) rows.splice(0, rows.length - 500);
}
const goodsById = new Map(GOODS.map((g) => [g.id, g]));

/* ------------------------------------------------------------------ utils */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new HttpError(400, msg); };
const needAuth = (user) => {
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  const sus = auth.suspension(user);
  if (sus) {
    const until = sus.until ? new Date(sus.until).toLocaleString('ko-KR') + ' 까지' : '해제될 때까지';
    throw new HttpError(403, `이용이 정지된 계정입니다 (${until}). 사유: ${sus.reason || '기재 없음'}`);
  }
  return user;
};

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
  const clean = security.cleanNickname(nickname);
  if (clean.length < 2 || clean.length > 16) bad('닉네임은 2~16자로 입력해 주세요.');

  const wait = security.tooMany('reg:' + (ctx.ip || '?'), 20, 10 * 60 * 1000);
  if (wait) throw new HttpError(429, `가입 시도가 너무 잦습니다. ${wait}초 뒤에 다시 시도해 주세요.`);

  const pwProblem = security.passwordProblem(password, mail, clean);
  if (pwProblem) bad(pwProblem);

  if (db.table('users').some((u) => u.email === mail)) throw new HttpError(409, '이미 가입된 이메일입니다.');
  if (nicknameTaken(clean)) throw new HttpError(409, '이미 쓰고 있는 이름입니다. 다른 이름을 골라 주세요.');

  const { salt, hash } = auth.hashPassword(password);
  const user = {
    id: db.id('u_'),
    email: mail,
    nickname: clean,
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
  // 잠금 확인과 실패 집계는 serve() 가 이미 마쳤다
  const user = db.table('users').find((u) => u.email === mail);
  // 계정이 있는지, 구글 가입인지 알려 주지 않는다 (계정 캐내기 방지)
  const ok = user && user.passwordHash &&
    auth.verifyPassword(String(password || ''), user.salt, user.passwordHash);

  if (!ok) throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
  (ctx.loginKeys || []).forEach((k) => security.loginOk(k));
  const sus = auth.suspension(user);
  if (sus) {
    const until = sus.until ? new Date(sus.until).toLocaleString('ko-KR') + ' 까지' : '해제될 때까지';
    throw new HttpError(403, `이용이 정지된 계정입니다 (${until}). 사유: ${sus.reason || '기재 없음'}`);
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
    const sus = auth.suspension(user);
    if (sus) {
      const until = sus.until ? new Date(sus.until).toLocaleString('ko-KR') + ' 까지' : '해제될 때까지';
      throw new HttpError(403, `이용이 정지된 계정입니다 (${until}). 사유: ${sus.reason || '기재 없음'}`);
    }
    user.googleId = profile.googleId;
    if (profile.picture) user.picture = profile.picture;
  } else {
    let base = security.cleanNickname(profile.name || (profile.email || '').split('@')[0] || '여행자').slice(0, 16);
    if (base.length < 2) base = '여행자';
    // 이름이 겹치면 뒤에 숫자를 붙인다
    let candidate = base;
    for (let n = 2; nicknameTaken(candidate); n++) candidate = base.slice(0, 14) + n;
    user = {
      id: db.id('u_'),
      email: profile.email,
      nickname: candidate,
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
    const n = security.cleanNickname(nickname);
    if (n.length < 2 || n.length > 16) bad('닉네임은 2~16자로 입력해 주세요.');
    if (nicknameTaken(n, user.id)) throw new HttpError(409, '이미 쓰고 있는 이름입니다.');
    user.nickname = n;
  }
  if (bio !== undefined) user.bio = String(bio).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 140);
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
  const text = String(body || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
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

/* --- 겨루기 --- */

const DAILY_BATTLES = 15;
const WIN_POINTS = 80;
const LOSE_POINTS = 15;
const NPC_WIN_POINTS = 30;
const NPC_LOSE_POINTS = 5;
const GEM_PER_STREAK = 3;        // 몇 연승마다 옥 하나
const RESET_STAT_POINTS = 3000;
const RESET_STAT_GEMS = 5;
const CHARM_GEMS = 3;            // 강화 부적 한 장
const EXTRA_BATTLE_GEMS = 2;     // 대전 5회 추가

function blankBattle() {
  return {
    stats: { str: 0, agi: 0, vit: 0, spi: 0 },
    weapon: 'mokgeom', plus: 0, owned: ['mokgeom'],
    rating: battle.BASE_RATING, wins: 0, losses: 0, draws: 0,
    streak: 0, bestStreak: 0, day: null, count: 0, extra: 0, charms: 0
  };
}

/** 사용자에게 붙은 겨루기 자료를 꺼낸다. 없으면 만들어 준다. */
function battleOf(user) {
  if (!user.battle) { user.battle = blankBattle(); db.save(); }
  const b = user.battle;
  if (!b.owned || !b.owned.length) b.owned = ['mokgeom'];
  if (b.gems !== undefined) delete b.gems;
  if (user.gems == null) user.gems = 0;
  const today = todayKey(Date.now());
  if (b.day !== today) { b.day = today; b.count = 0; b.extra = 0; }
  return b;
}

const battleLimit = (b) => DAILY_BATTLES + (b.extra || 0);

function levelOf(user) {
  return avatar.stageOf(user.points || 0).level;
}

/** 나 자신을 전투 수치로 */
function meCombatant(user) {
  const b = battleOf(user);
  return battle.combatant(user.nickname, levelOf(user), b.stats, b.weapon, b.plus);
}

function battleProfile(user) {
  const b = battleOf(user);
  const level = levelOf(user);
  const c = meCombatant(user);
  const total = battle.totalStatPoints(level);
  const spent = battle.spentPoints(b.stats);
  const games = b.wins + b.losses + b.draws;

  return {
    nickname: user.nickname,
    avatarSeed: user.avatarSeed,
    level,
    points: user.points || 0,
    gems: user.gems || 0,
    stats: b.stats,
    statPoints: { total, spent, left: Math.max(0, total - spent), perLevel: battle.POINTS_PER_LEVEL },
    statDefs: battle.STATS,
    base: battle.BASE_STATS,
    combat: c,
    power: battle.power(c),
    weapon: { ...battle.weaponOf(b.weapon), plus: b.plus },
    owned: b.owned,
    charms: b.charms || 0,
    enhance: {
      max: battle.MAX_ENHANCE,
      cost: b.plus >= battle.MAX_ENHANCE ? null : battle.enhanceCost(battle.weaponOf(b.weapon), b.plus),
      rate: b.plus >= battle.MAX_ENHANCE ? null : battle.enhanceRate(b.plus),
      dropFrom: battle.ENHANCE_DROP_FROM
    },
    record: {
      rating: b.rating, wins: b.wins, losses: b.losses, draws: b.draws,
      games, winRate: games ? Math.round((b.wins / games) * 100) : 0,
      streak: b.streak, bestStreak: b.bestStreak,
      title: battle.titleOf(b.rating)
    },
    today: { used: b.count, limit: battleLimit(b), left: Math.max(0, battleLimit(b) - b.count) }
  };
}

on('GET', '/api/battle/me', (ctx) => battleProfile(needAuth(ctx.user)));

/** 스탯은 더하기만 된다. 되돌리려면 초기화를 써야 한다. */
on('POST', '/api/battle/stats', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const add = (ctx.body || {}).add || {};
  const level = levelOf(user);

  let asked = 0;
  for (const st of battle.STATS) {
    const v = Math.floor(Number(add[st.key]) || 0);
    if (v < 0) bad('스탯은 빼서 넣을 수 없습니다. 초기화를 이용해 주세요.');
    asked += v;
  }
  if (!asked) bad('올릴 스탯을 골라 주세요.');

  const left = battle.totalStatPoints(level) - battle.spentPoints(b.stats);
  if (asked > left) throw new HttpError(400, `남은 스탯 점수가 ${left}점뿐입니다.`);

  for (const st of battle.STATS) {
    b.stats[st.key] = (b.stats[st.key] || 0) + (Math.floor(Number(add[st.key]) || 0));
  }
  db.save();
  return battleProfile(user);
});

on('POST', '/api/battle/stats/reset', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  if (!battle.spentPoints(b.stats)) bad('아직 올린 스탯이 없습니다.');

  const useGems = !!(ctx.body || {}).gems;
  if (useGems) {
    if ((user.gems || 0) < RESET_STAT_GEMS) throw new HttpError(402, `옥이 ${RESET_STAT_GEMS - (user.gems || 0)}개 부족합니다.`);
    user.gems -= RESET_STAT_GEMS;
  } else {
    if ((user.points || 0) < RESET_STAT_POINTS) throw new HttpError(402, `포인트가 ${RESET_STAT_POINTS - (user.points || 0)}P 부족합니다.`);
    user.points -= RESET_STAT_POINTS;
  }
  b.stats = { str: 0, agi: 0, vit: 0, spi: 0 };
  db.save();
  return battleProfile(user);
});

/* --- 무기 상점과 대장간 --- */

on('GET', '/api/battle/shop', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const level = levelOf(user);
  return {
    points: user.points || 0,
    gems: user.gems || 0,
    equipped: b.weapon,
    rows: battle.WEAPONS.map((w) => ({
      ...w,
      owned: b.owned.includes(w.key),
      canLevel: level >= w.level,
      canAfford: (user.points || 0) >= w.price
    }))
  };
});

on('POST', '/api/battle/buy', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const w = battle.WEAPONS.find((x) => x.key === (ctx.body || {}).key);
  if (!w) bad('알 수 없는 무기입니다.');
  if (b.owned.includes(w.key)) throw new HttpError(409, '이미 가지고 있습니다.');
  if (levelOf(user) < w.level) throw new HttpError(400, `${w.level}단계부터 살 수 있습니다.`);
  if ((user.points || 0) < w.price) throw new HttpError(402, `포인트가 ${(w.price - (user.points || 0)).toLocaleString()}P 부족합니다.`);

  user.points -= w.price;
  b.owned.push(w.key);
  db.save();
  return { ok: true, bought: w.name, profile: battleProfile(user) };
});

on('POST', '/api/battle/equip', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const key = (ctx.body || {}).key;
  if (!b.owned.includes(key)) throw new HttpError(400, '가지고 있지 않은 무기입니다.');
  if (key !== b.weapon) { b.weapon = key; b.plus = 0; }   // 무기를 바꾸면 강화는 그 무기 기준으로 다시
  db.save();
  return battleProfile(user);
});

on('POST', '/api/battle/enhance', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const w = battle.weaponOf(b.weapon);
  if (b.plus >= battle.MAX_ENHANCE) throw new HttpError(409, '더는 강화할 수 없습니다.');

  const cost = battle.enhanceCost(w, b.plus);
  if ((user.points || 0) < cost) throw new HttpError(402, `포인트가 ${(cost - (user.points || 0)).toLocaleString()}P 부족합니다.`);

  const useCharm = !!(ctx.body || {}).charm;
  if (useCharm && (b.charms || 0) < 1) throw new HttpError(400, '부적이 없습니다.');

  user.points -= cost;
  let rate = battle.enhanceRate(b.plus);
  if (useCharm) { b.charms -= 1; rate = Math.min(0.99, rate + 0.15); }

  const before = b.plus;
  const ok = Math.random() < rate;
  let dropped = false;
  if (ok) b.plus += 1;
  else if (before >= battle.ENHANCE_DROP_FROM) { b.plus = before - 1; dropped = true; }

  db.save();
  return {
    ok, dropped, before, after: b.plus, cost,
    rate: Math.round(rate * 1000) / 10,
    profile: battleProfile(user)
  };
});

/* --- 상대 고르기와 겨루기 --- */

function opponentRow(u, me) {
  const b = battleOf(u);
  const c = battle.combatant(u.nickname, levelOf(u), b.stats, b.weapon, b.plus);
  return {
    id: u.id, nickname: u.nickname, avatarSeed: u.avatarSeed,
    level: levelOf(u), rating: b.rating, power: battle.power(c),
    weapon: battle.weaponOf(b.weapon).name, plus: b.plus,
    title: battle.titleOf(b.rating).name,
    friend: isFriend(me.id, u.id)
  };
}

function isFriend(x, y) {
  const [a, c] = x < y ? [x, y] : [y, x];
  return db.table('friends').some((f) => f.a === a && f.b === c);
}

on('GET', '/api/battle/opponents', (ctx) => {
  const user = needAuth(ctx.user);
  const mine = battleOf(user);
  const others = db.table('users').filter((u) => u.id !== user.id);

  // 등급이 가까운 순으로 고른다. 친구는 따로 모아 준다.
  const rows = others.map((u) => opponentRow(u, user))
    .sort((a, b2) => Math.abs(a.rating - mine.rating) - Math.abs(b2.rating - mine.rating));

  return {
    players: rows.slice(0, 20),
    friends: rows.filter((r) => r.friend),
    npcs: battle.NPCS.map((n) => {
      const c = battle.combatant(n.name, n.level, n.stats, n.weapon, n.plus);
      return { id: n.id, name: n.name, emoji: n.emoji, line: n.line, level: n.level, power: battle.power(c) };
    }),
    today: { used: mine.count, limit: battleLimit(mine), left: Math.max(0, battleLimit(mine) - mine.count) }
  };
});

on('POST', '/api/battle/challenge', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const targetId = String((ctx.body || {}).target || '');

  if (b.count >= battleLimit(b)) {
    throw new HttpError(429, '오늘 겨룰 수 있는 횟수를 다 썼습니다. 내일 다시 오세요.');
  }

  const me = meCombatant(user);
  const npc = battle.npcById(targetId);
  let foe, foeUser = null;

  if (npc) {
    foe = battle.combatant(npc.name, npc.level, npc.stats, npc.weapon, npc.plus);
  } else {
    foeUser = db.table('users').find((u) => u.id === targetId);
    if (!foeUser) bad('상대를 찾을 수 없습니다.');
    if (foeUser.id === user.id) bad('자기 자신과는 겨룰 수 없습니다.');
    const fb = battleOf(foeUser);
    foe = battle.combatant(foeUser.nickname, levelOf(foeUser), fb.stats, fb.weapon, fb.plus);
  }

  const seed = user.id + ':' + targetId + ':' + Date.now();
  const result = battle.fight(me, foe, seed);
  const iWon = result.winner === 'a';
  const isDraw = result.winner === 'draw';

  b.count += 1;
  let earned = 0;
  let delta = 0;
  let gemGained = 0;

  if (npc) {
    earned = iWon ? NPC_WIN_POINTS : NPC_LOSE_POINTS;
  } else {
    const fb = battleOf(foeUser);
    delta = battle.ratingDelta(b.rating, fb.rating, isDraw ? 'draw' : (iWon ? 'win' : 'lose'));
    b.rating = Math.max(100, b.rating + delta);
    fb.rating = Math.max(100, fb.rating - delta);
    earned = iWon ? WIN_POINTS : (isDraw ? 30 : LOSE_POINTS);

    if (iWon) { fb.losses += 1; fb.streak = 0; }
    else if (isDraw) fb.draws += 1;
    else { fb.wins += 1; fb.streak += 1; fb.bestStreak = Math.max(fb.bestStreak, fb.streak); }
  }

  if (iWon) {
    b.wins += 1;
    b.streak += 1;
    b.bestStreak = Math.max(b.bestStreak, b.streak);
    if (!npc && b.streak % GEM_PER_STREAK === 0) { user.gems = (user.gems || 0) + 1; gemGained = 1; }
  } else if (isDraw) {
    b.draws += 1;
  } else {
    b.losses += 1;
    b.streak = 0;
  }

  addPoints(user, earned);

  const record = {
    id: db.id('bt_'), aId: user.id, bId: npc ? null : foeUser.id,
    bName: npc ? npc.name : foeUser.nickname, npc: !!npc,
    winner: result.winner, delta, earned, at: Date.now()
  };
  db.table('battles').push(record);
  // 기록이 끝없이 쌓이지 않게 최근 것만 남긴다
  const all = db.table('battles');
  if (all.length > 800) all.splice(0, all.length - 800);
  db.save();

  return {
    me: { name: me.name, hp: me.hp, power: battle.power(me), combat: me },
    foe: { name: foe.name, hp: foe.hp, power: battle.power(foe), combat: foe, npc: !!npc, emoji: npc ? npc.emoji : null },
    result: { winner: result.winner, hpA: result.hpA, hpB: result.hpB },
    log: result.log,
    reward: { points: earned, rating: delta, gems: gemGained, streak: b.streak },
    profile: battleProfile(user)
  };
});

on('GET', '/api/battle/history', (ctx) => {
  const user = needAuth(ctx.user);
  return {
    rows: db.table('battles')
      .filter((x) => x.aId === user.id || x.bId === user.id)
      .sort((a, b2) => b2.at - a.at).slice(0, 30)
      .map((x) => {
        const mine = x.aId === user.id;
        const won = mine ? x.winner === 'a' : x.winner === 'b';
        const other = mine ? x.bName : (db.table('users').find((u) => u.id === x.aId) || {}).nickname || '탈퇴한 사용자';
        return {
          id: x.id, at: x.at, opponent: other, npc: x.npc,
          result: x.winner === 'draw' ? 'draw' : (won ? 'win' : 'lose'),
          delta: mine ? x.delta : -x.delta,
          earned: mine ? x.earned : 0
        };
      })
  };
});

on('GET', '/api/battle/ranking', (ctx) => {
  const rows = db.table('users')
    .filter((u) => u.battle && (u.battle.wins || u.battle.losses || u.battle.draws))
    .map((u) => {
      const b = u.battle;
      const c = battle.combatant(u.nickname, levelOf(u), b.stats, b.weapon, b.plus);
      const games = b.wins + b.losses + b.draws;
      return {
        nickname: u.nickname, avatarSeed: u.avatarSeed,
        rating: b.rating, title: battle.titleOf(b.rating).name,
        wins: b.wins, losses: b.losses, draws: b.draws,
        winRate: games ? Math.round((b.wins / games) * 100) : 0,
        bestStreak: b.bestStreak, power: battle.power(c),
        weapon: battle.weaponOf(b.weapon).name, plus: b.plus,
        isMe: !!(ctx.user && ctx.user.id === u.id)
      };
    })
    .sort((a, b2) => b2.rating - a.rating || b2.wins - a.wins);

  rows.forEach((r, i) => { r.rank = i + 1; });
  const me = ctx.user ? rows.find((r) => r.isMe) : null;
  return { total: rows.length, rows: rows.slice(0, 50), me: me || null };
});

/* --- 옥 (유료 재화) --- */

const GEM_USES = [
  { key: 'charm',  name: '강화 부적', gems: CHARM_GEMS,        desc: '다음 강화 성공률이 15% 오릅니다.' },
  { key: 'extra',  name: '겨루기 5회', gems: EXTRA_BATTLE_GEMS, desc: '오늘 겨룰 수 있는 횟수를 5회 늘립니다.' },
  { key: 'respec', name: '스탯 초기화', gems: RESET_STAT_GEMS,  desc: '올린 스탯을 모두 되돌립니다.' }
];

/** 옥은 지금 겨루기로만 얻는다. 결제는 아직 열려 있지 않다. */
const GEM_PLANS = [
  { key: 'p10',  gems: 10,  won: 1100,  bonus: 0 },
  { key: 'p30',  gems: 30,  won: 3300,  bonus: 3 },
  { key: 'p60',  gems: 60,  won: 6600,  bonus: 9 },
  { key: 'p120', gems: 120, won: 12000, bonus: 24 }
];

on('GET', '/api/shop/gems', (ctx) => {
  const user = needAuth(ctx.user);
  battleOf(user);
  return {
    gems: user.gems || 0,
    uses: GEM_USES,
    plans: GEM_PLANS,
    purchasable: false,
    notice: '옥은 지금 겨루기 3연승마다 하나씩 드립니다. 결제로 사는 기능은 아직 열려 있지 않습니다.'
  };
});

on('POST', '/api/shop/gems/use', (ctx) => {
  const user = needAuth(ctx.user);
  const b = battleOf(user);
  const use = GEM_USES.find((u) => u.key === (ctx.body || {}).key);
  if (!use) bad('알 수 없는 항목입니다.');
  if ((user.gems || 0) < use.gems) throw new HttpError(402, `옥이 ${use.gems - (user.gems || 0)}개 부족합니다.`);

  if (use.key === 'charm') b.charms = (b.charms || 0) + 1;
  else if (use.key === 'extra') b.extra = (b.extra || 0) + 5;
  else if (use.key === 'respec') b.stats = { str: 0, agi: 0, vit: 0, spi: 0 };

  user.gems -= use.gems;
  db.save();
  return { ok: true, used: use.name, profile: battleProfile(user) };
});

on('POST', '/api/shop/gems/buy', () => {
  // 실제 결제는 사업자 등록과 결제대행사 계약이 있어야 붙일 수 있다.
  // 여기에 그 연동을 끼우면 된다. 지금은 분명히 막아 둔다.
  throw new HttpError(501, '옥을 결제로 사는 기능은 아직 열려 있지 않습니다. 겨루기로 모아 주세요.');
});

/* --- 친구 --- */

function friendPair(x, y) { return x < y ? [x, y] : [y, x]; }

on('GET', '/api/friends', (ctx) => {
  const user = needAuth(ctx.user);
  const users = db.table('users');
  const byId = (id) => users.find((u) => u.id === id);

  const list = db.table('friends')
    .filter((f) => f.a === user.id || f.b === user.id)
    .map((f) => byId(f.a === user.id ? f.b : f.a))
    .filter(Boolean)
    .map((u) => {
      const b = battleOf(u);
      return {
        id: u.id, nickname: u.nickname, avatarSeed: u.avatarSeed,
        level: levelOf(u), points: u.points || 0,
        rating: b.rating, title: battle.titleOf(b.rating).name,
        stamps: new Set(db.table('visits').filter((v) => v.userId === u.id).map((v) => v.heritageId)).size
      };
    })
    .sort((a, b2) => b2.rating - a.rating);

  const reqs = db.table('friendReqs');
  return {
    friends: list,
    incoming: reqs.filter((r) => r.to === user.id).map((r) => {
      const u = byId(r.from);
      return { id: r.id, at: r.at, nickname: u ? u.nickname : '탈퇴한 사용자', avatarSeed: u ? u.avatarSeed : 0 };
    }),
    outgoing: reqs.filter((r) => r.from === user.id).map((r) => {
      const u = byId(r.to);
      return { id: r.id, at: r.at, nickname: u ? u.nickname : '탈퇴한 사용자' };
    })
  };
});

on('POST', '/api/friends/request', (ctx) => {
  const user = needAuth(ctx.user);
  const nickname = String((ctx.body || {}).nickname || '').trim();
  if (!nickname) bad('상대의 이름을 적어 주세요.');

  const target = db.table('users').find((u) => u.nickname === nickname);
  if (!target) throw new HttpError(404, `'${nickname}' 님을 찾지 못했습니다. 이름이 정확한지 확인해 주세요.`);
  if (target.id === user.id) bad('자기 자신에게는 보낼 수 없습니다.');
  if (isFriend(user.id, target.id)) throw new HttpError(409, '이미 친구입니다.');

  const reqs = db.table('friendReqs');
  if (reqs.some((r) => r.from === user.id && r.to === target.id)) {
    throw new HttpError(409, '이미 보낸 신청이 있습니다.');
  }
  // 상대가 먼저 보냈다면 바로 친구가 된다
  const mirror = reqs.find((r) => r.from === target.id && r.to === user.id);
  if (mirror) {
    reqs.splice(reqs.indexOf(mirror), 1);
    const [a, b2] = friendPair(user.id, target.id);
    db.table('friends').push({ a, b: b2, at: Date.now() });
    db.save();
    return { ok: true, becameFriends: true, nickname: target.nickname };
  }

  reqs.push({ id: db.id('fr_'), from: user.id, to: target.id, at: Date.now() });
  db.save();
  return { ok: true, becameFriends: false, nickname: target.nickname };
});

on('POST', '/api/friends/respond', (ctx) => {
  const user = needAuth(ctx.user);
  const { id, accept } = ctx.body || {};
  const reqs = db.table('friendReqs');
  const i = reqs.findIndex((r) => r.id === id && r.to === user.id);
  if (i < 0) throw new HttpError(404, '신청을 찾을 수 없습니다.');

  const req = reqs[i];
  reqs.splice(i, 1);
  if (accept) {
    const [a, b2] = friendPair(req.from, user.id);
    if (!isFriend(a, b2)) db.table('friends').push({ a, b: b2, at: Date.now() });
  }
  db.save();
  return { ok: true, accepted: !!accept };
});

on('DELETE', '/api/friends/:userId', (ctx) => {
  const user = needAuth(ctx.user);
  const [a, b2] = friendPair(user.id, ctx.params.userId);
  const rows = db.table('friends');
  const i = rows.findIndex((f) => f.a === a && f.b === b2);
  if (i < 0) throw new HttpError(404, '친구가 아닙니다.');
  rows.splice(i, 1);
  db.save();
  return { ok: true };
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
  // 친구 관계와 신청은 짝으로 남으므로 따로 지운다
  for (const [name, hit] of [
    ['friends', (r) => r.a === userId || r.b === userId],
    ['friendReqs', (r) => r.from === userId || r.to === userId],
    ['battles', (r) => r.aId === userId || r.bId === userId]
  ]) {
    const rows = db.table(name);
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) if (hit(rows[i])) rows.splice(i, 1);
    removed[name] = before - rows.length;
  }

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
    lastAt: visits.length ? Math.max(...visits.map((v) => v.at)) : 0,
    gems: u.gems || 0,
    suspended: auth.suspension(u) || null,
    battle: u.battle ? {
      rating: u.battle.rating,
      weapon: battle.weaponOf(u.battle.weapon).name,
      weaponKey: u.battle.weapon,
      plus: u.battle.plus,
      wins: u.battle.wins, losses: u.battle.losses, draws: u.battle.draws,
      todayCount: u.battle.count || 0,
      statsSpent: battle.spentPoints(u.battle.stats)
    } : null,
    weapons: battle.WEAPONS.map((w) => ({ key: w.key, name: w.name }))
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
  const changed = [];

  const numField = (key, min, max, label, apply) => {
    if (b[key] === undefined) return;
    const v = Math.round(Number(b[key]));
    if (!Number.isFinite(v) || v < min || v > max) {
      bad(`${label}은(는) ${min.toLocaleString()} 이상 ${max.toLocaleString()} 이하여야 합니다.`);
    }
    apply(v);
    changed.push(`${label} ${v.toLocaleString()}`);
  };

  numField('points', 0, 10000000, '포인트', (v) => { user.points = v; });
  numField('gems', 0, 100000, '옥', (v) => { user.gems = v; });

  if (b.nickname !== undefined) {
    const n = security.cleanNickname(b.nickname);
    if (n.length < 2 || n.length > 16) bad('이름은 2~16자로 입력해 주세요.');
    if (nicknameTaken(n, user.id)) throw new HttpError(409, '이미 쓰고 있는 이름입니다.');
    user.nickname = n;
    changed.push(`이름 ${n}`);
  }

  // 겨루기 쪽 값들
  const hasBattleField = ['rating', 'plus', 'weapon', 'resetStats', 'resetRecord', 'resetToday']
    .some((k) => b[k] !== undefined);
  if (hasBattleField) {
    if (!user.battle) user.battle = blankBattle();
    const bt = user.battle;

    numField('rating', 100, 5000, '등급', (v) => { bt.rating = v; });
    numField('plus', 0, battle.MAX_ENHANCE, '강화 단계', (v) => { bt.plus = v; });

    if (b.weapon !== undefined) {
      const w = battle.WEAPONS.find((x) => x.key === b.weapon);
      if (!w) bad('알 수 없는 무기입니다.');
      bt.weapon = w.key;
      if (!bt.owned.includes(w.key)) bt.owned.push(w.key);
      changed.push(`무기 ${w.name}`);
    }
    if (b.resetStats) { bt.stats = { str: 0, agi: 0, vit: 0, spi: 0 }; changed.push('스탯 초기화'); }
    if (b.resetRecord) {
      bt.wins = bt.losses = bt.draws = bt.streak = bt.bestStreak = 0;
      bt.rating = battle.BASE_RATING;
      changed.push('전적 초기화');
    }
    if (b.resetToday) { bt.count = 0; changed.push('오늘 횟수 초기화'); }
  }

  if (!changed.length) bad('바꿀 내용이 없습니다.');
  auditLog(me.nickname, '계정 수정', user.nickname, changed.join(', '));
  db.save();
  return { ok: true, user: adminUserRow(user), changed, by: me.nickname };
});

/** 계정 정지 — 기간을 두거나 무기한으로 */
on('POST', '/api/admin/users/:id/suspend', (ctx) => {
  const me = needAdmin(ctx.user);
  const user = db.table('users').find((u) => u.id === ctx.params.id);
  if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
  if (user.id === me.id) bad('자기 계정은 정지할 수 없습니다.');
  if (auth.isAdmin(user)) bad('다른 관리자 계정은 정지할 수 없습니다.');

  const b = ctx.body || {};
  const days = b.days === null || b.days === undefined ? null : Number(b.days);
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) {
    bad('정지 기간은 1일 이상 3650일 이하로 정해 주세요.');
  }
  const reason = String(b.reason || '').trim().slice(0, 200);

  user.suspended = {
    at: Date.now(),
    until: days === null ? null : Date.now() + days * 864e5,
    reason,
    by: me.nickname
  };
  // 정지하면 로그인 상태도 끊는다
  const sessions = db.table('sessions');
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].userId === user.id) sessions.splice(i, 1);
  }
  auditLog(me.nickname, '이용 정지', user.nickname,
    (days === null ? '무기한' : days + '일') + (reason ? ' · ' + reason : ''));
  db.save();
  return { ok: true, nickname: user.nickname, suspended: user.suspended };
});

on('POST', '/api/admin/users/:id/unsuspend', (ctx) => {
  needAdmin(ctx.user);
  const user = db.table('users').find((u) => u.id === ctx.params.id);
  if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
  if (!user.suspended) throw new HttpError(409, '정지 상태가 아닙니다.');
  delete user.suspended;
  db.save();
  return { ok: true, nickname: user.nickname };
});

/** 잘못 찍힌 스탬프 하나를 되돌린다 */
on('DELETE', '/api/admin/users/:id/visits/:heritageId', (ctx) => {
  needAdmin(ctx.user);
  const rows = db.table('visits');
  const i = rows.findIndex((v) => v.userId === ctx.params.id && v.heritageId === ctx.params.heritageId);
  if (i < 0) throw new HttpError(404, '그 방문 기록이 없습니다.');
  rows.splice(i, 1);
  db.save();
  return { ok: true };
});

/** 한 사람의 스탬프 목록 (관리 화면에서 하나씩 지울 수 있게) */
on('GET', '/api/admin/users/:id/visits', (ctx) => {
  needAdmin(ctx.user);
  return {
    rows: db.table('visits')
      .filter((v) => v.userId === ctx.params.id)
      .sort((a, b) => b.at - a.at)
      .map((v) => {
        const h = byId.get(v.heritageId);
        return { heritageId: v.heritageId, name: h ? h.name : v.heritageId, at: v.at, method: v.method };
      })
  };
});

on('DELETE', '/api/admin/users/:id', (ctx) => {
  const me = needAdmin(ctx.user);
  const user = db.table('users').find((u) => u.id === ctx.params.id);
  if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
  if (user.id === me.id) throw new HttpError(400, '자기 계정은 여기서 지울 수 없습니다.');
  if (auth.isAdmin(user)) throw new HttpError(400, '다른 관리자 계정은 지울 수 없습니다.');

  const nickname = user.nickname;
  const removed = purgeUser(user.id);
  auditLog(me.nickname, '계정 삭제', nickname, '');
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
async function serve(method, pathname, ctx) {
  // 로그인 실패는 예외를 던지고, 예외가 나면 그 요청의 변경은 통째로 되돌아간다.
  // 실패 횟수는 그래도 남아야 하므로 본 처리에 들어가기 전에 따로 확정해 둔다.
  if (method === 'POST' && pathname === '/api/auth/login') {
    const keys = [
      String((ctx.body || {}).email || '').trim().toLowerCase(),
      'ip:' + (ctx.ip || '?')
    ];
    const locked = await db.runRequest(true, () => {
      for (const k of keys) {
        const left = security.loginLocked(k);
        if (left) return left;
      }
      keys.forEach((k) => security.loginFailed(k));   // 일단 실패로 세어 두고
      return 0;
    });
    if (locked) {
      throw new HttpError(429, `로그인 시도가 너무 많습니다. ${locked}초 뒤에 다시 시도해 주세요.`);
    }
    ctx.loginKeys = keys;                              // 성공하면 아래에서 지운다
  }

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
