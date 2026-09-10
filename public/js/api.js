/* ══════════════════════════════════════════════════════════════════
   API 클라이언트 + 전역 상태 저장소
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const TOKEN_KEY = 'hanbat.token';

  const API = {
    get token() {
      if (window.LocalAPI) return window.LocalAPI.token();
      try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    },
    set token(v) {
      if (window.LocalAPI) return;
      try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch {}
    },

    async call(method, path, body) {
      // 서버 없이 도는 배포판에서는 브라우저 안의 구현으로 흐른다
      if (window.LocalAPI) return window.LocalAPI(method, path, body);

      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.token) headers.Authorization = 'Bearer ' + this.token;

      const res = await fetch('/api' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let data = null;
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) {
        const err = new Error(data.error || '요청에 실패했습니다.');
        err.status = res.status;
        throw err;
      }
      return data;
    },

    get(p) { return this.call('GET', p); },
    post(p, b) { return this.call('POST', p, b || {}); },
    patch(p, b) { return this.call('PATCH', p, b || {}); },
    del(p) { return this.call('DELETE', p); }
  };

  /* ------------------------------------------------------------ 상태 저장소 */

  const listeners = new Set();

  const Store = {
    heritage: [],
    heritageById: new Map(),
    courses: [],
    badges: [],
    notices: [],
    categories: [],
    ratings: {},
    googleClientId: '',

    me: null,            // {user, visits, favorites, badges, quiz, courses, orders}
    activeId: null,      // 선택된 문화유산
    activeCourse: null,  // 선택된 코스 id
    filter: { category: null, query: '' },
    myPos: null,

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(evt, payload) { listeners.forEach((fn) => fn(evt, payload)); },

    /* 파생 상태 헬퍼 */
    get user() { return this.me && this.me.user; },
    isVisited(id) { return !!(this.me && this.me.visits.some((v) => v.heritageId === id)); },
    isFavorite(id) { return !!(this.me && this.me.favorites.includes(id)); },
    quizDone(id, i) { return !!(this.me && this.me.quiz.keys.includes(id + ':' + i)); },
    visitedCount() { return this.me ? new Set(this.me.visits.map((v) => v.heritageId)).size : 0; },

    get(id) { return this.heritageById.get(id); },

    /** 필터가 적용된 목록 */
    filtered() {
      const q = this.filter.query.trim().toLowerCase();
      return this.heritage.filter((h) => {
        if (this.filter.category && h.category !== this.filter.category) return false;
        if (!q) return true;
        return (
          h.name.toLowerCase().includes(q) ||
          (h.hanja || '').includes(q) ||
          h.summary.toLowerCase().includes(q) ||
          h.address.toLowerCase().includes(q) ||
          (h.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      });
    },

    async bootstrap() {
      const data = await API.get('/bootstrap');
      this.heritage = data.heritage;
      this.heritageById = new Map(data.heritage.map((h) => [h.id, h]));
      this.courses = data.courses;
      this.badges = data.badges;
      this.notices = data.notices;
      this.categories = data.categories;
      this.ratings = data.ratings || {};
      this.googleClientId = data.googleClientId || '';
      this.emit('bootstrap');
    },

    async refreshMe() {
      if (!API.token) { this.me = null; this.emit('me'); return null; }
      try {
        const data = await API.get('/auth/me');
        this.me = data.user ? data : null;
        if (!data.user) API.token = '';
      } catch (e) {
        if (e.status === 401) { API.token = ''; this.me = null; }
      }
      this.emit('me');
      return this.me;
    },

    async login(email, password) {
      const r = await API.post('/auth/login', { email, password });
      API.token = r.token;
      await this.refreshMe();
      return r;
    },

    async register(email, password, nickname) {
      const r = await API.post('/auth/register', { email, password, nickname });
      API.token = r.token;
      await this.refreshMe();
      return r;
    },

    async logout() {
      try { await API.post('/auth/logout'); } catch {}
      API.token = '';
      this.me = null;
      this.emit('me');
    }
  };

  /* ------------------------------------------------------------ 유틸 */

  const Util = {
    /** 문자열 → 0~359 색상 시드 */
    hueOf(str) {
      let h = 0;
      for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360;
      return h;
    },
    avatarBg(seed) {
      const h = typeof seed === 'number' ? seed : Util.hueOf(seed);
      return `linear-gradient(135deg, hsl(${h} 52% 48%), hsl(${(h + 48) % 360} 58% 40%))`;
    },
    catColor(cat) {
      const map = {
        '고건축': 'var(--c-고건축)',
        '성곽': 'var(--c-성곽)',
        '서원·향교': 'var(--c-서원향교)',
        '근대건축': 'var(--c-근대건축)'
      };
      return map[cat] || 'var(--brown)';
    },
    catHex(cat) {
      const dark = document.documentElement.dataset.theme === 'dark';
      const map = dark
        ? { '고건축': '#c08f6c', '성곽': '#8db07f', '서원·향교': '#d8b356', '근대건축': '#7ea9c0' }
        : { '고건축': '#8c5a3c', '성곽': '#5f7a50', '서원·향교': '#a9832f', '근대건축': '#4a6d80' };
      return map[cat] || '#8c5a3c';
    },
    date(ts) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
    },
    ago(ts) {
      const s = (Date.now() - ts) / 1000;
      if (s < 60) return '방금';
      if (s < 3600) return Math.floor(s / 60) + '분 전';
      if (s < 86400) return Math.floor(s / 3600) + '시간 전';
      if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
      return Util.date(ts);
    },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); },
    distanceKm(a, b, c, d) {
      const R = 6371, r = (x) => (x * Math.PI) / 180;
      const dLat = r(c - a), dLng = r(d - b);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    },
    /** 분류별 아이콘 path (24x24) */
    catIcon(cat) {
      switch (cat) {
        case '성곽':
          return '<path d="M3 20V9l3 2 3-3 3 3 3-3 3 3 3-2v11z"/>';
        case '근대건축':
          return '<path d="M4 21V6h16v15zM8 9h2v2H8zm0 4h2v2H8zm6-4h2v2h-2zm0 4h2v2h-2z"/>';
        case '서원·향교':
          return '<path d="M12 3 2 9h20zM5 11h2v7H5zm6 0h2v7h-2zm6 0h2v7h-2zM3 19h18v2H3z"/>';
        default:
          return '<path d="M12 4 2 11h3v8h14v-8h3zM9 13h6v6H9z"/>';
      }
    }
  };

  window.API = API;
  window.Store = Store;
  window.Util = Util;
})();
