(function () {
  "use strict";

  // 内网 PDF 下载基址：公网站点不含 PDF，所有原文下载走内网服务。
  // 修改此处即可切换内网域名（例如 https://patents.intra.example/pdfs）。
  // 用户提供内网域名/密钥后替换该值。
  const PDF_BASE = "http://127.0.0.1:8811/pdf/";

  // PDF 链接：公网无法直接访问，标记为内网下载
  function pdfHref(r) {
    return PDF_BASE + r.PN + ".pdf";
  }

  let PATENTS = [];
  let STATS = null;
  let state = {
    view: "list",
    q: "",
    dir: "",
    year: "",
    app: "",
    sortKey: "PBD",
    sortDesc: true,
    page: 1,
    pageSize: 100
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function legalLabel(v) {
    const m = { "1": "审中", "2": "有效", "3": "失效", "4": "审中-公开" };
    return v.map((x) => m[x] || x).join(", ") || "—";
  }

  async function load() {
    const [p, s] = await Promise.all([
      fetch("data/patents.json").then((r) => r.json()),
      fetch("data/stats.json").then((r) => r.json())
    ]);
    PATENTS = p;
    STATS = s;
    $("#metaLine").textContent =
      `共 ${s.total} 件专利 · ${s.byYear.length} 个年度 · 更新 ${s.updated}`;
    populateFilters();
    render();
  }

  function populateFilters() {
    const dirs = new Set(), years = new Set(), apps = new Set();
    PATENTS.forEach((r) => {
      if (r.Direction) dirs.add(r.Direction);
      if (r.PBD) years.add(r.PBD.slice(0, 4));
      (r.ANCS || []).forEach((a) => apps.add(a));
    });
    $("#dirFilter").innerHTML =
      '<option value="">全部方向</option>' +
      [...dirs].sort().map((d) => `<option>${esc(d)}</option>`).join("");
    $("#yearFilter").innerHTML =
      '<option value="">全部年份</option>' +
      [...years].sort().reverse().map((y) => `<option>${esc(y)}</option>`).join("");
    $("#appFilter").innerHTML =
      '<option value="">全部申请人</option>' +
      [...apps].sort().map((a) => `<option>${esc(a)}</option>`).join("");
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = PATENTS.filter((r) => {
      if (state.dir && r.Direction !== state.dir) return false;
      if (state.year && r.PBD.slice(0, 4) !== state.year) return false;
      if (state.app && !(r.ANCS || []).includes(state.app)) return false;
      if (q) {
        const hay = `${r.PN} ${r.TITLE} ${r.ABSTRACT} ${(r.ANCS || []).join(" ")} ${(r.IPCR || []).join(" ")} ${r.Direction}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const k = state.sortKey;
    list.sort((a, b) => {
      let va = a[k], vb = b[k];
      if (k === "ANCS") { va = (a.ANCS || []).join(" "); vb = (b.ANCS || []).join(" "); }
      va = va ?? ""; vb = vb ?? "";
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "zh");
      return state.sortDesc ? -c : c;
    });
    return list;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = list.slice(start, start + state.pageSize);

    $("#resultCount").textContent = `${list.length} / ${PATENTS.length} 条`;

    $("#tableBody").innerHTML = pageRows.map((r) => `
      <tr data-pn="${esc(r.PN)}">
        <td><span class="pn">${esc(r.PN)}</span></td>
        <td>${esc(r.TITLE)}</td>
        <td>${esc((r.ANCS || []).join("、") || "—")}</td>
        <td>${esc(r.PBD)}</td>
        <td><span class="dir-badge">${esc(r.Direction)}</span></td>
        <td><a class="pdf-link" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 内网下载</a></td>
      </tr>`).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">无匹配结果</td></tr>';

    $("#pageInfo").textContent = `第 ${state.page} / ${pages} 页`;
    $("#prevBtn").disabled = state.page <= 1;
    $("#nextBtn").disabled = state.page >= pages;

    $$("#patentTable th").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.key === state.sortKey) th.classList.add(state.sortDesc ? "sorted-desc" : "sorted-asc");
    });

    if (state.view === "stats") renderStats();
  }

  function renderStats() {
    const s = STATS;
    $("#statCards").innerHTML = `
      <div class="stat-card"><div class="num">${s.total}</div><div class="lbl">专利总数</div></div>
      <div class="stat-card"><div class="num">${s.byDir.length}</div><div class="lbl">技术方向</div></div>
      <div class="stat-card"><div class="num">${s.byYear[s.byYear.length - 1]?.count ?? "—"}</div><div class="lbl">最新年(${s.byYear[s.byYear.length - 1]?.year ?? "—"})</div></div>
      <div class="stat-card"><div class="num">${s.topApplicants.length}</div><div class="lbl">主要申请人</div></div>`;
    renderBars("#chartYear", s.byYear.map((x) => ({ label: x.year, value: x.count })));
    renderBars("#chartDir", s.byDir.map((x) => ({ label: x.dir, value: x.count })));
    renderBars("#chartApp", s.topApplicants.map((x) => ({ label: x.name, value: x.count })));
  }

  function renderBars(sel, data) {
    const max = Math.max(...data.map((d) => d.value), 1);
    $(sel).innerHTML = data.map((d) => `
      <div class="bar-row">
        <div class="bar-label" title="${esc(d.label)}">${esc(d.label)}</div>
        <div class="bar-track"><div class="bar" style="width:${(d.value / max) * 100}%"></div></div>
        <div class="bar-val">${d.value}</div>
      </div>`).join("");
  }

  function showDetail(pn) {
    const r = PATENTS.find((x) => x.PN === pn);
    if (!r) return;
    $("#detailBody").innerHTML = `
      <div class="detail">
        <h2>${esc(r.TITLE)}</h2>
        <div class="meta">${esc(r.PN)} · 申请号 ${esc(r.APN || "—")} · 公开日 ${esc(r.PBD)} · 申请日 ${esc(r.APD || "—")}</div>
        <div class="field"><span class="label">申请人</span><div class="value">${esc((r.ANCS || []).join("、") || "—")}</div></div>
        <div class="field"><span class="label">发明人</span><div class="value">${esc((r.IN || []).join("、") || "—")}</div></div>
        <div class="field"><span class="label">技术方向</span><div class="value">${esc(r.Directions || r.Direction)}</div></div>
        <div class="field"><span class="label">法律状态</span><div class="value">${esc(legalLabel(r.LEGAL || []))}</div></div>
        <div class="field"><span class="label">专利族</span><div class="value">${esc(r.FAM || "—")}</div></div>
        <div class="field"><span class="label">IPC分类号</span><div class="value">${(r.IPCR || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>
        <div class="field"><span class="label">摘要</span><div class="value">${esc(r.ABSTRACT || "—")}</div></div>
        <a class="pdf-open" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 打开官方PDF（内网）</a>
      </div>`;
    $("#detailModal").classList.remove("hidden");
  }

  // events
  $("#searchInput").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; render(); });
  $("#dirFilter").addEventListener("change", (e) => { state.dir = e.target.value; state.page = 1; render(); });
  $("#yearFilter").addEventListener("change", (e) => { state.year = e.target.value; state.page = 1; render(); });
  $("#appFilter").addEventListener("change", (e) => { state.app = e.target.value; state.page = 1; render(); });
  $("#pageSize").addEventListener("change", (e) => { state.pageSize = +e.target.value; state.page = 1; render(); });
  $("#prevBtn").addEventListener("click", () => { state.page--; render(); });
  $("#nextBtn").addEventListener("click", () => { state.page++; render(); });
  $("#modalClose").addEventListener("click", () => $("#detailModal").classList.add("hidden"));
  $("#detailModal").addEventListener("click", (e) => { if (e.target === $("#detailModal")) $("#detailModal").classList.add("hidden"); });
  $("#tableBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-pn]");
    if (tr && !e.target.closest("a")) showDetail(tr.dataset.pn);
  });
  $$(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      state.view = t.dataset.view;
      $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
      $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${state.view}`));
      if (state.view === "stats") renderStats();
      if (state.view === "about") {
        $("#aboutText").textContent =
          `本库为高温热泵专利技术情报调查的结构化成果，包含 ${STATS.total} 件专利的结构化记录（书目、摘要、AI技术问题/方法/功效、IPC分类、法律状态、专利族）。` +
          ` 官方PDF原文仅在内网提供下载（公网不发布 PDF）。数据采集自智慧芽专利平台；抽样说明：本库为便利样本（偏最新公开、偏头部申请人），相对核心窄集“超高温热泵”(271条)覆盖约47%，相对宽泛“高温热泵”(4520条)约2.8%，不作为全领域统计推断。`;
      }
    });
  });
  $$("#patentTable th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDesc = !state.sortDesc;
      else { state.sortKey = k; state.sortDesc = (k === "PBD" || k === "PN"); }
      render();
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#detailModal").classList.add("hidden"); });

  load();
})();
