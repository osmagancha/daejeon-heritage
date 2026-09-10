'use strict';

/**
 * 데이터 저장소.
 *
 * 두 가지 백엔드를 쓴다. 바깥에서 보이는 모양(db.table(...) 은 배열)은 같다.
 *   - DATABASE_URL 이 있으면  → PostgreSQL (배포용, 재시작해도 남는다)
 *   - 없으면                  → data/store.json 파일 (내 PC 개발용)
 *
 * 규모가 크지 않아 전체 상태를 메모리에 올려 두고 통째로 저장한다.
 * 덕분에 API 코드는 저장 방식을 전혀 몰라도 된다.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');
const TMP = FILE + '.tmp';
const ROW_ID = 'main';

const EMPTY = {
  users: [],       // {id, email, nickname, passwordHash, salt, googleId, createdAt, points, avatarSeed, bio}
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
let writing = false;
let dirty = false;
let backend = null;

/* ─────────────────────────── 파일 백엔드 ─────────────────────────── */

const fileBackend = {
  name: '파일 (data/store.json)',

  async load() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch { return null; }
  },

  async save(data) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(TMP, FILE);
  }
};

/* ──────────────────────── PostgreSQL 백엔드 ──────────────────────── */

function pgBackend(connectionString) {
  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch {
    throw new Error(
      'DATABASE_URL 이 설정되어 있는데 pg 패키지가 없습니다. `npm install` 을 먼저 실행하세요.'
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: true },
    max: 4,
    idleTimeoutMillis: 30000
  });

  pool.on('error', (e) => console.error('[db] 연결 오류:', e.message));

  return {
    name: 'PostgreSQL',

    async load() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id         TEXT PRIMARY KEY,
          data       JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      const res = await pool.query('SELECT data FROM app_state WHERE id = $1', [ROW_ID]);
      return res.rows.length ? res.rows[0].data : null;
    },

    async save(data) {
      await pool.query(
        `INSERT INTO app_state (id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [ROW_ID, JSON.stringify(data)]
      );
    },

    async close() { await pool.end(); }
  };
}

/* ─────────────────────────────── 공통 ─────────────────────────────── */

function normalize(raw) {
  const out = Object.assign({}, EMPTY, raw || {});
  for (const k of Object.keys(EMPTY)) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  return out;
}

/** 서버가 요청을 받기 전에 반드시 한 번 부른다. */
async function init() {
  const url = (process.env.DATABASE_URL || '').trim();
  backend = url ? pgBackend(url) : fileBackend;

  let raw = await backend.load();

  // 파일에 있던 기존 데이터를 처음 한 번 DB 로 옮겨 준다
  if (!raw && url) {
    const fromFile = await fileBackend.load();
    if (fromFile) {
      raw = fromFile;
      await backend.save(normalize(raw));
      console.log('[db] data/store.json 의 기존 데이터를 DB 로 옮겼습니다.');
    }
  }

  cache = normalize(raw);
  const counts = Object.keys(EMPTY).map((k) => `${k} ${cache[k].length}`).join(', ');
  console.log(`[db] 저장소: ${backend.name} — ${counts}`);
  return cache;
}

async function flush() {
  if (!cache || !dirty || writing) return;
  writing = true;
  const snapshot = JSON.parse(JSON.stringify(cache));
  dirty = false;
  try {
    await backend.save(snapshot);
  } catch (e) {
    dirty = true;                       // 다음 기회에 다시 시도한다
    console.error('[db] 저장 실패:', e.message);
  } finally {
    writing = false;
  }
}

/** 쓰기를 잠깐 모아서 처리 (요청이 몰려도 저장은 한 번) */
function save() {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 120);
}

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  await flush();
  if (backend && backend.close) { try { await backend.close(); } catch {} }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await shutdown();
    process.exit(0);
  });
}
process.on('beforeExit', () => { if (dirty) flush(); });

const db = {
  init,
  shutdown,
  get data() {
    if (!cache) throw new Error('db.init() 을 먼저 호출해야 합니다.');
    return cache;
  },
  table(name) { return db.data[name]; },
  save,
  id(prefix = '') { return prefix + crypto.randomBytes(9).toString('base64url'); }
};

module.exports = db;
