// 공통 메뉴(상단)와 하단 연락처를 모든 페이지에 똑같이 넣습니다.
// 사무소 정보를 바꿀 때는 이 파일의 OFFICE 만 고치면 모든 페이지에 반영됩니다.
(() => {
  const OFFICE = {
    name: "나경 공인중개사사무소",
    ceo: "강나경 (공인중개사)",
    phone: "010-3381-0856",
    email: "nk2022@naver.com",
    address: "제주시 국기로 14, 대림이편한세상아파트 상가동 102호",
    regNo: "50110-2021-00176",
    hours: "평일 09:00–19:00 · 토 10:00–16:00",
  };
  window.OFFICE = OFFICE;

  const MENU = [
    { id: "listings", href: "listings.html", label: "매물" },
    { id: "search", href: "search.html", label: "물건조회" },
    { id: "trades", href: "trades.html", label: "실거래가" },
    { id: "services", href: "services.html", label: "중개분야" },
    { id: "contact", href: "contact.html", label: "연락처" },
  ];

  const LOGO =
    '<svg class="logo" viewBox="0 0 150 100" fill="currentColor" aria-hidden="true"><path d="M8 8h14v84H8z"/><path d="M58 8h14v84H58z"/><path d="M18 8h6l48 84h-6z"/><path d="M82 8h14v84H82z"/><path d="M96 50 138 8h10l-40 42z"/><path d="M104 46l44 46h-16L96 56z"/></svg>';
  window.NK_LOGO = LOGO;

  const page = document.body.dataset.page || "home";

  const nav = document.querySelector("[data-nav]");
  if (nav) {
    nav.outerHTML = `
    <nav class="nav" aria-label="주 메뉴">
      <a class="nav__brand" href="index.html">${LOGO}<span>나경공인중개사</span></a>
      <div class="nav__links" id="nav-links">
        ${MENU.map((m) => `<a href="${m.href}"${m.id === page ? ' aria-current="page"' : ""}>${m.label}</a>`).join("")}
      </div>
      <a class="btn btn--light nav__cta" href="contact.html#form">상담 예약</a>
      <button class="nav__toggle" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="nav-links">
        <span></span><span></span><span></span>
      </button>
    </nav>`;
    const t = document.querySelector(".nav__toggle");
    t.addEventListener("click", () => {
      const open = t.getAttribute("aria-expanded") !== "true";
      t.setAttribute("aria-expanded", open);
      document.querySelector(".nav").classList.toggle("is-open", open);
    });
  }

  const foot = document.querySelector("[data-footer]");
  if (foot) {
    foot.outerHTML = `
    <footer class="footer">
      <div class="wrap footer__grid">
        <div>
          <svg class="footer__house" viewBox="0 0 64 40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M0 38h64M8 38V20L24 8l16 12v18M18 38V28h12v10"/></svg>
          <div class="footer__brand">${OFFICE.name}<br /><small>REAL ESTATE</small></div>
          <p class="muted">방문 전 전화 주시면 원하시는 매물을 미리 준비해 두겠습니다.</p>
          <nav class="footer__menu" aria-label="하단 메뉴">
            <a href="index.html">홈</a>${MENU.map((m) => `<a href="${m.href}">${m.label}</a>`).join("")}
          </nav>
        </div>
        <dl class="footer__info">
          <div><dt>대표</dt><dd>${OFFICE.ceo}</dd></div>
          <div><dt>전화</dt><dd><a href="tel:${OFFICE.phone}">${OFFICE.phone}</a></dd></div>
          <div><dt>이메일</dt><dd><a href="mailto:${OFFICE.email}">${OFFICE.email}</a></dd></div>
          <div><dt>주소</dt><dd>${OFFICE.address}</dd></div>
          <div><dt>등록번호</dt><dd>${OFFICE.regNo}</dd></div>
          <div><dt>영업시간</dt><dd>${OFFICE.hours}</dd></div>
        </dl>
      </div>
      <div class="wrap footer__bottom">
        <span>© ${new Date().getFullYear()} 나경공인중개사사무소</span>
        <span class="footer__links"><a href="admin.html">매물관리</a> <a href="#top">맨 위로 ↑</a></span>
      </div>
    </footer>`;
  }

  document.querySelectorAll("[data-logo]").forEach((el) => (el.outerHTML = LOGO));

  // data-office="phone" 같은 자리에 사무소 정보를 채움
  document.querySelectorAll("[data-office]").forEach((el) => {
    el.textContent = OFFICE[el.dataset.office] ?? "";
  });
})();
