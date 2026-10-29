#!/usr/bin/env python3
"""
나경 홈페이지 연동 — 노트북(한국)에서 실행합니다.
제주올(오일장신문) 나경공인중개사 매물을 읽어 홈페이지(GitHub 저장소)에 올립니다. 사진도 제주올에 올린 사진을 받아 함께 올립니다.

  python homepage_sync.py quick   # 신규 매물만 빠르게 (보통 몇 분)
  python homepage_sync.py full    # 전체 점검: 내려간 매물 숨김, 상세정보·사진 채우기 (처음엔 오래 걸림)

제주올은 해외 서버(GitHub 등)의 접속을 막고 있어 이 프로그램은 한국의 노트북에서 돌아야 합니다.
화면으로 쓰려면 같은 폴더의 app.py (홈페이지연동_실행.bat) 를 실행하세요.
"""
import base64
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 같은 폴더의 sync_jejuall.py(배포용 복사본) → 없으면 저장소의 scripts/ 에서
for cand in (HERE, HERE.parent.parent / "scripts"):
    if (cand / "sync_jejuall.py").exists():
        sys.path.insert(0, str(cand))
        break
import sync_jejuall as J  # noqa: E402

CONFIG_FILE = HERE / "설정.json"
LOG_FILE = HERE / "기록.txt"
DEFAULTS = {"owner": "a57514136-del", "repo": "AICEO", "branch": "main", "token": "",
            "delay": 60, "photo_delay": 3, "max_photos": 12, "photo_folder": "", "homepage": "https://a57514136-del.github.io/AICEO/"}
API = os.environ.get("GITHUB_API", "https://api.github.com").rstrip("/")


# ---------------------------------------------------------------- 설정
def load_config():
    cfg = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(CONFIG_FILE.read_text("utf-8")))
        except ValueError:
            pass
    return cfg


def save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), "utf-8")


# ---------------------------------------------------------------- GitHub
class GitHubError(Exception):
    pass


class GitHub:
    def __init__(self, cfg):
        self.owner, self.repo, self.branch, self.token = cfg["owner"], cfg["repo"], cfg["branch"], cfg["token"].strip()
        if not self.token:
            raise GitHubError("GitHub 접근 토큰이 없습니다. 왼쪽 'GitHub 연결'에 토큰을 넣고 저장해 주세요.")

    def call(self, path, method="GET", body=None, raw=False):
        req = urllib.request.Request(
            f"{API}/repos/{self.owner}/{self.repo}{path}", method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self.token}", "X-GitHub-Api-Version": "2022-11-28",
                     "Accept": "application/vnd.github.raw+json" if raw else "application/vnd.github+json",
                     "Content-Type": "application/json", "User-Agent": "nakyung-homepage-sync"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            msg = ""
            try:
                msg = json.loads(e.read().decode()).get("message", "")
            except Exception:
                pass
            raise GitHubError({
                401: "토큰이 맞지 않거나 만료되었습니다. 토큰을 새로 만들어 넣어 주세요.",
                403: "토큰에 쓰기 권한이 없습니다. 토큰 권한에서 Contents: Read and write 를 선택해 주세요.",
                404: "저장소나 파일을 찾을 수 없습니다. 계정·저장소 이름을 확인해 주세요.",
                409: "저장소가 비어 있습니다.",
                422: "그사이 저장소가 바뀌었습니다. 잠시 후 다시 눌러 주세요.",
            }.get(e.code, f"GitHub 오류 {e.code}: {msg}")) from None
        except urllib.error.URLError as e:
            raise GitHubError(f"인터넷 연결을 확인해 주세요 ({e.reason}).") from None
        return data.decode("utf-8") if raw else (json.loads(data) if data else None)

    def read_listings(self):
        text = self.call(f"/contents/data/listings.json?ref={self.branch}", raw=True)
        return json.loads(text)

    def commit(self, files, message):
        """files: {경로: bytes | None(삭제)} 를 커밋 한 번으로."""
        ref = self.call(f"/git/ref/heads/{self.branch}")
        parent = ref["object"]["sha"]
        base_tree = self.call(f"/git/commits/{parent}")["tree"]["sha"]
        tree = []
        for path, content in files.items():
            if content is None:
                tree.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
                continue
            blob = self.call("/git/blobs", "POST", {"content": base64.b64encode(content).decode(), "encoding": "base64"})
            tree.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        new_tree = self.call("/git/trees", "POST", {"base_tree": base_tree, "tree": tree})
        commit = self.call("/git/commits", "POST", {"message": message, "tree": new_tree["sha"], "parents": [parent]})
        self.call(f"/git/refs/heads/{self.branch}", "PATCH", {"sha": commit["sha"]})


