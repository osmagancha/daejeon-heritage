'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SESSION_DAYS = 30;

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
  db.table('sessions').push({
    token,
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
  const i = rows.findIndex((s) => s.token === token);
  if (i >= 0) { rows.splice(i, 1); db.save(); }
}

function userFromToken(token) {
  if (!token) return null;
  const sessions = db.table('sessions');
  const s = sessions.find((x) => x.token === token);
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
    createdAt: u.createdAt
  };
}

function validateEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

module.exports = {
  isAdmin,
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
