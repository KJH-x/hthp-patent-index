(function () {
  "use strict";

  // 内网 PDF 下载基址：公网站点不含 PDF，所有原文下载走内网 HFS 服务（files.nslc.top）。
  // 修改此处即可切换内网域名；基址须以 / 结尾，后接 <PN>.pdf。
  const PDF_BASE = "https://files.nslc.top/pdfs/";

  // 主题三态：亮 / 暗 / 跟随系统
  const THEMES = ["light", "dark", "auto"];

  // 标题关键词下划线标注 + 关键词共现（H9）：内置技术名词词典（词长 ≥2）
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
  let FAMILY_INDEX = new Map();          // H2：FAM → {main, members[], size}
  let FAVS = [];                         // H4：收藏 PN（localStorage）
  let KW_STATS = null;                   // H9：词频/共现统计缓存
  let detailPn = "";                     // H4：当前打开详情的 PN（深链用）
  let detailList = [];                   // H7：详情 prev/next 定位的当前结果集
  let detailIdx = -1;
  let lastFocus = null;                  // H7：焦点管理（关闭详情后还原）

  let state = {
    view: "list",
    q: "",
    dir: "",
    year: "",
    app: "",
    ipc: "",          // H3/H6：IPC 主组筛选（下钻目标）
    legal: "",        // H3：法律四桶筛选（下钻目标）
    country: "",      // H11：地域筛选（下钻目标）
    sortKey: "PBD",
    sortDesc: true,
    page: 1,
    pageSize: 100,
    viewMode: "auto",
    kwUnderline: false,
    theme: "auto",
    familyMode: "all",   // H2："all" | "dedup"
    favOnly: false       // H4：只看收藏
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

  // H10：字段化检索语法 —— field:value，field 支持中英文别名
  const FIELD_ALIAS = {
    pn: "PN", apn: "APN", title: "TITLE", t: "TITLE",
    ancs: "ANCS", applicant: "ANCS", "申请人": "ANCS",
    in: "IN", inventor: "IN",
    apd: "APD", pbd: "PBD", isd: "ISD", prd: "PRD",
    ipc: "IPCR", cpc: "CPC", fam: "FAM", famid: "FAM", pid: "PID",
    dir: "Direction", direction: "Direction", "方向": "Direction",
    legal: "LEGAL", "法律": "LEGAL",
    abs: "ABSTRACT", abstract: "ABSTRACT", "摘要": "ABSTRACT",
    prob: "AI_PROBLEM", problem: "AI_PROBLEM",
    method: "AI_METHOD", benefit: "AI_BENEFIT",
    country: "COUNTRY", "国家": "COUNTRY", adc: "ADC"
  };
  function parseQuery(q) {
    const parts = String(q || "").split(/\s+/).filter(Boolean);
    const terms = [];
    const fields = [];
    for (const p of parts) {
      const m = /^([a-zA-Z\u4e00-\u9fa5]{1,16}):(.+)$/i.exec(p);
      if (m && FIELD_ALIAS[m[1].toLowerCase()]) {
        fields.push([FIELD_ALIAS[m[1].toLowerCase()], m[2]]);
      } else {
        terms.push(p);
      }
    }
    return { terms, fields };
  }
  function fieldText(r, field) {
    switch (field) {
      case "ANCS": return (r.ANCS || []).join(" ");
      case "IN": return (r.IN || []).join(" ");
      case "IPCR": return (r.IPCR || []).join(" ");
      case "CPC": return (r.CPC || []).join(" ");
      case "LEGAL": return legalLabel(r.LEGAL || []);
      case "ADC": return (r.ADC || []).join(" ");
      case "Direction": return `${r.Direction || ""} ${r.Directions || ""}`;
      default: return r[field] == null ? "" : String(r[field]);
    }
  }
  function matchField(r, field, val) {
    return fieldText(r, field).toLowerCase().includes(val.toLowerCase());
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
    const mainText = main.length ? main.join("/") : (extra.length ? extra[0] : "未知");
    const extraText = extra.length ? `（${extra.join("、")}）` : "";
    return mainText + extraText;
  }

  // ---------- H2 同族索引 ----------
  // 主记录规则：PBD 降序 → PType B>A>U → PN 降序；
  // 数据带 familyOf（v2）时以其自指记录为准，否则用算法取排序首条。
  const PTYPE_ORDER = { B: 0, A: 1, U: 2, S: 3 };
  function buildFamilyIndex() {
    const idx = new Map();
    for (const r of PATENTS) {
      if (!r.FAM) continue;
      if (!idx.has(r.FAM)) idx.set(r.FAM, { main: null, members: [], size: 0 });
      idx.get(r.FAM).members.push(r);
    }
    for (const g of idx.values()) {
      g.members.sort((a, b) =>
        (b.PBD || "").localeCompare(a.PBD || "") ||
        ((PTYPE_ORDER[b.PType] ?? 9) - (PTYPE_ORDER[a.PType] ?? 9)) ||
        b.PN.localeCompare(a.PN));
      g.main = (g.members.find((m) => m.familyOf === m.PN) || g.members[0]).PN;
      g.size = g.members.length;
    }
    FAMILY_INDEX = idx;
  }
  function isMainRecord(r) {
    const g = FAMILY_INDEX.get(r.FAM);
    return !g || g.main === r.PN;
  }

  // ---------- H3/H6 IPC 主组 / 法律四桶 ----------
  const IPC_MAIN_RE = /^([A-Z]\d{2}[A-Z]\d+)/;
  function ipcMainGroup(x) {
    const m = IPC_MAIN_RE.exec(String(x || ""));
    return m ? m[1] : "其他";
  }
  const LEGAL_AUTH = ["3", "8", "66"];
  const LEGAL_EXAM = ["1", "2", "222"];
  const LEGAL_DEAD = ["16", "17", "18", "19", "13"];
  const LEGAL_PRIMARY_SET = new Set(["1", "2", "3", "8", "13", "16", "17", "18", "19", "222"]);
  function legalBucketOf(legal) {
    if (!Array.isArray(legal) || !legal.length) return "其他";
    let first = null;
    for (const c of legal) {
      const s = String(c);
      if (LEGAL_PRIMARY_SET.has(s)) { first = s; break; }
    }
    if (first === null) first = String(legal[0]);
    if (LEGAL_AUTH.includes(first)) return "授权有效";
    if (LEGAL_EXAM.includes(first)) return "审中";
    if (LEGAL_DEAD.includes(first)) return "终止/失效";
    return "其他";
  }
  function topIpcData() {
    const m = {};
    PATENTS.forEach((r) => {
      (r.IPCR || []).forEach((x) => {
        const g = ipcMainGroup(x);
        m[g] = (m[g] || 0) + 1;
      });
    });
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));
  }
  function legalBucketData() {
    const m = {};
    PATENTS.forEach((r) => {
      const b = legalBucketOf(r.LEGAL || []);
      m[b] = (m[b] || 0) + 1;
    });
    return Object.entries(m).map(([label, value]) => ({ label, value }));
  }

  // ---------- H4 收藏 ----------
  function loadFavs() {
    try { FAVS = JSON.parse(localStorage.getItem("favPNs") || "[]"); } catch (e) { FAVS = []; }
    if (!Array.isArray(FAVS)) FAVS = [];
  }
  function saveFavs() { try { localStorage.setItem("favPNs", JSON.stringify(FAVS)); } catch (e) { /* 隐私模式忽略 */ } }
  function isFav(pn) { return FAVS.includes(pn); }
  function toggleFav(pn) {
    const i = FAVS.indexOf(pn);
    if (i >= 0) FAVS.splice(i, 1); else FAVS.push(pn);
    saveFavs();
  }
  function favBtnHtml(r) {
    const on = isFav(r.PN);
    return `<button type="button" class="fav-btn${on ? " on" : ""}" data-pn="${esc(r.PN)}" title="${on ? "取消收藏" : "收藏"}">${on ? "★" : "☆"}</button>`;
  }

  // ---------- H4 新专利标记（按 stats.updated 起 30 天内 PBD） ----------
  let NEW_REF = null;
  function newRef() {
    if (NEW_REF != null) return NEW_REF;
    const s = STATS && STATS.updated;
    const d = s ? new Date(String(s).replace(" ", "T")) : new Date();
    NEW_REF = d.getTime();
    return NEW_REF;
  }
  function isNew(r) {
    if (!r.PBD) return false;
    const t = new Date(r.PBD).getTime();
    if (!Number.isFinite(t)) return false;
    const diff = newRef() - t;
    return diff >= 0 && diff <= 30 * 24 * 3600 * 1000;
  }
  function newBadgeHtml(r) {
    return isNew(r) ? `<span class="badge-new" title="近 30 天公开的新专利">NEW</span>` : "";
  }

  // ---------- 渐进式分段加载（优先渲染列表/卡片，统计/详情随后） ----------
  let shardLoading = false;
  let pendingDetailPn = "";
  let renderTimer = null;

  function updateMeta(loadedCount, total, done) {
    const el = $("#metaLine");
    const bar = $("#loadBar");
    if (done && STATS) {
      el.textContent = `共 ${STATS.total} 件专利 · ${STATS.byYear.length} 个年度 · 更新 ${STATS.updated}`;
      if (bar) bar.hidden = true;
      return;
    }
    const pct = total ? Math.round((loadedCount / total) * 100) : 0;
    el.textContent = `加载中… 已就绪 ${loadedCount}/${total} 件（${pct}%）`;
    if (bar) {
      bar.hidden = false;
      const fill = bar.firstElementChild;
      if (fill) fill.style.width = (total ? Math.min(100, (loadedCount / total) * 100) : 0) + "%";
    }
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => { renderTimer = null; render(); }, 120);
  }

  function afterDataGrew() {
    buildFamilyIndex();
    populateFilters();
    syncFilterControls();
    scheduleRender();
  }

  function tryOpenPendingDetail() {
    if (!pendingDetailPn) return false;
    if (PATENTS.some((r) => r.PN === pendingDetailPn)) {
      const pn = pendingDetailPn;
      pendingDetailPn = "";
      showDetail(pn);
      return true;
    }
    return false;
  }

  async function load() {
    const statsP = fetch("data/stats.json").then((r) => r.json()).catch(() => null);
    let manifest = null;
    try { manifest = await fetch("data/manifest.json").then((r) => r.json()); } catch (e) { manifest = null; }

    const m = /(?:^|&)p=([^&]*)/.exec((location.hash || "").replace(/^#/, ""));
    if (m) pendingDetailPn = decodeURIComponent(m[1]);
    applyHashToState(location.hash);

    // 分片清单（无 manifest 时退回单文件，保持向后兼容）
    const shardUrls = (manifest && Array.isArray(manifest.shards) && manifest.shards.length)
      ? manifest.shards.map((s) => "data/" + s)
      : ["data/patents.json"];
    const total = (manifest && manifest.total) || 0;

    STATS = await statsP;
    if (!STATS) STATS = { total: 0, byYear: [], byDir: [], topApplicants: [], updated: "" };
    switchView(state.view);
    shardLoading = true;
    updateMeta(0, total, false);

    const results = new Array(shardUrls.length);
    let nextAppend = 0;
    function flush() {
      let grew = false;
      while (nextAppend < shardUrls.length && results[nextAppend] !== undefined) {
        const arr = results[nextAppend];
        if (Array.isArray(arr) && arr.length) { PATENTS.push(...arr); preparePinyin(arr); grew = true; }
        nextAppend++;
      }
      return grew;
    }

    let idx = 0;
    async function worker() {
      while (idx < shardUrls.length) {
        const my = idx++;
        try { results[my] = await fetch(shardUrls[my]).then((r) => r.json()); }
        catch (e) { results[my] = []; }
        if (flush()) {
          afterDataGrew();
          updateMeta(PATENTS.length, total, false);
          tryOpenPendingDetail();
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, shardUrls.length) }, () => worker()));

    shardLoading = false;
    afterDataGrew();
    updateMeta(PATENTS.length, total, true);
    if (!tryOpenPendingDetail() && detailPn) showDetail(detailPn);
    render();
  }

  // 拼音索引：对“标题+申请人+方向”预计算全拼（支持增量：传入新分片记录）
  function preparePinyin(list) {
    (list || PATENTS).forEach((r) => {
      r._py = pinyin(
        `${r.TITLE} ${(r.ANCS || []).join(" ")} ${r.Direction}`
      ).toLowerCase();
    });
  }

  function populateFilters() {
    const dirs = new Set(), years = new Set(), apps = new Set();
    const ipcs = new Set(), legals = new Set(), countries = new Set();
    PATENTS.forEach((r) => {
      if (r.Direction) dirs.add(r.Direction);
      if (r.PBD) years.add(r.PBD.slice(0, 4));
      (r.ANCS || []).forEach((a) => apps.add(a));
      (r.IPCR || []).forEach((x) => ipcs.add(ipcMainGroup(x)));
      legals.add(legalBucketOf(r.LEGAL || []));
      if (r.COUNTRY) countries.add(r.COUNTRY);
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
    $("#ipcFilter").innerHTML =
      '<option value="">全部IPC</option>' +
      [...ipcs].sort().map((x) => `<option>${esc(x)}</option>`).join("");
    $("#legalFilter").innerHTML =
      '<option value="">全部法律状态</option>' +
      [...legals].sort((a, b) => a.localeCompare(b, "zh")).map((x) => `<option>${esc(x)}</option>`).join("");
    $("#countryFilter").innerHTML =
      '<option value="">全部国家</option>' +
      [...countries].sort().map((c) => `<option>${esc(c)}</option>`).join("");
  }

  function filtered() {
    const parsed = parseQuery(state.q);
    const words = splitTerms(parsed.terms.join(" "));
    let list = PATENTS.filter((r) => {
      if (state.familyMode === "dedup" && !isMainRecord(r)) return false;
      if (state.dir && r.Direction !== state.dir) return false;
      if (state.year && r.PBD.slice(0, 4) !== state.year) return false;
      if (state.app && !(r.ANCS || []).includes(state.app)) return false;
      if (state.ipc &&
        !(r.IPCR || []).some((x) => ipcMainGroup(x) === state.ipc) &&
        !(r.CPC || []).some((x) => ipcMainGroup(x) === state.ipc)) return false;
      if (state.legal && legalBucketOf(r.LEGAL || []) !== state.legal) return false;
      if (state.country && r.COUNTRY !== state.country) return false;
      if (state.favOnly && !isFav(r.PN)) return false;
      if (words.length || parsed.fields.length) {
        const hay = `${r.PN} ${r.TITLE} ${r.ABSTRACT} ${(r.ANCS || []).join(" ")} ${(r.IN || []).join(" ")} ${(r.IPCR || []).join(" ")} ${(r.CPC || []).join(" ")} ${r.Direction} ${r.Directions} ${r.FAM} ${r.AI_PROBLEM} ${r.AI_METHOD} ${r.AI_BENEFIT} ${r.COUNTRY || ""} ${(r.ADC || []).join(" ")}`.toLowerCase();
        const okW = words.every((t) =>
          hay.includes(t) || (/[a-z]/.test(t) && r._py && r._py.includes(t)));
        const okF = parsed.fields.every(([f, v]) => matchField(r, f, v));
        if (!okW || !okF) return false;
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
    const g = FAMILY_INDEX.get(r.FAM);
    const famBadge = g && g.size > 1
      ? `<span class="fam-badge" title="同族 ${g.size} 件，点击详情查看族成员">${g.size} 件族</span>`
      : "";
    const dir = esc(r.Direction || "—");
    const pbd = esc(r.PBD || "—");
    const ancs = hlPlain((r.ANCS || []).join("、") || "—", terms);
    const abs = hlPlain((r.ABSTRACT || "").replace(/\s+/g, " ").trim(), terms);
    const title = buildTitleHtml(r, terms);
    return `
      <div class="patent-card" data-pn="${pn}" tabindex="0" role="button" aria-label="查看详情">
        <div class="card-top">
          <span class="pn">${pn}</span>${newBadgeHtml(r)}${favBtnHtml(r)}
          <span class="dir-badge">${dir}</span>${famBadge}
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

    $("#resultCount").textContent = state.familyMode === "dedup"
      ? `${total} / ${PATENTS.length} 条（按族去重，共 ${FAMILY_INDEX.size} 族）`
      : `${total} / ${PATENTS.length} 条`;

    $("#tableWrap").classList.toggle("hidden", card);
    $("#cardWrap").classList.toggle("hidden", !card);
    $("#btnTable").classList.toggle("active", !card);
    $("#btnCard").classList.toggle("active", card);

    if (card) {
      $("#cardWrap").innerHTML = pageRows.map((r) => cardHtml(r, terms)).join("") ||
        '<div class="card-empty">无匹配结果</div>';
    } else {
      $("#tableBody").innerHTML = pageRows.map((r) => {
        const g = FAMILY_INDEX.get(r.FAM);
        const famBadge = g && g.size > 1
          ? `<span class="fam-badge" title="同族 ${g.size} 件，点击详情查看族成员">${g.size} 件族</span>`
          : "";
        return `
        <tr data-pn="${esc(r.PN)}">
          <td class="col-pn"><span class="pn">${esc(r.PN)}</span>${newBadgeHtml(r)}${favBtnHtml(r)}${famBadge}</td>
          <td class="col-title">${buildTitleHtml(r, terms)}</td>
          <td class="col-ancs">${hlPlain((r.ANCS || []).join("、") || "—", terms)}</td>
          <td class="col-pbd">${esc(r.PBD)}</td>
          <td class="col-dir"><span class="dir-badge">${esc(r.Direction)}</span></td>
          <td class="col-pdf"><a class="pdf-link" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 内网下载</a></td>
        </tr>`;
      }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">无匹配结果</td></tr>';
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
    if (state.view === "map") renderMap();
    syncHash();
  }

  // ---------- H3 统计面板 ----------
  function renderStats() {
    const s = STATS;
    const famCount = s.familyTotal ?? (FAMILY_INDEX && FAMILY_INDEX.size ? FAMILY_INDEX.size : null);
    $("#statCards").innerHTML = `
      <div class="stat-card"><div class="num">${s.total}</div><div class="lbl">专利总数</div></div>
      ${famCount != null ? `<div class="stat-card"><div class="num">${famCount}</div><div class="lbl">专利族</div></div>` : ""}
      <div class="stat-card"><div class="num">${s.byDir.length}</div><div class="lbl">技术方向</div></div>
      <div class="stat-card"><div class="num">${s.byYear[s.byYear.length - 1]?.count ?? "—"}</div><div class="lbl">最新年(${s.byYear[s.byYear.length - 1]?.year ?? "—"})</div></div>
      <div class="stat-card"><div class="num">${s.topApplicants.length}</div><div class="lbl">主要申请人</div></div>`;
    renderBars("#chartYear", s.byYear.map((x) => ({ label: x.year, value: x.count })), "year");
    renderBars("#chartDir", s.byDir.map((x) => ({ label: x.dir, value: x.count })), "dir");
    renderBars("#chartApp", s.topApplicants.map((x) => ({ label: x.name, value: x.count })), "app");
    renderBars("#chartIpc", topIpcData(), "ipc");
    renderBars("#chartLegal", legalBucketData(), "legal");
    renderAppYearDir();
  }

  function renderBars(sel, data, facet) {
    const max = Math.max(...data.map((d) => d.value), 1);
    $(sel).innerHTML = data.map((d) => `
      <div class="bar-row${facet ? " clickable" : ""}"${facet
        ? ` role="button" tabindex="0" data-facet="${esc(facet)}" data-label="${esc(d.label)}" title="${esc(d.label)}：${d.value} 件，点击在列表中查看" aria-label="${esc(d.label)}：${d.value} 件，点击在列表中查看"`
        : ""}>
        <div class="bar-label" title="${esc(d.label)}">${esc(d.label)}</div>
        <div class="bar-track"><div class="bar" style="width:${(d.value / max) * 100}%"></div></div>
        <div class="bar-val">${d.value}</div>
      </div>`).join("");
  }

  // 申请年 × 方向 热力（单 Direction 主口径，近 6 申请年 × TOP8 方向）
  function renderAppYearDir() {
    const years = [...new Set(PATENTS.map((r) => (r.APD || "").slice(0, 4)))]
      .filter(Boolean).sort().slice(-6);
    const dirTot = {};
    PATENTS.forEach((r) => {
      const d = r.Direction || "其他";
      dirTot[d] = (dirTot[d] || 0) + 1;
    });
    const dirs = Object.entries(dirTot).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d]) => d);
    const cell = (y, d) => PATENTS.filter((r) => (r.APD || "").slice(0, 4) === y && (r.Direction || "其他") === d).length;
    const max = Math.max(1, ...years.map((y) => Math.max(...dirs.map((d) => cell(y, d)))));
    const head = `<div class="hm-row hm-head"><span class="hm-dir"></span>` +
      years.map((y) => `<span class="hm-cell hm-y">${y}</span>`).join("") +
      `<span class="hm-tot">合计</span></div>`;
    const rows = dirs.map((d) => {
      let tot = 0;
      const cells = years.map((y) => {
        const c = cell(y, d);
        tot += c;
        const a = c / max;
        return c
          ? `<span class="hm-cell hcell" data-year="${y}" data-dir="${esc(d)}" title="${esc(d)} · 申请年 ${y}：${c} 件（点击查看）" style="--a:${a.toFixed(3)}">${c}</span>`
          : `<span class="hm-cell" title="${esc(d)} · 申请年 ${y}：0 件"></span>`;
      }).join("");
      return `<div class="hm-row"><span class="hm-dir" title="${esc(d)}">${esc(d)}</span>${cells}<span class="hm-tot">${tot}</span></div>`;
    }).join("");
    $("#chartAppYearDir").innerHTML = head + rows;
  }

  // ---------- H9/H11 专利地图（词云 / 共现网络 / 合作网络 / 地域） ----------
  function computeKwStats() {
    if (KW_STATS) return KW_STATS;
    const freq = {}, cooc = {};
    PATENTS.forEach((r) => {
      const text = `${r.TITLE || ""} ${r.ABSTRACT || ""}`;
      const found = new Set();
      for (const w of KW_DICT) {
        if (w.length < 2) continue;
        if (text.includes(w)) found.add(w);
      }
      for (const w of found) freq[w] = (freq[w] || 0) + 1;
      const arr = [...found];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = arr[i] < arr[j] ? arr[i] + "\u0001" + arr[j] : arr[j] + "\u0001" + arr[i];
          cooc[k] = (cooc[k] || 0) + 1;
        }
      }
    });
    KW_STATS = { freq, cooc };
    return KW_STATS;
  }
  function renderKwCloud() {
    const { freq } = computeKwStats();
    const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 80);
    const max = Math.max(...entries.map((e) => e[1]), 1);
    $("#kwCloud").innerHTML = entries.map(([w, c]) => {
      const fs = 12 + Math.round((c / max) * 18);
      return `<button type="button" class="kw-word" data-kw="${esc(w)}" title="${esc(w)}：${c} 件（点击搜索）" style="font-size:${fs}px">${esc(w)}</button>`;
    }).join("") || '<div class="card-empty">无关键词数据</div>';
  }
  function renderKwNet() {
    const { freq, cooc } = computeKwStats();
    const nodes = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25)
      .map(([name, count]) => ({ name, count }));
    const nameSet = new Set(nodes.map((n) => n.name));
    const links = [];
    for (const [k, w] of Object.entries(cooc)) {
      const [a, b] = k.split("\u0001");
      if (nameSet.has(a) && nameSet.has(b)) links.push({ a, b, weight: w });
    }
    links.sort((x, y) => y.weight - x.weight);
    renderNetwork($("#kwNet"), { nodes, links });
  }
  function renderAppNet() {
    const cnt = {}, cooc = {};
    PATENTS.forEach((r) => {
      const ancs = [...new Set(r.ANCS || [])];
      if (!ancs.length) return;
      ancs.forEach((a) => { cnt[a] = (cnt[a] || 0) + 1; });
      for (let i = 0; i < ancs.length; i++) {
        for (let j = i + 1; j < ancs.length; j++) {
          const a = ancs[i] < ancs[j] ? ancs[i] : ancs[j];
          const b = ancs[i] < ancs[j] ? ancs[j] : ancs[i];
          const k = a + "\u0001" + b;
          cooc[k] = (cooc[k] || 0) + 1;
        }
      }
    });
    const nodes = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 18)
      .map(([name, count]) => ({ name, count }));
    const nameSet = new Set(nodes.map((n) => n.name));
    const links = [];
    for (const [k, w] of Object.entries(cooc)) {
      const [a, b] = k.split("\u0001");
      if (nameSet.has(a) && nameSet.has(b)) links.push({ a, b, weight: w });
    }
    links.sort((x, y) => y.weight - x.weight);
    renderNetwork($("#appNet"), { nodes, links });
  }
  function renderRegion() {
    const m = {};
    PATENTS.forEach((r) => {
      const c = r.COUNTRY || "未知";
      m[c] = (m[c] || 0) + 1;
    });
    const data = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    renderBars("#regionChart", data, "country");
  }
  function renderMap() {
    renderKwCloud();
    renderKwNet();
    renderAppNet();
    renderRegion();
  }
  // 通用零依赖网络图：圆形布局 SVG，节点大小=count，边粗细/透明度=共现权重
  function renderNetwork(el, opts) {
    const W = 760, H = 420, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 40;
    const nodes = opts.nodes || [];
    if (!nodes.length) { el.innerHTML = '<div class="card-empty">无网络数据</div>'; return; }
    const idOf = {};
    nodes.forEach((n, i) => { idOf[n.name] = i; });
    const links = opts.links || [];
    const maxW = Math.max(...links.map((l) => l.weight), 1);
    const maxC = Math.max(...nodes.map((n) => n.count), 1);
    const lines = links.map((l) => {
      const iA = idOf[l.a], iB = idOf[l.b];
      const aA = (iA / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const aB = (iB / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + R * Math.cos(aA), y1 = cy + R * Math.sin(aA);
      const x2 = cx + R * Math.cos(aB), y2 = cy + R * Math.sin(aB);
      const op = (0.15 + 0.6 * (l.weight / maxW)).toFixed(2);
      const sw = (1 + 2.5 * (l.weight / maxW)).toFixed(2);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="stroke:var(--accent);stroke-opacity:${op};stroke-width:${sw}"/>`;
    }).join("");
    const circles = nodes.map((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + R * Math.cos(angle), y = cy + R * Math.sin(angle);
      const r = 6 + 14 * (n.count / maxC);
      const short = n.name.length > 8 ? n.name.slice(0, 8) + "…" : n.name;
      return `<g class="net-node" data-name="${esc(n.name)}" data-count="${n.count}" tabindex="0" role="button" aria-label="${esc(n.name)}：${n.count} 次，点击查看">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.5"/>
        <text x="${x.toFixed(1)}" y="${(y - r - 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="currentColor">${esc(short)}</text>
      </g>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || "共现网络")}" class="net-svg">${lines}${circles}</svg>`;
  }

  // ---------- H4 视图/下钻/URL 同步 ----------
  function switchView(view) {
    state.view = view;
    $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.view === view));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
    if (view === "stats") renderStats();
    if (view === "map") renderMap();
    if (view === "about") {
      $("#aboutText").textContent =
        `本库为高温热泵专利技术情报调查的结构化成果，包含 ${STATS.total} 件专利的结构化记录（书目、摘要、AI技术问题/方法/功效、IPC分类、法律状态、专利族）。` +
        ` 官方PDF原文仅在内网提供下载（公网不发布 PDF）。数据采集自智慧芽专利平台；抽样说明：本库为便利样本（偏最新公开、偏头部申请人），相对核心窄集“超高温热泵”(271条)覆盖约47%，相对宽泛“高温热泵”(4520条)约2.8%，不作为全领域统计推断。`;
    }
    syncHash();
  }
  // 统计/地图下钻：写入 state → 切列表 → 回填筛选控件 → render → 滚到列表
  function drill(facet, value) {
    switch (facet) {
      case "year": state.year = value; break;
      case "dir": state.dir = value; break;
      case "app": state.app = value; break;
      case "ipc": state.ipc = value; break;
      case "legal": state.legal = value; break;
      case "country": state.country = value; break;
      case "kw": state.q = value; break;
      case "diryear":
        if (value && value.year) state.year = value.year;
        if (value && value.dir) state.dir = value.dir;
        break;
      default: return;
    }
    state.page = 1;
    switchView("list");
    syncFilterControls();
    render();
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      $("#view-list").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      const wrap = $("#cardWrap").classList.contains("hidden") ? $("#tableWrap") : $("#cardWrap");
      if (wrap) wrap.scrollTop = 0;
    });
  }
  function syncFilterControls() {
    $("#searchInput").value = state.q;
    const setSel = (id, val) => {
      if (!val) return;
      const sel = $(id);
      if (sel && [...sel.options].some((o) => o.value === val)) sel.value = val;
    };
    setSel("#dirFilter", state.dir);
    setSel("#yearFilter", state.year);
    setSel("#appFilter", state.app);
    setSel("#ipcFilter", state.ipc);
    setSel("#legalFilter", state.legal);
    setSel("#countryFilter", state.country);
  }

  // hash 字段：q/y/d/a/i/l/c/s/o/ps/pg/v/p
  function stateToHash() {
    const p = [];
    const push = (k, v) => { if (v !== "" && v != null) p.push(`${k}=${encodeURIComponent(String(v))}`); };
    push("q", state.q.trim());
    push("y", state.year);
    push("d", state.dir);
    push("a", state.app);
    push("i", state.ipc);
    push("l", state.legal);
    push("c", state.country);
    if (state.sortKey !== "PBD" || !state.sortDesc) {
      p.push(`s=${state.sortKey}`);
      if (!state.sortDesc) p.push("o=asc");
    }
    push("ps", state.pageSize === "all" ? "all" : state.pageSize);
    if (state.page > 1) push("pg", state.page);
    if (state.view !== "list") push("v", state.view);
    if (detailPn) push("p", detailPn);
    return p.join("&");
  }
  function applyHashToState(h) {
    const qs = new URLSearchParams((h || "").replace(/^#/, ""));
    state.q = qs.get("q") || "";
    state.year = qs.get("y") || "";
    state.dir = qs.get("d") || "";
    state.app = qs.get("a") || "";
    state.ipc = qs.get("i") || "";
    state.legal = qs.get("l") || "";
    state.country = qs.get("c") || "";
    const s = qs.get("s");
    state.sortKey = s && ["PN", "TITLE", "ANCS", "PBD", "Direction"].includes(s) ? s : "PBD";
    state.sortDesc = qs.get("o") !== "asc";
    const ps = qs.get("ps");
    state.pageSize = ps === "all" ? "all" : (ps && +ps > 0 ? +ps : 100);
    state.page = Math.max(1, +qs.get("pg") || 1);
    const v = qs.get("v");
    state.view = (v === "stats" || v === "about" || v === "map") ? v : "list";
  }
  function syncHash() {
    const next = "#" + stateToHash();
    if (next === "#" && !location.hash) return;
    if (location.hash === next) return;
    try { history.replaceState(null, "", next); } catch (e) { location.hash = next; }
  }

  // ---------- H7 详情 prev/next ----------
  function updateDetailNav() {
    const prev = $("#detailPrev"), next = $("#detailNext");
    if (prev) prev.disabled = detailIdx <= 0;
    if (next) next.disabled = detailIdx >= detailList.length - 1;
  }
  function goPrev() { if (detailIdx > 0) showDetail(detailList[detailIdx - 1].PN); }
  function goNext() { if (detailIdx < detailList.length - 1) showDetail(detailList[detailIdx + 1].PN); }

  // ---------- 详情 ----------
  function familyFieldHtml(r) {
    const g = FAMILY_INDEX.get(r.FAM);
    if (!g || g.size <= 1) return esc(r.FAM || "—");
    const btns = g.members.map((m) =>
      `<button type="button" class="tag fam-member${m.PN === r.PN ? " active" : ""}" data-pn="${esc(m.PN)}">${esc(m.PN)}</button>`
    ).join("");
    return `<span class="fam-id">族 ${esc(r.FAM)}（${g.size} 件）</span> ${btns}`;
  }
  // H6：相似专利聚合入口（同 IPC 主组 / 同方向）
  function similarHtml(r) {
    const ipc = r.IPCR && r.IPCR.length ? ipcMainGroup(r.IPCR[0]) : null;
    const dir = r.Direction;
    const ipcN = ipc ? PATENTS.filter((x) => x !== r && (x.IPCR || []).some((c) => ipcMainGroup(c) === ipc)).length : 0;
    const dirN = dir ? PATENTS.filter((x) => x !== r && x.Direction === dir).length : 0;
    if (!ipcN && !dirN) return "";
    const btns = [];
    if (ipcN) btns.push(`<button type="button" class="tag sim-btn" data-facet="ipc" data-label="${esc(ipc)}" title="同 IPC 主组 ${esc(ipc)} 共 ${ipcN} 件，点击查看">同 IPC(${esc(ipc)}) ${ipcN} 件</button>`);
    if (dirN) btns.push(`<button type="button" class="tag sim-btn" data-facet="dir" data-label="${esc(dir)}" title="同方向共 ${dirN} 件，点击查看">同方向 ${dirN} 件</button>`);
    return `<div class="field"><span class="label">🔍 相似专利</span><div class="value">${btns.join("")}</div></div>`;
  }

  function showDetail(pn) {
    const r = PATENTS.find((x) => x.PN === pn);
    if (!r) return;
    const terms = splitTerms(state.q);
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    detailList = filtered();
    detailIdx = detailList.findIndex((x) => x.PN === pn);
    updateDetailNav();

    const ptypeMap = { A: "发明公开", B: "发明授权", U: "实用新型", S: "外观设计" };
    const ptype = r.PType ? (ptypeMap[r.PType] || r.PType) : "";

    const aiBlock = `
      ${r.AI_PROBLEM ? `<div class="field"><span class="label">🎯 技术问题（现有技术缺陷）</span><div class="value">${esc(r.AI_PROBLEM)}</div></div>` : ""}
      ${r.AI_METHOD ? `<div class="field"><span class="label">💡 创新点 / 核心技术方案</span><div class="value">${esc(r.AI_METHOD)}</div></div>` : ""}
      ${r.AI_BENEFIT ? `<div class="field"><span class="label">🏆 架构优势 / 技术功效</span><div class="value">${esc(r.AI_BENEFIT)}</div></div>` : ""}
    `;
    const claimsBlock = r.CLAIMS ? `
      <div class="field"><span class="label">📋 权利要求（重点）</span><div class="value claims-text">${esc(r.CLAIMS)}</div></div>` : "";
    // H1 1a：ADC 技术领域标签；附图数；国家；ISD（H5，非空才显示）
    const adcBlock = Array.isArray(r.ADC) && r.ADC.length ? `
      <div class="field"><span class="label">技术领域（ADC）</span><div class="value">${r.ADC.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>` : "";
    const picLine = (typeof r.PDF_IMAGE_COUNT === "number" && r.PDF_IMAGE_COUNT > 0)
      ? ` · 附图 ${r.PDF_IMAGE_COUNT} 幅` : "";
    const countrySeg = r.COUNTRY ? ` · 国家 ${esc(r.COUNTRY)}` : "";
    const isdSeg = r.ISD ? ` · 授权公告日 ${esc(r.ISD)}` : "";
    // H6：IPC/CPC 分类标签可点（点击跳该主组列表）
    const ipcTags = (r.IPCR || []).map((x) => {
      const g = ipcMainGroup(x);
      return `<button type="button" class="tag ipc-tag" data-facet="ipc" data-label="${esc(g)}" title="同 IPC 主组 ${esc(g)}，点击查看">${esc(x)}</button>`;
    }).join("");
    const cpcTags = (r.CPC && r.CPC.length) ? r.CPC.map((x) => {
      const g = ipcMainGroup(x);
      return `<button type="button" class="tag ipc-tag" data-facet="ipc" data-label="${esc(g)}" title="同 CPC 主组 ${esc(g)}，点击查看">${esc(x)}</button>`;
    }).join("") : "";

    $("#detailBody").innerHTML = `
      <div class="detail">
        <h2>${buildTitleHtml(r, terms)}</h2>
        <div class="meta">${esc(r.PN)}${ptype ? ` · ${esc(ptype)}` : ""}${countrySeg} · 申请号 ${esc(r.APN || "—")} · 公开日 ${esc(r.PBD)} · 申请日 ${esc(r.APD || "—")}${r.PRD ? ` · 优先权日 ${esc(r.PRD)}` : ""}${isdSeg}${picLine}</div>
        <div class="field"><span class="label">申请人</span><div class="value">${hlPlain((r.ANCS || []).join("、") || "—", terms)}</div></div>
        <div class="field"><span class="label">发明人</span><div class="value">${esc((r.IN || []).join("、") || "—")}</div></div>
        <div class="field"><span class="label">技术方向</span><div class="value">${esc(r.Directions || r.Direction)}</div></div>
        <div class="field"><span class="label">法律状态</span><div class="value">${esc(legalLabel(r.LEGAL || []))}</div></div>
        <div class="field"><span class="label">专利族</span><div class="value">${familyFieldHtml(r)}</div></div>
        ${adcBlock}
        <div class="field"><span class="label">IPC分类号</span><div class="value">${ipcTags || "—"}</div></div>
        ${cpcTags ? `<div class="field"><span class="label">CPC分类号</span><div class="value">${cpcTags}</div></div>` : ""}
        ${similarHtml(r)}
        <div class="field"><span class="label">摘要</span><div class="value">${hlPlain(r.ABSTRACT || "—", terms)}</div></div>
        ${aiBlock ? `<hr class="detail-hr"><h3 class="detail-section">📊 专利分析</h3>` : ""}
        ${aiBlock}
        ${claimsBlock}
        <a class="pdf-open" href="${esc(pdfHref(r))}" target="_blank" rel="noopener">📄 打开官方PDF（内网）</a>
      </div>`;
    detailPn = pn;
    $("#detailModal").classList.remove("hidden");
    const mcontent = $("#detailModal .modal-content");
    if (mcontent) mcontent.focus();
    syncHash();
  }

  function closeDetail() {
    $("#detailModal").classList.add("hidden");
    detailPn = "";
    syncHash();
    if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  // ---------- H4 CSV 导出 ----------
  const CSV_COLS = [
    ["PN", "公开号"], ["PType", "类型"], ["TITLE", "标题"],
    ["ANCS", "申请人"], ["IN", "发明人"],
    ["APD", "申请日"], ["PBD", "公开日"], ["ISD", "授权公告日"],
    ["Direction", "方向"], ["IPCR", "IPC主组"],
    ["LEGAL", "法律状态"], ["FAM", "专利族"], ["COUNTRY", "国家"]
  ];
  function csvCell(v) {
    let s = v == null ? "" : String(v);
    s = s.replace(/\s+/g, " ").trim();
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function exportCsv() {
    const list = filtered();
    const header = CSV_COLS.map(([, zh]) => csvCell(zh)).join(",");
    const rows = list.map((r) => CSV_COLS.map(([k]) => {
      if (k === "ANCS") return csvCell((r.ANCS || []).join("、"));
      if (k === "IN") return csvCell((r.IN || []).join("、"));
      if (k === "IPCR") return csvCell((r.IPCR || []).map(ipcMainGroup).join(";"));
      if (k === "LEGAL") return csvCell(legalLabel(r.LEGAL || []));
      return csvCell(r[k]);
    }).join(","));
    const csv = "\uFEFF" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hthp-patent-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flashBtn($("#btnCsv"), `已导出 ${list.length} 条`);
  }
  function flashBtn(btn, txt) {
    const old = btn.textContent;
    btn.textContent = txt;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = old; }, 1200);
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
  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    state.q = e.target.value; state.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => render(), 160);   // H10：输入防抖
  });
  $("#dirFilter").addEventListener("change", (e) => { state.dir = e.target.value; state.page = 1; render(); });
  $("#yearFilter").addEventListener("change", (e) => { state.year = e.target.value; state.page = 1; render(); });
  $("#appFilter").addEventListener("change", (e) => { state.app = e.target.value; state.page = 1; render(); });
  $("#ipcFilter").addEventListener("change", (e) => { state.ipc = e.target.value; state.page = 1; render(); });
  $("#legalFilter").addEventListener("change", (e) => { state.legal = e.target.value; state.page = 1; render(); });
  $("#countryFilter").addEventListener("change", (e) => { state.country = e.target.value; state.page = 1; render(); });
  $("#pageSize").addEventListener("change", (e) => {
    state.pageSize = e.target.value === "all" ? "all" : +e.target.value;
    state.page = 1;
    render();
  });
  $("#prevBtn").addEventListener("click", () => { state.page--; render(); });
  $("#nextBtn").addEventListener("click", () => { state.page++; render(); });
  $("#famToggle").addEventListener("change", (e) => {
    state.familyMode = e.target.checked ? "dedup" : "all";
    state.page = 1;
    render();
  });
  $("#favToggle").addEventListener("change", (e) => {
    state.favOnly = e.target.checked;
    state.page = 1;
    render();
  });
  $("#modalClose").addEventListener("click", closeDetail);
  $("#detailModal").addEventListener("click", (e) => {
    if (e.target === $("#detailModal")) { closeDetail(); return; }
    const fm = e.target.closest(".fam-member");
    if (fm) { e.stopPropagation(); showDetail(fm.dataset.pn); return; }
    const tag = e.target.closest(".ipc-tag, .sim-btn");
    if (tag) { e.stopPropagation(); const f = tag.dataset.facet, l = tag.dataset.label; closeDetail(); drill(f, l); return; }
    if (e.target.closest("#detailPrev")) { e.stopPropagation(); goPrev(); return; }
    if (e.target.closest("#detailNext")) { e.stopPropagation(); goNext(); return; }
  });
  $("#tableBody").addEventListener("click", (e) => {
    const fav = e.target.closest(".fav-btn");
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.pn); render(); return; }
    const tr = e.target.closest("tr[data-pn]");
    if (tr && !e.target.closest("a")) showDetail(tr.dataset.pn);
  });
  $("#cardWrap").addEventListener("click", (e) => {
    const fav = e.target.closest(".fav-btn");
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.pn); render(); return; }
    const card = e.target.closest(".patent-card");
    if (card && !e.target.closest("a")) showDetail(card.dataset.pn);
  });
  // H7：卡片 Enter/Space 打开详情
  $("#cardWrap").addEventListener("keydown", (e) => {
    const card = e.target.closest(".patent-card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      showDetail(card.dataset.pn);
    }
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
  $("#modalCopy").addEventListener("click", async () => {
    const url = location.origin + location.pathname + "#" + stateToHash();
    try {
      await navigator.clipboard.writeText(url);
      flashBtn($("#modalCopy"), "已复制 ✓");
    } catch (e) {
      const tmp = document.createElement("textarea");
      tmp.value = url;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
      flashBtn($("#modalCopy"), "已复制 ✓");
    }
  });
  $("#btnCsv").addEventListener("click", exportCsv);
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.viewMode === "auto") render(); }, 150);
  });
  $$(".tab").forEach((t) => {
    t.addEventListener("click", () => switchView(t.dataset.view));
  });
  $$("#patentTable th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDesc = !state.sortDesc;
      else { state.sortKey = k; state.sortDesc = (k === "PBD" || k === "PN"); }
      render();
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDetail(); return; }
    if (!$("#detailModal").classList.contains("hidden")) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
  });
  // H3：统计区下钻（容器级委托，只注册一次）
  $("#view-stats").addEventListener("click", (e) => {
    const hc = e.target.closest(".hcell[data-year][data-dir]");
    if (hc) { drill("diryear", { year: hc.dataset.year, dir: hc.dataset.dir }); return; }
    const row = e.target.closest(".bar-row[data-facet]");
    if (row) drill(row.dataset.facet, row.dataset.label);
  });
  $("#view-stats").addEventListener("keydown", (e) => {
    const row = e.target.closest(".bar-row[data-facet]");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); drill(row.dataset.facet, row.dataset.label); }
  });
  // H9/H11：专利地图区下钻（容器级委托）
  $("#view-map").addEventListener("click", (e) => {
    const kw = e.target.closest(".kw-word");
    if (kw) { drill("kw", kw.dataset.kw); return; }
    const kwNode = e.target.closest("#kwNet .net-node");
    if (kwNode) { drill("kw", kwNode.dataset.name); return; }
    const appNode = e.target.closest("#appNet .net-node");
    if (appNode) { drill("app", appNode.dataset.name); return; }
    const regionRow = e.target.closest("#regionChart .bar-row[data-facet]");
    if (regionRow) drill(regionRow.dataset.facet, regionRow.dataset.label);
  });
  // H4：hash 外部变化（手改地址栏 / 前进后退 / 粘贴深链）
  window.addEventListener("hashchange", () => {
    applyHashToState(location.hash);
    const m = /(?:^|&)p=([^&]*)/.exec((location.hash || "").replace(/^#/, ""));
    const pn = m ? decodeURIComponent(m[1]) : "";
    const found = pn && PATENTS.some((r) => r.PN === pn);
    pendingDetailPn = (pn && !found && shardLoading) ? pn : "";  // 分片未就绪则暂存
    detailPn = found ? pn : "";
    syncFilterControls();
    switchView(state.view);
    render();
    if (detailPn) showDetail(detailPn);
    else $("#detailModal").classList.add("hidden");
  });

  initTheme();
  initKwUnderline();
  wireAutoScrollbar();
  loadFavs();
  load();
})();
