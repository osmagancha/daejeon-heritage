'use strict';

const crypto = require('crypto');
const db = require('./db');

const SESSION_DAYS = 30;

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
    createdAt: u.createdAt
  };
}

function validateEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  userFromToken,
  publicUser,
  validateEmail,
  SESSION_DAYS
};
