'use strict';

/**
 * 아바타 — 탐방할수록 자라는 나만의 분신.
 *
 * 서른 단계. 스무 단계까지는 사람으로 자라고, 그 위로는 옛이야기 속
 * 영물과 신격으로 넘어간다. 기수가 바뀌면 생김새가 바뀐다.
 * 필요 포인트는 (단계-1)^2.4 곡선을 따른다. 하루 한 번 문안을 거르지 않고
 * 드려도 마지막 단계까지 약 5년이 걸리도록 잡았다.
 *
 * 칭호와 생김새는 조선의 학제와 우리 옛이야기에서 이름만 빌린 놀이용
 * 설정이다. form 은 3D 아바타를 짓는 명세로 public/js/avatar-3d.js 가 읽는다.
 */

/** tier: 1 배움 · 2 유생 · 3 선비 · 4 관료 · 5 문형 */
const STAGES = [
  { name: '동몽',   hanja: '童蒙',   need: 0,      tier: 1, desc: '이제 막 글자를 익힌다. 댕기를 드리웠다.' },
  { name: '초학',   hanja: '初學',   need: 40,     tier: 1, desc: '천자문을 뗐다. 붓 잡는 법을 배운다.' },
  { name: '학동',   hanja: '學童',   need: 200,    tier: 1, desc: '서당에 다닌다. 소리 내어 읽는 것이 즐겁다.' },
  { name: '서동',   hanja: '書童',   need: 550,    tier: 1, desc: '스승의 책시중을 든다. 어깨너머로 더 배운다.' },
  { name: '접장',   hanja: '接長',   need: 1100,   tier: 1, desc: '또래 중 맏이가 되어 아우들을 가르친다.' },
  { name: '교생',   hanja: '校生',   need: 1900,   tier: 1, desc: '향교에 이름을 올렸다. 이제 학생이다.' },

  { name: '유생',   hanja: '儒生',   need: 3000,   tier: 2, desc: '유건을 썼다. 경전을 본격으로 읽는다.' },
  { name: '재생',   hanja: '齋生',   need: 4300,   tier: 2, desc: '재(齋)에 머물며 밤늦도록 글을 읽는다.' },
  { name: '상재',   hanja: '上齋',   need: 5900,   tier: 2, desc: '재생 중에서도 앞자리에 앉는다.' },
  { name: '초시',   hanja: '初試',   need: 7800,   tier: 2, desc: '첫 시험을 통과했다. 이름이 알려지기 시작한다.' },
  { name: '생원',   hanja: '生員',   need: 10100,  tier: 2, desc: '경전에 밝다는 증표를 얻었다.' },
  { name: '진사',   hanja: '進士',   need: 12700,  tier: 2, desc: '시문(詩文)에 밝다. 도포 자락이 어울린다.' },

  { name: '선비',   hanja: '士',     need: 15600,  tier: 3, desc: '갓을 갖춰 쓰고 사방을 유람한다.' },
  { name: '처사',   hanja: '處士',   need: 19000,  tier: 3, desc: '벼슬에 나가지 않고 학문에 머문다.' },
  { name: '거사',   hanja: '居士',   need: 22600,  tier: 3, desc: '산수를 벗 삼아 지낸다. 글이 깊어진다.' },
  { name: '산림',   hanja: '山林',   need: 26700,  tier: 3, desc: '초야에 있어도 조정이 그 이름을 안다.' },
  { name: '유현',   hanja: '儒賢',   need: 31200,  tier: 3, desc: '묻고 배우러 오는 이가 끊이지 않는다.' },
  { name: '명유',   hanja: '名儒',   need: 36100,  tier: 3, desc: '한 고을을 대표하는 학자가 되었다.' },

  { name: '승문',   hanja: '承文',   need: 41400,  tier: 4, desc: '문서를 맡아 조정에 들었다. 사모를 썼다.' },
  { name: '한림',   hanja: '翰林',   need: 47100,  tier: 4, desc: '임금 곁에서 글을 짓는다.' },
  { name: '도깨비', hanja: '',       need: 53300,  tier: 6, emoji: '👹',
    desc: '사람이길 관두었다. 씨름을 걸어오거든 왼다리를 걸면 이긴다.',
    form: { kind: 'ogre', skin: '#7E4A6B', horns: 2, glow: '#C56BE0', club: true } },

  { name: '야차',   hanja: '夜叉',   need: 59900,  tier: 6, emoji: '😈',
    desc: '험한 얼굴로 절 문을 지킨다. 무섭게 생겼지만 속은 여리다.',
    form: { kind: 'ogre', skin: '#6E2B2B', horns: 2, fangs: true, glow: '#E2603A' } },

  { name: '해태',   hanja: '獬豸',   need: 67000,  tier: 6, emoji: '🦁',
    desc: '옳고 그름을 가린다. 새치기하는 사람을 조용히 노려본다.',
    form: { kind: 'beast', skin: '#B98A3E', horns: 1, mane: true, glow: '#F0C46A' } },

  { name: '삼족오', hanja: '三足烏', need: 74500,  tier: 6, emoji: '🐦',
    desc: '해 속에 산다는 세 발 까마귀. 다리가 하나 더 있어 좀처럼 넘어지지 않는다.',
    form: { kind: 'bird', skin: '#2B2622', wings: true, legs: 3, glow: '#F2A23C' } },

  { name: '구미호', hanja: '九尾狐', need: 82500,  tier: 6, emoji: '🦊',
    desc: '꼬리가 아홉이다. 앉을 자리를 고르는 데 시간이 오래 걸린다.',
    form: { kind: 'fox', skin: '#D8A05A', tails: 9, glow: '#F5D97E' } },

  { name: '청룡',   hanja: '靑龍',   need: 91000,  tier: 7, emoji: '🐉',
    desc: '천 년 만에 승천했다. 동쪽 하늘이 담당 구역이다.',
    form: { kind: 'dragon', skin: '#2E6E8C', horns: 2, whiskers: true, glow: '#6BD5F5' } },

  { name: '산신령', hanja: '山神靈', need: 100000, tier: 7, emoji: '🧙',
    desc: '계족산에 산다. 도끼를 빠뜨리면 금도끼를 들고 나타난다.',
    form: { kind: 'spirit', skin: '#E8E2D2', beard: true, halo: 1, float: true, glow: '#C9E8B0' } },

  { name: '염라대왕', hanja: '閻羅大王', need: 109500, tier: 7, emoji: '📕',
    desc: '저승의 장부를 넘긴다. 당신 이름 옆에 스탬프 개수가 적혀 있다.',
    form: { kind: 'ogre', skin: '#5E1B1B', horns: 2, crown: true, beard: true, halo: 1, glow: '#E2603A' } },

  { name: '돌부처', hanja: '石佛',   need: 119500, tier: 8, emoji: '🗿',
    desc: '한자리에 하도 오래 서 있어 이끼가 앉았다. 지나던 사람이 절을 하고 갔다.',
    form: { kind: 'stone', skin: '#9AA093', halo: 1, moss: true, glow: '#BFD0B0' } },

  { name: '천지신명', hanja: '天地神明', need: 130000, tier: 8, emoji: '🌌',
    desc: '이제 대전 사람들이 비가 안 오면 당신에게 빈다. 부담스럽지만 어쩔 수 없다.',
    form: { kind: 'cosmos', skin: '#1B2340', halo: 3, float: true, glow: '#9FD0FF' } }
].map((s, i) => Object.assign({ key: 'lv' + (i + 1), level: i + 1 }, s));

