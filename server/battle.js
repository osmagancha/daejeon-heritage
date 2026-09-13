'use strict';

/**
 * 겨루기 — 스탯·무기·강화·전투 판정.
 *
 * 실시간이 아니라 비동기 대전이다. 도전을 걸면 서버가 양쪽의 스탯과 장비로
 * 전투를 한 번에 계산하고 기록(로그)을 돌려준다. 클라이언트는 그 기록을
 * 재생만 한다. 판정이 전부 서버에 있어야 조작할 수 없다.
 *
 * 난수는 씨앗을 고정해 같은 전투를 다시 돌려도 결과가 같다.
 */

/* ────────────────────────────── 스탯 ────────────────────────────── */

const STATS = [
  { key: 'str', name: '힘',   hanja: '力', desc: '공격력이 오른다.' },
  { key: 'agi', name: '민첩', hanja: '敏', desc: '먼저 치고, 잘 피한다.' },
  { key: 'vit', name: '체력', hanja: '體', desc: '체력이 늘고 맞아도 덜 아프다.' },
  { key: 'spi', name: '기',   hanja: '氣', desc: '치명타가 자주, 세게 터진다.' }
];

const POINTS_PER_LEVEL = 3;
const BASE_STATS = { str: 5, agi: 5, vit: 5, spi: 5 };

/** 단계(레벨)에 따라 받을 수 있는 총 스탯 점수 */
function totalStatPoints(level) {
  return (level - 1) * POINTS_PER_LEVEL;
}

function normalizeStats(raw) {
  const out = {};
  for (const s of STATS) {
    const v = Math.max(0, Math.floor(Number(raw && raw[s.key]) || 0));
    out[s.key] = Math.min(9999, v);
  }
  return out;
}

const spentPoints = (stats) => STATS.reduce((n, s) => n + (stats[s.key] || 0), 0);

/* ────────────────────────────── 무기 ────────────────────────────── */

/** scale: 어떤 스탯을 더 크게 반영하는가 */
const WEAPONS = [
  { key: 'mokgeom',  name: '목검',     hanja: '木劍', atk: 6,  price: 0,     level: 1,  scale: 'str', desc: '서당에서 쓰던 나무칼. 누구나 처음은 여기서.' },
  { key: 'jukchang', name: '죽창',     hanja: '竹槍', atk: 11, price: 600,   level: 3,  scale: 'agi', desc: '가볍고 길다. 먼저 찌르는 맛이 있다.' },
  { key: 'pyeongon', name: '편곤',     hanja: '鞭棍', atk: 17, price: 1800,  level: 6,  scale: 'str', desc: '쇠도리깨. 맞으면 정신이 번쩍 든다.' },
  { key: 'hwando',   name: '환도',     hanja: '環刀', atk: 25, price: 4200,  level: 9,  scale: 'agi', desc: '조선 군졸의 허리춤에 걸리던 칼.' },
  { key: 'unggeom',  name: '운검',     hanja: '雲劍', atk: 35, price: 9000,  level: 12, scale: 'spi', desc: '임금 곁을 지키던 별운검. 함부로 뽑지 않는다.' },
  { key: 'wolto',    name: '월도',     hanja: '月刀', atk: 48, price: 18000, level: 16, scale: 'str', desc: '초승달을 얹은 긴 자루. 한 번에 여럿을 쓸어낸다.' },
  { key: 'chilseong',name: '칠성검',   hanja: '七星劍', atk: 64, price: 36000, level: 20, scale: 'spi', desc: '북두칠성을 새겼다. 잡귀가 먼저 물러선다.' },
  { key: 'sabinggeom', name: '사인검', hanja: '四寅劍', atk: 84, price: 70000, level: 24, scale: 'spi', desc: '인년 인월 인일 인시에만 벼렸다는 칼.' },
  { key: 'cheonja',  name: '천자검',   hanja: '天子劍', atk: 110, price: 140000, level: 28, scale: 'str', desc: '하늘이 내렸다는 칼. 드는 것만으로 손이 떨린다.' }
];

/* ─────────────────────────── 강화 ─────────────────────────── */

const MAX_ENHANCE = 10;
/** +0 에서 +1 로 갈 확률부터 차례로 */
const ENHANCE_RATE = [0.95, 0.90, 0.84, 0.76, 0.66, 0.55, 0.44, 0.34, 0.25, 0.17];
/** 5강부터는 실패하면 한 단계 떨어진다. 부서지지는 않는다. */
const ENHANCE_DROP_FROM = 5;

