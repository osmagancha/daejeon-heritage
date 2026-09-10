'use strict';

/**
 * 구글 로그인 — ID 토큰 검증.
 *
 * 브라우저가 구글에서 받아 온 ID 토큰(JWT)을 서버가 직접 검증한다.
 * 구글 공개키(JWKS)를 받아 RS256 서명을 확인하므로 외부 라이브러리가 필요 없다.
 * 클라이언트 ID 는 server/config.json 또는 GOOGLE_CLIENT_ID 환경변수로 준다.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISS = ['accounts.google.com', 'https://accounts.google.com'];

/* ----------------------------------------------------------------- 설정 */

function readConfig() {
  if (process.env.GOOGLE_CLIENT_ID) return { clientId: process.env.GOOGLE_CLIENT_ID.trim() };
  const file = path.join(__dirname, 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cfg.googleClientId && !/^여기에/.test(cfg.googleClientId)) {
      return { clientId: String(cfg.googleClientId).trim() };
    }
  } catch { /* 설정이 없으면 구글 로그인만 꺼진다 */ }
  return { clientId: '' };
}

let config = readConfig();

/** 설정되어 있으면 클라이언트 ID, 아니면 빈 문자열 */
function clientId() { return config.clientId; }
function enabled() { return !!config.clientId; }
function reload() { config = readConfig(); return config.clientId; }

/* ------------------------------------------------------------- 공개키 캐시 */

let certs = { keys: {}, expiresAt: 0 };

async function getKey(kid) {
  if (certs.keys[kid] && certs.expiresAt > Date.now()) return certs.keys[kid];

  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('구글 공개키를 받지 못했습니다.');
  const body = await res.json();

  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  const keys = {};
  for (const jwk of body.keys || []) {
    try { keys[jwk.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' }); }
    catch { /* 알 수 없는 키 형식은 건너뛴다 */ }
  }
  certs = { keys, expiresAt: Date.now() + (maxAge ? Number(maxAge[1]) * 1000 : 3600e3) };

  if (!certs.keys[kid]) throw new Error('토큰에 맞는 구글 공개키가 없습니다.');
  return certs.keys[kid];
}

/* ------------------------------------------------------------- 토큰 검증 */

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * 구글 ID 토큰을 검증하고 사용자 정보를 돌려준다.
 * 실패하면 예외를 던진다.
 */
async function verify(credential) {
  if (!enabled()) throw new Error('구글 로그인이 설정되지 않았습니다.');
  if (typeof credential !== 'string' || credential.split('.').length !== 3) {
    throw new Error('토큰 형식이 올바르지 않습니다.');
  }
  const [h, p, sig] = credential.split('.');

  let header, payload;
  try {
    header = JSON.parse(b64(h).toString('utf8'));
    payload = JSON.parse(b64(p).toString('utf8'));
  } catch {
    throw new Error('토큰을 해석하지 못했습니다.');
  }
  if (header.alg !== 'RS256') throw new Error('지원하지 않는 서명 방식입니다.');

  const key = await getKey(header.kid);
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(h + '.' + p),
    { key, padding: crypto.constants.RSA_PKCS1_PADDING },
    b64(sig)
  );
  if (!ok) throw new Error('토큰 서명이 올바르지 않습니다.');

  const now = Math.floor(Date.now() / 1000);
  if (!VALID_ISS.includes(payload.iss)) throw new Error('발급자가 구글이 아닙니다.');
  if (payload.aud !== config.clientId) throw new Error('이 앱을 위한 토큰이 아닙니다.');
  if (!payload.exp || payload.exp < now - 60) throw new Error('만료된 토큰입니다.');
  if (payload.email && payload.email_verified === false) {
    throw new Error('이메일이 확인되지 않은 구글 계정입니다.');
  }
  if (!payload.sub) throw new Error('토큰에 사용자 식별자가 없습니다.');

  return {
    googleId: payload.sub,
    email: (payload.email || '').toLowerCase(),
    name: payload.name || payload.given_name || '',
    picture: payload.picture || ''
  };
}

module.exports = { verify, clientId, enabled, reload };