/** 기수 — 차림새가 바뀌는 단위 */
const TIERS = [
  { tier: 1, name: '배움', emoji: '🧒', wear: '댕기머리', realm: '사람',
    form: { kind: 'human', hat: 'daenggi' } },
  { tier: 2, name: '유생', emoji: '🎓', wear: '유건', realm: '사람',
    form: { kind: 'human', hat: 'yugeon' } },
  { tier: 3, name: '선비', emoji: '🎩', wear: '갓', realm: '사람',
    form: { kind: 'human', hat: 'gat' } },
  { tier: 4, name: '관료', emoji: '🏛', wear: '사모', realm: '사람',
    form: { kind: 'human', hat: 'samo', beard: true } },
  { tier: 5, name: '문형', emoji: '🖋', wear: '사모와 흉배', realm: '사람',
    form: { kind: 'human', hat: 'samo', beard: true, badge: true } },
  { tier: 6, name: '영물', emoji: '👹', wear: '사람의 모습을 벗는다', realm: '영물' },
  { tier: 7, name: '신격', emoji: '🐉', wear: '신의 자리에 오른다', realm: '신격' },
  { tier: 8, name: '초월', emoji: '🌌', wear: '이름을 넘어선다', realm: '초월' }
];

/** 도포 색 */
const ROBES = [
  { key: 'white',   name: '흰 도포',   hex: '#EDE6D6' },
  { key: 'indigo',  name: '쪽빛 도포', hex: '#41617D' },
  { key: 'ink',     name: '먹빛 도포', hex: '#3A3A40', rule: { type: 'stamps', n: 3 } },
  { key: 'jade',    name: '옥빛 도포', hex: '#5C8574', rule: { type: 'stamps', n: 7 } },
  { key: 'clay',    name: '황토 도포', hex: '#9A6B42', rule: { type: 'reviews', n: 3 } },
  { key: 'crimson', name: '다홍 도포', hex: '#A8403A', rule: { type: 'stamps', n: 13 } },
  { key: 'violet',  name: '자주 도포', hex: '#6A4A6E', rule: { type: 'level', n: 15 } },
  { key: 'gold',    name: '금빛 도포', hex: '#B08B3A', rule: { type: 'level', n: 25 } }
];