def listings_files(data):
    text = json.dumps(data, ensure_ascii=False, indent=2)
    return {"data/listings.json": (text + "\n").encode("utf-8"),
            "data/listings.js": f"window.__LISTINGS__ = {text};\n".encode("utf-8")}


# ---------------------------------------------------------------- 제주올 읽기
class Reader:
    def __init__(self, cfg, log, should_stop=lambda: False):
        self.delay = max(5.0, float(cfg.get("delay", 60)))
        self.photo_delay = max(0.5, float(cfg.get("photo_delay", 3)))
        self.log, self.should_stop = log, should_stop
        self._last = 0.0
        self._photo_rule = None  # 원본 사진 주소 규칙(처음 찾은 것을 계속 사용)

    def _wait(self, gap):
        w = gap - (time.time() - self._last)
        while w > 0:
            if self.should_stop():
                raise KeyboardInterrupt
            time.sleep(min(w, 1))
            w = gap - (time.time() - self._last)
        self._last = time.time()

    def page(self, url):
        self._wait(self.delay)
        self.log(f"  읽는 중: {url.replace(J.BASE, '제주올')}")
        return J.get(url)

    def binary(self, url):
        self._wait(self.photo_delay)
        req = urllib.request.Request(url, headers={"User-Agent": J.UA, "Referer": J.BASE + "/"})
        with urllib.request.urlopen(req, timeout=60) as r:
            ctype = r.headers.get("Content-Type", "")
            data = r.read()
        if not ctype.startswith("image/") and not data[:3] == b"\xff\xd8\xff":
            raise ValueError("사진이 아님")
        return data

    def photo(self, thumb_path):
        """썸네일 경로 → 가장 큰 사진 bytes (원본 주소 규칙을 한 번 찾으면 계속 사용)."""
        cands = J.photo_candidates(thumb_path)
        if self._photo_rule is not None:
            cands = [cands[self._photo_rule]] + [c for i, c in enumerate(cands) if i != self._photo_rule]
        for i, c in enumerate(cands):
            try:
                data = self.binary(J.BASE + c)
                if self._photo_rule is None:
                    self._photo_rule = J.photo_candidates(thumb_path).index(c)
                    self.log("  사진: " + ("원본 크기로 받습니다." if "_thumb" not in c else "제주올 공개 사진(작은 크기)으로 받습니다."))
                return data
            except Exception:
                continue
        return None


def shrink(data, max_side=1600, quality=82):
    try:
        from PIL import Image
    except ImportError:
        return data
    try:
        im = Image.open(io.BytesIO(data))
        im = im.convert("RGB")
        if max(im.size) > max_side:
            im.thumbnail((max_side, max_side))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=quality, optimize=True)
        return out.getvalue() if out.tell() < len(data) or max(im.size) < max_side else data
    except Exception:
        return data


# ---------------------------------------------------------------- 노트북 사진 폴더 (폴더 이름 = 제주올 광고 주소)
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _norm(s):
    return re.sub(r"[\s()\[\]_.,·~]|제주특별자치도|제주도|제주시|서귀포시|번지", "", str(s or "")).lower()


def _jibun(s):
    m = re.search(r"(?:산\s*)?(\d{1,5})(?:\s*-\s*(\d{1,5}))?(?!.*\d)", str(s or ""))
    return (f"{m.group(1)}-{m.group(2)}" if m.group(2) else m.group(1)) if m else ""


def _dong_core(s):
    d = re.sub(r"\s*(산\s*)?\d.*$", "", str(s or "")).strip().split(" ")[-1] if s else ""
    return re.sub(r"(동|리|읍|면)$", "", d)


