'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');
const TMP = FILE + '.tmp';

const EMPTY = {
  users: [],       // {id, email, nickname, passwordHash, salt, createdAt, points, avatarSeed, bio}
  sessions: [],    // {token, userId, createdAt, expiresAt, ua}
  visits: [],      // {id, userId, heritageId, at, method, note}
  favorites: [],   // {userId, heritageId, at}
  reviews: [],     // {id, userId, heritageId, rating, body, at}
  quizLogs: [],    // {id, userId, heritageId, qIndex, correct, at}
  orders: [],      // {id, userId, goodsId, qty, pointsSpent, at, status}
  badges: []       // {userId, badgeId, at}
};

let cache = null;
let writeTimer = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = Object.assign({}, EMPTY, parsed);
    // 배열 보정 (수동 편집 대비)
    for (const k of Object.keys(EMPTY)) {
      if (!Array.isArray(cache[k])) cache[k] = [];
    }
  } catch {
    cache = JSON.parse(JSON.stringify(EMPTY));
    flushNow();
  }
  return cache;
}

function flushNow() {
  ensureDir();
  fs.writeFileSync(TMP, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(TMP, FILE);
}

/** 쓰기를 40ms 모아서 처리 (요청 폭주 시 디스크 보호) */
function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { flushNow(); } catch (e) { console.error('[db] 저장 실패:', e.message); }
  }, 40);
}

process.on('exit', () => { if (cache) { try { flushNow(); } catch {} } });

const db = {
  get data() { return load(); },
  table(name) { return load()[name]; },
  save,
  id(prefix = '') { return prefix + crypto.randomBytes(9).toString('base64url'); }
};

module.exports = db;
