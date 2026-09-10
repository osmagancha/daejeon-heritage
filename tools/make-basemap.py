"""대전 지역 기본 지도를 OSM 데이터(ODbL)로 만들어 JS 로 굽는다.

타일 이미지를 내려받지 않는다. Overpass API 로 경계·하천·도로·철도
지오메트리만 받아 단순화한 뒤, 앱이 직접 벡터로 그린다.
출처 표기: © OpenStreetMap 기여자 (ODbL).

    python tools/make-basemap.py          # 내려받고 굽기
    python tools/make-basemap.py --cache  # 캐시된 응답으로 다시 굽기만
"""
import json, math, os, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "overpass.json")
OUT = os.path.join(HERE, "basemap.js")

S, W, N, E = 36.14, 127.19, 36.54, 127.64
BBOX = f"{S},{W},{N},{E}"
ENDPOINT = "https://overpass-api.de/api/interpreter"
UA = "hanbat-giheng/1.0 (school heritage map; single vector basemap build)"

QUERY = f"""
[out:json][timeout:180];
(
  relation["boundary"="administrative"]["admin_level"~"^(4|6)$"]({BBOX});
  way["waterway"="river"]({BBOX});
  way["natural"="water"]({BBOX});
  way["highway"~"^(motorway|trunk|primary)$"]({BBOX});
  way["railway"="rail"]({BBOX});
);
out geom;
"""

# 종류별 단순화 허용 오차(도 단위). 1도 ≈ 111km 이므로 0.0004 ≈ 45m.
TOLERANCE = {
    "boundary": 0.0006,
    "water": 0.0004,
    "river": 0.0003,
    "road": 0.00025,
    "rail": 0.00025,
}
MIN_POINTS = 2


def fetch():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read().decode("utf-8"))


def perp(p, a, b):
    (y0, x0), (y1, x1), (y2, x2) = p, a, b
    dy, dx = y2 - y1, x2 - x1
    if dy == 0 and dx == 0:
        return math.hypot(y0 - y1, x0 - x1)
    t = ((y0 - y1) * dy + (x0 - x1) * dx) / (dy * dy + dx * dx)
    t = max(0.0, min(1.0, t))
    return math.hypot(y0 - (y1 + t * dy), x0 - (x1 + t * dx))


def simplify(pts, tol):
    """Douglas-Peucker (반복 구현: 긴 선에서도 재귀 한계에 걸리지 않는다)"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        worst, idx = 0.0, -1
        for k in range(i + 1, j):
            d = perp(pts[k], pts[i], pts[j])
            if d > worst:
                worst, idx = d, k
        if worst > tol and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def classify(el):
    t = el.get("tags", {}) or {}
    if el["type"] == "relation":
        return "boundary", t.get("admin_level")
    if t.get("waterway") == "river":
        return "river", None
    if t.get("natural") == "water":
        return "water", None
    if t.get("railway") == "rail":
        return "rail", None
    hw = t.get("highway")
    if hw in ("motorway", "trunk", "primary"):
        return "road", hw
    return None, None


def geom_of(el):
    """way 는 geometry, relation 은 멤버 way 들의 geometry 를 모아 돌려준다."""
    lines = []
    if el["type"] == "way" and el.get("geometry"):
        lines.append([(p["lat"], p["lon"]) for p in el["geometry"]])
    elif el["type"] == "relation":
        for m in el.get("members", []):
            if m.get("type") == "way" and m.get("geometry"):
                lines.append([(p["lat"], p["lon"]) for p in m["geometry"]])
    return lines


def main():
    if "--cache" in sys.argv and os.path.exists(CACHE):
        data = json.load(open(CACHE, encoding="utf-8"))
        print("캐시된 Overpass 응답 사용", file=sys.stderr)
    else:
        print("Overpass 에 요청하는 중… (수십 초 걸릴 수 있습니다)", file=sys.stderr)
        data = fetch()
        json.dump(data, open(CACHE, "w", encoding="utf-8"))

    out = {"boundary": [], "district": [], "river": [], "water": [], "rail": [],
           "motorway": [], "trunk": [], "primary": []}
    raw_pts = kept_pts = 0

    for el in data.get("elements", []):
        kind, sub = classify(el)
        if not kind:
            continue
        if kind == "boundary":
            bucket = "boundary" if sub == "4" else "district"
            tol = TOLERANCE["boundary"]
        elif kind == "road":
            bucket = sub
            tol = TOLERANCE["road"]
        else:
            bucket = kind
            tol = TOLERANCE.get(kind, 0.0003)

        for line in geom_of(el):
            raw_pts += len(line)
            s = simplify(line, tol)
            if len(s) < MIN_POINTS:
                continue
            kept_pts += len(s)
            out[bucket].append([[round(a, 5), round(b, 5)] for a, b in s])

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.__BASEMAP__=")
        json.dump(out, f, separators=(",", ":"))
        f.write(";")

    counts = " ".join(f"{k}:{len(v)}" for k, v in out.items() if v)
    print(f"{counts}\n점 {raw_pts} -> {kept_pts} | basemap.js "
          f"{os.path.getsize(OUT)/1e6:.2f}MB")


if __name__ == "__main__":
    main()
