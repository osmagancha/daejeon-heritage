'use strict';

/**
 * 서버 없이 도는 단일 HTML 배포판을 만든다.
 *
 *   node tools/build-standalone.js [기본지도JS경로]
 *
 * 결과: dist/hanbat.html
 * 지도는 타일 이미지를 받지 않고 OSM 데이터(ODbL)를 벡터로 그린다.
 * 기본 지도 데이터는 tools/make-basemap.py 로 굽는다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'hanbat.html');

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const basePath = process.argv[2] || path.join(ROOT, 'tools', 'basemap.js');
const basemap = fs.existsSync(basePath)
  ? fs.readFileSync(basePath, 'utf8')
  : (console.warn(`[build] 기본 지도 데이터가 없습니다: ${basePath}
` +
                  '        먼저 python tools/make-basemap.py 를 실행하세요.'), '');

/* index.html 의 본문만 가져오고 스크립트 태그는 걷어낸다 */
const html = read('public', 'index.html');
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
if (!bodyMatch) throw new Error('index.html 에서 body 를 찾지 못했습니다.');
const bodyMarkup = bodyMatch[1].replace(/<script[\s\S]*?<\/script>\s*/g, '').trim();

/* 인라인 스크립트 안에서 </script> 가 깨지지 않게 */
const safe = (js) => js.replace(/<\/script>/gi, '<\\/script>');

const parts = [
  '<title>한밭기행</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />',
  '<style>' + read('tools', 'vendor', 'leaflet.css') + '</style>',
  '<style>' + read('public', 'css', 'style.css') + '</style>',
  bodyMarkup,
  // 지도 라이브러리는 파일 안에 넣어 외부 의존을 줄인다
  '<script>' + safe(read('tools', 'vendor', 'leaflet.js')) + '</script>',
  // 3D 는 용량이 커서 CDN 에서 받고, 실패하면 안내 문구로 대체된다
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
  basemap ? '<script>' + safe(basemap) + '</script>' : '',
  '<script>' + safe(read('server', 'seed', 'heritage.js')) + '</script>',
  '<script>' + safe(read('server', 'seed', 'city.js')) + '</script>',
  '<script>' + safe(read('server', 'avatar.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'local-api.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'api.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'illustrate.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'avatar-art.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'avatar-3d.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'three-view.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'map.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'panels.js')) + '</script>',
  '<script>' + safe(read('public', 'js', 'app.js')) + '</script>'
].filter(Boolean);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, parts.join('\n'), 'utf8');

const mb = (fs.statSync(OUT).size / 1e6).toFixed(2);
const shapes = basemap ? (basemap.match(/\],\[/g) || []).length : 0;
console.log(`dist/hanbat.html 생성 — ${mb}MB` +
  (basemap ? ` (벡터 기본 지도 내장, 선분 약 ${shapes.toLocaleString()}개)` : ' (기본 지도 없음)'));
