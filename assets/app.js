// 나경공인중개사사무소 — 매물 목록 · 물건조회 · 실거래가 표시
(() => {
  const $ = (s) => document.querySelector(s);
  const won = (man) => {
    if (man >= 10000) {
      const eok = Math.floor(man / 10000), rest = man % 10000;
      return `${eok}억${rest ? " " + rest.toLocaleString() : ""}`;
    }
    return `${man.toLocaleString()}만`;
  };
  const priceLabel = (l) =>
    l.deal === "월세" ? `월세 ${won(l.price)} / ${l.rent}` : `${l.deal} ${won(l.price)}`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let listings = [];
  let tab = "전체";
  let filter = {};

  const loadJSON = (path) => {
    // 더블클릭(file://)으로 열어도 동작하도록 data/*.js 를 우선 사용
    const pre = path.includes("listings") ? window.__LISTINGS__ : window.__TRADES__;
    if (pre) return Promise.resolve(pre);
    return fetch(path, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  };

  function matches(l) {
    if (tab !== "전체" && l.type !== tab) return false;
    if (filter.region && !l.region.startsWith(filter.region)) return false;
    if (filter.type && l.type !== filter.type) return false;
    if (filter.deal && l.deal !== filter.deal) return false;
    if (filter.max && l.price > filter.max) return false;
    return true;
  }

  function render() {
    const list = listings.filter(matches);
    $("#empty").hidden = list.length > 0;
    $("#rows").innerHTML = list
      .map(
        (l, i) => `
      <li class="row${i === 0 ? " is-open" : ""}">
        <button class="row__head" aria-expanded="${i === 0}">
          <span class="row__title">${esc(l.title)}</span>
          <span class="row__meta">${esc(l.type)} · ${esc(l.deal)}</span>
          <span class="row__meta">${esc(l.region)}</span>
          <span class="row__price">${esc(priceLabel(l))}</span>
          <span class="row__icon" aria-hidden="true">→</span>
        </button>
        <div class="row__body"${i === 0 ? "" : " hidden"}>
          <img src="${esc(l.image)}" alt="${esc(l.title)}" loading="lazy" />
          <div>
            <p class="row__desc">${esc(l.desc)}</p>
            <dl class="specs">
              <div><dt>면적</dt><dd>${l.area}㎡ (${(l.area / 3.3058).toFixed(1)}평)</dd></div>
              <div><dt>층</dt><dd>${esc(l.floor)}</dd></div>
              <div><dt>구조</dt><dd>${esc(l.rooms)}</dd></div>
              <div><dt>준공</dt><dd>${l.built ? l.built + "년" : "-"}</dd></div>
            </dl>
            <p style="margin-top:24px"><a class="link-arrow" href="#contact">이 매물 문의하기 <span>→</span></a></p>
          </div>
        </div>
      </li>`
      )
      .join("");
    return list.length;
  }

  // 아코디언
  $("#rows").addEventListener("click", (e) => {
    const head = e.target.closest(".row__head");
    if (!head) return;
    const row = head.parentElement;
    const open = !row.classList.contains("is-open");
    row.classList.toggle("is-open", open);
    head.setAttribute("aria-expanded", open);
    row.querySelector(".row__body").hidden = !open;
  });

  // 탭
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    tab = b.dataset.type;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("is-active", x === b));
    render();
  });

  // 물건 조회
  $("#finder").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    filter = {
      region: fd.get("region"),
      type: fd.get("type"),
      deal: fd.get("deal"),
      max: Number(fd.get("max")) || 0,
    };
    tab = "전체";
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("is-active", x.dataset.type === "전체"));
    const n = render();
    $("#finder-result").textContent = n ? `조건에 맞는 매물 ${n}건을 찾았습니다.` : "조건에 맞는 매물이 없습니다.";
    if (n) setTimeout(() => $("#listings").scrollIntoView({ behavior: "smooth" }), 400);
  });

  // 매물 로드
  loadJSON("data/listings.json")
    .then((d) => {
      listings = d.listings || [];
      const regions = [...new Set(listings.map((l) => l.region.split(" ")[0]))];
      $("#f-region").insertAdjacentHTML("beforeend", regions.map((r) => `<option>${esc(r)}</option>`).join(""));
      render();
    })
    .catch(() => {
      $("#empty").hidden = false;
      $("#empty").textContent = "매물 정보를 불러오지 못했습니다. (로컬에서는 웹 서버로 열어 주세요)";
    });

  // 실거래가 로드
  loadJSON("data/trades.json")
    .then((d) => {
      const t = d.trades || [];
      if (!t.length) throw 0;
      const when = new Date(d.updatedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
      $("#trades-meta").textContent = `${(d.regions || []).join(" · ")} · ${when} 자동 갱신`;
      $("#trades-body").innerHTML = t
        .slice(0, 15)
        .map(
          (r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.region)}</td><td>${esc(r.name)}</td>
          <td>${r.area}㎡</td><td>${esc(r.floor)}층</td><td class="num">${won(r.price)}원</td></tr>`
        )
        .join("");
    })
    .catch(() => {
      $("#trades-body").innerHTML =
        '<tr><td colspan="6" style="color:var(--ink-2)">실거래가 데이터가 아직 없습니다. 공공데이터포털 API 키를 등록하면 매일 자동으로 갱신됩니다.</td></tr>';
    });

  $("#year").textContent = new Date().getFullYear();
})();
