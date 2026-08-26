(function () {
  "use strict";

  // 内网 PDF 下载基址：公网站点不含 PDF，所有原文下载走内网 HFS 服务（files.nslc.top）。
  // 修改此处即可切换内网域名；基址须以 / 结尾，后接 <PN>.pdf。
  const PDF_BASE = "https://files.nslc.top/pdfs/";

  // 主题三态：亮 / 暗 / 跟随系统
  const THEMES = ["light", "dark", "auto"];

  // 标题关键词下划线标注：内置技术名词词典（词长 ≥2，按出现位置取最先的 1-2 个）
  const KW_DICT = [
    "卡诺电池", "磁悬浮", "气悬浮", "跨临界", "超临界", "亚临界", "复叠", "引射器", "喷射器",
    "吸收式", "相变", "熔盐", "水蒸气", "水蒸汽", "高温热泵", "热泵", "压缩机", "压缩式",
    "膨胀机", "换热器", "蒸发器", "冷凝器", "回热器", "工质", "制冷剂", "循环", "储能",
    "吸热", "储热", "蓄热", "蓄冷", "供热", "供暖", "制热", "制冷", "蒸汽", "压缩空气储能",
    "闪蒸", "蒸馏", "干燥", "烘干", "除湿", "余热", "废热", "碳捕集",
    "胺液", "溶液", "工质对", "吸收剂", "涡旋", "螺杆", "离心", "叶轮", "涡轮", "透平",
    "轴流", "径流", "磁力", "活塞", "滑片", "沸腾", "密封", "轴承", "润滑油", "油冷",
    "水冷", "风冷", "回油", "补气", "增焓", "经济器", "喷气", "喷液", "喷淋", "油分离",
    "气液分离", "闪发器", "储液器", "四通阀", "电子膨胀阀", "节流阀", "膨胀阀", "止回阀",
    "热交换", "传热", "导热", "热管", "微通道", "板式", "壳管式", "套管", "翅片",
    "多孔介质", "扩压器", "蜗壳", "导向叶片", "静叶", "动叶", "级间", "多级", "双级", "单级",
    "变频", "变容", "卸载", "滑阀", "旁通", "调节阀", "传感器", "控制器", "变工况",
    "冷热联供", "三联供", "工业余热", "有机朗肯", "朗肯循环", "布雷顿", "蒸汽压缩", "吸收",
    "吸附", "全热回收", "热回收", "热网", "集中供热", "区域供热", "供汽", "蒸汽压缩式",
    "空压机", "鼓风机", "引风机", "节能", "能效", "能效比", "碳减排", "碳中和", "双碳",
    "绿电", "光伏", "电解", "膜蒸馏", "机械蒸汽再压缩", "多效蒸发", "浓缩", "结晶", "脱盐",
    "盐水", "海水淡化", "锂电池", "电池热管理", "液冷板", "浸没式", "冷却液", "导热油",
    "硅油", "矿物油", "合成油", "除霜", "结霜", "融霜", "化霜", "四管制", "两管制",
    "水系统", "氟系统", "直膨", "冰蓄冷", "水蓄冷", "地源", "水源", "空气源", "气源",
    "热源塔", "太阳能", "光伏热", "集热器", "平板集热", "干燥室", "烘房", "烘箱", "隧道窑",
    "回转窑", "沸腾床", "流化床", "喷雾干燥", "冷冻干燥", "真空干燥", "防爆", "防腐",
    "耐高温", "耐压", "气密性", "泄漏", "消声", "降噪", "减振", "隔振", "叶顶间隙",
    "消音器", "稳压器", "缓冲器", "蓄能器", "球阀", "蝶阀", "针阀", "多级压缩", "中间换热器"
  ];

  // 关键词提取兜底时的泛用停用词
  const KW_STOP = ["一种", "用于", "基于", "通过", "包括", "以及", "及其", "所述", "本发明",
    "实用新型", "实用新型专利", "及", "其", "和", "与", "等", "或", "并", "且", "的", "之",
    "中", "内", "上", "下", "系统", "机组", "方法", "装置", "设备", "结构", "控制", "构件"];

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
    pageSize: 100,
    viewMode: "auto",
    kwUnderline: false,
    theme: "auto"
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function escapeReg(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 查询词拆分：空格/标点分隔，逐词高亮
  function splitTerms(q) {
    return String(q || "").toLowerCase()
      .split(/[\s,，.。;；:：!！?？()（）\[\]【】{}“”‘’"'、\-_/\\|]+/)
      .filter((s) => s.length > 0);
  }

  // 纯文本高亮：先整体 HTML 转义，再逐词用 <mark class="hl"> 包裹（防止 XSS）
  function hlPlain(text, terms) {
    const s = esc(text);
    if (!terms || !terms.length) return s;
    const rx = new RegExp(terms.map((t) => escapeReg(esc(t))).filter(Boolean).join("|"), "gi");
    return s.replace(rx, (m) => `<mark class="hl">${m}</mark>`);
  }

  // 标题关键词提取：词典最长匹配，按出现位置取最先的 1-2 个；无命中则去停用词取最长名词段
  function kwOf(title) {
    if (!title) return [];
    const hits = [];
    for (const w of KW_DICT) {
      if (w.length < 2) continue;
      let i = title.indexOf(w);
      while (i >= 0) {
        hits.push({ w, i });
        i = title.indexOf(w, i + w.length);
      }
    }
    hits.sort((a, b) => a.i - b.i || b.w.length - a.w.length);
    const picked = [];
    for (const h of hits) {
      if (picked.some((p) => h.i < p.i + p.len && h.i + h.len > p.i)) continue;
      picked.push({ w: h.w, i: h.i, len: h.w.length });
      if (picked.length >= 2) break;
    }
    if (picked.length) return picked.map((p) => p.w);
    let t = title;
    for (const w of KW_STOP) t = t.split(w).join(" ");
    const segs = t.replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, " ").split(/\s+/)
      .filter((s) => s.length >= 2);
    segs.sort((a, b) => b.length - a.length);
    return segs.slice(0, 2);
  }

  // 关键词下划线：单趟扫描包裹，最长优先、避免重叠嵌套
  function wrapKeywords(s, kws) {
    const arr = kws.slice().sort((a, b) => b.length - a.length);
    let out = "", i = 0, matched;
    while (i < s.length) {
      matched = null;
      for (const w of arr) {
        if (s.startsWith(w, i)) { matched = w; break; }
      }
      if (matched) {
        out += `<u class="kw-uline">${matched}</u>`;
        i += matched.length;
      } else {
        out += s[i];
        i++;
      }
    }
    return out;
  }

  // 保护已生成的下划线标签，避免搜索词高亮误匹配到标签文本内部
  function protectTags(str) {
    const tags = [];
    const out = str.replace(/<u class="kw-uline">[\s\S]*?<\/u>/g, (m) => {
      tags.push(m);
      return `\u0001${tags.length - 1}\u0001`;
    });
    return {
      str: out,
      restore(s) {
        return s.replace(/\u0001(\d+)\u0001/g, (_, i) => tags[+i]);
      }
    };
  }

  // 标题渲染：转义 →（可选）关键词下划线 → 搜索词高亮（高亮前先保护下划线标签）
  function buildTitleHtml(r, terms) {
    const t = r.TITLE || "—";
    let s = esc(t);
    if (state.kwUnderline) {
      const kws = r._kw || (r._kw = kwOf(t));
      if (kws.length) s = wrapKeywords(s, kws);
    }
    if (terms && terms.length) {
      const prot = protectTags(s);
      const rx = new RegExp(terms.map((tt) => escapeReg(esc(tt))).filter(Boolean).join("|"), "gi");
      s = prot.restore(prot.str.replace(rx, (m) => `<mark class="hl">${m}</mark>`));
    }
    return s;
  }

  // 法律状态代码→中文（2026-08-26 经智慧芽核实）
  // primary: 主状态；secondary: 伴随状态（叠加标注）
  const LEGAL_PRIMARY = {
    "1": "公开", "2": "实质审查", "3": "授权", "8": "授权有效",
    "13": "驳回", "16": "未缴年费终止", "17": "放弃", "18": "撤回",
    "19": "放弃", "222": "PCT公开"
  };
  const LEGAL_SECONDARY = {
    "61": "权利转移", "63": "质押", "66": "有效", "71": "保全", "75": "一案双申"
  };
  function legalLabel(v) {
    if (!Array.isArray(v) || !v.length) return "—";
    const main = [];
    const extra = [];
    v.forEach((x) => {
      const s = String(x);
      if (LEGAL_SECONDARY[s]) extra.push(LEGAL_SECONDARY[s]);
      else main.push(LEGAL_PRIMARY[s] || `代码${s}`);
    });
    // 主状态优先取第一个；若无主状态但有伴随状态则显示伴随
    const mainText = main.length ? main.join("/") : (extra.length ? extra[0] : "未知");
    const extraText = extra.length ? `（${extra.join("、")}）` : "";
    return mainText + extraText;
  }

  async function load() {
    const [p, s] = await Promise.all([
      fetch("data/patents.json").then((r) => r.json()),
      fetch("data/stats.json").then((r) => r.json())
    ]);
    PATENTS = p;
    STATS = s;
    preparePinyin();
    $("#metaLine").textContent =
      `共 ${s.total} 件专利 · ${s.byYear.length} 个年度 · 更新 ${s.updated}`;
    populateFilters();
    render();
  }

  // 拼音索引：加载时对“标题+申请人+方向”预计算一次全拼，缓存于内存
  function preparePinyin() {
    PATENTS.forEach((r) => {
      r._py = pinyin(
        `${r.TITLE} ${(r.ANCS || []).join(" ")} ${r.Direction}`
      ).toLowerCase();
    });
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
        // 多词查询：空格/标点分隔，逐词 AND 匹配（与逐词高亮保持一致）
        const terms = splitTerms(q);
        const hay = `${r.PN} ${r.TITLE} ${r.ABSTRACT} ${(r.ANCS || []).join(" ")} ${(r.IPCR || []).join(" ")} ${r.Direction}`.toLowerCase();
        const ok = terms.every((t) =>
          hay.includes(t) || (/[a-z]/.test(t) && r._py && r._py.includes(t))
        );
        if (!ok) return false;
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

  function effectiveView() {
    if (state.viewMode === "auto") return window.innerWidth <= 720 ? "card" : "table";
    return state.viewMode;
  }

  function cardHtml(r, terms) {
    const pn = esc(r.PN);
    const dir = esc(r.Direction || "—");
    const pbd = esc(r.PBD || "—");
    const ancs = hlPlain((r.ANCS || []).join("、") || "—", terms);
    const abs = hlPlain((r.ABSTRACT || "").replace(/\s+/g, " ").trim(), terms);
    const title = buildTitleHtml(r, terms);
    return `
      <div class="patent-card" data-pn="${pn}" tabindex="0" role="button" aria-label="查看详情">
        <div class="card-top">
          <span class="pn">${pn}</span>
          <span class="dir-badge">${dir}</span>
          <span class="pbd">${pbd}</span>
        </div>
        <div class="card-title" title="${esc(r.TITLE || "—")}">${title}</div>
        <div class="card-ancs">${ancs}</div>
        ${abs ? `<div class="card-abs">${abs}</div>` : ""}
        <div class="card-foot">
          <a class="pdf-link" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 内网下载</a>
          <span class="card-hint">点卡片打开详情 →</span>
        </div>
      </div>`;
  }

  function render() {
    const list = filtered();
    const terms = splitTerms(state.q);
    const total = list.length;
    const all = state.pageSize === "all";
    const ps = all ? Math.max(total, 1) : state.pageSize;
    const pages = all ? 1 : Math.max(1, Math.ceil(total / state.pageSize));
    state.page = all ? 1 : Math.min(state.page, pages);
    const start = (state.page - 1) * ps;
    const pageRows = list.slice(start, start + ps);
    const card = effectiveView() === "card";

    $("#resultCount").textContent = `${total} / ${PATENTS.length} 条`;

    $("#tableWrap").classList.toggle("hidden", card);
    $("#cardWrap").classList.toggle("hidden", !card);
    $("#btnTable").classList.toggle("active", !card);
    $("#btnCard").classList.toggle("active", card);

    if (card) {
      $("#cardWrap").innerHTML = pageRows.map((r) => cardHtml(r, terms)).join("") ||
        '<div class="card-empty">无匹配结果</div>';
    } else {
      $("#tableBody").innerHTML = pageRows.map((r) => `
        <tr data-pn="${esc(r.PN)}">
          <td class="col-pn"><span class="pn">${esc(r.PN)}</span></td>
          <td class="col-title">${buildTitleHtml(r, terms)}</td>
          <td class="col-ancs">${hlPlain((r.ANCS || []).join("、") || "—", terms)}</td>
          <td class="col-pbd">${esc(r.PBD)}</td>
          <td class="col-dir"><span class="dir-badge">${esc(r.Direction)}</span></td>
          <td class="col-pdf"><a class="pdf-link" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 内网下载</a></td>
        </tr>`).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">无匹配结果</td></tr>';
    }

    if (all) {
      $("#pageInfo").textContent = `全部 ${total} 条`;
      $("#prevBtn").classList.add("hidden");
      $("#nextBtn").classList.add("hidden");
      $("#prevBtn").disabled = true;
      $("#nextBtn").disabled = true;
    } else {
      $("#pageInfo").textContent = `第 ${state.page} / ${pages} 页`;
      $("#prevBtn").classList.remove("hidden");
      $("#nextBtn").classList.remove("hidden");
      $("#prevBtn").disabled = state.page <= 1;
      $("#nextBtn").disabled = state.page >= pages;
    }

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
    const terms = splitTerms(state.q);

    // 专利类型标签
    const ptypeMap = { A: "发明公开", B: "发明授权", U: "实用新型", S: "外观设计" };
    const ptype = r.PType ? (ptypeMap[r.PType] || r.PType) : "";

    // 分析区块：有 AI 字段才展示
    const aiBlock = `
      ${r.AI_PROBLEM ? `<div class="field"><span class="label">🎯 技术问题（现有技术缺陷）</span><div class="value">${esc(r.AI_PROBLEM)}</div></div>` : ""}
      ${r.AI_METHOD ? `<div class="field"><span class="label">💡 创新点 / 核心技术方案</span><div class="value">${esc(r.AI_METHOD)}</div></div>` : ""}
      ${r.AI_BENEFIT ? `<div class="field"><span class="label">🏆 架构优势 / 技术功效</span><div class="value">${esc(r.AI_BENEFIT)}</div></div>` : ""}
    `;
    const claimsBlock = r.CLAIMS ? `
      <div class="field"><span class="label">📋 权利要求（重点）</span><div class="value claims-text">${esc(r.CLAIMS)}</div></div>` : "";

    $("#detailBody").innerHTML = `
      <div class="detail">
        <h2>${buildTitleHtml(r, terms)}</h2>
        <div class="meta">${esc(r.PN)}${ptype ? ` · ${esc(ptype)}` : ""} · 申请号 ${esc(r.APN || "—")} · 公开日 ${esc(r.PBD)} · 申请日 ${esc(r.APD || "—")}${r.PRD ? ` · 优先权日 ${esc(r.PRD)}` : ""}</div>
        <div class="field"><span class="label">申请人</span><div class="value">${hlPlain((r.ANCS || []).join("、") || "—", terms)}</div></div>
        <div class="field"><span class="label">发明人</span><div class="value">${esc((r.IN || []).join("、") || "—")}</div></div>
        <div class="field"><span class="label">技术方向</span><div class="value">${esc(r.Directions || r.Direction)}</div></div>
        <div class="field"><span class="label">法律状态</span><div class="value">${esc(legalLabel(r.LEGAL || []))}</div></div>
        <div class="field"><span class="label">专利族</span><div class="value">${esc(r.FAM || "—")}</div></div>
        <div class="field"><span class="label">IPC分类号</span><div class="value">${(r.IPCR || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>
        ${(r.CPC && r.CPC.length) ? `<div class="field"><span class="label">CPC分类号</span><div class="value">${r.CPC.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>` : ""}
        <div class="field"><span class="label">摘要</span><div class="value">${hlPlain(r.ABSTRACT || "—", terms)}</div></div>
        ${aiBlock ? `<hr class="detail-hr"><h3 class="detail-section">📊 专利分析</h3>` : ""}
        ${aiBlock}
        ${claimsBlock}
        <a class="pdf-open" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 打开官方PDF（内网）</a>
      </div>`;
    $("#detailModal").classList.remove("hidden");
  }

  // ---------- 主题 ----------
  function applyTheme(t) {
    state.theme = t;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (e) { /* 隐私模式忽略 */ }
    const ico = { light: "☀️", dark: "🌙", auto: "🅰️" };
    const lbl = { light: "亮", dark: "暗", auto: "A" };
    const tip = { light: "明亮主题", dark: "暗色主题", auto: "跟随系统主题" };
    $("#themeIco").textContent = ico[t] || ico.auto;
    $("#themeLbl").textContent = lbl[t] || lbl.auto;
    $("#btnTheme").title = `主题：${tip[t] || tip.auto}（点击切换）`;
  }

  function initTheme() {
    let t = "auto";
    try { t = localStorage.getItem("theme") || "auto"; } catch (e) { /* 隐私模式 */ }
    if (!THEMES.includes(t)) t = "auto";
    applyTheme(t);
    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          if (document.documentElement.dataset.theme === "auto") applyTheme("auto");
        });
      } catch (e) { /* 旧浏览器不支持 addEventListener */ }
    }
  }

  // ---------- 关键词下划线开关 ----------
  function initKwUnderline() {
    let v = false;
    try { v = localStorage.getItem("kwUnderline") === "1"; } catch (e) { /* 隐私模式 */ }
    state.kwUnderline = v;
    $("#btnKw").classList.toggle("active", v);
    $("#btnKw").setAttribute("aria-pressed", String(v));
  }

  // ---------- 自动隐藏滚动条 ----------
  function wireAutoScrollbar() {
    $$(".table-wrap, .card-wrap, .modal-content, .claims-text").forEach((el) => {
      el.addEventListener("scroll", () => {
        el.classList.add("is-scroll");
        clearTimeout(el._scrollT);
        el._scrollT = setTimeout(() => el.classList.remove("is-scroll"), 500);
      });
    });
  }

  // events
  $("#searchInput").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; render(); });
  $("#dirFilter").addEventListener("change", (e) => { state.dir = e.target.value; state.page = 1; render(); });
  $("#yearFilter").addEventListener("change", (e) => { state.year = e.target.value; state.page = 1; render(); });
  $("#appFilter").addEventListener("change", (e) => { state.app = e.target.value; state.page = 1; render(); });
  $("#pageSize").addEventListener("change", (e) => {
    state.pageSize = e.target.value === "all" ? "all" : +e.target.value;
    state.page = 1;
    render();
  });
  $("#prevBtn").addEventListener("click", () => { state.page--; render(); });
  $("#nextBtn").addEventListener("click", () => { state.page++; render(); });
  $("#modalClose").addEventListener("click", () => $("#detailModal").classList.add("hidden"));
  $("#detailModal").addEventListener("click", (e) => { if (e.target === $("#detailModal")) $("#detailModal").classList.add("hidden"); });
  $("#tableBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-pn]");
    if (tr && !e.target.closest("a")) showDetail(tr.dataset.pn);
  });
  $("#cardWrap").addEventListener("click", (e) => {
    const card = e.target.closest(".patent-card");
    if (card && !e.target.closest("a")) showDetail(card.dataset.pn);
  });
  $("#btnTable").addEventListener("click", () => { state.viewMode = "table"; render(); });
  $("#btnCard").addEventListener("click", () => { state.viewMode = "card"; render(); });
  $("#btnTheme").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme;
    const idx = THEMES.indexOf(cur);
    applyTheme(THEMES[(idx + 1) % THEMES.length]);
  });
  $("#btnKw").addEventListener("click", () => {
    state.kwUnderline = !state.kwUnderline;
    try { localStorage.setItem("kwUnderline", state.kwUnderline ? "1" : "0"); } catch (e) { /* 隐私模式 */ }
    $("#btnKw").classList.toggle("active", state.kwUnderline);
    $("#btnKw").setAttribute("aria-pressed", String(state.kwUnderline));
    render();
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.viewMode === "auto") render(); }, 150);
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

  initTheme();
  initKwUnderline();
  wireAutoScrollbar();
  load();
})();
