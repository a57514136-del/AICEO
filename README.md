# 나경공인중개사사무소 REAL ESTATE

부동산 중개사무소 웹사이트 — 매물 소개, 조건별 물건 조회, 국토교통부 실거래가 자동 조회.

## 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 홈 (빠른 검색 · 종류 바로가기 · 추천 매물 · 신규 매물) |
| `listings.html` | 매물 목록 — 매물종류 탭 + 거래(매매·전세·월세·연세) 탭, 12개씩 페이지 |
| `search.html` | 물건조회 — 지역·읍면동·종류·거래·면적·가격·해시태그 검색 |
| `listing.html` | 매물 상세 (사진, 표시·광고 항목, 문의) |
| `admin.html` | **매물관리 — 매물 등록·수정·삭제, 상태(광고중/거래완료/숨김) 변경** |
| `assets/listings-core.js` | 매물종류·거래 목록, 가격 표기, 매물 카드 |
| `assets/admin.js` | 매물관리 동작 (연습 모드 / GitHub 저장) |
| `images/listings/` | 매물관리에서 올린 사진이 저장되는 곳 |
| `trades.html` | 실거래가 — 지역·단지 검색 |
| `services.html` | 중개분야 · 나경 소개 |
| `contact.html` | 연락처 · 지도 · 상담 신청 |
| `assets/layout.js` | 모든 페이지의 상단 메뉴·하단 정보 (**사무소 정보는 여기 `OFFICE`만 고치면 전 페이지 반영**) |
| `assets/style.css`, `assets/app.js` | 디자인과 동작 (외부 라이브러리 없음) |
| `data/listings.json`, `data/listings.js` | 매물 데이터 (매물관리가 자동으로 고침 — 직접 고칠 필요 없음) |
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

## 매물 등록·삭제 (매물관리)

사이트 하단의 **매물관리** 또는 `admin.html` 을 엽니다.

- **연습 모드:** 이 컴퓨터의 브라우저에만 저장됩니다. 같은 컴퓨터로 사이트를 열면 상단에 노란 "연습 모드" 줄과 함께 연습 매물이 보입니다. 손님에게는 보이지 않습니다.
- **홈페이지에 바로 반영:** GitHub 저장소에 바로 저장합니다. 처음 한 번 GitHub 접근 토큰이 필요합니다 (매물관리 화면의 "접근 토큰 만드는 법" 참고). 저장하면 1~2분 뒤 홈페이지에 나타납니다.
- 사진은 자동으로 줄여서 저장하며, 첫 번째 사진이 대표 사진입니다.
- 거래가 끝난 매물은 삭제하지 않고 상태를 **거래완료**로 바꾸면 흐리게 표시되고, **숨김**은 홈페이지에서 보이지 않습니다.

## 꼭 바꿔야 할 것

- 처음 매물 14건은 제주올 등록 매물에서 가져왔습니다. 층·방향·관리비 등 상세 항목과 사진은 매물관리에서 채워 주세요
- 통계 수치(누적 중개 건수 등) → 실제 수치
- 이미지는 임시 사진(picsum.photos)입니다 — 실제 매물·사무소 사진을 `assets/`에 넣고 경로를 바꿔 주세요

## 내 컴퓨터에서 열기

- **윈도우:** `사이트열기(윈도우).bat` 더블클릭 → 브라우저에 http://localhost:8000 이 열립니다
- **맥:** `사이트열기(맥).command` 더블클릭 (처음엔 우클릭 → 열기)
- 서버 없이 `index.html`을 바로 더블클릭해도 화면은 그대로 보입니다
- 직접 실행: `python3 -m http.server 8000`
