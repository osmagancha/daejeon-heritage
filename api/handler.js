'use strict';

/**
 * Vercel 서버리스 함수 진입점.
 *
 * vercel.json 의 rewrite 가 /api/* 를 전부 이리로 보낸다.
 * 원래 경로는 쿼리(__p)로 함께 넘어온다 — rewrite 뒤에는 req.url 이
 * 목적지 주소로 바뀌어 있을 수 있어서, 경로를 추측하지 않고 받아 쓴다.
 * 실제 처리는 server/api.js 가 하고, 이 파일은 요청/응답 모양만 맞춘다.
 *
 * 서버리스는 인스턴스가 여러 개 뜰 수 있으므로 저장소는 반드시
 * DATABASE_URL(PostgreSQL)이어야 한다. server/db.js 가 요청마다 잠금을
 * 잡고 최신 상태를 읽어 쓰기 충돌을 막는다.
 */

const { serve, HttpError } = require('../server/api');
const db = require('../server/db');
const security = require('../server/security');

/** 인스턴스가 살아 있는 동안 한 번만 연다 */
let ready = null;
function open() {
  if (!ready) {
    ready = db.init().catch((e) => {
      ready = null;                     // 다음 요청에서 다시 시도
      throw e;
    });
  }
  return ready;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.end(body);
}

/** 프록시가 붙여 주는 주소 중 첫 번째가 진짜 요청자다 */
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

module.exports = async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) {
      throw new HttpError(503,
        '서버에 DATABASE_URL 이 설정되지 않았습니다. 배포 환경변수를 확인해 주세요.');
    }
    await open();

    const url = new URL(req.url, 'http://localhost');
    const forwarded = url.searchParams.get('__p');
    url.searchParams.delete('__p');
    const pathname = forwarded ? '/api/' + forwarded.replace(/^\/+/, '') : url.pathname;

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    // Vercel 은 JSON 본문을 미리 파싱해 주지만, 문자열로 올 때도 있다
    let body = req.body;
    if (typeof body === 'string') {
      try { body = security.safeParse(body || '{}'); } catch { body = {}; }
    } else if (body && typeof body === 'object') {
      // Vercel 이 미리 파싱해 준 경우에도 위험한 열쇠는 떨어뜨린다
      try { body = security.safeParse(JSON.stringify(body)); } catch { body = {}; }
    }

    const ip = clientIp(req);
    const ctx = {
      token,
      ua: req.headers['user-agent'] || '',
      ip,
      query: Object.fromEntries(url.searchParams),
      body: body || {}
    };

    // 인증 관련 요청은 훨씬 촘촘히 센다
    const isAuth = pathname.startsWith('/api/auth/');
    const limit = isAuth ? 60 : 240;   // 같은 주소를 여럿이 쓰는 경우(학교)를 감안한다
    const windowMs = isAuth ? 10 * 60 * 1000 : 60 * 1000;
    const wait = await db.runRequest(true, () =>
      security.tooMany((isAuth ? 'a:' : 'g:') + ip, limit, windowMs));
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpError(429, `요청이 너무 잦습니다. ${wait}초 뒤에 다시 시도해 주세요.`);
    }

    const result = await serve(req.method, pathname, ctx);
    send(res, 200, result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api]', err);
    send(res, status, { error: err.message || '서버 오류가 발생했습니다.' });
  }
};
