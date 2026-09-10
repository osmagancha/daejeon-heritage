'use strict';

/** 굿즈 상점 — 포인트로 교환하거나 외부 상점으로 연결 */
const GOODS = [
  {
    id: 'g_dongchundang_badge',
    name: '동춘당 금속 배지',
    price: 9000,
    pointPrice: 450,
    category: '배지·키링',
    emoji: '🏯',
    tint: '#8C5A3C',
    tagline: '굴뚝 없는 집, 손바닥 위에',
    desc: '동춘당 정면 3칸의 실루엣을 그대로 옮긴 무광 금속 배지. 뒷면에 "同春" 각인이 들어갑니다.',
    stock: 42,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_dancheong_tape',
    name: '단청 마스킹테이프 3종',
    price: 12000,
    pointPrice: 600,
    category: '문구',
    emoji: '🎨',
    tint: '#A63A2E',
    tagline: '쌍청당의 색을 그대로',
    desc: '쌍청당 보와 도리에 남은 단청 문양을 스캔해 만든 15mm 마스킹테이프 세트입니다.',
    stock: 88,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_train_mug',
    name: '급수탑 머그컵',
    price: 18000,
    pointPrice: 900,
    category: '리빙',
    emoji: '☕',
    tint: '#6C7A80',
    tagline: '기관차도 물을 마신다',
    desc: '대전역 급수탑 단면도를 실크스크린으로 인쇄한 350ml 도자 머그. 뜨거운 물을 부으면 증기 문양이 드러납니다.',
    stock: 25,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_map_poster',
    name: '대전 문화유산 지도 포스터',
    price: 15000,
    pointPrice: 750,
    category: '포스터',
    emoji: '🗺️',
    tint: '#3F7A86',
    tagline: '13곳을 한 장에',
    desc: 'A2 크기 활자 지도. 13개 문화유산의 위치와 지정 번호, 건립 연도를 한 장에 담았습니다.',
    stock: 60,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_stamp_book',
    name: '문화유산 스탬프 수첩',
    price: 8000,
    pointPrice: 400,
    category: '문구',
    emoji: '📓',
    tint: '#7A5236',
    tagline: '13개의 도장을 채워 보세요',
    desc: '각 유산의 현장 스탬프를 찍을 수 있는 100g 한지 내지 수첩. 완주 시 기념 인증서를 드립니다.',
    stock: 120,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_hanji_lamp',
    name: '한지 무드등 (동춘당 에디션)',
    price: 39000,
    pointPrice: 1950,
    category: '리빙',
    emoji: '🏮',
    tint: '#C9A227',
    tagline: '창호 그림자를 방 안에',
    desc: '동춘당 창살 문양을 레이저 커팅한 한지 무드등. 불을 켜면 벽에 창호 그림자가 번집니다.',
    stock: 14,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_tote',
    name: '백제 성돌 에코백',
    price: 16000,
    pointPrice: 800,
    category: '패션',
    emoji: '👜',
    tint: '#5F7A50',
    tagline: '계족산성의 돌 쌓기',
    desc: '계족산성 성벽 실측 도면을 패턴화한 12온스 캔버스 에코백입니다.',
    stock: 55,
    link: 'https://www.daejeon.go.kr'
  },
  {
    id: 'g_tea',
    name: '무수동 구절초 티백 세트',
    price: 14000,
    pointPrice: 700,
    category: '식품',
    emoji: '🍵',
    tint: '#5C7F4E',
    tagline: '유회당 골짜기의 가을',
    desc: '무수동 일대에서 자란 구절초를 덖어 만든 티백 20개입. 유회당 그림 패키지.',
    stock: 33,
    link: 'https://www.daejeon.go.kr'
  }
];

