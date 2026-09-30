#!/usr/bin/env python3
"""
제주올(jejuall.com) 나경공인중개사 매물을 홈페이지(data/listings.json)로 가져옵니다.

  python3 scripts/sync_jejuall.py fetch   # 제주올에서 읽어 .sync/jejuall.json 에 저장 (오래 걸림)
  python3 scripts/sync_jejuall.py merge   # .sync/jejuall.json 을 data/listings.json 에 합침 (빠름)
  python3 scripts/sync_jejuall.py test FILE.html [detail.html]   # 저장한 페이지로 읽기 시험

두 단계로 나눈 이유: 제주올은 1분에 1번만 읽어 달라고 요청하므로(robots.txt Crawl-delay: 60)
읽기가 오래 걸립니다. 그동안 매물관리에서 저장한 내용이 덮어써지지 않도록,
합치기는 최신 파일을 다시 받은 뒤에 짧게 합니다.

합치는 규칙
  - 제주올 매물번호 N 은 홈페이지 매물번호 NK{N} 으로 연결
  - 가격·면적·거래·해시태그·층 등 제주올 정보는 매번 제주올 기준으로 갱신
  - 사진, 추천 여부, 제목(매물관리에서 바꾼 것)은 건드리지 않음
  - 제주올에서 사라진 매물은 '숨김'으로 (삭제하지 않음)
  - 읽은 매물 수가 너무 적으면(사이트 구조 변경 등) 아무것도 바꾸지 않고 멈춤
Python 3.9+ 표준 라이브러리만 사용합니다.
"""
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OFFICE_NUM = os.environ.get("JEJUALL_OFFICE", "180659")
BASE = "https://jejuall.com"
LIST_URL = f"{BASE}/CProperty/myHome/params/num/{OFFICE_NUM}"
DETAIL_URL = f"{BASE}/CProperty/detail?num={{num}}"
DELAY = float(os.environ.get("JEJUALL_DELAY", "60"))  # robots.txt Crawl-delay
MAX_PAGES = int(os.environ.get("JEJUALL_MAX_PAGES", "40"))
UA = "Mozilla/5.0 (compatible; NakyungHomepageSync/1.0; +mailto:nk2022@naver.com)"
KST = timezone(timedelta(hours=9))
SYNC_DIR = ROOT / ".sync"
LISTINGS = ROOT / "data" / "listings.json"
LISTINGS_JS = ROOT / "data" / "listings.js"


# ---------------------------------------------------------------- 작은 DOM
class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "text")

    def __init__(self, tag, attrs=None, parent=None, text=None):
        self.tag, self.attrs, self.parent, self.text = tag, dict(attrs or {}), parent, text
        self.children = []

    def iter(self):
        yield self
        for c in self.children:
            yield from c.iter()

    def links(self):
        return [n for n in self.iter() if n.tag == "a" and n.attrs.get("href")]


BLOCK = {"div", "p", "li", "tr", "td", "th", "dt", "dd", "br", "h1", "h2", "h3", "h4", "h5", "h6",
         "section", "article", "ul", "ol", "table", "tbody", "thead", "dl", "span", "strong", "em", "b", "label"}
VOID = {"br", "img", "input", "meta", "link", "hr", "area", "base", "col", "embed", "source", "track", "wbr"}
SKIP = {"script", "style", "noscript", "template"}


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        if not self.skip and tag not in SKIP:
            self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.cur.children.append(Node("#text", parent=self.cur, text=data))


def parse_html(src):
    b = _Builder()
    b.feed(src)
    return b.root


INLINE = {"b", "strong", "em", "i", "u", "small", "sup", "sub", "font"}


def text_of(node, sep=" "):
    """태그 사이를 sep 로 이어 붙인 글자 (굵게·기울임 같은 꾸밈 태그는 붙여서)."""
    out = []

    def walk(n):
        if n.tag == "#text":
            out.append(n.text)
            return
        brk = n.tag not in INLINE and n.tag != "#root"
        if brk:
            out.append(sep)
        for c in n.children:
            walk(c)
        if brk:
            out.append(sep)

    walk(node)
    s = "".join(out)
    s = re.sub(r"[ \t\r\f\v\u00a0]+", " ", s)
    s = re.sub(r" *\n[\s]*", "\n", s)
    return s.strip()


