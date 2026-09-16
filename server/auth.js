'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const security = require('./security');

const SESSION_DAYS = 14;
const MAX_SESSIONS = 8;   // 한 계정이 동시에 들고 있을 수 있는 수

/**
 * 관리자 지정.
 *
 * 관리자 목록은 배포 환경변수(ADMIN_EMAILS)나 server/config.json 에서만 읽는다.
 * DB 에 두지 않는 이유는, DB 를 고칠 수 있는 경로가 생기면 스스로 관리자가
 * 되는 길이 열리기 때문이다. 서버를 다시 띄워야 목록이 바뀐다.
 */
const ADMIN_EMAILS = (() => {
  const parts = [];
  if (process.env.ADMIN_EMAILS) parts.push(process.env.ADMIN_EMAILS);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    if (Array.isArray(cfg.adminEmails)) parts.push(cfg.adminEmails.join(','));
  } catch { /* 설정이 없으면 관리자도 없다 */ }
  return new Set(
    parts.join(',').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
  );
})();

/**
 * 정지된 계정인지. 기간이 지나면 저절로 풀린다.
 * 풀린 경우 기록을 지워 두어 다음부터는 검사가 짧게 끝난다.
 */
function suspension(user) {
  const sus = user && user.suspended;
  if (!sus) return null;
  if (sus.until && sus.until < Date.now()) {
    delete user.suspended;
    db.save();
    return null;
  }
  return sus;
}

function isAdmin(user) {
  return !!(user && user.email && ADMIN_EMAILS.has(String(user.email).toLowerCase()));
}

function adminCount() { return ADMIN_EMAILS.size; }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expected) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(userId, ua = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const rows = db.table('sessions');

  // 만료된 것은 이 참에 치운다
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].expiresAt < now) rows.splice(i, 1);

  // 한 계정이 너무 많은 세션을 들고 있지 않게 오래된 것부터 버린다
  const mine = rows.filter((s) => s.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  while (mine.length >= MAX_SESSIONS) {
    const oldest = mine.shift();
    const i = rows.indexOf(oldest);
    if (i >= 0) rows.splice(i, 1);
  }

  // 원문이 아니라 해시를 저장한다 (저장소가 새어도 그대로 쓸 수 없게)
  rows.push({
    hash: security.hashToken(token),
    userId,
    createdAt: now,
    expiresAt: now + SESSION_DAYS * 864e5,
    ua: String(ua).slice(0, 160)
  });
  db.save();
  return token;
}

function destroySession(token) {
  const rows = db.table('sessions');
  const hash = security.hashToken(token);
  const i = rows.findIndex((s) => s.hash === hash || s.token === token);
  if (i >= 0) { rows.splice(i, 1); db.save(); }
}

function userFromToken(token) {
  if (!token) return null;
  const sessions = db.table('sessions');
  const hash = security.hashToken(token);
  // 예전에 원문으로 저장된 세션도 당분간 받아 준다
  const s = sessions.find((x) => x.hash === hash || x.token === token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.splice(sessions.indexOf(s), 1);
    db.save();
    return null;
  }
  return db.table('users').find((u) => u.id === s.userId) || null;
}

/** 비밀번호/솔트를 제거한 공개 사용자 객체 */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    points: u.points || 0,
    avatarSeed: u.avatarSeed,
    bio: u.bio || '',
    picture: u.picture || '',
    provider: u.googleId ? 'google' : 'email',
    isAdmin: isAdmin(u),
    suspended: suspension(u) || null,
    createdAt: u.createdAt
  };
}

function validateEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

module.exports = {
  isAdmin,
  suspension,
  adminCount,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  userFromToken,
  publicUser,
  validateEmail,
  SESSION_DAYS
};
