/* ══════════════════════════════════════════════════════════════════
   앱 오케스트레이션 — 이벤트 연결과 상태 반영
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const body = document.body;
  let reviewStars = 0;

  /* ══════════════════════ 테마 ══════════════════════ */

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('hanbat.theme', t); } catch {}
    $('#theme-label').textContent = t === 'dark' ? '주간 모드' : '야간 모드';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#16171a' : '#16181c';
    if (MapView.map) { MapView.setTheme(t); MapView.render(); }
    if (UI.currentDetail) UI.refreshSheet().catch(() => {});
  }

  /* ══════════════════════ 전체 리렌더 ══════════════════════ */

  function syncAll() {
    UI.renderTop();
    UI.renderChips();
    UI.renderPeek();
    UI.renderDrawer();
    MapView.render();
  }

  /* ══════════════════════ 액션 ══════════════════════ */

  async function selectHeritage(id) {
    if (!id) { UI.closeSheet(); return; }
    UI.closeView();
    Store.activeId = id;
    MapView.select(id);
    UI.renderPeek();
    await UI.openSheet(id);
  }

  async function checkin(useGps) {
    if (!Store.user) { UI.authModal('login'); return; }
    const d = UI.currentDetail;
    if (!d) return;
    let coords = null;
    if (useGps) {
      UI.toast('위치를 확인하는 중…', '📡');
      try {
        coords = await MapView.locate();
      } catch (e) {
        UI.toast(e.message + ' 직접 체크인을 이용해 주세요.', '⚠️');
        return;
      }
    }
    try {
      const r = await API.post('/visits', {
        heritageId: d.id,
        lat: coords ? coords.lat : undefined,
        lng: coords ? coords.lng : undefined
      });
      await Store.refreshMe();
      const msg =
        r.method === 'gps' ? `현장 인증 완료! +${r.earned}P`
        : r.method === 'far' ? `현장에서 ${(r.distance / 1000).toFixed(1)}km 떨어져 있어요. +${r.earned}P`
        : `체크인 완료! +${r.earned}P`;
      UI.toast(msg, r.method === 'gps' ? '📍' : '✅');
      UI.celebrate(r.newBadges);
      syncAll();
      await UI.refreshSheet();
    } catch (e) {
      UI.toast(e.message, '⚠️');
    }
  }

  async function answerQuiz(qIndex, choice, cardEl) {
    if (!Store.user) { UI.authModal('login'); return; }
    const d = UI.currentDetail;
    try {
      const r = await API.post('/quiz', { heritageId: d.id, qIndex, choice });
      const opts = cardEl.querySelectorAll('.qo');
      opts.forEach((o, i) => {
        o.disabled = true;
        if (i === r.answer) o.classList.add('ok');
        else if (i === choice && !r.correct) o.classList.add('no');
      });
      const ex = document.createElement('div');
      ex.className = 'quiz-ex';
      ex.textContent = (r.correct ? '정답입니다. ' : '아쉬워요. ') + r.explain;
      cardEl.appendChild(ex);
      if (r.earned) UI.toast(`정답! +${r.earned}P`, '🎉');
      await Store.refreshMe();
      UI.celebrate(r.newBadges);
      UI.renderTop();
      UI.renderDrawer();
    } catch (e) {
      UI.toast(e.message, '⚠️');
    }
  }

  async function submitReview() {
    if (!Store.user) { UI.authModal('login'); return; }
    const d = UI.currentDetail;
    const bodyEl = $('#review-body');
    const rating = reviewStars || 5;
    try {
      const r = await API.post('/reviews', { heritageId: d.id, rating, body: bodyEl.value });
      UI.toast(r.earned ? `후기 등록! +${r.earned}P` : '후기를 수정했습니다.', '✍️');
      await Store.refreshMe();
      reviewStars = 0;
      UI.renderTop();
      await UI.refreshSheet();
    } catch (e) {
      UI.toast(e.message, '⚠️');
    }
  }

  async function buyGoods(goodsId) {
    if (!Store.user) { UI.authModal('login'); return; }
    try {
      const r = await API.post('/orders', { goodsId, qty: 1 });
      UI.toast(`${r.order.goods.name} 교환 완료! 잔액 ${r.points.toLocaleString()}P`, '🎁');
      await Store.refreshMe();
      UI.renderTop();
      UI.renderDrawer();
      UI.openView('goods');
    } catch (e) {
      UI.toast(e.message, '⚠️');
    }
  }

  function startTour() {
    const course = Store.activeCourse ? Store.courses.find((c) => c.id === Store.activeCourse) : null;
    let list = course
      ? course.stops.map((id) => Store.get(id)).filter(Boolean)
      : Store.filtered();
    if (!list.length) { UI.toast('표시할 문화유산이 없습니다.', '🤔'); return; }
    const next = list.find((h) => !Store.isVisited(h.id)) || list[0];
    if (course) UI.toast(`${course.name} — ${next.name}부터 시작합니다`, '🚩');
    selectHeritage(next.id);
  }

  function pickCourse(id) {
    Store.activeCourse = Store.activeCourse === id ? null : id;
    const c = Store.courses.find((x) => x.id === Store.activeCourse);
    UI.closeView();
    UI.closeSheet();
    syncAll();
    if (c) { MapView.fitCourse(c); UI.toast(`${c.name} 코스를 지도에 표시했습니다`, '🧭'); }
    else MapView.fitAll();
  }

  function categoryModal() {
    const cats = Store.categories;
    UI.el.modalCard.innerHTML = `
      <h3>분류로 보기</h3>
      <p class="m-sub">보고 싶은 유형만 지도에 남길 수 있습니다.</p>
      <div class="grid two">
        ${cats.map((c) => {
          const n = Store.heritage.filter((h) => h.category === c).length;
          const on = Store.filter.category === c;
          return `<button class="card" data-pick-cat="${Util.esc(c)}" style="${on ? 'border-color:' + Util.catHex(c) + ';border-width:2px' : ''}">
            <div class="card-body" style="text-align:center;padding:16px 10px">
              <div style="width:38px;height:38px;margin:0 auto 8px;border-radius:11px;display:grid;place-items:center;background:${Util.catHex(c)}">
                <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#fff">${Util.catIcon(c)}</svg>
              </div>
              <h4>${Util.esc(c)}</h4><p>${n}곳</p>
            </div></button>`;
        }).join('')}
      </div>
      <div style="height:12px"></div>
      <button class="btn line wide" data-pick-cat="">전체 보기</button>`;
    body.classList.add('modal-open');
    UI.el.modal.setAttribute('aria-hidden', 'false');
  }

  /* ══════════════════════ 구글 로그인 ══════════════════════ */

  const GoogleAuth = {
    loading: null,

    /** 구글 스크립트는 실제로 필요할 때만 불러온다 */
    load() {
      if (!Store.googleClientId) return Promise.resolve(false);
      if (this.loading) return this.loading;
      this.loading = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        s.onload = () => resolve(!!(window.google && window.google.accounts));
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
      return this.loading;
    },

    async mount(container) {
      if (!container) return;
      const ok = await this.load();
      if (!ok) {
        // 스크립트를 못 받으면 자리만 차지하지 않도록 치운다
        const or = container.nextElementSibling;
        if (or && or.classList.contains('or')) or.remove();
        container.remove();
        return;
      }
      window.google.accounts.id.initialize({
        client_id: Store.googleClientId,
        callback: onGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'center',
        locale: 'ko',
        width: 300
      });
    }
  };
  window.GoogleAuth = GoogleAuth;

  async function onGoogleCredential(res) {
    try {
      const r = await API.post('/auth/google', { credential: res.credential });
      API.token = r.token;
      await Store.refreshMe();
      UI.closeModal();
      UI.toast(
        r.created ? `환영합니다, ${r.user.nickname}님! +${r.welcomePoints}P` : `${r.user.nickname}님, 반갑습니다`,
        r.created ? '🎉' : '👋'
      );
      syncAll();
      if (UI.currentDetail) await UI.refreshSheet();
    } catch (e) {
      UI.modalError(e.message);
    }
  }

  /* ══════════════════════ 이벤트 위임 ══════════════════════ */

  document.addEventListener('click', async (e) => {
    const t = e.target;

    /* 문화유산으로 이동 */
    const go = t.closest('[data-go]');
    if (go) { selectHeritage(go.dataset.go); return; }

    /* 드로어 내비 */
    const nav = t.closest('[data-nav]');
    if (nav) {
      const k = nav.dataset.nav;
      UI.openDrawer(false);
      if (k === 'map') { UI.closeView(); UI.closeSheet(); MapView.fitAll(); }
      else UI.openView(k);
      return;
    }

    /* 탭 */
    const tab = t.closest('[data-tab]');
    if (tab) {
      UI.currentTab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === tab));
      UI.renderPane();
      return;
    }

    /* 코스 선택 */
    const course = t.closest('[data-course]');
    if (course) { pickCourse(course.dataset.course); return; }

    /* 분류 선택 (모달) */
    const pick = t.closest('[data-pick-cat]');
    if (pick) {
      Store.filter.category = pick.dataset.pickCat || null;
      UI.closeModal();
      syncAll();
      MapView.fitAll();
      return;
    }

    /* 검색 뷰 칩 */
    const chip = t.closest('[data-cat]');
    if (chip) {
      Store.filter.category = chip.dataset.cat || null;
      document.querySelectorAll('#cats .chip').forEach((c) => c.classList.toggle('on', c === chip));
      UI.Views.renderResults();
      UI.renderChips();
      MapView.render();
      return;
    }

    /* 굿즈 교환 */
    const buy = t.closest('[data-buy]');
    if (buy) { buyGoods(buy.dataset.buy); return; }

    /* 퀴즈 */
    const qo = t.closest('.qo');
    if (qo && !qo.disabled) {
      const card = qo.closest('.quiz');
      answerQuiz(Number(card.dataset.q), Number(qo.dataset.choice), card);
      return;
    }

    /* 별점 */
    const star = t.closest('[data-star]');
    if (star) {
      reviewStars = Number(star.dataset.star);
      document.querySelectorAll('#stars button').forEach((b) => {
        b.classList.toggle('on', Number(b.dataset.star) <= reviewStars);
      });
      return;
    }

    /* 랭킹 부문 · 기간 */
    const rs = t.closest('[data-rank-sort]');
    if (rs) { UI.setRank(rs.dataset.rankSort, null); UI.openView('ranking'); return; }
    const rp = t.closest('[data-rank-period]');
    if (rp) { UI.setRank(null, rp.dataset.rankPeriod); UI.openView('ranking'); return; }

    /* 시대 아코디언 */
    const era = t.closest('.era-head');
    if (era) { era.parentElement.classList.toggle('open'); return; }

    /* 이름 있는 액션 */
    const act = t.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;

    if (a === 'fav') {
      if (!Store.user) { UI.authModal('login'); return; }
      const r = await API.post('/favorites/' + UI.currentDetail.id);
      act.classList.toggle('on', r.active);
      await Store.refreshMe();
      UI.toast(r.active ? '즐겨찾기에 담았습니다' : '즐겨찾기에서 뺐습니다', r.active ? '🤍' : '🤍');
    }
    else if (a === 'audio') {
      const card = $('#audio-card');
      UI.Audio.speak(UI.currentDetail.audio, (playing) => card && card.classList.toggle('playing', playing));
    }
    else if (a === 'center') {
      UI.closeView();
      body.classList.add('sheet-peek');
      MapView.select(UI.currentDetail.id);
    }
    else if (a === 'checkin-gps') checkin(true);
    else if (a === 'checkin-manual') checkin(false);
    else if (a === 'review') submitReview();
    else if (a === 'clear-course') { Store.activeCourse = null; syncAll(); MapView.fitAll(); }
    else if (a === 'clear-cat') { Store.filter.category = null; syncAll(); MapView.fitAll(); }
    else if (a === 'clear-q') { Store.filter.query = ''; syncAll(); MapView.fitAll(); }
    else if (a === 'open-auth') { UI.openDrawer(false); UI.authModal('login'); }
    else if (a === 'switch-auth') UI.authModal(act.dataset.mode);
    else if (a === 'submit-auth') await doAuth(act.dataset.mode, act);
    else if (a === 'logout') {
      if (window.LocalAPI) {
        if (!confirm('스탬프·배지·포인트·감상 기록을 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
        await API.post('/auth/reset');
        await Store.refreshMe();
        UI.closeView();
        syncAll();
        UI.toast('기록을 모두 지웠습니다', '🧹');
        return;
      }
      await Store.logout();
      UI.closeView();
      syncAll();
      UI.toast('로그아웃되었습니다', '👋');
    }
    else if (a === 'save-profile') {
      try {
        await API.patch('/auth/me', {
          nickname: $('#p-nick').value,
          bio: $('#p-bio').value,
          avatarSeed: $('#p-seed').value
        });
        await Store.refreshMe();
        syncAll();
        UI.toast('저장했습니다', '✅');
      } catch (err) { UI.toast(err.message, '⚠️'); }
    }
  });

  async function doAuth(mode, btn) {
    if (window.LocalAPI) {
      const nick = $('#m-nick').value.trim();
      btn.disabled = true;
      try {
        const r = await Store.register('', '', nick);
        UI.closeModal();
        UI.toast(`반갑습니다, ${r.user.nickname}님! +${r.welcomePoints}P`, '🎉');
        syncAll();
        if (UI.currentDetail) await UI.refreshSheet();
      } catch (err) {
        UI.modalError(err.message);
      } finally { btn.disabled = false; }
      return;
    }
    const email = $('#m-email').value.trim();
    const pw = $('#m-pw').value;
    const nick = $('#m-nick') ? $('#m-nick').value.trim() : '';
    btn.disabled = true;
    try {
      if (mode === 'register') {
        const r = await Store.register(email, pw, nick);
        UI.closeModal();
        UI.toast(`환영합니다, ${r.user.nickname}님! +${r.welcomePoints}P`, '🎉');
      } else {
        const r = await Store.login(email, pw);
        UI.closeModal();
        UI.toast(`${r.user.nickname}님, 반갑습니다`, '👋');
      }
      syncAll();
      if (UI.currentDetail) await UI.refreshSheet();
    } catch (err) {
      UI.modalError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* 검색 입력 */
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      Store.filter.query = e.target.value;
      UI.Views.renderResults();
      UI.renderChips();
      MapView.render();
    }
    if (e.target.id === 'p-seed') {
      const p = $('#p-preview');
      if (p) p.style.background = Util.avatarBg(Number(e.target.value));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (body.classList.contains('modal-open')) UI.closeModal();
      else if (body.classList.contains('drawer-open')) UI.openDrawer(false);
      else if (body.classList.contains('view-open')) UI.closeView();
      else if (body.classList.contains('sheet-open')) UI.closeSheet();
    }
    if (e.key === 'Enter' && body.classList.contains('modal-open')) {
      const b = UI.el.modalCard.querySelector('[data-act="submit-auth"]');
      if (b && document.activeElement.tagName === 'INPUT') b.click();
    }
  });

  /* ══════════════════════ 고정 UI 버튼 ══════════════════════ */

  $('#btn-menu').addEventListener('click', () => UI.openDrawer(!body.classList.contains('drawer-open')));
  $('#drawer-backdrop').addEventListener('click', () => UI.openDrawer(false));
  $('#sheet-backdrop').addEventListener('click', () => UI.closeSheet());
  $('#view-back').addEventListener('click', () => UI.closeView());
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') UI.closeModal(); });
  $('#btn-cta').addEventListener('click', startTour);

  $('#btn-home').addEventListener('click', () => {
    UI.closeView(); UI.closeSheet(); UI.openDrawer(false);
    Store.activeCourse = null; Store.filter = { category: null, query: '' };
    syncAll();
    MapView.fitAll();
  });

  $('#btn-account').addEventListener('click', () => {
    if (Store.user) UI.openView('profile');
    else UI.authModal('login');
  });

  $('#btn-theme').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.querySelectorAll('[data-rail]').forEach((b) => {
    b.addEventListener('click', async () => {
      const k = b.dataset.rail;
      if (k === 'courses') UI.openView('courses');
      else if (k === 'search') UI.openView('search');
      else if (k === 'filter') categoryModal();
      else if (k === 'stamps') UI.openView('stamps');
      else if (k === 'locate') {
        b.classList.add('on');
        try {
          await MapView.locate();
          UI.toast('현재 위치를 표시했습니다', '📍');
          UI.Views.renderResults();
        } catch (err) { UI.toast(err.message, '⚠️'); }
        finally { setTimeout(() => b.classList.remove('on'), 900); }
      }
    });
  });

  /* 시트 드래그로 닫기 (모바일) */
  (function sheetDrag() {
    const grab = $('#sheet-grab');
    const sheet = $('#sheet');
    let startY = 0, delta = 0, active = false;
    grab.addEventListener('pointerdown', (e) => {
      active = true; startY = e.clientY; delta = 0;
      sheet.style.transition = 'none';
      grab.setPointerCapture(e.pointerId);
    });
    grab.addEventListener('pointermove', (e) => {
      if (!active) return;
      delta = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    });
    grab.addEventListener('pointerup', () => {
      if (!active) return;
      active = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (delta > 110) UI.closeSheet();
    });
  })();

  /* 공지 롤링 */
  function startNotices() {
    const box = $('#notice-text');
    let i = 0;
    function show() {
      const n = Store.notices[i % Store.notices.length];
      if (!n) return;
      box.classList.remove('swap');
      void box.offsetWidth;
      box.textContent = `${n.emoji} ${n.text}`;
      box.classList.add('swap');
      i++;
    }
    show();
    setInterval(show, 5200);
    $('#notice').addEventListener('click', () => UI.openView('intro'));
  }

  /* ══════════════════════ 시작 ══════════════════════ */

  async function boot() {
    // 우선순위: 사용자가 이 앱에서 고른 값 > 호스트가 찍어 둔 표식 > OS 설정
    const stamped = document.documentElement.getAttribute('data-theme');
    let theme = stamped || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    try { theme = localStorage.getItem('hanbat.theme') || theme; } catch {}
    document.documentElement.dataset.theme = theme;
    $('#theme-label').textContent = theme === 'dark' ? '주간 모드' : '야간 모드';

    MapView.init((id) => selectHeritage(id));

    try {
      await Store.bootstrap();
      await Store.refreshMe();
    } catch (e) {
      UI.toast('데이터를 불러오지 못했습니다. 서버를 확인해 주세요.', '⚠️');
      console.error(e);
    }

    try {
      syncAll();
      startNotices();
      MapView.fitAll();
    } catch (e) {
      console.error('[boot] UI 초기화 오류', e);
    }

    setTimeout(() => {
      $('#splash').classList.add('gone');
      setTimeout(() => { const s = $('#splash'); if (s) s.remove(); }, 700);
    }, 900);

    // 음성 목록 미리 로드 (일부 브라우저는 지연 로드)
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