# ---------------------------------------------------------------- 값 해석
NUM_RE = re.compile(r"detail\?num=(\d+)")

TYPE_RULES = [  # (제주올 표기에 포함된 글자, 홈페이지 매물종류) — 앞쪽이 우선
    ("분양", "분양권"), ("오피스텔", "오피스텔"), ("도시형", "오피스텔"), ("아파트", "아파트"),
    ("빌라", "빌라·다세대"), ("연립", "빌라·다세대"), ("다세대", "빌라·다세대"),
    ("상가주택", "건물"), ("단독", "단독·다가구"), ("다가구", "단독·다가구"),
    ("원룸", "원룸·투룸"), ("투룸", "원룸·투룸"), ("쓰리룸", "원룸·투룸"),
    ("리조트", "기타"), ("콘도", "기타"), ("펜션", "기타"),
    ("전원", "전원주택"), ("농가", "전원주택"),
    ("상가건물", "건물"), ("상가", "상가·점포"), ("점포", "상가·점포"),
    ("토지", "토지·임야"), ("임야", "토지·임야"), ("사무실", "사무실"),
    ("공장", "공장·창고"), ("창고", "공장·창고"), ("건물", "건물"),
]
TYPE_WORD = re.compile(r"(아파트분양권|분양권|오피스텔/도시형|오피스텔|아파트|빌라연립다세대|빌라/연립/다세대|빌라|단독다가구|단독/다가구|"
                       r"원룸/투룸/쓰리룸|원룸|상가주택|리조트/콘도/펜션|전원/농가주택|전원주택|상가/점포|상가건물|상가|"
                       r"토지/임야|토지|건물|사무실|공장/창고|기타)")
DEAL_WORD = re.compile(r"(매매|전세|년월세|연월세|월세|연세|년세|임대)")
PRICE_RE = re.compile(r"([\d,]+)\s*(?:만원)?\s*/\s*([\d,]+)\s*만?원?|([\d,]{2,})\s*만원")
CITY_RE = re.compile(r"(제주시|서귀포시)\s+((?:\S+[읍면]\s+)?\S+?[동리가로](?=\s|$|\d))")


def map_type(word):
    for key, t in TYPE_RULES:
        if key in (word or ""):
            return t
    return "기타"


def to_num(s):
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0


def map_deal(word, price, rent):
    if word in ("매매",):
        return "매매"
    if word == "전세":
        return "전세"
    if word in ("연세", "년세"):
        return "연세"
    if word == "월세":
        return "월세"
    # 년월세·임대: 금액으로 구분 (제주는 연세 관행 — 월 300만원 이상이면 연세로 봄)
    if rent:
        return "연세" if rent >= 300 else "월세"
    return "매매" if word != "임대" else "월세"


def card_of(link, num):
    """매물 링크를 감싼 가장 큰 요소 중 다른 매물번호를 포함하지 않는 것 = 매물 카드."""
    node, best = link, link
    while node.parent is not None and node.parent.tag != "#root":
        nums = {m.group(1) for a in node.parent.links() for m in [NUM_RE.search(a.attrs["href"])] if m}
        if nums - {num}:
            break
        node = node.parent
        best = node
    return best


