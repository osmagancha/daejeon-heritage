'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { handle, HttpError } = require('./api');

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

/* 간단한 슬라이딩 윈도 레이트 리밋 (인증 엔드포인트 보호) */
const hits = new Map();
function rateLimited(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, '요청이 너무 큽니다.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new HttpError(400, 'JSON 형식이 올바르지 않습니다.')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!target.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('Forbidden'); return; }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA 라우팅 fallback
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      return fs.readFile(fallback, (e2, buf) => {
        if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(buf);
      });
    }
    const ext = path.extname(target).toLowerCase();
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'ETag': etag,
      'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=300'
    });
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  const ip = req.socket.remoteAddress || 'unknown';

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  try {
    if (pathname.startsWith('/api/auth/') && req.method === 'POST' && rateLimited(ip, 20)) {
      throw new HttpError(429, '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.');
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const { userFromToken } = require('./auth');

    const ctx = {
      token,
      user: userFromToken(token),
      ua: req.headers['user-agent'] || '',
      ip,
      query: url.parse(req.url, true).query,
      body: ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {}
    };

    const result = await handle(req.method, pathname, ctx);
    sendJson(res, 200, result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api]', err);
    sendJson(res, status, { error: err.message || '서버 오류가 발생했습니다.' });
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another process may be running.`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

const db = require('./db');

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log('');
      console.log('  대전 문화유산 투어  ─  한밭기행');
      console.log('  ────────────────────────────────');
      console.log(`  ▶  http://localhost:${PORT}`);
      console.log('  종료하려면 Ctrl+C');
      console.log('');
    });
  })
  .catch((e) => {
    console.error('[서버] 저장소를 열지 못해 시작하지 못했습니다:', e.message);
    process.exit(1);
  });