/** 대전 소개 — 도시의 역사 */
const CITY_INTRO = {
  title: '대전, 물길과 철길이 만든 도시',
  lead: '대전(大田)은 "한밭", 즉 큰 밭이라는 우리말 지명을 한자로 옮긴 이름이다. 백제의 국경이었고, 조선 선비들의 고장이었으며, 철도가 만든 근대 도시였고, 지금은 대한민국의 과학 수도다.',
  stats: [
    { label: '면적', value: '539.7', unit: 'km²' },
    { label: '인구', value: '약 144', unit: '만 명' },
    { label: '자치구', value: '5', unit: '개' },
    { label: '국가지정문화재', value: '30+', unit: '건' }
  ],
  eras: [
    {
      id: 'baekje',
      period: '삼국시대',
      years: '4~7세기',
      title: '백제의 동쪽 국경',
      color: '#6E8F5A',
      body: '대전은 백제와 신라가 맞닿은 최전선이었다. 계족산성, 보문산성, 월평동 산성 등 도시를 둘러싼 산봉우리마다 성을 쌓았다. 산성의 밀도가 곧 긴장의 밀도였다. 660년 백제가 무너진 뒤에도 이 일대는 부흥군의 거점으로 오래 저항했다.'
    },
    {
      id: 'goryeo',
      period: '고려',
      years: '10~14세기',
      title: '회덕과 진잠, 두 개의 현',
      color: '#7C7466',
      body: '고려 시대 이 지역은 회덕현과 진잠현으로 나뉘어 있었다. 큰 도시는 아니었지만 금강 수운과 삼남대로가 지나는 길목이어서 사람과 물자가 끊이지 않았다. 두 현의 이름은 지금도 대덕구와 유성구의 지명에 남아 있다.'
    },
    {
      id: 'joseon',
      period: '조선',
      years: '15~19세기',
      title: '호서 사림의 고장',
      color: '#8C5A3C',
      body: '은진 송씨를 비롯한 명문가가 회덕에 자리 잡으면서 대전 일대는 기호학파의 중심지가 되었다. 우암 송시열과 동춘당 송준길이 이곳에서 배우고 가르쳤다. 동춘당, 쌍청당, 남간정사, 숭현서원은 모두 이 시기의 유산이다.'
    },
    {
      id: 'modern',
      period: '근대',
      years: '1905~1945',
      title: '철도가 부른 도시',
      color: '#8E7A62',
      body: '1905년 경부선이 개통되고 대전역이 들어서면서 논밭이던 자리에 사람이 몰렸다. 1932년 충남도청이 공주에서 대전으로 옮겨 오며 도시의 위상이 결정되었다. 급수탑, 소제동 관사촌, 옛 충남도청사, 구 산업은행은 그 20~30년의 압축 성장을 증언한다.'
    },
    {
      id: 'contemporary',
      period: '현대',
      years: '1945~현재',
      title: '과학의 수도',
      color: '#3F7A86',
      body: '한국전쟁 때 임시수도 역할을 했고, 1973년 대덕연구단지가 조성되며 도시의 성격이 다시 바뀌었다. 1993년 대전엑스포는 한국이 세계에 과학기술을 내보인 무대였다. KAIST와 정부출연연구기관이 모인 지금의 대전은 전통과 실험실이 나란히 있는 도시다.'
    }
  ],
  districts: [
    { name: '동구', note: '대전역과 소제동, 우암사적공원. 도시의 시작점.' },
    { name: '중구', note: '옛 충남도청과 은행동 원도심, 보문산.' },
    { name: '서구', note: '둔산 신도심과 행정 중심, 한밭수목원.' },
    { name: '유성구', note: '온천과 대덕연구단지, 숭현서원과 진잠향교.' },
    { name: '대덕구', note: '회덕의 옛 땅. 동춘당·쌍청당·계족산성.' }
  ]
};