function enhanceCost(weapon, from) {
  return Math.round((120 + weapon.price * 0.10) * Math.pow(from + 1, 1.55));
}

function enhanceRate(from) {
  return ENHANCE_RATE[from] != null ? ENHANCE_RATE[from] : 0.10;
}

/** 강화 단계가 붙은 공격력 */
function weaponAtk(weapon, plus) {
  return weapon.atk * (1 + 0.14 * (plus || 0));
}

/* ─────────────────────── 싸울 준비가 된 모습 ─────────────────────── */

const byWeapon = new Map(WEAPONS.map((w) => [w.key, w]));

/**
 * 스탯과 장비를 실제 전투 수치로 바꾼다.
 * 화면에도 같은 값을 보여 주어야 하므로 이 함수 하나만 쓴다.
 */
function combatant(name, level, stats, weaponKey, plus) {
  const st = normalizeStats(stats);
  const base = {
    str: BASE_STATS.str + st.str,
    agi: BASE_STATS.agi + st.agi,
    vit: BASE_STATS.vit + st.vit,
    spi: BASE_STATS.spi + st.spi
  };
  const weapon = byWeapon.get(weaponKey) || WEAPONS[0];
  const wAtk = weaponAtk(weapon, plus);
  // 무기마다 잘 맞는 스탯이 있다
  const scaleBonus = base[weapon.scale] * 0.6;

  return {
    name,
    level,
    stats: base,
    weapon: { key: weapon.key, name: weapon.name, plus: plus || 0, atk: Math.round(wAtk * 10) / 10 },
    hp: Math.round(120 + base.vit * 9 + level * 6),
    atk: Math.round((base.str * 1.8 + wAtk + scaleBonus) * 10) / 10,
    guard: Math.round(base.vit * 0.45 * 10) / 10,      // 받는 피해를 깎는다
    speed: base.agi + level * 0.4,
    dodge: Math.min(0.35, base.agi * 0.004),           // 최대 35%
    crit: Math.min(0.5, base.spi * 0.005),             // 최대 50%
    critMul: 1.5 + base.spi * 0.004
  };
}

/** 남에게 보여 주는 전투력 한 줄 요약 */
function power(c) {
  return Math.round(c.atk * 3 + c.hp * 0.6 + c.guard * 4 + c.speed * 2 + c.crit * 200);
}

/* ────────────────────────────── 전투 ────────────────────────────── */

/** 씨앗을 고정한 난수 — 같은 전투는 늘 같은 결과 */
function rng(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const MAX_TURNS = 24;

/**
 * 전투를 끝까지 계산하고 기록을 돌려준다.
 * a 가 도전한 쪽이다.
 */
function fight(a, b, seed) {
  const rand = rng(seed);
  const log = [];
  let hpA = a.hp;
  let hpB = b.hp;

  // 민첩이 높은 쪽이 먼저 친다. 같으면 도전한 쪽이 먼저.
  let aFirst = a.speed >= b.speed;
  if (Math.abs(a.speed - b.speed) < 0.5) aFirst = rand() < 0.5;
  log.push({ t: 0, kind: 'start', first: aFirst ? 'a' : 'b' });

  const strike = (atkr, defr, hpDef, side, turn) => {
    if (rand() < defr.dodge) {
      log.push({ t: turn, kind: 'dodge', by: side === 'a' ? 'b' : 'a' });
      return hpDef;
    }
    const swing = 0.85 + rand() * 0.3;
    const crit = rand() < atkr.crit;
    let dmg = atkr.atk * swing - defr.guard;
    if (crit) dmg *= atkr.critMul;
    dmg = Math.max(1, Math.round(dmg));
    const next = Math.max(0, hpDef - dmg);
    log.push({ t: turn, kind: 'hit', by: side, dmg, crit, hp: next });
    return next;
  };

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const order = aFirst ? ['a', 'b'] : ['b', 'a'];
    for (const side of order) {
      if (hpA <= 0 || hpB <= 0) break;
      if (side === 'a') hpB = strike(a, b, hpB, 'a', turn);
      else hpA = strike(b, a, hpA, 'b', turn);
    }
    if (hpA <= 0 || hpB <= 0) break;
  }

  let winner;
  if (hpA <= 0 && hpB <= 0) winner = 'draw';
  else if (hpB <= 0) winner = 'a';
  else if (hpA <= 0) winner = 'b';
  else {
    // 시간이 다 되면 남은 체력 비율로 가린다
    const ra = hpA / a.hp;
    const rb = hpB / b.hp;
    winner = Math.abs(ra - rb) < 0.02 ? 'draw' : (ra > rb ? 'a' : 'b');
    log.push({ t: MAX_TURNS, kind: 'timeout' });
  }
  log.push({ t: MAX_TURNS, kind: 'end', winner, hpA: Math.max(0, hpA), hpB: Math.max(0, hpB) });

  return { winner, hpA: Math.max(0, hpA), hpB: Math.max(0, hpB), log };
}