def parse_card_text(t):
    """카드 글자 → 매물 정보. 예: '오피스텔/도시형 매매 #급매 #노형에코하임 노형에코하임 제주시 노형동 ... 84.72㎡ ... 28,500만원'"""
    first_tag = t.find("#")
    head = t[:first_tag] if first_tag >= 0 else t
    tw = TYPE_WORD.search(head) or TYPE_WORD.search(t)
    dw = DEAL_WORD.search(head) or DEAL_WORD.search(t)
    tags = [x.strip(".,") for x in re.findall(r"#([^\s#]+)", t)]
    area_m = re.search(r"([\d]+(?:\.\d+)?)\s*(?:㎡|m²|m2)", t)
    price, rent = 0, 0
    after_area = t[area_m.end():] if area_m else t
    pm = PRICE_RE.search(after_area) or PRICE_RE.search(t)
    if pm:
        if pm.group(1):
            price, rent = to_num(pm.group(1)), to_num(pm.group(2))
        else:
            price = to_num(pm.group(3))
    city_m = CITY_RE.search(t)
    title = ""
    if city_m:
        before = [l.strip() for l in t[:city_m.start()].split("\n")]
        for line in reversed(before):
            clean = re.sub(r"#[^\s#]+", "", line).strip(" |·-")
            if not clean or TYPE_WORD.fullmatch(clean) or DEAL_WORD.fullmatch(clean) or re.fullmatch(r"[\d\-\s,]+", clean):
                continue
            if clean in ("홈페이지 이미지", "x") or len(clean) < 2:
                continue
            title = clean
            break
    word = dw.group(1) if dw else ""
    return {
        "jejuallType": tw.group(1) if tw else "",
        "type": map_type(tw.group(1) if tw else ""),
        "deal": map_deal(word, price, rent),
        "tags": tags,
        "title": title[:60],
        "city": city_m.group(1) if city_m else "제주시",
        "dong": city_m.group(2) if city_m else "",
        "area": to_num(area_m.group(1)) if area_m else 0,
        "price": int(price),
        "rent": int(rent) if map_deal(word, price, rent) in ("월세", "연세") else 0,
    }


def parse_list(src):
    """목록 페이지 → [매물]. 한 페이지에 신규리스트·중개업소리스트가 함께 있어도 번호로 중복 제거."""
    root = parse_html(src)
    seen, out = set(), []
    for a in root.links():
        m = NUM_RE.search(a.attrs["href"])
        if not m or m.group(1) in seen:
            continue
        num = m.group(1)
        card = card_of(a, num)
        info = parse_card_text(text_of(card, sep="\n"))
        if not info["area"] and not info["price"]:
            continue  # 매물 카드가 아닌 링크
        seen.add(num)
        info["num"] = num
        out.append(info)
    return out


DETAIL_LABELS = {
    "supplyArea": r"공급면적", "area": r"전용면적", "floorRaw": r"층수|해당층|층\s*/\s*총층", "roomsRaw": r"방\s*/\s*욕실|방수\s*/\s*욕실수",
    "direction": r"방향", "moveIn": r"입주가능일|입주일", "parking": r"주차대수|주차", "approvalDate": r"사용승인일|준공일",
    "maintenance": r"월\s*관리비|관리비", "addr": r"주소|소재지", "complex": r"단지명|건물명",
}


def parse_detail(src):
    """상세 페이지 → 추가 정보 (값을 못 찾으면 빈칸)."""
    root = parse_html(src)
    t = text_of(root, sep="\n")
    lines = [l.strip() for l in t.split("\n") if l.strip()]
    got = {}
    for key, lab in DETAIL_LABELS.items():
        rx = re.compile(rf"^(?:{lab})\s*[:：]?\s*(.*)$")
        for i, line in enumerate(lines):
            m = rx.match(line)
            if not m:
                continue
            val = m.group(1).strip() or (lines[i + 1] if i + 1 < len(lines) else "")
            if val and not rx.match(val):
                got[key] = val
                break
    d = {}
    if "supplyArea" in got:
        d["supplyArea"] = to_num(re.sub(r"[^\d.,]", "", got["supplyArea"].split("㎡")[0]))
    if "area" in got:
        a = to_num(re.sub(r"[^\d.,]", "", got["area"].split("㎡")[0]))
        if a:
            d["area"] = a
    if "floorRaw" in got:
        f = got["floorRaw"]
        m = re.search(r"(\S+?)\s*/\s*(\d+)\s*층", f)
        if m:
            fl = m.group(1)
            d["floor"], d["totalFloor"] = (fl[:-1] if re.fullmatch(r"-?\d+층", fl) else fl), m.group(2)
        else:
            d["floor"] = f.replace("층", "")
    if "roomsRaw" in got:
        m = re.search(r"(\d+)\s*(?:개)?\s*/\s*(\d+)", got["roomsRaw"])
        if m:
            d["rooms"], d["baths"] = m.group(1), m.group(2)
    for k in ("direction", "moveIn", "parking", "approvalDate", "maintenance", "addr", "complex"):
        if k in got:
            d[k] = got[k][:80]
    if "maintenance" in d and re.fullmatch(r"[\d,]+\s*원?", d["maintenance"]):
        won = to_num(re.sub(r"[^\d]", "", d["maintenance"]))
        d["maintenance"] = f"월 {won / 10000:g}만원" if won >= 10000 else f"월 {int(won):,}원"
    tags = re.findall(r"#([^\s#]+)", t)
    if tags:
        d["tags"] = list(dict.fromkeys(x.strip(".,") for x in tags))
    m = re.search(r"상세\s*설명\s*\n(.+?)(?:\n(?:중개사\s*정보|중개업소|담당자|사진|매물\s*위치|관련\s*매물)|$)", t, re.S)
    if m:
        d["desc"] = m.group(1).strip()[:2000]
    return d