/** 대전 특징 — 명물과 특산품 */
const CITY_FEATURES = {
  title: '대전에만 있는 것들',
  lead: '문화유산 사이를 걷다 보면 배가 고파진다. 대전이 자랑하는 맛과 명물, 계절 행사를 모았다.',
  groups: [
    {
      id: 'food',
      name: '먹거리',
      icon: '🍞',
      color: '#C1382C',
      items: [
        {
          name: '성심당 튀김소보로',
          tag: '1956년~',
          desc: '대전역 앞 작은 찐빵집으로 시작한 성심당의 대표 빵. 소보로 반죽을 튀겨 팥소를 채운 조합은 대전 밖에서는 살 수 없다.',
          where: '중구 은행동 본점 외 시내 지점'
        },
        {
          name: '대전 칼국수',
          tag: '도시의 주식',
          desc: '피란민 시절 미국산 밀가루가 대량으로 풀리며 자리 잡은 음식. 사골, 얼큰이, 두부두루치기와의 조합 등 계열이 갈릴 만큼 뿌리가 깊어 매년 칼국수 축제가 열린다.',
          where: '대흥동·오류동 일대'
        },
        {
          name: '두부두루치기',
          tag: '대전식 안주',
          desc: '두부를 고춧가루 양념에 자작하게 볶아 내는 대전 특유의 음식. 마지막에 칼국수 면을 넣어 비벼 먹는 것이 정석이다.',
          where: '중구 대흥동 골목'
        },
        {
          name: '구즉 묵마을',
          tag: '유성구',
          desc: '도토리묵을 채 썰어 육수에 말아 내는 묵밥. 대덕연구단지 인근 구즉동 일대에 묵집이 모여 마을을 이루었다.',
          where: '유성구 구즉동'
        }
      ]
    },
    {
      id: 'specialty',
      name: '특산품',
      icon: '🌾',
      color: '#7A6B2E',
      items: [
        { name: '유성 온천수', tag: '천연 라듐천', desc: '조선 시대부터 왕이 찾던 온천. 약알칼리성 단순천으로 피부에 순하다.', where: '유성구 봉명동 일대' },
        { name: '대청호 민물고기', tag: '호수의 맛', desc: '대청호 주변 마을의 매운탕과 어죽. 도리뱅뱅이는 대전·옥천 권역의 별미다.', where: '대덕구 대청호반' },
        { name: '금산 인삼 (인접권)', tag: '충청의 뿌리', desc: '대전과 맞닿은 금산은 국내 인삼 유통의 중심. 대전 시장에서도 쉽게 만난다.', where: '중앙시장·역전시장' },
        { name: '한밭 딸기·포도', tag: '근교 농업', desc: '동구·대덕구 근교 농가의 시설 재배 과일. 봄이면 딸기 체험 농장이 문을 연다.', where: '동구 근교 농가' }
      ]
    },
    {
      id: 'landmark',
      name: '명소',
      icon: '🌉',
      color: '#3F7A86',
      items: [
        { name: '한밭수목원', tag: '도심 속 숲', desc: '둔산 대전시립미술관·예술의전당과 이어지는 국내 최대 도심 인공 수목원.', where: '서구 둔산대로' },
        { name: '국립중앙과학관', tag: '과학의 도시', desc: '천체관·자연사관·미래기술관을 갖춘 국내 대표 과학관.', where: '유성구 대덕대로' },
        { name: '엑스포과학공원 한빛탑', tag: '1993', desc: '대전엑스포의 상징탑. 밤에는 미디어파사드가 갑천 위로 번진다.', where: '유성구 대덕대로' },
        { name: '뿌리공원', tag: '성씨의 고향', desc: '244개 문중의 성씨 조형물이 모인 세계 유일의 성씨 테마공원.', where: '중구 침산동' },
        { name: '장태산 자연휴양림', tag: '메타세쿼이아', desc: '하늘을 찌르는 메타세쿼이아 숲과 스카이웨이가 있는 휴양림.', where: '서구 장안동' }
      ]
    },
    {
      id: 'festival',
      name: '축제·행사',
      icon: '🎪',
      color: '#8C5A3C',
      items: [
        { name: '계족산 맨발축제', tag: '5월', desc: '14.5km 황톳길을 맨발로 걷는 대전의 대표 봄 축제.', where: '대덕구 계족산' },
        { name: '대전 칼국수 축제', tag: '10월', desc: '도시의 정체성이 된 음식을 주제로 열리는 미식 축제.', where: '중구 원도심' },
        { name: '효 문화 뿌리축제', tag: '9~10월', desc: '뿌리공원 일원에서 열리는 성씨·효 주제 전통 축제.', where: '중구 뿌리공원' },
        { name: '대전 0시 축제', tag: '8월', desc: '대전역에서 옛 충남도청까지 중앙로를 통째로 비우고 여는 도심 축제.', where: '중구 중앙로' }
      ]
    }
  ]
};

/** 상단 공지 롤링 */
const NOTICES = [
  { id: 'n1', emoji: '🍀', text: '2026 대전 문화유산 스탬프투어 상시 운영 중' },
  { id: 'n2', emoji: '🎫', text: '동춘당 야간개방 — 매주 금·토 19:00~21:00' },
  { id: 'n3', emoji: '🥾', text: '계족산 맨발축제 사전 신청이 시작되었습니다' },
  { id: 'n4', emoji: '🏛️', text: '대전근현대사전시관 특별전 「철도와 도시」 개최' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GOODS, CITY_INTRO, CITY_FEATURES, NOTICES };
} else {
  Object.assign(globalThis, { GOODS, CITY_INTRO, CITY_FEATURES, NOTICES });
}