def scan_photo_folder(root):
    """사진이 들어 있는 폴더들 → [(폴더 경로, [사진 파일…])]. 아파트/오피스텔/토지/상가 › 주소 폴더 구조."""
    out = []
    root = Path(root)
    if not root.is_dir():
        return out
    for d, _dirs, files in os.walk(root):
        imgs = sorted([Path(d) / f for f in files if Path(f).suffix.lower() in IMG_EXT],
                      key=lambda p: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", p.name)])
        if imgs and Path(d) != root:
            out.append((Path(d), imgs))
    return out


def match_folder(listing, folders):
    """매물 주소(예: 노형동 1294-4)와 이름이 맞는 폴더. 지번이 같고 동 이름이 들어 있으면 짝. 단지명이 폴더 이름에 있어도 짝."""
    addr = listing.get("addr", "")
    lj, ld = _jibun(addr), _dong_core(addr) or _dong_core(listing.get("dong", ""))
    title = _norm(listing.get("title"))
    best, best_score = None, 0
    for path, imgs in folders:
        name = path.name
        fn, fj = _norm(name), _jibun(name)
        score = 0
        if lj and fj == lj:
            score += 60
            if ld and ld in fn:
                score += 30
        if len(title) >= 3 and title in fn and not re.search(r"(동|리|읍|면)$", listing.get("title", "")):
            score += 40
        if score > best_score:
            best, best_score = (path, imgs), score
    return best if best_score >= 60 else None


# ---------------------------------------------------------------- 실행
def run(mode, cfg=None, log=print, should_stop=lambda: False):
    """mode: 'quick'(신규만) | 'full'(전체 점검). 결과 요약 dict 를 돌려줌."""
    cfg = cfg or load_config()
    started = time.time()
    gh = GitHub(cfg)
    rd = Reader(cfg, log, should_stop)
    now = lambda: datetime.now(J.KST).isoformat(timespec="minutes")

    log("홈페이지의 현재 매물을 불러옵니다…")
    data = gh.read_listings()
    known = {}
    for l in data.get("listings", []):
        n = l.get("jejuallNum") or (l["id"][2:] if str(l.get("id", "")).startswith("NK") and l["id"][2:].isdigit() else None)
        if n:
            known[n] = l
    log(f"  홈페이지 매물 {len(data.get('listings', []))}건")

    # 1) 목록 읽기
    items, seen = [], set()
    if mode == "quick":
        log("제주올 신규리스트를 최신순으로 읽습니다 (이미 있는 매물이 나오면 멈춤)…")
        for p in range(1, 7):
            src = rd.page(J.LIST_URL if p == 1 else f"{J.LIST_URL}?page_new={p}")
            found = [x for x in J.parse_list(src) if x["num"] not in seen]
            for x in found:
                seen.add(x["num"])
                items.append(x)
            new_here = [x for x in found if x["num"] not in known]
            log(f"  {p}쪽: 매물 {len(found)}건, 홈페이지에 없는 매물 {len(new_here)}건")
            if not new_here:
                break
    else:
        log("제주올 중개업소 리스트 전체를 읽습니다…")
        last, empty = 1, 0
        p = 1
        while p <= min(last, J.MAX_PAGES):
            url = J.LIST_URL if p == 1 else f"{J.BASE}/index.php/CProperty/myHome/params/num/{J.OFFICE_NUM}?page_data_list={p}"
            src = rd.page(url)
            if p == 1:
                nums = [int(n) for n in re.findall(r"page_data_list=(\d+)", src)]
                last = max(nums) if nums else 1
                log(f"  모두 {last}쪽입니다.")
            found = [x for x in J.parse_list(src) if x["num"] not in seen]
            for x in found:
                seen.add(x["num"])
                items.append(x)
            log(f"  {p}쪽: 새로 {len(found)}건 (지금까지 {len(items)}건)")
            empty = 0 if found else empty + 1
            if empty >= 3:
                break
            p += 1
    if not items:
        raise RuntimeError("제주올에서 매물을 하나도 읽지 못했습니다. 제주올 화면이 바뀌었거나 접속이 막혔을 수 있습니다.")
    live_known = sum(1 for l in known.values() if l.get("status") != "숨김")
    if mode == "full" and live_known >= 10 and len(items) < live_known * 0.5:
        raise RuntimeError(f"제주올에서 읽은 매물이 {len(items)}건뿐입니다(홈페이지 {live_known}건). "
                           "제주올 화면이 바뀌었을 수 있어 아무것도 바꾸지 않았습니다.")

    # 2) 상세 읽기: 새 매물 · 바뀐 매물 · 상세를 아직 안 읽은 매물 · 사진이 없는 매물
    def needs_detail(x):
        old = known.get(x["num"])
        if old is None:
            return True
        if mode == "quick":
            return False
        return (J.signature(x) != old.get("jejuallSig") or not old.get("detailAt") or not old.get("photos"))
    need = [x for x in items if needs_detail(x)]
    log(f"상세 페이지 {len(need)}건을 읽습니다 (1건에 약 {int(rd.delay)}초)…")
    for i, x in enumerate(need, 1):
        try:
            src = rd.page(J.DETAIL_URL.format(num=x["num"]))
            x["detail"] = J.parse_detail(src)
            x["photoUrls"] = J.parse_gallery(src)
            log(f"  [{i}/{len(need)}] {x['num']} {x['detail'].get('addr', '') or x['dong']} · 사진 {len(x['photoUrls'])}장")
        except KeyboardInterrupt:
            raise
        except Exception as e:
            log(f"  [{i}/{len(need)}] {x['num']} 상세 읽기 실패: {e}")

    # 3) 합치기 (끌어올리기로 번호만 바뀐 매물은 기존 사진·제목 유지)
    try:
        stats = J.merge(data, {"items": items}, now(), hide_missing=(mode == "full"), repost_any=(mode == "quick"))
    except SystemExit as e:  # 안전장치(읽은 매물이 너무 적음) → 화면에 이유 표시
        raise RuntimeError(str(e.code)) from None
    log(f"정리: 새 매물 {stats['added']}건 · 끌어올리기 {stats['reposted']}건 · 바뀐 매물 {stats['updated']}건 · 숨김 {stats['hidden']}건")

    # 4) 사진: ① 노트북 사진 폴더(주소로 짝) → ② 없으면 제주올 사진. 이미 사진이 있는 매물은 건드리지 않음
    by_num = {l.get("jejuallNum"): l for l in data["listings"] if l.get("jejuallNum")}
    max_photos = int(cfg.get("max_photos", 12))
    pending, saved_listings, saved_photos = {}, 0, 0
    local_listings = 0
    def flush(final=False):
        nonlocal pending
        if not pending and not final:
            return
        files = dict(pending)
        files.update(listings_files(data))
        n_img = sum(1 for k in pending if k.startswith("images/"))
        gh.commit(files, f"제주올 연동: 매물 정보" + (f" · 사진 {n_img}장" if n_img else "") + f" ({now()})")
        pending = {}

    folder = (cfg.get("photo_folder") or "").strip()
    if folder:
        folders = scan_photo_folder(folder)
        log(f"노트북 사진 폴더에서 사진 폴더 {len(folders)}개를 찾았습니다. 주소로 매물과 짝짓습니다…")
        if not folders:
            log(f"  ! '{folder}' 에서 사진이 든 폴더를 찾지 못했습니다. 설정의 사진 폴더 위치를 확인해 주세요.")
        used = set()
        for l in data["listings"]:
            if l.get("photos") or l.get("status") == "숨김":
                continue
            m = match_folder(l, [f for f in folders if f[0] not in used])
            if not m:
                continue
            used.add(m[0])
            paths = []
            for k, img in enumerate(m[1][:max_photos], 1):
                try:
                    path = f"images/listings/{l['id']}-{k}.jpg"
                    pending[path] = shrink(img.read_bytes())
                    paths.append(path)
                except OSError:
                    continue
            if paths:
                l["photos"], l["photosFrom"] = paths, "노트북"
                local_listings += 1
                saved_listings += 1
                saved_photos += len(paths)
                log(f"  {l['title']} ← 폴더 '{m[0].name}' 사진 {len(paths)}장")
                if local_listings % 8 == 0:
                    log("  중간 저장…")
                    flush()
        log(f"  노트북 사진으로 채운 매물 {local_listings}건")
    photo_jobs = [(by_num[x["num"]], x["photoUrls"]) for x in items
                  if x.get("photoUrls") and x["num"] in by_num and not by_num[x["num"]].get("photos")]


    if photo_jobs:
        log(f"노트북에 사진 폴더가 없는 매물 {len(photo_jobs)}건은 제주올 사진을 받습니다…")
    for i, (l, urls) in enumerate(photo_jobs, 1):
        paths = []
        for k, u in enumerate(urls[:max_photos], 1):
            try:
                img = rd.photo(u)
            except KeyboardInterrupt:
                raise
            if not img:
                continue
            path = f"images/listings/{l['id']}-{k}.jpg"
            pending[path] = shrink(img)
            paths.append(path)
        if paths:
            l["photos"] = paths
            l["photosFrom"] = "제주올"
            saved_listings += 1
            saved_photos += len(paths)
        log(f"  [{i}/{len(photo_jobs)}] {l['title']} · 사진 {len(paths)}장")
        if i % 6 == 0:
            log("  중간 저장…")
            flush()
    log("홈페이지에 저장합니다…")
    flush(final=True)

    took = int(time.time() - started)
    result = {**stats, "photoListings": saved_listings, "photos": saved_photos, "read": len(items),
              "minutes": round(took / 60, 1), "at": now(), "mode": mode}
    msg = (f"완료 ({result['minutes']}분): 새 매물 {stats['added']}건 · 끌어올리기 {stats['reposted']}건 · "
           f"바뀐 매물 {stats['updated']}건 · 숨김 {stats['hidden']}건 · 사진 {saved_photos}장(매물 {saved_listings}건). "
           f"1~2분 뒤 홈페이지에 나타납니다.")
    log(msg)
    return result


def _file_log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode not in ("quick", "full"):
        print(__doc__)
        sys.exit(0)
    try:
        run(mode, log=_file_log)
    except (GitHubError, RuntimeError) as e:
        _file_log(f"멈춤: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        _file_log("중간에 멈췄습니다.")
        sys.exit(1)
