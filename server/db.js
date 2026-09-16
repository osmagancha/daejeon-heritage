'use strict';

/**
 * 데이터 저장소.
 *
 * 바깥에서 보이는 모양은 늘 같다 — db.table('users') 는 배열이고,
 * 고친 뒤 db.save() 를 부르면 저장된다. API 코드는 저장 방식을 모른다.
 *
 *   DATABASE_URL 있음 → PostgreSQL
 *   없음              → data/store.json 파일 (내 PC 개발용)
 *
 * PostgreSQL 모드에서는 요청 하나가 시작될 때 최신 상태를 읽고, 끝날 때 쓴다.
 * 쓰기 요청은 자문 잠금(advisory lock)으로 줄을 세워서, 서버가 여러 개
 * 떠 있어도 두 사람의 기록이 서로를 덮어쓰지 않는다. 서버리스 배포에서
 * 반드시 필요한 부분이다.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');
const TMP = FILE + '.tmp';
const ROW_ID = 'main';
const LOCK_KEY = 748291;        // 이 앱 전용 잠금 번호

const EMPTY = {
  users: [],       // {id, email, nickname, passwordHash, salt, googleId, picture, points, avatarSeed, bio, createdAt}
  sessions: [],    // {token, userId, createdAt, expiresAt, ua}
  visits: [],      // {id, userId, heritageId, at, method, distance}
  favorites: [],   // {userId, heritageId, at}
  reviews: [],     // {id, userId, heritageId, rating, body, at}
  quizLogs: [],    // {id, userId, heritageId, qIndex, correct, at}
  orders: [],      // {id, userId, goodsId, qty, pointsSpent, at, status}
  badges: [],      // {userId, badgeId, at}
  battles: [],     // {id, aId, bId, bName, npc, winner, delta, at, log}
  friends: [],     // {a, b, at}  — a < b 로 정렬해 한 줄만 둔다
  friendReqs: [],  // {id, from, to, at}
  rateLimits: [],  // {key, hits, at, fails, lockUntil}
  adminLogs: []    // {id, at, by, action, target, detail}
};

let cache = null;
let dirty = false;
let backend = null;
let pool = null;

function normalize(raw) {
  const out = Object.assign({}, EMPTY, raw || {});
  for (const k of Object.keys(EMPTY)) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ─────────────────────────── 파일 백엔드 ─────────────────────────── */

const fileBackend = {
  name: '파일 (data/store.json)',
  perRequest: false,

  async load() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
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
  try { ({ Pool } = require('pg')); }
  catch {
    throw new Error('DATABASE_URL 이 있는데 pg 패키지가 없습니다. `npm install` 을 실행하세요.');
  }

  pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', (e) => console.error('[db] 연결 오류:', e.message));

  return {
    name: 'PostgreSQL',
    perRequest: true,

    async ensure() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id         TEXT PRIMARY KEY,
          data       JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    },

    async load(client) {
      const q = client || pool;
      const res = await q.query('SELECT data FROM app_state WHERE id = $1', [ROW_ID]);
      return res.rows.length ? res.rows[0].data : null;
    },

    async save(data, client) {
      const q = client || pool;
      await q.query(
        `INSERT INTO app_state (id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [ROW_ID, JSON.stringify(data)]
      );
    },

    /** 쓰기 요청을 한 줄로 세운다 */
    async begin() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
        return client;
      } catch (e) {
        client.release();
        throw e;
      }
    },

    async commit(client) {
      try { await client.query('COMMIT'); } finally { client.release(); }
    },

    async rollback(client) {
      try { await client.query('ROLLBACK'); } catch {} finally { client.release(); }
    },

    async close() { if (pool) await pool.end(); }
  };
}

/* ─────────────────────────────── 초기화 ─────────────────────────────── */

async function init() {
  const url = (process.env.DATABASE_URL || '').trim();
  backend = url ? pgBackend(url) : fileBackend;

  if (backend.ensure) await backend.ensure();
  let raw = await backend.load();

  // 파일에 있던 기존 데이터를 처음 한 번만 DB 로 옮긴다
  if (!raw && url) {
    const fromFile = await fileBackend.load();
    if (fromFile) {
      raw = fromFile;
      await backend.save(normalize(raw));
      console.log('[db] data/store.json 의 기존 데이터를 DB 로 옮겼습니다.');
    }
  }

  cache = normalize(raw);
  console.log(`[db] 저장소: ${backend.name} — ` +
    Object.keys(EMPTY).map((k) => `${k} ${cache[k].length}`).join(', '));
  return cache;
}

/* ───────────────────────── 요청 단위 처리 ───────────────────────── */

/**
 * 요청 하나를 감싼다.
 *   mutating=true  → 잠금을 잡고 최신 상태를 읽어 온 뒤, 끝나면 저장한다.
 *   mutating=false → 읽기만 하므로 잠그지 않는다.
 * 파일 모드에서는 메모리에 있는 것을 그대로 쓰고 저장만 미뤄서 한다.
 */
async function runRequest(mutating, fn) {
  if (!backend.perRequest) {
    const out = await fn();
    if (dirty) scheduleFileSave();
    return out;
  }

  if (!mutating) {
    cache = normalize(await backend.load());
    return fn();
  }

  const client = await backend.begin();
  try {
    cache = normalize(await backend.load(client));
    dirty = false;
    const out = await fn();
    if (dirty) {
      await backend.save(cache, client);
      dirty = false;
    }
    await backend.commit(client);
    return out;
  } catch (e) {
    await backend.rollback(client);
    throw e;
  }
}

/* 파일 모드의 지연 저장 */
let fileTimer = null;
function scheduleFileSave() {
  if (fileTimer) return;
  fileTimer = setTimeout(async () => {
    fileTimer = null;
    if (!dirty) return;
    dirty = false;
    try { await fileBackend.save(clone(cache)); }
    catch (e) { dirty = true; console.error('[db] 저장 실패:', e.message); }
  }, 120);
}

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  if (fileTimer) { clearTimeout(fileTimer); fileTimer = null; }
  if (dirty && !backend.perRequest) {
    try { await fileBackend.save(clone(cache)); } catch {}
  }
  if (backend && backend.close) { try { await backend.close(); } catch {} }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await shutdown(); process.exit(0); });
}

const db = {
  init,
  shutdown,
  runRequest,
  get data() {
    if (!cache) throw new Error('db.init() 을 먼저 호출해야 합니다.');
    return cache;
  },
  table(name) { return db.data[name]; },
  save() { dirty = true; },
  id(prefix = '') { return prefix + crypto.randomBytes(9).toString('base64url'); }
};

module.exports = db;