# ---------------------------------------------------------------- 가져오기
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        cs = r.headers.get_content_charset() or "utf-8"
    try:
        return raw.decode(cs)
    except UnicodeDecodeError:
        return raw.decode("euc-kr", errors="replace")


_last = [0.0]


def polite_get(url):
    wait = DELAY - (time.time() - _last[0])
    if wait > 0 and _last[0]:
        time.sleep(wait)
    _last[0] = time.time()
    print(f"  읽는 중: {url}", flush=True)
    return get(url)


def signature(x):
    return json.dumps([x.get("type"), x.get("deal"), x.get("price"), x.get("rent"), x.get("area"), x.get("tags")], ensure_ascii=False)


def cmd_fetch():
    SYNC_DIR.mkdir(exist_ok=True)
    prev = {}
    if LISTINGS.exists():
        for l in json.loads(LISTINGS.read_text("utf-8")).get("listings", []):
            if l.get("jejuallNum"):
                prev[l["jejuallNum"]] = l
    items, seen = [], set()
    for page in range(1, MAX_PAGES + 1):
        url = LIST_URL if page == 1 else f"{BASE}/index.php/CProperty/myHome/params/num/{OFFICE_NUM}?page_data_list={page}"
        found = parse_list(polite_get(url))
        new = [x for x in found if x["num"] not in seen]
        print(f"  {page}쪽: 매물 {len(found)}건 (새로 {len(new)}건)")
        if not new:
            break
        for x in new:
            seen.add(x["num"])
            items.append(x)
    # 상세 정보: 새 매물이거나 목록 정보가 바뀐 매물만 (1분 간격이라 꼭 필요한 것만)
    need = [x for x in items if x["num"] not in prev or signature(x) != prev[x["num"]].get("jejuallSig") or not prev[x["num"]].get("addr")]
    limit = int(os.environ.get("JEJUALL_MAX_DETAILS", "200"))
    print(f"상세 페이지 {min(len(need), limit)}건 읽기 (전체 {len(items)}건 중 새로 생기거나 바뀐 것)")
    for x in need[:limit]:
        try:
            x["detail"] = parse_detail(polite_get(DETAIL_URL.format(num=x["num"])))
        except Exception as e:  # 한 건 실패해도 계속
            print(f"  ! {x['num']} 상세 읽기 실패: {e}")
    out = {"fetchedAt": datetime.now(KST).isoformat(timespec="minutes"), "count": len(items), "items": items}
    (SYNC_DIR / "jejuall.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), "utf-8")
    print(f"제주올 매물 {len(items)}건을 읽었습니다.")


def merge(data, fetched, now):
    """data(listings.json 내용)에 fetched(제주올에서 읽은 것)를 합침. 바뀐 건수를 돌려줌."""
    listings = data.setdefault("listings", [])
    by_num = {l.get("jejuallNum") or (l["id"][2:] if str(l.get("id", "")).startswith("NK") and l["id"][2:].isdigit() else None): l
              for l in listings}
    by_num.pop(None, None)
    old_count = sum(1 for l in by_num.values() if l.get("status") != "숨김")
    items = fetched["items"]
    if not items or (old_count >= 10 and len(items) < old_count * 0.5):
        raise SystemExit(f"제주올에서 읽은 매물이 {len(items)}건뿐입니다(기존 {old_count}건). 사이트 구조가 바뀌었을 수 있어 아무것도 바꾸지 않았습니다.")
    stats = {"added": 0, "updated": 0, "hidden": 0}
    live = set()
    for x in items:
        num = x["num"]
        live.add(num)
        d = x.get("detail", {})
        fields = {
            "type": x["type"], "deal": x["deal"], "price": x["price"], "rent": x["rent"],
            "area": d.get("area") or x["area"], "city": x["city"] or "제주시", "dong": x["dong"],
            "tags": d.get("tags") or x["tags"],
        }
        for k in ("supplyArea", "floor", "totalFloor", "rooms", "baths", "direction", "moveIn", "parking", "approvalDate", "maintenance", "addr"):
            if d.get(k):
                fields[k] = d[k]
        l = by_num.get(num)
        if l is None:
            title = d.get("complex") or x["title"] or f"{x['dong']} {x['type']}".strip()
            l = {"id": f"NK{num}", "status": "광고중", "featured": False, "title": title, "photos": [], "desc": d.get("desc", ""),
                 "createdAt": now, **fields}
            listings.append(l)
            stats["added"] += 1
        else:
            before = json.dumps(l, ensure_ascii=False, sort_keys=True)
            l.update(fields)
            if not l.get("desc") and d.get("desc"):
                l["desc"] = d["desc"]
            if l.get("status") == "숨김" and l.get("hiddenBy") == "sync":
                l["status"] = "광고중"  # 제주올에 다시 올라온 매물
                l.pop("hiddenBy", None)
            if json.dumps(l, ensure_ascii=False, sort_keys=True) != before:
                l["syncedAt"] = now
                stats["updated"] += 1
        l["jejuallNum"] = num
        l["jejuallSig"] = signature(x)
        l["source"] = f"제주올 매물번호 {num}"
    for num, l in by_num.items():
        if num not in live and l.get("status") == "광고중":
            l["status"] = "숨김"
            l["hiddenBy"] = "sync"
            l["syncedAt"] = now
            stats["hidden"] += 1
    data["updatedAt"] = now
    data["jejuallSyncedAt"] = now
    return stats


def write_listings(data):
    text = json.dumps(data, ensure_ascii=False, indent=2)
    LISTINGS.write_text(text + "\n", "utf-8")
    LISTINGS_JS.write_text(f"window.__LISTINGS__ = {text};\n", "utf-8")


def cmd_merge():
    src = SYNC_DIR / "jejuall.json"
    if not src.exists():
        raise SystemExit("먼저 fetch 를 실행하세요.")
    fetched = json.loads(src.read_text("utf-8"))
    data = json.loads(LISTINGS.read_text("utf-8")) if LISTINGS.exists() else {"listings": []}
    s = merge(data, fetched, datetime.now(KST).isoformat(timespec="minutes"))
    write_listings(data)
    print(f"새 매물 {s['added']}건 · 바뀐 매물 {s['updated']}건 · 제주올에서 내려가 숨김 처리 {s['hidden']}건")


def cmd_test(list_file, detail_file=None):
    items = parse_list(Path(list_file).read_text("utf-8", errors="replace"))
    print(f"목록에서 매물 {len(items)}건을 찾았습니다.")
    for x in items[:12]:
        print(f"  {x['num']} | {x['jejuallType']}→{x['type']} {x['deal']} | {x['title']} | {x['city']} {x['dong']} | {x['area']}㎡ | {x['price']}/{x['rent']} | #{' #'.join(x['tags'][:4])}")
    if detail_file:
        print(json.dumps(parse_detail(Path(detail_file).read_text("utf-8", errors="replace")), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "fetch":
        cmd_fetch()
    elif cmd == "merge":
        cmd_merge()
    elif cmd == "test" and len(sys.argv) > 2:
        cmd_test(*sys.argv[2:4])
    else:
        print(__doc__)
