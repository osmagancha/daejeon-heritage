/* ══════════════════════════════════════════════════════════════════
   UI 패널 — 상세 시트, 전체화면 뷰, 드로어, 모달, 토스트
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) => Util.esc(s);
  const body = document.body;

  const el = {
    sheet: $('#sheet'),
    sheetScroll: $('#sheet-scroll'),
    view: $('#view'),
    viewBody: $('#view-body'),
    viewTitle: $('#view-title'),
    viewKicker: $('#view-kicker'),
    drawer: $('#drawer'),
    drawerNav: $('#drawer-nav'),
    drawerUser: $('#drawer-user'),
    modal: $('#modal'),
    modalCard: $('#modal-card'),
    toasts: $('#toasts'),
    badgePop: $('#badge-pop'),
    chips: $('#map-chips'),
    peek: $('#dock-peek'),
    ctaLabel: $('#cta-label'),
    topAvatar: $('#top-avatar')
  };

  let viewer = null;        // 3D 인스턴스
  let currentDetail = null; // 열려 있는 상세 데이터
  let currentTab = 'story';

  /* ══════════════════════ 토스트 / 배지 ══════════════════════ */

  function toast(msg, emoji) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (emoji ? `<span class="em">${emoji}</span>` : '') + `<span>${esc(msg)}</span>`;
    el.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, 2600);
  }

  function badgePop(badge) {
    el.badgePop.innerHTML =
      `<div class="bp-card"><div class="bp-ic">${badge.icon}</div>` +
      `<em>배지 획득</em><b>${esc(badge.name)}</b><span>${esc(badge.desc)}</span></div>`;
    el.badgePop.classList.add('show');
    setTimeout(() => el.badgePop.classList.remove('show'), 2400);
  }

  function celebrate(newBadges) {
    if (!newBadges || !newBadges.length) return;
    newBadges.forEach((b, i) => setTimeout(() => badgePop(b), 500 + i * 2600));
  }

  /* ══════════════════════ 오디오 가이드 (TTS) ══════════════════════ */

  const Audio = {
    speaking: false,
    speak(text, onState) {
      if (!('speechSynthesis' in window)) { toast('이 브라우저는 음성 안내를 지원하지 않습니다.', '🔇'); return; }
      if (this.speaking) { this.stop(); onState && onState(false); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR'; u.rate = 0.96; u.pitch = 1.0;
      const ko = speechSynthesis.getVoices().find((v) => /ko/i.test(v.lang));
      if (ko) u.voice = ko;
      u.onend = u.onerror = () => { this.speaking = false; onState && onState(false); };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      this.speaking = true;
      onState && onState(true);
    },
    stop() {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      this.speaking = false;
    }
  };

  /* ══════════════════════ 상세 시트 ══════════════════════ */

  function metaPill(icon, text) {
    return `<span class="meta-pill"><svg viewBox="0 0 24 24">${icon}</svg>${esc(text)}</span>`;
  }

  const ICONS = {
    tag: '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1.4"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    foot: '<path d="M7 20c-2 0-3-1-3-3 0-3 2-4 2-8a3 3 0 1 1 6 0c0 4 2 5 2 8 0 2-1 3-3 3z"/>',
    star: '<path d="M12 4l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 15.8 7.4 18.2l.9-5.1L4.5 9.5l5.2-.8z"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
  };

  function sheetHtml(d) {
    const cat = Util.catHex(d.category);
    const fav = Store.isFavorite(d.id);
    const rating = d.rating || { avg: 0, count: 0 };

    return `
    <div class="hero" style="--cat:${cat}">
      ${Illustrate.scene(d, { w: 800, h: 400 })}
      <span class="hero-badge">${esc(d.designation)}</span>
      <button class="hero-fav ${fav ? 'on' : ''}" data-act="fav" aria-label="즐겨찾기">
        <svg viewBox="0 0 24 24"><path d="M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6 2 4.9 4.1 3 6.7 3c1.5 0 3 .7 3.9 1.9l1.4 1.7 1.4-1.7C14.3 3.7 15.8 3 17.3 3 19.9 3 22 4.9 22 7.6c0 3.8-3.4 6.9-8.6 11.6z"/></svg>
      </button>
    </div>

    <div class="sheet-title" style="--cat:${cat}">
      <div class="kicker">${esc(d.category)} · ${esc(d.era)}</div>
      <h2>${esc(d.name)}<small>${esc(d.hanja || '')}</small></h2>
      <p class="summary">${esc(d.summary)}</p>
    </div>

    <div class="meta-row">
      ${metaPill(ICONS.pin, d.address.replace('대전광역시 ', ''))}
      ${metaPill(ICONS.clock, d.duration)}
      ${metaPill(ICONS.foot, '난이도 ' + d.difficulty)}
      ${metaPill(ICONS.star, rating.count ? `${rating.avg} (${rating.count})` : '첫 후기를 남겨보세요')}
    </div>

    <div class="tabs" role="tablist">
      <button class="tab ${currentTab === 'story' ? 'on' : ''}" data-tab="story">이야기</button>
      <button class="tab ${currentTab === 'model' ? 'on' : ''}" data-tab="model">3D 체험</button>
      <button class="tab ${currentTab === 'time' ? 'on' : ''}" data-tab="time">연표·정보</button>
      <button class="tab ${currentTab === 'quiz' ? 'on' : ''}" data-tab="quiz">퀴즈</button>
      <button class="tab ${currentTab === 'visit' ? 'on' : ''}" data-tab="visit">방문</button>
    </div>

    <div id="pane" class="pane" style="--cat:${cat}"></div>`;
  }

  function paneStory(d) {
    return `
      <div class="story">${d.story.map((p) => `<p>${esc(p)}</p>`).join('')}</div>

      <div class="audio-card" id="audio-card">
        <div class="audio-head">
          <button class="audio-play" data-act="audio" aria-label="오디오 가이드 재생">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <div>
            <b>오디오 가이드</b>
            <p>현장 해설을 음성으로 들어보세요</p>
          </div>
          <div class="audio-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <p class="audio-script">${esc(d.audio)}</p>
      </div>

      <div class="section-h"><h3>이건 꼭 보세요</h3><span>관람 포인트 ${d.highlights.length}</span></div>
      <div class="hl-grid">
        ${d.highlights.map((h) => `
          <div class="hl"><span class="em">${h.icon}</span>
            <div><b>${esc(h.title)}</b><p>${esc(h.text)}</p></div>
          </div>`).join('')}
      </div>

      <div class="section-h"><h3>가까운 유산</h3><span>걸어서 이어지는 곳</span></div>
      <div class="nearby">
        ${(d.nearby || []).map((n) => `
          <button class="nb-card" data-go="${n.id}">
            ${Illustrate.scene({ id: n.id, name: n.name, palette: n.palette, model: n.model }, { w: 132, h: 74, simple: true })}
            <div class="nb-t"><b>${esc(n.name)}</b><span>${n.distanceKm}km · ${esc(n.category)}</span></div>
          </button>`).join('')}
      </div>`;
  }

  function paneModel(d) {
    const m = d.model || {};
    const facts = [];
    if (m.bays) facts.push(['정면 칸수', m.bays + '칸']);
    if (m.depth) facts.push(['측면 칸수', m.depth + '칸']);
    if (m.roof === 'paljak') facts.push(['지붕 형식', '팔작지붕']);
    if (m.perimeterM) facts.push(['성벽 둘레', '약 ' + m.perimeterM.toLocaleString() + 'm']);
    if (m.wallHeight) facts.push(['성벽 높이', m.wallHeight + 'm']);
    if (m.floors) facts.push(['층수', m.floors + '층']);
    if (m.height) facts.push(['높이', m.height + 'm']);
    if (m.dancheong) facts.push(['단청', '있음']);
    if (m.chimney === false) facts.push(['굴뚝', '없음']);
    if (m.pond) facts.push(['연못', '있음']);
    facts.push(['분류', d.category]);
    facts.push(['시대', d.era.split('·')[0].trim()]);

    return `
      <div class="viewer" id="viewer"></div>
      <div class="section-h"><h3>구조 읽기</h3><span>모형을 돌려가며 확인해 보세요</span></div>
      <div class="model-facts">
        ${facts.slice(0, 6).map(([k, v]) => `<div class="mf"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}
      </div>
      <p style="margin-top:14px;font-size:12px;line-height:1.7;color:var(--ink-4);word-break:keep-all">
        ※ 3D 모형은 실측 도면이 아니라 건축 형식·비례·구조를 이해하기 위한 해석 모형입니다.
        노란 점을 눌러 각 부분의 이름을 확인해 보세요.
      </p>`;
  }

  function paneTime(d) {
    return `
      <div class="section-h"><h3>연표</h3><span>${d.timeline.length}개의 장면</span></div>
      <div class="timeline">
        ${d.timeline.map((t) => `
          <div class="tl-item">
            <div class="tl-year">${esc(t.year)}</div>
            <b>${esc(t.title)}</b><p>${esc(t.text)}</p>
          </div>`).join('')}
      </div>

      <div class="section-h"><h3>관람 정보</h3><span>방문 전 확인</span></div>
      <div class="hl-grid">
        <div class="hl"><span class="em">🕘</span><div><b>운영 시간</b><p>${esc(d.visit.hours)}</p></div></div>
        <div class="hl"><span class="em">🎟️</span><div><b>관람료</b><p>${esc(d.visit.fee)}</p></div></div>
        <div class="hl"><span class="em">🅿️</span><div><b>주차</b><p>${esc(d.visit.parking)}</p></div></div>
        <div class="hl"><span class="em">🚌</span><div><b>대중교통</b><p>${esc(d.visit.transit)}</p></div></div>
        <div class="hl"><span class="em">📍</span><div><b>주소</b><p>${esc(d.address)}</p></div></div>
      </div>
      <div class="btn-row">
        <button class="btn soft" data-act="center">지도에서 보기</button>
        <a class="btn line" style="text-decoration:none" target="_blank" rel="noopener"
           href="https://map.kakao.com/link/to/${encodeURIComponent(d.name)},${d.lat},${d.lng}">길찾기</a>
      </div>`;
  }

  function paneQuiz(d) {
    return `
      <div class="section-h"><h3>문화유산 퀴즈</h3><span>맞히면 30P</span></div>
      ${d.quiz.map((q, i) => {
        const done = Store.quizDone(d.id, i);
        return `
        <div class="quiz" data-q="${i}">
          <div class="quiz-q">Q${i + 1}. ${esc(q.q)}</div>
          <div class="quiz-opts">
            ${q.options.map((o, k) => `
              <button class="qo ${done && k === q.answer ? 'ok' : ''}" data-choice="${k}" ${done ? 'disabled' : ''}>
                <i>${'ABCD'[k]}</i>${esc(o)}
              </button>`).join('')}
          </div>
          ${done ? `<div class="quiz-ex">${esc(q.explain)}</div>` : ''}
        </div>`;
      }).join('')}
      ${!Store.user ? '<p style="font-size:12.5px;color:var(--ink-4);margin-top:8px">로그인하면 정답 포인트가 적립됩니다.</p>' : ''}`;
  }

  function paneVisit(d) {
    const visited = Store.isVisited(d.id);
    const mine = Store.user ? (d.reviews || []).find((r) => r.userId === Store.user.id) : null;
    return `
      <div class="stamp-card ${visited ? 'done' : ''}">
        <div class="stamp-seal">${esc(d.short || d.name)}</div>
        ${visited
          ? `<h4>스탬프를 받았습니다</h4><p>이 유산의 이야기를 직접 확인하셨네요.<br />지금까지 ${Store.visitedCount()} / ${Store.heritage.length}곳</p>`
          : `<h4>아직 스탬프가 없어요</h4><p>현장에서 위치를 인증하면 ${d.points}P,<br />직접 체크인하면 ${Math.round(d.points * 0.4)}P가 적립됩니다.</p>`}
        ${visited ? '' : `
          <div class="btn-row">
            <button class="btn red" data-act="checkin-gps">📍 현장 인증</button>
            <button class="btn soft" data-act="checkin-manual">직접 체크인</button>
          </div>`}
      </div>

      <div class="section-h"><h3>방문자 ${d.visitCount || 0}명</h3><span>후기 ${(d.reviews || []).length}</span></div>

      <div class="field">
        <label>이 곳의 인상을 남겨주세요 ${mine ? '(수정)' : '(+20P)'}</label>
        <div class="stars" id="stars">
          ${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" class="${mine && n <= mine.rating ? 'on' : ''}">★</button>`).join('')}
        </div>
        <textarea id="review-body" placeholder="무엇이 가장 인상 깊었나요?" maxlength="500">${mine ? esc(mine.body) : ''}</textarea>
        <button class="btn wide" data-act="review">${mine ? '후기 수정' : '후기 남기기'}</button>
      </div>

      <div id="review-list">
        ${(d.reviews || []).length ? (d.reviews || []).map((r) => `
          <div class="review">
            <div class="rv-head">
              <span class="rv-av" style="background:${Util.avatarBg(r.nickname)}">${esc(r.nickname[0])}</span>
              <div><div class="rv-name">${esc(r.nickname)}</div>
                   <div class="rv-stars">${Util.stars(r.rating)}</div></div>
              <span class="rv-date">${Util.ago(r.at)}</span>
            </div>
            <p>${esc(r.body)}</p>
          </div>`).join('')
          : '<p style="font-size:13px;color:var(--ink-4);padding:8px 0">아직 후기가 없습니다. 첫 기록을 남겨보세요.</p>'}
      </div>`;
  }

  function renderPane() {
    const d = currentDetail;
    if (!d) return;
    const pane = $('#pane');
    if (viewer) { viewer.dispose(); viewer = null; }

    if (currentTab === 'story') pane.innerHTML = paneStory(d);
    else if (currentTab === 'model') {
      pane.innerHTML = paneModel(d);
      requestAnimationFrame(() => {
        const c = $('#viewer');
        if (c) viewer = Viewer.mount(c, d);
      });
    }
    else if (currentTab === 'time') pane.innerHTML = paneTime(d);
    else if (currentTab === 'quiz') pane.innerHTML = paneQuiz(d);
    else pane.innerHTML = paneVisit(d);
  }

  async function openSheet(id) {
    if (!id) return closeSheet();
    Store.activeId = id;
    currentTab = 'story';
    body.classList.add('sheet-open');
    el.sheet.setAttribute('aria-hidden', 'false');
    el.sheetScroll.innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--ink-4);font-size:13px">불러오는 중…</div>';
    el.sheetScroll.scrollTop = 0;
    try {
      currentDetail = await API.get('/heritage/' + encodeURIComponent(id));
      el.sheetScroll.innerHTML = sheetHtml(currentDetail);
      renderPane();
    } catch (e) {
      el.sheetScroll.innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--ink-4)">${esc(e.message)}</div>`;
    }
  }

  function closeSheet() {
    body.classList.remove('sheet-open', 'sheet-peek');
    el.sheet.setAttribute('aria-hidden', 'true');
    Store.activeId = null;
    Audio.stop();
    if (viewer) { viewer.dispose(); viewer = null; }
    currentDetail = null;
    MapView.render();
  }

  async function refreshSheet() {
    if (!currentDetail) return;
    const keep = currentTab;
    const scroll = el.sheetScroll.scrollTop;
    currentDetail = await API.get('/heritage/' + encodeURIComponent(currentDetail.id));
    currentTab = keep;
    el.sheetScroll.innerHTML = sheetHtml(currentDetail);
    renderPane();
    el.sheetScroll.scrollTop = scroll;
  }

  /* ══════════════════════ 전체화면 뷰 ══════════════════════ */

  const Views = {
    /* ── 검색 & 목록 ── */
    search() {
      const cats = ['전체'].concat(Store.categories);
      return {
        title: '문화유산 둘러보기', kicker: Store.heritage.length + '곳',
        html: `
        <div class="wrap">
          <div class="search-bar">
            <input id="q" type="search" placeholder="이름 · 지역 · 키워드로 검색" value="${esc(Store.filter.query)}" />
          </div>
          <div class="chip-row" id="cats">
            ${cats.map((c) => `<button class="chip ${(!Store.filter.category && c === '전체') || Store.filter.category === c ? 'on' : ''}" data-cat="${c === '전체' ? '' : c}">${esc(c)}</button>`).join('')}
          </div>
          <div id="results"></div>
        </div>`,
        after() { Views.renderResults(); }
      };
    },

    renderResults() {
      const box = document.getElementById('results');
      if (!box) return;
      const list = Store.filtered();
      if (!list.length) {
        box.innerHTML = '<p style="padding:40px 0;text-align:center;color:var(--ink-4);font-size:13.5px">조건에 맞는 문화유산이 없습니다.</p>';
        return;
      }
      box.innerHTML = list.map((h) => {
        const done = Store.isVisited(h.id);
        const km = Store.myPos ? Util.distanceKm(Store.myPos.lat, Store.myPos.lng, h.lat, h.lng).toFixed(1) + 'km' : '';
        return `
        <button class="list-row" data-go="${h.id}">
          <div class="lr-vis">${Illustrate.scene(h, { w: 74, h: 62, simple: true })}</div>
          <div class="lr-body">
            <b>${esc(h.name)}</b>
            <div class="d" style="color:${Util.catHex(h.category)}">${esc(h.designation)}</div>
            <p>${esc(h.summary)}</p>
          </div>
          <div class="lr-tail">
            ${done ? '<span style="font-size:19px">✅</span>' : `<span style="font-size:19px;opacity:.25">⬜</span>`}
            ${km ? `<span class="km">${km}</span>` : ''}
          </div>
        </button>`;
      }).join('');
    },

    /* ── 테마 코스 ── */
    courses() {
      const prog = Store.me ? Store.me.courses : [];
      return {
        title: '테마 코스', kicker: Store.courses.length + '개 코스',
        html: `<div class="wrap">
          <p class="lede">문화유산을 하나씩 보는 것도 좋지만, 이야기가 이어지는 순서로 걸으면 도시가 다르게 보입니다.</p>
          <div style="height:16px"></div>
          ${Store.courses.map((c, i) => {
            const p = prog.find((x) => x.id === c.id) || { done: 0, total: c.stops.length };
            return `
            <button class="course-card" data-course="${c.id}">
              <div class="cc-head">
                <span class="cc-num" style="background:${c.color}">${i + 1}</span>
                <div><b>${esc(c.name)}</b><span>${esc(c.subtitle)}</span></div>
              </div>
              <p class="cc-desc">${esc(c.description)}</p>
              <div class="cc-stops">
                ${c.stops.map((id, k) => {
                  const h = Store.get(id);
                  const done = Store.isVisited(id);
                  return `<span class="cs ${done ? 'done' : ''}">${done ? '✓' : k + 1} ${esc(h ? h.name : id)}</span>` +
                         (k < c.stops.length - 1 ? '<span style="color:var(--ink-4);font-size:11px">→</span>' : '');
                }).join('')}
              </div>
              <div class="cc-meta">
                <span>📏 ${c.distanceKm}km</span>
                <span>⏱ 약 ${Math.round(c.durationMin / 60)}시간</span>
                <span>🏛 ${c.stops.length}곳</span>
                <span style="margin-left:auto;color:${c.color}">${p.done}/${p.total} 완료</span>
              </div>
              <div class="progress" style="margin-top:9px"><i style="width:${(p.done / p.total) * 100}%;background:${c.color}"></i></div>
            </button>`;
          }).join('')}
        </div>`
      };
    },

    /* ── 굿즈 상점 ── */
    async goods() {
      const list = await API.get('/goods');
      const pts = Store.user ? Store.user.points : 0;
      return {
        title: '굿즈 상점', kicker: Store.user ? `보유 ${pts.toLocaleString()}P` : '로그인 필요',
        html: `<div class="wrap">
          <p class="lede">문화유산을 걸으며 모은 포인트로 교환하거나, 온라인 상점에서 구매할 수 있습니다.</p>
          <div style="height:18px"></div>
          <div class="grid two">
            ${list.map((g) => `
              <div class="card goods-card">
                <div class="goods-vis" style="background:linear-gradient(150deg, ${g.tint}22, ${g.tint}44)">${g.emoji}</div>
                <div class="card-body">
                  <span class="card-tag" style="background:${g.tint}1f;color:${g.tint}">${esc(g.category)}</span>
                  <h4>${esc(g.name)}</h4>
                  <p>${esc(g.tagline)}</p>
                  <div class="goods-price"><b>${g.pointPrice.toLocaleString()}P</b><s>${g.price.toLocaleString()}원</s></div>
                  <div class="goods-stock">남은 수량 ${g.stock - (g.sold || 0)}개</div>
                  <button class="btn red wide" style="height:40px;font-size:13px;margin-top:10px" data-buy="${g.id}">포인트로 교환</button>
                  <a class="shop-link" href="${g.link}" target="_blank" rel="noopener">온라인 상점에서 구매 →</a>
                </div>
              </div>`).join('')}
          </div>
          <div id="my-orders"></div>
        </div>`,
        after() {
          if (!Store.me || !Store.me.orders.length) return;
          document.getElementById('my-orders').innerHTML = `
            <div class="section-h"><h3>교환 내역</h3><span>${Store.me.orders.length}건</span></div>
            ${Store.me.orders.map((o) => `
              <div class="rank-row">
                <span style="font-size:20px">${o.goods ? o.goods.emoji : '🎁'}</span>
                <div><div class="rank-name">${esc(o.goods ? o.goods.name : o.goodsId)}</div>
                     <div class="rank-sub">${Util.date(o.at)} · ${o.qty}개 · ${o.status}</div></div>
                <span class="rank-pt">-${o.pointsSpent.toLocaleString()}P</span>
              </div>`).join('')}`;
        }
      };
    },

    /* ── 대전 소개 ── */
    async intro() {
      const d = await API.get('/city/intro');
      return {
        title: '대전 소개', kicker: '도시의 역사',
        html: `<div class="wrap">
          <h2 style="font-family:var(--font-serif);font-size:26px;line-height:1.3;margin-bottom:12px">${esc(d.title)}</h2>
          <p class="lede">${esc(d.lead)}</p>
          <div class="stat-row">
            ${d.stats.map((s) => `<div class="stat"><b>${esc(s.value)}<small>${esc(s.unit)}</small></b><span>${esc(s.label)}</span></div>`).join('')}
          </div>
          <div class="section-h"><h3>시대별로 읽는 대전</h3><span>눌러서 펼치기</span></div>
          ${d.eras.map((e, i) => `
            <div class="era ${i === 0 ? 'open' : ''}">
              <button class="era-head">
                <span class="era-dot" style="background:${e.color}">${esc(e.period[0])}</span>
                <div><b>${esc(e.title)}</b><span>${esc(e.period)} · ${esc(e.years)}</span></div>
                <svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
              </button>
              <div class="era-body"><p>${esc(e.body)}</p></div>
            </div>`).join('')}
          <div class="section-h"><h3>5개 자치구</h3><span>어디에 무엇이 있나</span></div>
          <div class="grid two">
            ${d.districts.map((x) => `
              <div class="card"><div class="card-body"><h4>${esc(x.name)}</h4><p>${esc(x.note)}</p></div></div>`).join('')}
          </div>
        </div>`
      };
    },

    /* ── 대전 특징 ── */
    async features() {
      const d = await API.get('/city/features');
      return {
        title: '대전 특징', kicker: '명물 · 특산품',
        html: `<div class="wrap">
          <h2 style="font-family:var(--font-serif);font-size:26px;margin-bottom:12px">${esc(d.title)}</h2>
          <p class="lede">${esc(d.lead)}</p>
          ${d.groups.map((g) => `
            <div class="section-h"><h3>${g.icon} ${esc(g.name)}</h3><span>${g.items.length}가지</span></div>
            <div class="grid">
              ${g.items.map((it) => `
                <div class="card"><div class="card-body">
                  <span class="card-tag" style="background:${g.color}1f;color:${g.color}">${esc(it.tag)}</span>
                  <h4>${esc(it.name)}</h4>
                  <p>${esc(it.desc)}</p>
                  <p style="color:var(--ink-4);margin-top:6px">📍 ${esc(it.where)}</p>
                </div></div>`).join('')}
            </div>`).join('')}
        </div>`
      };
    },

    /* ── 내 스탬프 ── */
    stamps() {
      if (!Store.user) {
        return {
          title: '내 스탬프', kicker: '',
          html: `<div class="wrap" style="text-align:center;padding-top:70px">
            <div style="font-size:52px">🏮</div>
            <h3 style="font-family:var(--font-serif);font-size:22px;margin:12px 0 6px">이름을 정하고 기록을 남기세요</h3>
            <p class="lede" style="margin-bottom:20px">${window.LocalAPI
              ? '방문 스탬프, 배지, 포인트가 이 브라우저에 저장됩니다.'
              : '방문 스탬프, 배지, 포인트가 계정에 저장됩니다.'}</p>
            <button class="btn red" data-act="open-auth">${window.LocalAPI ? '이름 정하기' : '로그인 / 가입'}</button>
          </div>`
        };
      }
      const visited = Store.visitedCount();
      const total = Store.heritage.length;
      const owned = new Set(Store.me.badges.map((b) => b.id));
      return {
        title: '내 스탬프', kicker: `${visited}/${total}`,
        html: `<div class="wrap">
          <div class="card" style="padding:18px;margin-bottom:18px">
            <div style="display:flex;align-items:center;gap:14px">
              <span class="du-av" style="background:${Util.avatarBg(Store.user.avatarSeed)};width:54px;height:54px">${esc(Store.user.nickname[0])}</span>
              <div style="flex:1">
                <div class="du-name" style="font-size:17px">${esc(Store.user.nickname)}</div>
                <div class="du-sub">${Util.date(Store.user.createdAt)} 가입 · 퀴즈 ${Store.me.quiz.correct}문제 정답</div>
              </div>
              <div style="text-align:right">
                <div style="font-family:var(--font-serif);font-size:24px;color:var(--red);font-weight:700">${Store.user.points.toLocaleString()}</div>
                <div style="font-size:10.5px;color:var(--ink-4);font-weight:700">POINT</div>
              </div>
            </div>
            <div style="margin-top:16px">
              <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--ink-3);margin-bottom:6px">
                <span>문화유산 완주율</span><span>${Math.round((visited / total) * 100)}%</span>
              </div>
              <div class="progress"><i style="width:${(visited / total) * 100}%"></i></div>
            </div>
          </div>

          <div class="section-h"><h3>스탬프 보드</h3><span>${visited} / ${total}</span></div>
          <div class="stamp-grid">
            ${Store.heritage.map((h) => {
              const got = Store.isVisited(h.id);
              return `<button class="sg ${got ? 'got' : ''}" data-go="${h.id}">
                <span class="seal">${esc(h.short || h.name)}</span>
                <span>${got ? '획득' : '미방문'}</span>
              </button>`;
            }).join('')}
          </div>

          <div class="section-h"><h3>배지</h3><span>${owned.size} / ${Store.badges.length}</span></div>
          <div class="badge-grid">
            ${Store.badges.map((b) => `
              <div class="bg-item ${owned.has(b.id) ? '' : 'off'}">
                <div class="ic">${b.icon}</div><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>
              </div>`).join('')}
          </div>

          <div class="section-h"><h3>최근 방문</h3><span>${Store.me.visits.length}건</span></div>
          ${Store.me.visits.length ? Store.me.visits.slice(0, 12).map((v) => {
            const h = Store.get(v.heritageId);
            return `<button class="rank-row" style="width:100%;text-align:left" data-go="${v.heritageId}">
              <span style="font-size:18px">${v.method === 'gps' ? '📍' : '✍️'}</span>
              <div><div class="rank-name">${esc(h ? h.name : v.heritageId)}</div>
                   <div class="rank-sub">${Util.date(v.at)} · ${v.method === 'gps' ? '현장 인증' : '직접 체크인'}</div></div>
            </button>`;
          }).join('') : '<p style="font-size:13px;color:var(--ink-4)">아직 방문 기록이 없습니다.</p>'}
        </div>`
      };
    },

    /* ── 랭킹 ── */
    async ranking() {
      const list = await API.get('/leaderboard');
      return {
        title: '탐방 랭킹', kicker: `${list.length}명`,
        html: `<div class="wrap">
          <p class="lede">스탬프와 퀴즈로 모은 포인트 순위입니다.</p>
          <div style="height:16px"></div>
          ${list.length ? list.map((u, i) => `
            <div class="rank-row ${i < 3 ? 'top' : ''}">
              <span class="rank-no">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <span class="rank-av" style="background:${Util.avatarBg(u.avatarSeed)}">${esc(u.nickname[0])}</span>
              <div><div class="rank-name">${esc(u.nickname)}</div>
                   <div class="rank-sub">스탬프 ${u.stamps}개</div></div>
              <span class="rank-pt">${u.points.toLocaleString()}P</span>
            </div>`).join('')
            : '<p style="font-size:13px;color:var(--ink-4)">아직 참가자가 없습니다.</p>'}
        </div>`
      };
    },

    /* ── 내 정보 ── */
    profile() {
      const u = Store.user;
      if (!u) return Views.stamps();   // 로그인 전에는 안내 화면으로
      return {
        title: '내 정보', kicker: '',
        html: `<div class="wrap">
          <div class="field"><label>닉네임</label><input id="p-nick" value="${esc(u.nickname)}" maxlength="16" /></div>
          <div class="field"><label>한 줄 소개</label><textarea id="p-bio" maxlength="140" placeholder="예: 주말마다 성곽을 걷습니다">${esc(u.bio)}</textarea></div>
          <div class="field"><label>아바타 색</label>
            <input id="p-seed" type="range" min="0" max="359" value="${u.avatarSeed}" style="padding:0" />
            <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
              <span class="du-av" id="p-preview" style="background:${Util.avatarBg(u.avatarSeed)}">${esc(u.nickname[0])}</span>
              <span style="font-size:12px;color:var(--ink-4)">${esc(u.email || (Util.date(u.createdAt) + ' 시작'))}</span>
            </div>
          </div>
          <button class="btn wide" data-act="save-profile">저장</button>
          <div style="height:10px"></div>
          <button class="btn line wide" data-act="logout">${window.LocalAPI ? '기록 모두 지우기' : '로그아웃'}</button>
          ${window.LocalAPI ? '<p style="margin-top:12px;font-size:11.5px;line-height:1.6;color:var(--ink-4);text-align:center">기록은 이 브라우저에만 저장됩니다.<br />다른 기기에서는 따로 쌓입니다.</p>' : ''}
        </div>`
      };
    }
  };

  async function openView(key) {
    Audio.stop();
    let v;
    try {
      v = await Views[key]();
    } catch (e) {
      toast(e.message, '⚠️');
      return;
    }
    el.viewTitle.textContent = v.title;
    el.viewKicker.textContent = v.kicker || '';
    el.viewBody.innerHTML = v.html;
    el.viewBody.scrollTop = 0;
    body.classList.add('view-open');
    el.view.setAttribute('aria-hidden', 'false');
    el.view.dataset.key = key;
    if (v.after) v.after();
  }

  function closeView() {
    body.classList.remove('view-open');
    el.view.setAttribute('aria-hidden', 'true');
    el.view.dataset.key = '';
  }

  /* ══════════════════════ 드로어 ══════════════════════ */

  const NAV = [
    { sec: '탐방' },
    { key: 'map', em: '🗺️', label: '지도로 돌아가기' },
    { key: 'search', em: '🔎', label: '문화유산 둘러보기', tail: () => Store.heritage.length + '곳' },
    { key: 'courses', em: '🧭', label: '테마 코스', tail: () => Store.courses.length + '개' },
    { key: 'stamps', em: '🏮', label: '내 스탬프', tail: () => Store.me ? `${Store.visitedCount()}/${Store.heritage.length}` : '' },
    { key: 'ranking', em: '🏆', label: '탐방 랭킹' },
    { sec: '대전 알아보기' },
    { key: 'intro', em: '🏙️', label: '대전 소개' },
    { key: 'features', em: '🍞', label: '대전 특징 · 명물' },
    { key: 'goods', em: '🎁', label: '굿즈 상점', tail: () => Store.user ? Store.user.points.toLocaleString() + 'P' : '' }
  ];

  function renderDrawer() {
    const u = Store.user;
    el.drawerUser.innerHTML = u
      ? `<span class="du-av" style="background:${Util.avatarBg(u.avatarSeed)}">${esc(u.nickname[0])}</span>
         <div style="flex:1;min-width:0">
           <div class="du-name">${esc(u.nickname)}</div>
           <div class="du-sub">${esc(u.bio || u.email)}</div>
           <span class="du-points">✦ ${u.points.toLocaleString()} P</span>
         </div>
         <button class="icon-btn" style="width:36px;height:36px;box-shadow:none;background:var(--surface-2)" data-nav="profile" aria-label="내 정보">
           <svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
         </button>`
      : `<div style="flex:1">
           <div class="du-name">여행자님, 안녕하세요</div>
           <div class="du-sub">${window.LocalAPI ? '이름을 정하면 스탬프가 저장됩니다' : '로그인하면 스탬프와 포인트가 저장됩니다'}</div>
         </div>
         <button class="btn red" style="height:38px;padding:0 14px;font-size:13px" data-act="open-auth">${window.LocalAPI ? '이름 정하기' : '로그인'}</button>`;

    const nav = window.LocalAPI ? NAV.filter((n) => n.key !== 'ranking') : NAV;
    el.drawerNav.innerHTML = nav.map((n) => {
      if (n.sec) return `<div class="dn-sec">${esc(n.sec)}</div>`;
      const tail = n.tail ? n.tail() : '';
      return `<button class="dn" data-nav="${n.key}">
        <span class="em">${n.em}</span><span>${esc(n.label)}</span>
        ${tail ? `<span class="tail">${esc(tail)}</span>` : ''}
      </button>`;
    }).join('');
  }

  function openDrawer(v) {
    if (v) renderDrawer();
    body.classList.toggle('drawer-open', v);
    el.drawer.setAttribute('aria-hidden', v ? 'false' : 'true');
  }

  /* ══════════════════════ 인증 모달 ══════════════════════ */

  function authModal(mode) {
    if (window.LocalAPI) return nameModal();
    const isLogin = mode !== 'register';
    el.modalCard.innerHTML = `
      <h3>${isLogin ? '다시 오셨군요' : '한밭기행 시작하기'}</h3>
      <p class="m-sub">${isLogin
        ? '스탬프와 포인트를 이어서 모으세요.'
        : '가입 즉시 100P를 드립니다. 13곳의 문화유산이 기다리고 있어요.'}</p>
      <div id="m-err"></div>
      ${Store.googleClientId ? '<div id="g-btn" class="g-btn"></div><div class="or"><span>또는 이메일로</span></div>' : ''}
      ${isLogin ? '' : `<div class="field"><label>닉네임</label><input id="m-nick" placeholder="2~16자" maxlength="16" autocomplete="nickname" /></div>`}
      <div class="field"><label>이메일</label><input id="m-email" type="email" placeholder="you@example.com" autocomplete="email" /></div>
      <div class="field"><label>비밀번호</label><input id="m-pw" type="password" placeholder="6자 이상" autocomplete="${isLogin ? 'current-password' : 'new-password'}" /></div>
      <button class="btn red wide" data-act="submit-auth" data-mode="${isLogin ? 'login' : 'register'}">
        ${isLogin ? '로그인' : '가입하고 시작하기'}
      </button>
      <div class="m-switch">
        ${isLogin ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}
        <button data-act="switch-auth" data-mode="${isLogin ? 'register' : 'login'}">${isLogin ? '가입하기' : '로그인'}</button>
      </div>`;
    body.classList.add('modal-open');
    el.modal.setAttribute('aria-hidden', 'false');
    if (window.GoogleAuth) window.GoogleAuth.mount(document.getElementById('g-btn'));
    setTimeout(() => {
      const f = el.modalCard.querySelector('input');
      if (f) f.focus();
    }, 260);
  }

  /** 배포판: 비밀번호 없이 이름만 정한다 */
  function nameModal() {
    el.modalCard.innerHTML = `
      <h3>어떻게 부를까요?</h3>
      <p class="m-sub">이름만 정하면 바로 시작합니다. 가입도 비밀번호도 없어요.<br />
        스탬프·배지·포인트는 이 브라우저에 저장됩니다.</p>
      <div id="m-err"></div>
      <div class="field"><label>이름</label>
        <input id="m-nick" placeholder="2~16자" maxlength="16" autocomplete="nickname" />
      </div>
      <button class="btn red wide" data-act="submit-auth" data-mode="register">한밭기행 시작하기</button>
      <p class="m-switch" style="text-decoration:none">둘러보기만 한다면 이름 없이도 괜찮습니다.</p>`;
    body.classList.add('modal-open');
    el.modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const f = el.modalCard.querySelector('input'); if (f) f.focus(); }, 260);
  }

  function closeModal() {
    body.classList.remove('modal-open');
    el.modal.setAttribute('aria-hidden', 'true');
  }

  function modalError(msg) {
    const box = document.getElementById('m-err');
    if (box) box.innerHTML = `<div class="m-err">${esc(msg)}</div>`;
  }

  /* ══════════════════════ 지도 위 보조 UI ══════════════════════ */

  function renderChips() {
    const chips = [];
    if (Store.activeCourse) {
      const c = Store.courses.find((x) => x.id === Store.activeCourse);
      if (c) chips.push(`<span class="map-chip"><i style="background:${c.color}"></i>${esc(c.name)}<button data-act="clear-course">✕</button></span>`);
    }
    if (Store.filter.category) {
      chips.push(`<span class="map-chip"><i style="background:${Util.catHex(Store.filter.category)}"></i>${esc(Store.filter.category)}<button data-act="clear-cat">✕</button></span>`);
    }
    if (Store.filter.query) {
      chips.push(`<span class="map-chip"><i></i>“${esc(Store.filter.query)}”<button data-act="clear-q">✕</button></span>`);
    }
    el.chips.innerHTML = chips.join('');
  }

  function renderPeek() {
    const course = Store.activeCourse ? Store.courses.find((c) => c.id === Store.activeCourse) : null;
    const list = course
      ? course.stops.map((id) => Store.get(id)).filter(Boolean)
      : Store.filtered();

    const title = document.getElementById('dock-title');
    const count = document.getElementById('dock-count');
    if (title) title.textContent = course ? course.name : (Store.filter.category || '문화유산');
    if (count) {
      const done = list.filter((h) => Store.isVisited(h.id)).length;
      count.textContent = Store.me ? `${done} / ${list.length}곳` : `${list.length}곳`;
    }

    el.peek.innerHTML = list.map((h, i) => `
      <button class="peek-card ${Store.activeId === h.id ? 'on' : ''}" data-go="${h.id}">
        <span class="peek-dot" style="background:${Util.catHex(h.category)}">
          ${Store.isVisited(h.id) ? '<span style="color:#fff;font-size:13px">✓</span>' : `<svg viewBox="0 0 24 24">${Util.catIcon(h.category)}</svg>`}
        </span>
        <span><span class="peek-name">${esc(h.name)}</span><br /><span class="peek-meta">${course ? (i + 1) + '번째 · ' : ''}${esc(h.category)}</span></span>
      </button>`).join('');

    // 데스크톱 세로 목록에서는 선택된 항목이 보이도록 스크롤을 맞춘다
    const active = el.peek.querySelector('.peek-card.on');
    if (active && matchMedia('(min-width: 860px)').matches) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderTop() {
    const u = Store.user;
    el.topAvatar.textContent = u ? u.nickname[0] : '?';
    el.topAvatar.style.background = u ? Util.avatarBg(u.avatarSeed) : '';
    document.getElementById('account-dot').hidden = !!u;
    el.ctaLabel.textContent = Store.activeCourse ? '이 코스로 투어 시작' : '투어 시작하기';
  }

  window.UI = {
    el, toast, badgePop, celebrate, Audio,
    openSheet, closeSheet, refreshSheet,
    get currentDetail() { return currentDetail; },
    get currentTab() { return currentTab; },
    set currentTab(v) { currentTab = v; },
    renderPane, sheetHtml,
    Views, openView, closeView,
    renderDrawer, openDrawer,
    authModal, closeModal, modalError,
    renderChips, renderPeek, renderTop
  };
})();