/* ─────────────────────── 수련 상대 (허수아비) ─────────────────────── */

/**
 * 사람이 적을 때도 겨룰 상대가 있어야 한다.
 * 수련 상대는 등급에 영향을 주지 않고 포인트도 적게 준다.
 */
const NPCS = [
  { id: 'npc_scarecrow', name: '허수아비', level: 1,  stats: { str: 2,  agi: 0,  vit: 6,  spi: 0 },  weapon: 'mokgeom',  plus: 0, emoji: '🌾',
    line: '움직이지 않는다. 그래도 맞으면 흔들린다.' },
  { id: 'npc_bandit',    name: '산적',     level: 5,  stats: { str: 12, agi: 6,  vit: 10, spi: 2 },  weapon: 'jukchang', plus: 1, emoji: '🪓',
    line: '보문산 고개에서 통행세를 받는다.' },
  { id: 'npc_walpae',    name: '왈패',     level: 10, stats: { str: 22, agi: 18, vit: 16, spi: 6 },  weapon: 'pyeongon', plus: 3, emoji: '🍶',
    line: '장터 뒷골목의 골칫거리.' },
  { id: 'npc_guard',     name: '포졸',     level: 16, stats: { str: 34, agi: 26, vit: 30, spi: 12 }, weapon: 'hwando',   plus: 5, emoji: '🛡️',
    line: '규칙대로 친다. 그래서 빈틈이 적다.' },
  { id: 'npc_master',    name: '떠돌이 검객', level: 22, stats: { str: 48, agi: 40, vit: 40, spi: 30 }, weapon: 'wolto', plus: 7, emoji: '🗡️',
    line: '이름을 밝히지 않는다. 이기면 한 수 알려 준다.' },
  { id: 'npc_tiger',     name: '계족산 범', level: 28, stats: { str: 70, agi: 55, vit: 60, spi: 40 }, weapon: 'chilseong', plus: 9, emoji: '🐯',
    line: '대전에 마지막으로 남았다는 그 범.' }
];

const npcById = new Map(NPCS.map((n) => [n.id, n]));

/* ───────────────────────────── 등급 ───────────────────────────── */

const BASE_RATING = 1000;

/** 이겼을 때 오르내리는 폭 — 약한 상대를 이기면 조금만 오른다 */
function ratingDelta(mine, theirs, result) {
  const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  return Math.round(32 * (score - expected));
}

const TITLES = [
  { min: 0,    name: '무명',   hanja: '無名' },
  { min: 900,  name: '초심',   hanja: '初心' },
  { min: 1100, name: '무사',   hanja: '武士' },
  { min: 1300, name: '검객',   hanja: '劍客' },
  { min: 1500, name: '고수',   hanja: '高手' },
  { min: 1700, name: '명인',   hanja: '名人' },
  { min: 1900, name: '검성',   hanja: '劍聖' },
  { min: 2100, name: '무신',   hanja: '武神' }
];

const titleOf = (rating) =>
  TITLES.slice().reverse().find((t) => rating >= t.min) || TITLES[0];

const Battle = {
  STATS, WEAPONS, NPCS,
  npcById: (id) => npcById.get(id), MAX_ENHANCE, BASE_STATS, POINTS_PER_LEVEL, BASE_RATING, TITLES,
  totalStatPoints, normalizeStats, spentPoints,
  weaponOf: (k) => byWeapon.get(k) || WEAPONS[0],
  weaponAtk, enhanceCost, enhanceRate, ENHANCE_DROP_FROM,
  combatant, power, fight, ratingDelta, titleOf, rng
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Battle;
} else {
  globalThis.BattleRules = Battle;
}
