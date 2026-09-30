// 매물관리: 매물 등록 · 수정 · 삭제
// 저장 방식 2가지
//   local  : 이 브라우저(localStorage)에만 저장 — 연습용
//   github : GitHub 저장소의 data/listings.json · data/listings.js · images/listings/ 에 한 번에 커밋
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { TYPES, DEALS, CITIES, STATUS, LOCAL_KEY, MODE_KEY, esc, priceText, tagsOf, placeOf } = window.NK;
  const GH_KEY = "nk_github";
  const API = "https://api.github.com";

  const state = { mode: null, listings: [], gh: null, busy: false };

  // ---------- 공통 ----------
  const status = (msg, kind = "") => {
    const el = $("#status");
    el.textContent = msg;
    el.className = `status ${kind}`;
  };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return e; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const newId = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    let id = `NK${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    while (state.listings.some((l) => l.id === id)) id += "1";
    return id;
  };
  const payload = () => ({ updatedAt: new Date().toISOString(), listings: state.listings });

  // 저장소 안의 상대 경로 사진을 관리 화면에서 보이게
  const photoSrc = (p) => {
    if (!p || /^(data:|https?:|blob:)/.test(p)) return p;
    if (state.mode === "github" && state.gh) return `https://raw.githubusercontent.com/${state.gh.owner}/${state.gh.repo}/${state.gh.branch}/${p}`;
    return p;
  };

  // UTF-8 문자열 <-> base64
  const b64FromBytes = (bytes) => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const b64FromText = (text) => b64FromBytes(new TextEncoder().encode(text));

  // ---------- 사진 줄이기 ----------
  function resizeImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}: 열 수 없는 사진 형식입니다 (JPG·PNG로 올려 주세요).`)); };
      img.src = url;
    });
  }

  // ---------- GitHub ----------
  async function gh(path, opts = {}) {
    const { token } = state.gh;
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json()).message || ""; } catch {}
      const err = new Error(msg || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return opts.raw ? res.text() : res.status === 204 ? null : res.json();
  }
  const ghRepoPath = () => `/repos/${encodeURIComponent(state.gh.owner)}/${encodeURIComponent(state.gh.repo)}`;
  const explain = (e) => {
    if (e.status === 401) return "토큰이 맞지 않거나 만료되었습니다. 토큰을 다시 만들어 붙여 넣어 주세요.";
    if (e.status === 403) return "토큰에 쓰기 권한이 없습니다. 토큰 권한에서 Contents: Read and write 를 선택해 주세요.";
    if (e.status === 404) return "저장소나 파일을 찾을 수 없습니다. 계정·저장소 이름을 확인하고, 사이트 파일(data/listings.json 포함)이 저장소에 올라가 있는지 확인해 주세요.";
    if (e.status === 409 && /empty/i.test(e.message)) return "저장소가 비어 있습니다. 사이트 파일을 먼저 저장소에 올려 주세요.";
    if (e.status === 422) return "그사이 다른 곳에서 저장소가 바뀌었습니다. 다시 [연결하고 매물 불러오기]를 눌러 최신 상태로 불러온 뒤 저장해 주세요.";
    if (e instanceof TypeError) return "인터넷 연결을 확인해 주세요.";
    return `저장하지 못했습니다: ${e.message}`;
  };

  async function ghLoad() {
    const text = await gh(`${ghRepoPath()}/contents/data/listings.json?ref=${encodeURIComponent(state.gh.branch)}`, { raw: true });
    return JSON.parse(text).listings || [];
  }

  // 여러 파일을 커밋 한 번으로 저장 (files: {path: base64 | null(삭제)})
  async function ghCommit(files, message) {
    const R = ghRepoPath(), br = encodeURIComponent(state.gh.branch);
    const ref = await gh(`${R}/git/ref/heads/${br}`);
    const parent = ref.object.sha;
    const commit = await gh(`${R}/git/commits/${parent}`);
    const tree = [];
    for (const [path, b64] of Object.entries(files)) {
      if (b64 === null) { tree.push({ path, mode: "100644", type: "blob", sha: null }); continue; }
      const blob = await gh(`${R}/git/blobs`, { method: "POST", body: JSON.stringify({ content: b64, encoding: "base64" }) });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await gh(`${R}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
    const newCommit = await gh(`${R}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [parent] }) });
    await gh(`${R}/git/refs/heads/${br}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
  }

  // ---------- 저장 ----------
  // removedPhotos: 저장소에서 지울 사진 경로들
  async function persist(message, removedPhotos = []) {
    if (state.mode === "local") {
      const r = ls.set(LOCAL_KEY, JSON.stringify(payload()));
      if (r !== true) throw new Error("이 컴퓨터의 저장 공간이 가득 찼습니다. 사진 수를 줄이거나 GitHub 연결 모드를 사용해 주세요.");
      return;
    }
    // github: 새 사진(data:)은 파일로 올리고 경로로 바꿈
    const files = {};
    for (const l of state.listings) {
      l.photos = (l.photos || []).map((p, i) => {
        if (!p.startsWith("data:")) return p;
        const path = `images/listings/${l.id}-${Date.now().toString(36)}${i}.jpg`;
        files[path] = p.split(",")[1];
        return path;
      });
    }
    removedPhotos.filter((p) => p.startsWith("images/")).forEach((p) => (files[p] = null));
    const json = JSON.stringify(payload(), null, 2);
    files["data/listings.json"] = b64FromText(json + "\n");
    files["data/listings.js"] = b64FromText(`window.__LISTINGS__ = ${json};\n`);
    await ghCommit(files, message);
  }

  async function save(message, removedPhotos, okMsg) {
    state.busy = true;
    status("저장하는 중…", "busy");
    try {
      await persist(message, removedPhotos);
      status(state.mode === "github" ? `${okMsg} 홈페이지에는 1~2분 뒤에 반영됩니다.` : `${okMsg} (연습 모드: 이 컴퓨터에만 저장)`, "ok");
      return true;
    } catch (e) {
      status(state.mode === "github" ? explain(e) : e.message, "err");
      return false;
    } finally {
      state.busy = false;
      renderList();
    }
  }

  // ---------- 모드 전환 ----------
  async function useLocal() {
    state.mode = "local";
    ls.set(MODE_KEY, "local");
    $("#gh-form").hidden = true;
    $("#local-tools").hidden = false;
    const saved = NK.readLocal();
    if (saved && Array.isArray(saved.listings)) {
      state.listings = saved.listings;
    } else {
      ls.del(MODE_KEY);
      const pub = await NK.loadListings();
      state.listings = JSON.parse(JSON.stringify(pub.listings || []));
      ls.set(MODE_KEY, "local");
      ls.set(LOCAL_KEY, JSON.stringify(payload()));
    }
    status("연습 모드입니다. 여기서 바꾼 내용은 이 컴퓨터의 홈페이지 화면에만 보입니다.", "info");
    renderList();
  }

  function useGithubForm() {
    state.mode = "github";
    ls.set(MODE_KEY, "github");
    $("#gh-form").hidden = false;
    $("#local-tools").hidden = true;
    const saved = JSON.parse(ls.get(GH_KEY) || "null") || {};
    const f = $("#gh-form").elements;
    f.owner.value = saved.owner || "a57514136-del";
    f.repo.value = saved.repo || "AICEO";
    f.branch.value = saved.branch || "main";
    f.token.value = saved.token || "";
    if (saved.token) connectGithub();
    else {
      state.listings = [];
      renderList("GitHub에 연결하면 매물이 여기에 나옵니다.");
      status("GitHub 연결 정보를 입력하고 [연결하고 매물 불러오기]를 눌러 주세요.", "info");
    }
  }

  async function connectGithub() {
    const f = $("#gh-form").elements;
    state.gh = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || "main", token: f.token.value.trim() };
    status("GitHub에 연결하는 중…", "busy");
    try {
      state.listings = await ghLoad();
      ls.set(GH_KEY, JSON.stringify(state.gh));
      status(`연결되었습니다. 저장소 ${state.gh.owner}/${state.gh.repo}의 매물 ${state.listings.length}건을 불러왔어요.`, "ok");
    } catch (e) {
      state.listings = [];
      status(explain(e), "err");
    }
    renderList();
  }

  // ---------- 목록 ----------
  function renderList(emptyMsg) {
    const q = $("#a-q").value.trim().toLowerCase();
    const st = $("#a-status").value;
    const list = [...state.listings]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .filter((l) => (!st || l.status === st) && (!q || [l.id, l.title, l.dong, l.city, l.type, ...tagsOf(l)].join(" ").toLowerCase().includes(q)));
    $("#a-count").textContent = `${state.listings.length}건`;
    const ready = state.mode === "local" || (state.mode === "github" && state.gh && !$("#status").classList.contains("err"));
    $("#btn-new").disabled = !ready;
    if (!list.length) {
      $("#a-rows").innerHTML = `<tr><td colspan="6" class="muted">${esc(emptyMsg || (state.listings.length ? "검색 결과가 없습니다." : "등록된 매물이 없습니다. [+ 새 매물 등록]을 눌러 시작하세요."))}</td></tr>`;
      return;
    }
    $("#a-rows").innerHTML = list.map((l) => `
      <tr data-id="${esc(l.id)}" class="${l.status !== "광고중" ? "is-off" : ""}">
        <td class="a-thumb">${l.photos && l.photos[0] ? `<img src="${esc(photoSrc(l.photos[0]))}" alt="" loading="lazy" />` : '<span class="a-nophoto">사진 없음</span>'}</td>
        <td class="a-main">
          <span class="card__labels"><span class="lbl">${esc(l.type)}</span><span class="lbl lbl--deal lbl--${esc(l.deal)}">${esc(l.deal)}</span>${l.featured ? '<span class="lbl lbl--star">추천</span>' : ""}</span>
          <strong>${esc(l.title)}</strong>
          <small>${esc(placeOf(l))} · ${l.area || "-"}㎡ · ${esc(l.id)}</small>
        </td>
        <td class="a-price">${esc(priceText(l))}</td>
        <td><select class="a-st" aria-label="상태 변경">${STATUS.map((s) => `<option${s === l.status ? " selected" : ""}>${s}</option>`).join("")}</select></td>
        <td class="a-date">${esc(String(l.createdAt || "").slice(0, 10))}</td>
        <td class="num a-act">
          <button type="button" class="btn btn--ghost btn--sm" data-act="edit">수정</button>
          <button type="button" class="btn btn--ghost btn--sm a-del" data-act="del">삭제</button>
        </td>
      </tr>`).join("");
  }

  $("#a-rows").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || state.busy) return;
    const id = b.closest("tr").dataset.id;
    const l = state.listings.find((x) => x.id === id);
    if (b.dataset.act === "edit") return openEditor(l);
    if (b.dataset.act === "del") {
      if (!b.classList.contains("is-confirm")) {
        $$(".a-del.is-confirm").forEach((x) => { x.classList.remove("is-confirm"); x.textContent = "삭제"; });
        b.classList.add("is-confirm");
        b.textContent = "정말 삭제?";
        setTimeout(() => { if (b.isConnected) { b.classList.remove("is-confirm"); b.textContent = "삭제"; } }, 4000);
        return;
      }
      const before = state.listings;
      state.listings = state.listings.filter((x) => x.id !== id);
      const ok = await save(`매물 삭제: ${l.title} (${id})`, l.photos || [], `"${l.title}" 매물을 삭제했습니다.`);
      if (!ok) { state.listings = before; renderList(); }
    }
  });

  $("#a-rows").addEventListener("change", async (e) => {
    if (!e.target.classList.contains("a-st")) return;
    const id = e.target.closest("tr").dataset.id;
    const l = state.listings.find((x) => x.id === id);
    const prev = l.status;
    l.status = e.target.value;
    const ok = await save(`매물 상태 변경: ${l.title} → ${l.status}`, [], `"${l.title}" 상태를 ${l.status}(으)로 바꿨습니다.`);
    if (!ok) { l.status = prev; renderList(); }
  });

  $("#a-q").addEventListener("input", () => renderList());
  $("#a-status").addEventListener("change", () => renderList());

  // ---------- 입력 창 ----------
  const dlg = $("#editor");
  const form = $("#ed-form");
  let editing = null;   // 수정 중인 매물 (새 매물이면 null)
  let photos = [];      // 입력 창 안의 사진 목록

  const fill = (sel, items) => (sel.innerHTML = items.map((x) => `<option>${x}</option>`).join(""));
  fill($("#e-type"), TYPES);
  fill($("#e-deal"), DEALS);
  fill($("#e-city"), CITIES);
  fill($("#e-status"), STATUS);

  function syncPriceFields() {
    const deal = form.elements.deal.value;
    const hasRent = deal === "월세" || deal === "연세";
    $("#lbl-price").textContent = deal === "매매" ? "매매가" : deal === "전세" ? "전세금" : "보증금";
    $("#lbl-rent").textContent = deal === "연세" ? "연세 (1년치)" : "월세";
    $("#wrap-rent").hidden = !hasRent;
    form.elements.rent.required = hasRent;
    const price = Number(form.elements.price.value), rent = Number(form.elements.rent.value);
    $("#price-preview").textContent = price ? `홈페이지 표시: ${priceText({ deal, price, rent })}` : "";
  }
  ["deal", "price", "rent"].forEach((n) => form.elements[n].addEventListener("input", syncPriceFields));

  function renderPhotos() {
    $("#photo-list").innerHTML = photos.map((p, i) => `
      <figure class="ph-item${i === 0 ? " is-cover" : ""}">
        <img src="${esc(photoSrc(p))}" alt="사진 ${i + 1}" />
        ${i === 0 ? "<figcaption>대표</figcaption>" : ""}
        <div class="ph-tools">
          ${i > 0 ? `<button type="button" data-ph="left" data-i="${i}" aria-label="앞으로">◀</button>` : ""}
          <button type="button" data-ph="del" data-i="${i}" aria-label="사진 빼기">✕</button>
        </div>
      </figure>`).join("");
  }
  $("#photo-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ph]");
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.dataset.ph === "del") photos.splice(i, 1);
    if (b.dataset.ph === "left") [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
    renderPhotos();
  });
  $("#e-photos").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const side = state.mode === "github" ? 1600 : 1000;
    const q = state.mode === "github" ? 0.82 : 0.72;
    $("#ed-error").textContent = files.length ? "사진을 준비하는 중…" : "";
    const errs = [];
    for (const f of files) {
      try { photos.push(await resizeImage(f, side, q)); } catch (err) { errs.push(err.message); }
    }
    $("#ed-error").textContent = errs.join(" ");
    renderPhotos();
  });

  function openEditor(l) {
    editing = l || null;
    form.reset();
    $("#ed-error").textContent = "";
    $("#ed-title").textContent = l ? `매물 수정 · ${l.id}` : "새 매물 등록";
    const v = l || { city: "제주시", status: "광고중", deal: "매매", type: "아파트" };
    ["type", "deal", "title", "city", "dong", "price", "rent", "area", "supplyArea", "floor", "totalFloor", "rooms", "baths",
      "direction", "moveIn", "parking", "approvalDate", "maintenance", "desc", "status"].forEach((k) => {
      if (form.elements[k]) form.elements[k].value = v[k] ?? "";
    });
    if (!Number(v.rent)) form.elements.rent.value = "";
    form.elements.tags.value = tagsOf(v).map((t) => `#${t}`).join(" ");
    form.elements.featured.checked = !!v.featured;
    photos = [...(v.photos || [])];
    renderPhotos();
    syncPriceFields();
    dlg.showModal();
    form.elements.title.focus();
  }

  const close = () => dlg.close();
  $("#ed-close").addEventListener("click", close);
  $("#ed-cancel").addEventListener("click", close);
  $("#btn-new").addEventListener("click", () => openEditor(null));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const bad = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (bad) {
      const name = bad.closest("label")?.firstChild?.textContent?.trim() || "필수 항목";
      $("#ed-error").textContent = `${name.replace("*", "").trim()} 칸을 확인해 주세요.`;
      bad.focus();
      return;
    }
    const f = form.elements;
    const data = {
      type: f.type.value, deal: f.deal.value, title: f.title.value.trim(), city: f.city.value, dong: f.dong.value.trim(),
      price: Number(f.price.value) || 0, rent: f.deal.value === "월세" || f.deal.value === "연세" ? Number(f.rent.value) || 0 : 0,
      area: Number(f.area.value) || 0, supplyArea: Number(f.supplyArea.value) || "",
      floor: f.floor.value.trim(), totalFloor: f.totalFloor.value.trim(), rooms: f.rooms.value, baths: f.baths.value,
      direction: f.direction.value, moveIn: f.moveIn.value.trim(), parking: f.parking.value.trim(),
      approvalDate: f.approvalDate.value.trim(), maintenance: f.maintenance.value.trim(),
      tags: tagsOf({ tags: f.tags.value }), desc: f.desc.value.trim(),
      status: f.status.value, featured: f.featured.checked, photos: [...photos],
    };
    const before = JSON.parse(JSON.stringify(state.listings));
    let removed = [];
    if (editing) {
      removed = (editing.photos || []).filter((p) => !photos.includes(p));
      Object.assign(editing, data, { updatedAt: stamp() });
    } else {
      state.listings.push({ id: newId(), ...data, createdAt: stamp() });
    }
    $("#ed-save").disabled = true;
    const ok = await save(editing ? `매물 수정: ${data.title}` : `매물 등록: ${data.title}`, removed,
      editing ? `"${data.title}" 매물을 수정했습니다.` : `"${data.title}" 매물을 등록했습니다.`);
    $("#ed-save").disabled = false;
    if (ok) close();
    else {
      state.listings = before;
      $("#ed-error").textContent = $("#status").textContent;
      renderList();
    }
  });

  // ---------- 연습 모드 도구 ----------
  $("#btn-export").addEventListener("click", () => {
    const json = JSON.stringify(payload(), null, 2);
    const dl = (name, text, type) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    dl("listings.json", json + "\n", "application/json");
    setTimeout(() => dl("listings.js", `window.__LISTINGS__ = ${json};\n`, "text/javascript"), 400);
    status("listings.json 과 listings.js 두 파일을 내려받았습니다. 사이트의 data 폴더에 덮어쓰면 그대로 반영됩니다.", "ok");
  });
  $("#btn-reset").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!b.classList.contains("is-confirm")) {
      b.classList.add("is-confirm"); b.textContent = "정말 되돌릴까요? 한 번 더 누르세요";
      setTimeout(() => { b.classList.remove("is-confirm"); b.textContent = "연습 데이터 처음으로 되돌리기"; }, 4000);
      return;
    }
    ls.del(LOCAL_KEY);
    await useLocal();
    status("연습 데이터를 홈페이지의 원래 매물로 되돌렸습니다.", "ok");
  });

  // ---------- 시작 ----------
  $("#gh-form").addEventListener("submit", (e) => { e.preventDefault(); connectGithub(); });
  $("#gh-forget").addEventListener("click", () => {
    ls.del(GH_KEY);
    $("#gh-form").elements.token.value = "";
    state.gh = null; state.listings = [];
    renderList("GitHub에 연결하면 매물이 여기에 나옵니다.");
    status("이 컴퓨터에 저장된 토큰을 지웠습니다.", "ok");
  });
  $$('input[name="mode"]').forEach((r) => r.addEventListener("change", () => (r.value === "local" ? useLocal() : useGithubForm())));

  const startMode = ls.get(MODE_KEY) === "github" ? "github" : "local";
  $(`#mode-${startMode}`).checked = true;
  startMode === "github" ? useGithubForm() : useLocal();
})();
