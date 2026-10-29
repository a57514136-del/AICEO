# 나경 홈페이지 연동 — 화면 (streamlit run app.py)
import json
import time
from datetime import datetime

import streamlit as st

import homepage_sync as H

st.set_page_config(page_title="나경 홈페이지 연동", page_icon="🏠", layout="centered")


def wide_button(where, label, **kw):
    """Streamlit 새/옛 버전 모두에서 가로로 꽉 찬 버튼."""
    try:
        return where.button(label, width="stretch", **kw)
    except TypeError:
        return where.button(label, use_container_width=True, **kw)


cfg = H.load_config()

# ---------------------------------------------------------------- 왼쪽: 설정
with st.sidebar:
    st.header("GitHub 연결")
    st.caption("홈페이지가 저장된 곳입니다. 처음 한 번만 넣으면 됩니다.")
    owner = st.text_input("GitHub 계정", cfg["owner"])
    repo = st.text_input("저장소", cfg["repo"])
    token = st.text_input("접근 토큰", cfg["token"], type="password", placeholder="github_pat_로 시작")
    with st.expander("접근 토큰 만드는 법"):
        st.markdown(
            "1. GitHub 로그인 → 오른쪽 위 프로필 → **Settings** → 맨 아래 **Developer settings**\n"
            "2. **Personal access tokens → Fine-grained tokens → Generate new token**\n"
            "3. 이름: `나경 홈페이지 연동`, 기간: 1년\n"
            "4. Repository access: **Only select repositories → AICEO**\n"
            "5. Permissions → Repository permissions → **Contents: Read and write**\n"
            "6. **Generate token** → `github_pat_…` 복사해서 위 칸에 붙여 넣기\n\n"
            "토큰은 이 노트북의 `설정.json`에만 저장됩니다.")
    st.divider()
    st.header("노트북 사진 폴더")
    st.caption("아파트·오피스텔·토지·상가 폴더가 들어 있는 폴더. 폴더 이름(주소)으로 매물과 짝지어 올립니다. 비워 두면 제주올 사진을 씁니다.")
    photo_folder = st.text_input("사진 폴더 위치", cfg.get("photo_folder", ""), placeholder=r"예: C:\Users\나경\Desktop\매물사진")
    if photo_folder:
        found = H.scan_photo_folder(photo_folder)
        if found:
            st.success(f"사진이 든 폴더 {len(found)}개를 찾았습니다.")
        else:
            st.warning("이 위치에서 사진 폴더를 찾지 못했습니다. 파일 탐색기 주소창의 경로를 그대로 복사해 넣어 주세요.")
    st.divider()
    with st.expander("읽기 간격"):
        delay = st.slider("제주올 페이지 읽기 간격(초)", 20, 90, int(cfg.get("delay", 60)),
                          help="제주올은 1분에 한 번 읽기를 요청합니다(robots.txt). 너무 줄이면 접속이 막힐 수 있습니다.")
        max_photos = st.slider("매물당 최대 사진 수", 1, 20, int(cfg.get("max_photos", 12)))
    if wide_button(st, "💾 설정 저장"):
        cfg.update(owner=owner.strip(), repo=repo.strip(), token=token.strip(), photo_folder=photo_folder.strip(),
                   delay=delay, max_photos=max_photos)
        H.save_config(cfg)
        st.success("저장했습니다.")

# ---------------------------------------------------------------- 가운데: 버튼
st.title("🏠 나경 홈페이지 연동")
st.caption("제주올(오일장신문) 매물 → 나경공인중개사사무소 홈페이지")
if cfg.get("homepage"):
    st.markdown(f"홈페이지: [{cfg['homepage']}]({cfg['homepage']})")

if not cfg.get("token"):
    st.info("👈 왼쪽 **GitHub 연결**에 접근 토큰을 넣고 **설정 저장**을 눌러 주세요.")

c1, c2 = st.columns(2)
quick = wide_button(c1, "🆕 신규 매물 올리기", type="primary", disabled=not cfg.get("token"),
                  help="제주올에 새로 올린(끌어올린) 매물만 홈페이지에 올립니다. 보통 몇 분.")
full = wide_button(c2, "🔄 전체 점검", disabled=not cfg.get("token"),
                 help="모든 매물을 다시 맞춥니다: 내려간 매물 숨김, 상세정보·사진 채우기. 처음에는 2~3시간 걸립니다.")
st.caption("• 신규 매물 올리기: 새 매물 추가, 끌어올리기한 매물은 같은 매물로 이어 씀(사진·제목 유지)  \n"
           "• 전체 점검: 제주올에서 내린 매물은 홈페이지에서 숨김, 빠진 상세정보·사진 채움  \n"
           "• 사진: 노트북 사진 폴더(주소가 같은 폴더) → 없으면 제주올 사진")

if quick or full:
    mode = "quick" if quick else "full"
    lines = []
    box = st.empty()

    def log(msg):
        lines.append(f"{datetime.now().strftime('%H:%M:%S')}  {msg}")
        box.code("\n".join(lines[-40:]), language=None)
        with H.LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(lines[-1] + "\n")

    with st.spinner("작업 중입니다. 이 창을 닫지 말아 주세요…"):
        try:
            res = H.run(mode, H.load_config(), log=log)
            st.success(f"완료! 새 매물 {res['added']}건 · 끌어올리기 {res['reposted']}건 · 바뀐 매물 {res['updated']}건 · "
                       f"숨김 {res['hidden']}건 · 사진 {res['photos']}장. 1~2분 뒤 홈페이지에 나타납니다.")
            st.session_state["last"] = res
        except H.GitHubError as e:
            st.error(f"홈페이지 저장 문제: {e}")
        except Exception as e:
            st.error(f"멈췄습니다: {e}")
            log(f"멈춤: {e}")

if H.LOG_FILE.exists():
    with st.expander("지난 기록 보기"):
        tail = H.LOG_FILE.read_text("utf-8", errors="replace").splitlines()[-200:]
        st.code("\n".join(tail), language=None)
