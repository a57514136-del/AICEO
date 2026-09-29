# 나경공인중개사사무소 REAL ESTATE

부동산 중개사무소 웹사이트 — 매물 소개, 조건별 물건 조회, 국토교통부 실거래가 자동 조회.

## 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 홈 (소개 · 중개분야 · 추천 매물 3개 · 빠른 물건조회) |
| `listings.html` | 매물 — 유형별 탭 |
| `search.html` | 물건조회 — 지역·유형·거래·금액 검색 |
| `trades.html` | 실거래가 — 지역·단지 검색 |
| `services.html` | 중개분야 · 나경 소개 |
| `contact.html` | 연락처 · 지도 · 상담 신청 |
| `assets/layout.js` | 모든 페이지의 상단 메뉴·하단 정보 (**사무소 정보는 여기 `OFFICE`만 고치면 전 페이지 반영**) |
| `assets/style.css`, `assets/app.js` | 디자인과 동작 (외부 라이브러리 없음) |
| `data/listings.json` | 매물 목록 — **예시 데이터이므로 실제 매물로 교체** |
| `data/trades.json` | 실거래가 데이터 (자동 생성) |
| `scripts/fetch-trades.mjs` | 공공데이터포털 API로 실거래가를 받아 `data/trades.json` 저장 |
| `.github/workflows/update-trades.yml` | 매일 06:00(KST) 실거래가 자동 갱신 |

## 사이트 공개 (GitHub Pages)

1. 저장소 **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)`
2. 잠시 후 `https://<계정>.github.io/<저장소>/` 에서 확인

## 실거래가 자동 조회 켜기

1. [공공데이터포털](https://www.data.go.kr)에서 **국토교통부_아파트 매매 실거래가 자료** 활용신청 → 인증키 발급
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `MOLIT_API_KEY` / Value: 발급받은 인증키
3. **Actions → 실거래가 자동 조회 → Run workflow** 로 한 번 실행해 확인
4. 조회 지역은 워크플로의 `LAWD_CODES`(시군구 코드 5자리)로 변경 — 기본값 제주시(50110)·서귀포시(50130)

로컬에서 직접 실행: `MOLIT_API_KEY=인증키 node scripts/fetch-trades.mjs` (Node 18+)

## 꼭 바꿔야 할 것

- `data/listings.js` 예시 매물 → 실제 매물 (사이트는 이 파일을 먼저 읽습니다. `listings.json`도 같은 내용으로 맞춰 두세요)
- 통계 수치(누적 중개 건수 등) → 실제 수치
- 이미지는 임시 사진(picsum.photos)입니다 — 실제 매물·사무소 사진을 `assets/`에 넣고 경로를 바꿔 주세요

## 내 컴퓨터에서 열기

- **윈도우:** `사이트열기(윈도우).bat` 더블클릭 → 브라우저에 http://localhost:8000 이 열립니다
- **맥:** `사이트열기(맥).command` 더블클릭 (처음엔 우클릭 → 열기)
- 서버 없이 `index.html`을 바로 더블클릭해도 화면은 그대로 보입니다
- 직접 실행: `python3 -m http.server 8000`
