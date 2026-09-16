'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { serve, HttpError } = require('./api');
const security = require('./security');

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 256 * 1024;

/* 브라우저에게 이 페이지가 무엇을 해도 되는지 못 박아 둔다 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://lh3.googleusercontent.com https://ssl.gstatic.com https://www.gstatic.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
  'X-Content-Type-Options': 'nosniff'
};

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
      try { resolve(security.safeParse(raw)); }
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
        res.writeHead(200, Object.assign({ 'Content-Type': MIME['.html'] }, SECURITY_HEADERS));
        res.end(buf);
      });
    }
    const ext = path.extname(target).toLowerCase();
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'ETag': etag,
      'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=300'
    }, ext === '.html' ? SECURITY_HEADERS : {}));
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  const ip = req.socket.remoteAddress || 'unknown';

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  try {
    // 배포 환경과 같은 방식(저장소 기반)으로 센다
    const isAuth = pathname.startsWith('/api/auth/');
    const wait = await db.runRequest(true, () => security.tooMany(
      (isAuth ? 'a:' : 'g:') + ip, isAuth ? 60 : 240, isAuth ? 10 * 60 * 1000 : 60 * 1000));
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpError(429, `요청이 너무 잦습니다. ${wait}초 뒤에 다시 시도해 주세요.`);
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const ctx = {
      token,
      ua: req.headers['user-agent'] || '',
      ip,
      query: url.parse(req.url, true).query,
      body: ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {}
    };

    const result = await serve(req.method, pathname, ctx);
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
