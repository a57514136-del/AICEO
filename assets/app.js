// 나경공인중개사사무소 — 페이지별 기능 (매물 목록 · 물건조회 · 실거래가 · 상담 신청)
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const params = new URLSearchParams(location.search);

  const won = (man) => {
    if (man >= 10000) {
      const eok = Math.floor(man / 10000), rest = man % 10000;
      return `${eok}억${rest ? " " + rest.toLocaleString() : ""}`;
    }
    return `${man.toLocaleString()}만`;
  };
  const priceLabel = (l) =>
    l.deal === "월세" ? `월세 ${won(l.price)} / ${l.rent}` : `${l.deal} ${won(l.price)}`;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 더블클릭(file://)으로 열어도 동작하도록 data/*.js 를 우선 사용
  const load = (name) => {
    const pre = name === "listings" ? window.__LISTINGS__ : window.__TRADES__;
    if (pre) return Promise.resolve(pre);
    return fetch(`data/${name}.json`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  };

  // ---------- 매물 행 (아코디언) ----------
  function rowsHTML(list, openFirst = true) {
    return list
      .map((l, i) => {
        const open = openFirst && i === 0;
        return `
      <li class="row${open ? " is-open" : ""}" id="item-${l.id}">
        <button class="row__head" aria-expanded="${open}">
          <span class="row__title">${esc(l.title)}</span>
          <span class="row__meta">${esc(l.type)} · ${esc(l.deal)}</span>
          <span class="row__meta">${esc(l.region)}</span>
          <span class="row__price">${esc(priceLabel(l))}</span>
          <span class="row__icon" aria-hidden="true">→</span>
        </button>
        <div class="row__body"${open ? "" : " hidden"}>
          <img src="${esc(l.image)}" alt="${esc(l.title)}" loading="lazy" />
          <div>
            <p class="row__desc">${esc(l.desc)}</p>
            <dl class="specs">
              <div><dt>면적</dt><dd>${l.area}㎡ (${(l.area / 3.3058).toFixed(1)}평)</dd></div>
              <div><dt>층</dt><dd>${esc(l.floor)}</dd></div>
              <div><dt>구조</dt><dd>${esc(l.rooms)}</dd></div>
              <div><dt>준공</dt><dd>${l.built ? l.built + "년" : "-"}</dd></div>
            </dl>
            <p style="margin-top:24px"><a class="link-arrow" href="contact.html?item=${encodeURIComponent(l.title)}#form">이 매물 문의하기 <span>→</span></a></p>
          </div>
        </div>
      </li>`;
      })
      .join("");
  }

  document.addEventListener("click", (e) => {
    const head = e.target.closest(".row__head");
    if (!head) return;
    const row = head.parentElement;
    const open = !row.classList.contains("is-open");
    row.classList.toggle("is-open", open);
    head.setAttribute("aria-expanded", open);
    row.querySelector(".row__body").hidden = !open;
  });

  const matches = (l, f) =>
    (!f.region || l.region.startsWith(f.region)) &&
    (!f.type || l.type === f.type) &&
    (!f.deal || l.deal === f.deal) &&
    (!f.max || l.price <= f.max);

  const fillRegions = (sel, listings) => {
    if (!sel) return;
    const regions = [...new Set(listings.map((l) => l.region.split(" ")[0]))];
    sel.insertAdjacentHTML("beforeend", regions.map((r) => `<option>${esc(r)}</option>`).join(""));
  };

  load("listings")
    .then((d) => {
      const listings = d.listings || [];

      // 홈: 추천 매물 3개
      if ($("#home-rows")) $("#home-rows").innerHTML = rowsHTML(listings.slice(0, 3));
      fillRegions($("#f-region"), listings);

      // 매물 페이지: 유형 탭 (?type=토지 로 바로 열기 가능)
      if ($("#rows") && $("#tabs")) {
        let tab = params.get("type") || "전체";
        const render = () => {
          const list = listings.filter((l) => tab === "전체" || l.type === tab);
          $("#rows").innerHTML = rowsHTML(list);
          $("#empty").hidden = list.length > 0;
          $("#count").textContent = `${list.length}건`;
          $$("#tabs button").forEach((b) => b.classList.toggle("is-active", b.dataset.type === tab));
        };
        $("#tabs").addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          tab = b.dataset.type;
          history.replaceState(null, "", tab === "전체" ? location.pathname : `?type=${encodeURIComponent(tab)}`);
          render();
        });
        render();
      }

      // 물건조회 페이지: 조건 검색 (홈에서 넘어온 조건도 그대로 적용)
      if ($("#search-rows")) {
        const form = $("#finder");
        ["region", "type", "deal", "max"].forEach((k) => {
          if (params.get(k) && form.elements[k]) form.elements[k].value = params.get(k);
        });
        const run = () => {
          const fd = new FormData(form);
          const f = { region: fd.get("region"), type: fd.get("type"), deal: fd.get("deal"), max: Number(fd.get("max")) || 0 };
          const list = listings.filter((l) => matches(l, f));
          $("#search-rows").innerHTML = rowsHTML(list, false);
          $("#finder-result").textContent = list.length
            ? `조건에 맞는 매물 ${list.length}건`
            : "조건에 맞는 매물이 없습니다. 조건을 넓혀 보시거나 전화로 문의해 주세요.";
        };
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
          history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
          run();
        });
        form.addEventListener("reset", () => setTimeout(run));
        run();
      }
    })
    .catch(() => {
      const el = $("#empty") || $("#finder-result");
      if (el) { el.hidden = false; el.textContent = "매물 정보를 불러오지 못했습니다."; }
    });

  // ---------- 실거래가 ----------
  if ($("#trades-body")) {
    load("trades")
      .then((d) => {
        const all = d.trades || [];
        if (!all.length) throw 0;
        const when = new Date(d.updatedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
        $("#trades-meta").textContent = `${(d.regions || []).join(" · ")} · ${when} 자동 갱신`;
        const sel = $("#t-region");
        if (sel) {
          const regions = [...new Set(all.map((t) => t.region.split(" ")[0]))];
          sel.insertAdjacentHTML("beforeend", regions.map((r) => `<option>${esc(r)}</option>`).join(""));
        }
        const draw = () => {
          const r = sel ? sel.value : "";
          const q = ($("#t-query")?.value || "").trim();
          const list = all.filter((t) => (!r || t.region.startsWith(r)) && (!q || t.name.includes(q) || t.region.includes(q)));
          $("#trades-body").innerHTML = list.length
            ? list
                .map(
                  (t) => `<tr><td>${esc(t.date)}</td><td>${esc(t.region)}</td><td>${esc(t.name)}</td>
              <td>${t.area}㎡ <small class="muted">(${(t.area / 3.3058).toFixed(0)}평)</small></td><td>${esc(t.floor)}층</td><td class="num">${won(t.price)}원</td></tr>`
                )
                .join("")
            : '<tr><td colspan="6" class="muted">검색 결과가 없습니다.</td></tr>';
          if ($("#t-count")) $("#t-count").textContent = `${list.length}건`;
        };
        sel?.addEventListener("change", draw);
        $("#t-query")?.addEventListener("input", draw);
        draw();
      })
      .catch(() => {
        $("#trades-body").innerHTML =
          '<tr><td colspan="6" class="muted">실거래가 데이터가 아직 없습니다. 공공데이터포털 API 키를 등록하면 매일 자동으로 갱신됩니다.</td></tr>';
      });
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

  // 전화번호 복사
  $$("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "복사됨"; }
      catch { b.textContent = b.dataset.copy; }
      setTimeout(() => (b.textContent = "복사"), 1500);
    })
  );
})();
