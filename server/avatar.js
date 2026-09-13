'use strict';

/**
 * 선비 아바타 — 탐방할수록 자라는 나만의 분신.
 *
 * 성장은 쌓은 포인트로 정해지고, 꾸미기 항목은 활동으로 하나씩 열린다.
 * 칭호는 조선의 학제에서 이름만 빌린 놀이용 단계다.
 */

/** 성장 단계. need 는 이 단계가 되기 위해 필요한 누적 포인트. */
const STAGES = [
  { key: 'dongmong', name: '동몽', hanja: '童蒙', need: 0,
    desc: '이제 막 글을 배우기 시작한 아이. 댕기를 드리웠다.' },
  { key: 'yusaeng', name: '유생', hanja: '儒生', need: 300,
    desc: '향교에 드나들며 경전을 읽는다. 유건을 썼다.' },
  { key: 'jinsa', name: '진사', hanja: '進士', need: 800,
    desc: '초시에 합격했다. 이제 도포 자락이 제법 어울린다.' },
  { key: 'seonbi', name: '선비', hanja: '士', need: 1500,
    desc: '갓을 갖춰 쓰고 사방을 유람한다.' },
  { key: 'haksa', name: '학사', hanja: '學士', need: 2500,
    desc: '학문이 깊어 사람들이 묻고 배우러 온다.' },
  { key: 'daejehak', name: '대제학', hanja: '大提學', need: 4000,
    desc: '문형(文衡)이라 불린다. 한 시대의 글을 저울질한다.' }
];

/** 도포 색 — 활동으로 열린다 */
const ROBES = [
  { key: 'white',  name: '흰 도포',   hex: '#EDE6D6', need: null },
  { key: 'indigo', name: '쪽빛 도포', hex: '#41617D', need: null },
  { key: 'ink',    name: '먹빛 도포', hex: '#3A3A40', rule: { type: 'stamps', n: 3 } },
  { key: 'jade',   name: '옥빛 도포', hex: '#5C8574', rule: { type: 'stamps', n: 7 } },
  { key: 'clay',   name: '황토 도포', hex: '#9A6B42', rule: { type: 'reviews', n: 3 } },
  { key: 'crimson',name: '다홍 도포', hex: '#A8403A', rule: { type: 'stamps', n: 13 } }
];

/** 손에 드는 물건 */
const ITEMS = [
  { key: 'none',  name: '맨손',   need: null },
  { key: 'book',  name: '서책',   rule: { type: 'quiz', n: 4 } },
  { key: 'fan',   name: '합죽선', rule: { type: 'visits', n: 5 } },
  { key: 'brush', name: '붓',     rule: { type: 'reviews', n: 5 } },
  { key: 'staff', name: '죽장',   rule: { type: 'badges', n: 4 } },
  { key: 'lamp',  name: '초롱',   rule: { type: 'streak', n: 5 } }
];

const RULE_LABEL = {
  stamps: (n) => `스탬프 ${n}개`,
  visits: (n) => `현장 인증 ${n}회`,
  reviews: (n) => `감상 기록 ${n}편`,
  quiz: (n) => `퀴즈 정답 ${n}문제`,
  badges: (n) => `배지 ${n}개`,
  streak: (n) => `연속 문안 ${n}일`
};

function stageOf(points) {
  let cur = STAGES[0];
  for (const s of STAGES) if (points >= s.need) cur = s;
  const idx = STAGES.indexOf(cur);
  const next = STAGES[idx + 1] || null;
  const span = next ? next.need - cur.need : 1;
  return {
    ...cur,
    level: idx + 1,
    max: STAGES.length,
    next: next ? { name: next.name, need: next.need, left: next.need - points } : null,
    progress: next ? Math.min(1, Math.max(0, (points - cur.need) / span)) : 1
  };
}

/** 해금 조건을 만족했는지 */
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

/** 저장된 꾸미기 값이 규칙에 맞는지 확인하고, 아니면 기본값으로 돌린다 */
function sanitize(look, stats) {
  const robe = ROBES.find((r) => r.key === (look && look.robe));
  const item = ITEMS.find((i) => i.key === (look && look.item));
  return {
    robe: robe && meets(robe.rule, stats) ? robe.key : 'white',
    item: item && meets(item.rule, stats) ? item.key : 'none'
  };
}

const AvatarRules = { STAGES, ROBES, ITEMS, stageOf, catalog, sanitize, meets };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AvatarRules;
} else {
  globalThis.AvatarRules = AvatarRules;
}
