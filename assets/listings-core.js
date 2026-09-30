// 매물 공통: 종류·거래 목록, 가격 표기, 카드 모양, 데이터 불러오기
(() => {
  const TYPES = [
    "아파트", "분양권", "오피스텔", "빌라·다세대", "단독·다가구", "원룸·투룸",
    "상가·점포", "사무실", "토지·임야", "건물", "전원주택", "공장·창고", "기타",
  ];
  const DEALS = ["매매", "전세", "월세", "연세"];
  const CITIES = ["제주시", "서귀포시"];
  const STATUS = ["광고중", "거래완료", "숨김"];
  const LOCAL_KEY = "nk_listings_local";
  const MODE_KEY = "nk_admin_mode";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 만원 → "2억 8,500" / "8,500"
  const man = (v) => {
    v = Number(v) || 0;
    if (v >= 10000) {
      const eok = Math.floor(v / 10000), rest = v % 10000;
      return `${eok}억${rest ? " " + rest.toLocaleString() : ""}`;
    }
    return v.toLocaleString();
  };
  const priceText = (l) => {
    if (l.deal === "월세") return `${man(l.price)} / ${man(l.rent)}만원`;
    if (l.deal === "연세") return `${man(l.price)} / 연 ${man(l.rent)}만원`;
    return `${man(l.price)}${Number(l.price) >= 10000 && Number(l.price) % 10000 === 0 ? "" : "만"}원`.replace("억원", "억원");
  };
  const pyeong = (m2) => (Number(m2) / 3.3058).toFixed(1);
  const placeOf = (l) => [l.city, l.dong].filter(Boolean).join(" ");
  const tagsOf = (l) =>
    (Array.isArray(l.tags) ? l.tags : String(l.tags || "").split(/[\s,]+/))
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);

  const TYPE_ICON = {
    "토지·임야": '<path d="M4 40h56M8 40l10-14 8 8 10-16 12 22"/>',
    "상가·점포": '<path d="M8 40V20h48v20M4 20l6-10h44l6 10M24 40V28h16v12"/>',
    "사무실": '<path d="M16 40V6h32v34M22 12h6M36 12h6M22 20h6M36 20h6M22 28h6M36 28h6M4 40h56"/>',
    "건물": '<path d="M16 40V6h32v34M22 12h6M36 12h6M22 20h6M36 20h6M22 28h6M36 28h6M4 40h56"/>',
    "공장·창고": '<path d="M4 40V20l14 8V20l14 8V20l14 8V10h8v30z"/>',
  };
  const DEFAULT_ICON = '<path d="M4 40h56M12 40V22L32 8l20 14v18M26 40V28h12v12"/>';
  const placeholder = (l) =>
    `<div class="ph"><svg viewBox="0 0 64 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${TYPE_ICON[l.type] || DEFAULT_ICON}</svg><span>사진 준비중</span></div>`;

  function cardHTML(l) {
    const photo = (l.photos || [])[0];
    const tags = tagsOf(l).slice(0, 5);
    const done = l.status === "거래완료";
    return `
    <li class="card${done ? " is-done" : ""}">
      <a class="card__link" href="listing.html?id=${encodeURIComponent(l.id)}">
        <div class="card__img">
          ${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" />` : placeholder(l)}
          ${l.featured ? '<span class="badge badge--hot">추천</span>' : ""}
          ${done ? '<span class="badge badge--done">거래완료</span>' : ""}
        </div>
        <div class="card__body">
          <p class="card__labels"><span class="lbl">${esc(l.type)}</span><span class="lbl lbl--deal lbl--${esc(l.deal)}">${esc(l.deal)}</span></p>
          ${tags.length ? `<p class="card__tags">${tags.map((t) => `#${esc(t)}`).join(" ")}</p>` : ""}
          <h3 class="card__title">${esc(l.title)}</h3>
          <p class="card__place">${esc(placeOf(l))}</p>
          <dl class="card__facts">
            <div><dt>면적</dt><dd>${l.area ? `${l.area}㎡ <small>(${pyeong(l.area)}평)</small>` : "-"}</dd></div>
            <div><dt>가격</dt><dd class="card__price">${esc(priceText(l))}</dd></div>
          </dl>
        </div>
      </a>
    </li>`;
  }

  function matches(l, f) {
    if (f.type && l.type !== f.type) return false;
    if (f.deal && l.deal !== f.deal) return false;
    if (f.city && l.city !== f.city) return false;
    if (f.dong && !(l.dong || "").includes(f.dong)) return false;
    if (f.minArea && Number(l.area) < f.minArea) return false;
    if (f.maxArea && Number(l.area) > f.maxArea) return false;
    if (f.minPrice && Number(l.price) < f.minPrice) return false;
    if (f.maxPrice && Number(l.price) > f.maxPrice) return false;
    if (f.q) {
      const hay = [l.title, l.city, l.dong, l.type, l.deal, l.desc, ...tagsOf(l)].join(" ").toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w.replace(/^#/, "")))) return false;
    }
    return true;
  }

  const SORTS = {
    new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    areaDesc: (a, b) => b.area - a.area,
  };

  // 공개 페이지용: 광고중·거래완료만, 추천 먼저 X (정렬은 페이지가 결정)
  const publicOnly = (list) => list.filter((l) => l.status !== "숨김");

  const readLocal = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; }
  };
  const isPracticeMode = () => {
    try { return localStorage.getItem(MODE_KEY) === "local" && !!readLocal(); } catch { return false; }
  };

  // 사이트가 매물을 읽는 순서: 연습 모드(이 컴퓨터) → data/listings.json(웹) → data/listings.js(더블클릭)
  async function loadListings() {
    if (isPracticeMode()) return { ...readLocal(), practice: true };
    if (location.protocol.startsWith("http")) {
      try {
        const r = await fetch("data/listings.json", { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch {}
    }
    return window.__LISTINGS__ || { listings: [] };
  }

  function practiceBanner() {
    if (!isPracticeMode() || document.querySelector(".practice-bar")) return;
    const bar = document.createElement("div");
    bar.className = "practice-bar";
    bar.innerHTML = `연습 모드: 이 컴퓨터에만 저장된 매물을 보여주고 있어요. <a href="admin.html">매물관리</a> <button type="button">연습 모드 끄기</button>`;
    bar.querySelector("button").onclick = () => { try { localStorage.removeItem(MODE_KEY); } catch {} location.reload(); };
    document.body.prepend(bar);
  }

  function pagerHTML(page, pages) {
    if (pages <= 1) return "";
    const btn = (p, label = p, cls = "") =>
      `<button type="button" data-page="${p}" class="${cls}${p === page ? " is-active" : ""}"${p === page ? ' aria-current="page"' : ""}>${label}</button>`;
    const start = Math.max(1, Math.min(page - 4, pages - 9));
    const end = Math.min(pages, start + 9);
    let h = page > 1 ? btn(page - 1, "‹ 이전", "pg-nav") : "";
    for (let p = start; p <= end; p++) h += btn(p);
    if (page < pages) h += btn(page + 1, "다음 ›", "pg-nav");
    return h;
  }

  window.NK = { TYPES, DEALS, CITIES, STATUS, LOCAL_KEY, MODE_KEY, esc, man, priceText, pyeong, placeOf, tagsOf,
    cardHTML, placeholder, matches, SORTS, publicOnly, loadListings, readLocal, isPracticeMode, practiceBanner, pagerHTML };
})();
