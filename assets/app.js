// 나경공인중개사사무소 — 공개 페이지 동작 (홈 · 매물 · 물건조회 · 매물상세 · 실거래가 · 연락처)
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const { esc, man, cardHTML, matches, SORTS, publicOnly, pagerHTML, TYPES, DEALS } = window.NK;
  const PER_PAGE = 12;

  const setParams = (obj) => {
    const q = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== "" && v != null && v !== 0 && !(k === "page" && v === 1)) q.set(k, v); });
    history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
  };
  const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;

  // 카드 목록 + 페이지 번호
  function renderGrid(list, { grid, pager, count, page, onPage, empty }) {
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    page = Math.min(Math.max(1, page), pages);
    grid.innerHTML = list.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(cardHTML).join("");
    if (count) count.textContent = list.length.toLocaleString();
    if (empty) empty.hidden = list.length > 0;
    if (pager) {
      pager.innerHTML = pagerHTML(page, pages);
      pager.onclick = (e) => {
        const b = e.target.closest("[data-page]");
        if (!b) return;
        onPage(Number(b.dataset.page));
        grid.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }
    return page;
  }

  // 검색 폼 <-> 조건
  const FILTER_KEYS = ["city", "dong", "type", "deal", "minArea", "maxArea", "minPrice", "maxPrice", "q"];
  function fillSelects(root) {
    $$('select[name="type"]', root).forEach((s) => s.insertAdjacentHTML("beforeend", TYPES.map((t) => `<option>${t}</option>`).join("")));
    $$('select[name="deal"]', root).forEach((s) => s.insertAdjacentHTML("beforeend", DEALS.map((t) => `<option>${t}</option>`).join("")));
  }
  function readForm(form) {
    const f = {};
    FILTER_KEYS.forEach((k) => {
      const el = form.elements[k];
      if (!el) return;
      f[k] = /Area|Price/.test(k) ? num(el.value) : el.value.trim();
    });
    return f;
  }
  function writeForm(form, src) {
    FILTER_KEYS.forEach((k) => { if (form.elements[k] && src.get(k)) form.elements[k].value = src.get(k); });
  }

  NK.practiceBanner();

  NK.loadListings().then((data) => {
    const all = publicOnly(data.listings || []);
    // 공개 목록 정렬: 광고중 먼저, 그다음 최신순
    const base = [...all].sort((a, b) => (a.status === "거래완료") - (b.status === "거래완료") || SORTS.new(a, b));

    // ---------- 홈 ----------
    if ($("#home-featured")) {
      const live = base.filter((l) => l.status !== "거래완료");
      const featured = live.filter((l) => l.featured);
      $("#home-featured").innerHTML = (featured.length ? featured : live).slice(0, 8).map(cardHTML).join("");
      $("#home-new").innerHTML = live.slice(0, 8).map(cardHTML).join("");
      $("#home-total").textContent = live.length.toLocaleString();
      // 유형 바로가기 개수
      $$("[data-type-count]").forEach((a) => {
        const n = live.filter((l) => l.type === a.dataset.typeCount).length;
        a.querySelector("small").textContent = `${n}건`;
      });
    }

    // ---------- 매물 (유형 탭 + 거래 탭) ----------
    if ($("#browse")) {
      let type = params.get("type") || "";
      let deal = params.get("deal") || "";
      let sort = params.get("sort") || "new";
      let page = num(params.get("page")) || 1;
      $("#sort").value = sort;

      const drawTabs = () => {
        const n = (t) => all.filter((l) => !t || l.type === t).length;
        $("#type-tabs").innerHTML = ["", ...TYPES]
          .map((t) => `<button type="button" data-type="${t}" class="${t === type ? "is-active" : ""}${n(t) ? "" : " is-zero"}">${t || "전체"} <small>${n(t)}</small></button>`)
          .join("");
        const inType = all.filter((l) => !type || l.type === type);
        $("#deal-tabs").innerHTML = ["", ...DEALS]
          .map((d) => `<button type="button" data-deal="${d}" class="${d === deal ? "is-active" : ""}">${d || "전체"} <small>${inType.filter((l) => !d || l.deal === d).length}</small></button>`)
          .join("");
        $("#browse-title").textContent = [type || "전체 매물", deal].filter(Boolean).join(" · ");
      };
      const draw = () => {
        const list = base.filter((l) => (!type || l.type === type) && (!deal || l.deal === deal));
        if (sort !== "new") list.sort(SORTS[sort]);
        page = renderGrid(list, {
          grid: $("#grid"), pager: $("#pager"), count: $("#count"), empty: $("#empty"), page,
          onPage: (p) => { page = p; draw(); },
        });
        drawTabs();
        setParams({ type, deal, sort: sort === "new" ? "" : sort, page });
      };
      $("#type-tabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-type]"); if (!b) return;
        type = b.dataset.type; deal = ""; page = 1; draw();
      });
      $("#deal-tabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-deal]"); if (!b) return;
        deal = b.dataset.deal; page = 1; draw();
      });
      $("#sort").addEventListener("change", (e) => { sort = e.target.value; page = 1; draw(); });
      draw();
    }

    // ---------- 물건조회 (상세 검색) ----------
    if ($("#search-form")) {
      const form = $("#search-form");
      fillSelects(form);
      writeForm(form, params);
      let page = num(params.get("page")) || 1;
      let sort = params.get("sort") || "new";
      $("#sort").value = sort;
      const run = () => {
        const f = readForm(form);
        const list = base.filter((l) => matches(l, f));
        if (sort !== "new") list.sort(SORTS[sort]);
        page = renderGrid(list, {
          grid: $("#grid"), pager: $("#pager"), count: $("#count"), empty: $("#empty"), page,
          onPage: (p) => { page = p; run(); },
        });
        setParams({ ...f, sort: sort === "new" ? "" : sort, page });
      };
      form.addEventListener("submit", (e) => { e.preventDefault(); page = 1; run(); });
      form.addEventListener("reset", () => setTimeout(() => { page = 1; run(); }));
      $("#sort").addEventListener("change", (e) => { sort = e.target.value; page = 1; run(); });
      $$("[data-chip]").forEach((c) => c.addEventListener("click", () => {
        form.elements.q.value = c.dataset.chip; page = 1; run();
      }));
      run();
    }

    // 홈의 빠른 검색 폼: 선택지 채우기 (제출은 search.html 로 이동)
    $$("form.quick-search").forEach(fillSelects);

    // ---------- 매물 상세 ----------
    if ($("#detail")) {
      const l = (data.listings || []).find((x) => x.id === params.get("id") && x.status !== "숨김");
      if (!l) {
        $("#detail").innerHTML = `<div class="notfound"><h1>매물을 찾을 수 없습니다</h1><p>거래가 끝났거나 광고가 내려간 매물입니다.</p><a class="btn btn--dark" href="listings.html">매물 목록으로</a></div>`;
        return;
      }
      document.title = `${l.title} | 나경공인중개사사무소`;
      const photos = l.photos || [];
      const row = (k, v) => (v || v === 0 ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "");
      const priceLabel = l.deal === "매매" ? "매매가" : l.deal === "전세" ? "전세금" : "보증금 / " + (l.deal === "연세" ? "연세" : "월세");
      const O = window.OFFICE;
      $("#detail").innerHTML = `
        <nav class="crumb crumb--dark"><a href="index.html">홈</a> / <a href="listings.html?type=${encodeURIComponent(l.type)}">${esc(l.type)}</a> / 매물번호 ${esc(l.id)}</nav>
        <div class="detail">
          <div class="gallery">
            <div class="gallery__main">${photos[0] ? `<img id="g-main" src="${esc(photos[0])}" alt="${esc(l.title)}" />` : NK.placeholder(l)}
              ${l.status === "거래완료" ? '<span class="badge badge--done">거래완료</span>' : ""}</div>
            ${photos.length > 1 ? `<div class="gallery__thumbs">${photos.map((p, i) => `<button type="button" data-src="${esc(p)}" class="${i ? "" : "is-active"}"><img src="${esc(p)}" alt="사진 ${i + 1}" loading="lazy" /></button>`).join("")}</div>` : ""}
          </div>
          <aside class="summary">
            <p class="card__labels"><span class="lbl">${esc(l.type)}</span><span class="lbl lbl--deal lbl--${esc(l.deal)}">${esc(l.deal)}</span></p>
            <h1>${esc(l.title)}</h1>
            <p class="summary__place">${esc(NK.placeOf(l))}</p>
            <p class="summary__price"><small>${priceLabel}</small>${esc(NK.priceText(l))}</p>
            ${NK.tagsOf(l).length ? `<p class="card__tags">${NK.tagsOf(l).map((t) => `<a href="search.html?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join(" ")}</p>` : ""}
            <div class="summary__agent">
              <strong>나경 공인중개사사무소</strong>
              <span>대표 강나경 · 등록번호 ${esc(O.regNo)}</span>
              <a class="big-phone" href="tel:${O.phone}">${O.phone}</a>
              <a class="btn btn--dark" href="contact.html?item=${encodeURIComponent(`${l.title} (매물번호 ${l.id})`)}#form">이 매물 문의하기</a>
            </div>
          </aside>
        </div>
        <section class="facts">
          <h2>매물 정보</h2>
          <dl class="facts__grid">
            ${row("매물번호", l.id)}
            ${row("소재지", NK.placeOf(l))}
            ${row("매물종류", l.type)}
            ${row("거래형태", l.deal)}
            ${row(priceLabel, NK.priceText(l))}
            ${row("전용면적", l.area ? `${l.area}㎡ (${NK.pyeong(l.area)}평)` : "")}
            ${row("공급면적", l.supplyArea ? `${l.supplyArea}㎡ (${NK.pyeong(l.supplyArea)}평)` : "")}
            ${row("해당층 / 총층", l.floor || l.totalFloor ? `${l.floor || "-"}층 / ${l.totalFloor || "-"}층` : "")}
            ${row("방 / 욕실", l.rooms || l.baths ? `${l.rooms || "-"}개 / ${l.baths || "-"}개` : "")}
            ${row("방향", l.direction)}
            ${row("입주가능일", l.moveIn)}
            ${row("주차", l.parking)}
            ${row("사용승인일", l.approvalDate)}
            ${row("관리비", l.maintenance)}
            ${row("등록일", String(l.createdAt || "").slice(0, 10))}
          </dl>
        </section>
        ${l.desc ? `<section class="facts"><h2>상세 설명</h2><p class="desc">${esc(l.desc).replace(/\n/g, "<br />")}</p></section>` : ""}
        <p class="note">※ 매물 정보는 등록 시점 기준이며 실제와 다를 수 있습니다. 계약 전 반드시 현장과 서류를 확인해 주세요.</p>`;
      $$(".gallery__thumbs button").forEach((b) => b.addEventListener("click", () => {
        $("#g-main").src = b.dataset.src;
        $$(".gallery__thumbs button").forEach((x) => x.classList.toggle("is-active", x === b));
      }));
      // 비슷한 매물
      const similar = base.filter((x) => x.id !== l.id && x.type === l.type && x.status !== "거래완료").slice(0, 4);
      if (similar.length && $("#similar")) {
        $("#similar").hidden = false;
        $("#similar-grid").innerHTML = similar.map(cardHTML).join("");
      }
    }
  });

  // ---------- 실거래가 ----------
  if ($("#trades-body")) {
    const t = window.__TRADES__;
    const all = (t && t.trades) || [];
    if (!all.length) {
      $("#trades-body").innerHTML =
        '<tr><td colspan="6" class="muted">실거래가 데이터가 아직 없습니다. 공공데이터포털 API 키를 등록하면 매일 자동으로 갱신됩니다.</td></tr>';
    } else {
      const when = new Date(t.updatedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
      $("#trades-meta").textContent = `${(t.regions || []).join(" · ")} · ${when} 자동 갱신`;
      const sel = $("#t-region");
      sel.insertAdjacentHTML("beforeend", [...new Set(all.map((x) => x.region.split(" ")[0]))].map((r) => `<option>${esc(r)}</option>`).join(""));
      const draw = () => {
        const r = sel.value, q = $("#t-query").value.trim();
        const list = all.filter((x) => (!r || x.region.startsWith(r)) && (!q || x.name.includes(q) || x.region.includes(q)));
        $("#trades-body").innerHTML = list.length
          ? list.map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.region)}</td><td>${esc(x.name)}</td><td>${x.area}㎡ <small class="muted">(${(x.area / 3.3058).toFixed(0)}평)</small></td><td>${esc(x.floor)}층</td><td class="num">${man(x.price)}만원</td></tr>`).join("")
          : '<tr><td colspan="6" class="muted">검색 결과가 없습니다.</td></tr>';
        $("#t-count").textContent = `${list.length}건`;
      };
      sel.addEventListener("change", draw);
      $("#t-query").addEventListener("input", draw);
      draw();
    }
  }

  // ---------- 상담 신청 (메일 앱으로 보내기) ----------
  const cf = $("#contact-form");
  if (cf) {
    if (params.get("item")) cf.elements.message.value = `[문의 매물] ${params.get("item")}\n\n`;
    cf.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = cf.elements;
      const body = `이름: ${f.name.value}\n연락처: ${f.phone.value}\n관심 분야: ${f.topic.value}\n희망 방문일: ${f.date.value || "미정"}\n\n${f.message.value}`;
      location.href = `mailto:${window.OFFICE.email}?subject=${encodeURIComponent(`[상담 신청] ${f.name.value}님`)}&body=${encodeURIComponent(body)}`;
      $("#form-note").textContent = "메일 앱이 열리면 [보내기]를 눌러 주세요. 열리지 않으면 전화로 연락 주세요.";
    });
  }

  $$("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "복사됨"; }
      catch { b.textContent = b.dataset.copy; }
      setTimeout(() => (b.textContent = "복사"), 1500);
    })
  );
})();
