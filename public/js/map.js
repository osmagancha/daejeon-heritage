/* ══════════════════════════════════════════════════════════════════
   지도 — Leaflet 기반. 문화유산 마커, 테마 코스 경로, 내 위치.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const DAEJEON = [36.3372, 127.4045];
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  // 키 없이 쓸 수 있는 OSM 타일에 CSS 필터를 씌워 라이트/다크 두 가지 톤을 만든다.
  const TILE_FILTER = {
    light: 'saturate(.62) contrast(1.04) brightness(1.03)',
    dark: 'invert(1) hue-rotate(180deg) saturate(.5) brightness(.82) contrast(1.08)'
  };
  const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자';

  let map = null;
  let tileLayer = null;
  let markers = new Map();
  let routeLayer = null;
  let meLayer = null;
  let radiusLayer = null;

  /* ── 서버 없는 배포판용 벡터 기본 지도 ──────────────────────────
     타일 이미지를 받지 않고 OSM 데이터(ODbL)를 앱이 직접 그린다.
     선 하나하나를 레이어로 만들면 느리므로 종류별로 한 겹씩 묶는다. */

  const BASE_STYLE = {
    light: {
      water:    { color: '#9dc0d0', weight: 0.8, fillColor: '#c3dae5', fillOpacity: 1 },
      river:    { color: '#a6c8d8', weight: 2.2 },
      district: { color: '#dcd1bc', weight: 1 },
      boundary: { color: '#bda98c', weight: 2, dashArray: '7 5' },
      rail:     { color: '#b0a795', weight: 1.3, dashArray: '2 6' },
      motorway: { color: '#e3c68f', weight: 3.2 },
      trunk:    { color: '#e9d3a8', weight: 2.4 },
      primary:  { color: '#efe4cb', weight: 1.6 },
      label:    'rgba(22,24,28,.55)'
    },
    dark: {
      water:    { color: '#2c4c5a', weight: 0.8, fillColor: '#1e333d', fillOpacity: 1 },
      river:    { color: '#2f5262', weight: 2.2 },
      district: { color: '#2a2d33', weight: 1 },
      boundary: { color: '#433d33', weight: 2, dashArray: '7 5' },
      rail:     { color: '#3a3730', weight: 1.3, dashArray: '2 6' },
      motorway: { color: '#544731', weight: 3.2 },
      trunk:    { color: '#443b2b', weight: 2.4 },
      primary:  { color: '#312d26', weight: 1.6 },
      label:    'rgba(242,238,230,.5)'
    }
  };

  /** 방향을 잡아 주는 지명 (지도에 글자가 하나도 없으면 읽기 어렵다) */
  const PLACES = [
    { n: '대전역',       lat: 36.3325, lng: 127.4344, big: true },
    { n: '둔산',         lat: 36.3510, lng: 127.3845, big: true },
    { n: '유성온천',     lat: 36.3543, lng: 127.3446 },
    { n: '대덕연구단지', lat: 36.3900, lng: 127.3650 },
    { n: '보문산',       lat: 36.3020, lng: 127.4190 },
    { n: '계족산',       lat: 36.3830, lng: 127.4290 },
    { n: '대청호',       lat: 36.4300, lng: 127.4900 },
    { n: '갑천',         lat: 36.3700, lng: 127.3760 },
    { n: '금강',         lat: 36.4750, lng: 127.3900 },
    { n: '진잠',         lat: 36.3090, lng: 127.3240 }
  ];

  function buildBasemap(theme) {
    const B = window.__BASEMAP__;
    const S = BASE_STYLE[theme === 'dark' ? 'dark' : 'light'];
    const group = L.layerGroup();
    const add = (lines, style) => {
      if (lines && lines.length) {
        L.polyline(lines, Object.assign({ interactive: false, lineJoin: 'round', lineCap: 'round' }, style)).addTo(group);
      }
    };

    if (B.water && B.water.length) {
      L.polygon(B.water.map((ring) => [ring]), Object.assign({ interactive: false }, S.water)).addTo(group);
    }
    add(B.river, S.river);
    add(B.district, S.district);
    add(B.rail, S.rail);
    add(B.primary, Object.assign({ className: 'road-primary' }, S.primary));
    add(B.trunk, S.trunk);
    add(B.motorway, S.motorway);
    add(B.boundary, S.boundary);

    PLACES.forEach((p) => {
      L.marker([p.lat, p.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'place-label' + (p.big ? ' big' : ''),
          html: '<span style="color:' + S.label + '">' + Util.esc(p.n) + '</span>',
          iconSize: [0, 0]
        })
      }).addTo(group);
    });
    return group;
  }

  function pinHtml(item, index, done, active) {
    return (
      `<div class="pin ${done ? 'done' : ''} ${active ? 'active' : ''}" style="--pin:${Util.catHex(item.category)}">` +
        `<div class="pin-body"><svg viewBox="0 0 24 24">${Util.catIcon(item.category)}</svg></div>` +
        `<div class="pin-tip"></div>` +
        (index != null ? `<span class="pin-num">${done ? '✓' : index}</span>` : '') +
        `<span class="pin-label">${Util.esc(item.name)}</span>` +
      `</div>`
    );
  }

  const MapView = {
    get map() { return map; },

    init(onSelect) {
      map = L.map('map', {
        center: DAEJEON,
        zoom: 12,
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        zoomSnap: 0.25
      });
      this.onSelect = onSelect;
      this.setTheme(document.documentElement.dataset.theme);
      // 벡터 지도는 대전 일대만 담고 있으므로 그 밖으로 나가지 않게 한다.
      // setMaxBounds 는 컨테이너 크기를 읽으므로 레이아웃이 잡힌 뒤에 건다.
      if (window.__BASEMAP__) {
        this.whenSized(() => {
          map.setMinZoom(10.5);
          map.setMaxBounds(L.latLngBounds([36.10, 127.14], [36.58, 127.70]));
        });
      }
      map.on('click', () => this.onSelect && this.onSelect(null));
      // 낮은 배율에서는 이름표를 숨겨 마커가 겹쳐 보이지 않게 한다
      const syncZoomClass = () => {
        const z = map.getZoom();
        map.getContainer().classList.toggle('zoomed-out', z < 13);
        map.getContainer().classList.toggle('far-out', z < 11.5);
      };
      map.on('zoomend', syncZoomClass);
      syncZoomClass();
      return map;
    },

    setTheme(theme) {
      if (!map) return;
      if (tileLayer) map.removeLayer(tileLayer);
      if (window.__BASEMAP__) {
        tileLayer = buildBasemap(theme);
        tileLayer.addTo(map);
        map.attributionControl.addAttribution(ATTR);
        return;
      }
      tileLayer = L.tileLayer(TILE_URL, { attribution: ATTR, maxZoom: 19 }).addTo(map);
      tileLayer.getContainer().style.filter = TILE_FILTER[theme === 'dark' ? 'dark' : 'light'];
    },

    /** 마커 다시 그리기 */
    render() {
      if (!map) return;
      markers.forEach((m) => map.removeLayer(m));
      markers.clear();

      const list = Store.filtered();
      const course = Store.activeCourse ? Store.courses.find((c) => c.id === Store.activeCourse) : null;
      const order = course ? course.stops : null;

      list.forEach((item) => {
        if (course && !course.stops.includes(item.id)) return;
        const idx = order ? order.indexOf(item.id) + 1 : null;
        const done = Store.isVisited(item.id);
        const active = Store.activeId === item.id;
        const marker = L.marker([item.lat, item.lng], {
          icon: L.divIcon({
            className: 'pin-wrap',
            html: pinHtml(item, idx, done, active),
            iconSize: [44, 54],
            iconAnchor: [22, 54]
          }),
          riseOnHover: true,
          zIndexOffset: active ? 1000 : 0
        });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          this.onSelect && this.onSelect(item.id);
        });
        marker.addTo(map);
        markers.set(item.id, marker);
      });

      this.drawRoute(course);
    },

    drawRoute(course) {
      if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
      if (!course) return;
      const pts = course.stops
        .map((id) => Store.get(id))
        .filter(Boolean)
        .map((h) => [h.lat, h.lng]);
      if (pts.length < 2) return;

      routeLayer = L.layerGroup([
        L.polyline(pts, { color: '#ffffff', weight: 9, opacity: .55, lineJoin: 'round' }),
        L.polyline(pts, {
          color: course.color || '#b8392c', weight: 4, opacity: .95,
          dashArray: '1 11', lineCap: 'round', lineJoin: 'round'
        })
      ]).addTo(map);
      routeLayer.getLayers().forEach((l) => l.bringToBack && l.bringToBack());
    },

    select(id, opts) {
      opts = opts || {};
      this.render();
      const item = Store.get(id);
      if (!item) return;
      const offsetY = opts.offset === false ? 0 : -window.innerHeight * 0.18;
      this.whenSized(() => {
        map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 15), { duration: .8 });
        if (offsetY) setTimeout(() => map.panBy([0, offsetY], { animate: true, duration: .4 }), 820);
      });
    },

    /**
     * 컨테이너 크기가 잡힌 뒤에 실행 (초기 렌더 경합 방지).
     *
     * 크기가 0 인 채로 지도를 옮기면 좌표 계산이 NaN 이 되어 Leaflet 이 던진다.
     * 그러니 한 번 기다려 보고 마는 대신, 크기가 잡힐 때까지 짧게 되묻고
     * 끝내 잡히지 않으면(숨겨진 화면 등) 아예 하지 않는다.
     */
    whenSized(cb, tries = 12) {
      if (!map) return;
      const s = map.getSize();
      if (s.x > 0 && s.y > 0) return cb();
      map.invalidateSize();
      if (tries <= 0) return;
      setTimeout(() => this.whenSized(cb, tries - 1), 120);
    },

    _fit(pts, pad) {
      if (!pts.length) return;
      this.whenSized(() => {
        const bounds = L.latLngBounds(pts).pad(pad);
        const z = map.getBoundsZoom(bounds, false);
        if (!isFinite(z)) { map.setView(bounds.getCenter(), 12); return; }
        map.flyToBounds(bounds, { duration: .9 });
      });
    },

    fitAll(list) {
      this._fit((list || Store.filtered()).map((h) => [h.lat, h.lng]), 0.18);
    },

    fitCourse(course) {
      this._fit(course.stops.map((id) => Store.get(id)).filter(Boolean).map((h) => [h.lat, h.lng]), 0.25);
    },

    showMe(lat, lng, accuracy) {
      if (meLayer) map.removeLayer(meLayer);
      if (radiusLayer) map.removeLayer(radiusLayer);
      meLayer = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'me-wrap', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
        zIndexOffset: 900
      }).addTo(map);
      if (accuracy && accuracy < 2000) {
        radiusLayer = L.circle([lat, lng], {
          radius: accuracy, color: '#2f7fe0', weight: 1, opacity: .4, fillOpacity: .08, interactive: false
        }).addTo(map);
      }
    },

    locate() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('이 브라우저는 위치 기능을 지원하지 않습니다.'));
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            Store.myPos = { lat: latitude, lng: longitude, accuracy };
            this.showMe(latitude, longitude, accuracy);
            map.flyTo([latitude, longitude], 15, { duration: .9 });
            resolve(Store.myPos);
          },
          (err) => reject(new Error(
            err.code === 1 ? '위치 권한이 거부되었습니다.' : '위치를 찾지 못했습니다.'
          )),
          { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 }
        );
      });
    },

    invalidate() { if (map) setTimeout(() => map.invalidateSize(), 60); }
  };

  window.MapView = MapView;
})();