/** 손에 드는 물건 */
const ITEMS = [
  { key: 'none',     name: '맨손' },
  { key: 'book',     name: '서책',   rule: { type: 'quiz', n: 4 } },
  { key: 'fan',      name: '합죽선', rule: { type: 'visits', n: 5 } },
  { key: 'brush',    name: '붓',     rule: { type: 'reviews', n: 5 } },
  { key: 'staff',    name: '죽장',   rule: { type: 'badges', n: 4 } },
  { key: 'lamp',     name: '초롱',   rule: { type: 'streak', n: 5 } },
  { key: 'inkstone', name: '벼루',   rule: { type: 'level', n: 12 } },
  { key: 'crane',    name: '학',     rule: { type: 'level', n: 28 } }
];

const RULE_LABEL = {
  stamps: (n) => `스탬프 ${n}개`,
  visits: (n) => `현장 인증 ${n}회`,
  reviews: (n) => `감상 기록 ${n}편`,
  quiz: (n) => `퀴즈 정답 ${n}문제`,
  badges: (n) => `배지 ${n}개`,
  streak: (n) => `연속 문안 ${n}일`,
  level: (n) => `${n}단계 도달`
};

function stageOf(points) {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (points >= STAGES[i].need) idx = i;
  const cur = STAGES[idx];
  const next = STAGES[idx + 1] || null;
  const span = next ? next.need - cur.need : 1;
  const tier = TIERS.find((t) => t.tier === cur.tier);
  return {
    ...cur,
    max: STAGES.length,
    tierName: tier.name,
    realm: tier.realm,
    wear: tier.wear,
    // 사람 단계는 기수의 차림새를, 영물부터는 각 단계의 생김새를 쓴다
    form: cur.form || tier.form || { kind: 'human', hat: 'daenggi' },
    next: next
      ? { name: next.name, level: next.level, need: next.need, left: next.need - points }
      : null,
    progress: next ? Math.min(1, Math.max(0, (points - cur.need) / span)) : 1
  };
}

/** 해금 조건을 만족했는지. stats.level 은 현재 단계 번호. */
function meets(rule, stats) {
  if (!rule) return true;
  return (stats[rule.type] || 0) >= rule.n;
}

function catalog(stats) {
  const decorate = (list) => list.map((x) => ({
    key: x.key,
    name: x.name,
    hex: x.hex,
    unlocked: meets(x.rule, stats),
    how: x.rule ? RULE_LABEL[x.rule.type](x.rule.n) : null
  }));
  return { robes: decorate(ROBES), items: decorate(ITEMS) };
}

/** 저장된 꾸미기 값이 규칙에 맞는지 확인하고, 아니면 기본값으로 되돌린다 */
function sanitize(look, stats) {
  const robe = ROBES.find((r) => r.key === (look && look.robe));
  const item = ITEMS.find((i) => i.key === (look && look.item));
  return {
    robe: robe && meets(robe.rule, stats) ? robe.key : 'white',
    item: item && meets(item.rule, stats) ? item.key : 'none'
  };
}

const AvatarRules = { STAGES, TIERS, ROBES, ITEMS, stageOf, catalog, sanitize, meets };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AvatarRules;
} else {
  globalThis.AvatarRules = AvatarRules;
}
