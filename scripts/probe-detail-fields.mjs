#!/usr/bin/env node
/*
 * probe-detail-fields.mjs — H1 1b 详情字段探测（智慧芽 PatSnap）
 *
 * 只探测、不采集。抽样若干条专利详情页，dump ViewRoot.patent 的全部键 + 候选
 * 新字段（CLAIMS/PRD/优先权/引证/法律时间线/过期日/同族成员），并切换到
 * 权利要求 / 法律信息 / 同族 / 引用 标签页提取对应 Vue 组件数据，
 * 用于锁定重采脚本里 CLAIMS/PRD/CITES/CITED_BY/LEGAL_TL/EXPIRY 等字段的真实键名。
 *
 * 前置条件（务必满足）：
 *   1. 独立 browser-agent 实例在跑（默认端口 8932，可用 env ZHY_BASE 覆盖）。
 *   2. 该浏览器已登录智慧芽，且当前域为 analytics.zhihuiya.com（登录态有效）。
 *   3. 智慧芽登录需要人工介入（headed 窗口 / 验证码 / saveCookies），
 *      本脚本不代登录——登录态失效时脚本会提示并中止，不要带病跑。
 *
 * 用法（在仓库根目录）：
 *   node scripts/probe-detail-fields.mjs                 # 抽样 3 条
 *   node scripts/probe-detail-fields.mjs 5               # 抽样 5 条
 *   node scripts/probe-detail-fields.mjs 3 --out scripts/probe-report.json
 *   $env:ZHY_BASE="http://127.0.0.1:8932"; node scripts/probe-detail-fields.mjs
 *
 * 零依赖（Node >= 18，自带 fetch/setTimeout）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.ZHY_BASE || "http://127.0.0.1:8932";
const args = process.argv.slice(2);
let N = 3;
let outFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") outFile = args[++i];
  else if (/^\d+$/.test(args[i])) N = +args[i];
  else { console.error(`未知参数: ${args[i]}`); process.exit(2); }
}
N = Math.max(1, Math.min(N, 10));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callAgent(payload) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`browser-agent HTTP ${res.status} @ ${BASE}`);
  return res.json();
}
async function goto(url) {
  const r = await callAgent({ action: "goto", url });
  if (r && r.error) throw new Error(`goto failed: ${r.error}`);
}
async function evalPage(code) {
  const r = await callAgent({ action: "eval", code });
  if (r && r.error) throw new Error(`eval failed: ${r.error}`);
  return r;
}

// 页面内：找 ViewRoot，dump patent 键 + 候选字段存在性 + 登录态
const PROBE_VIEWROOT = `() => {
  let target = null;
  (function walk(root, d) {
    if (!root || d > 22 || target) return;
    if (root.__vue__ && root.__vue__.$options && root.__vue__.$options.name === 'ViewRoot') { target = root.__vue__; return; }
    [...(root.children || [])].forEach((c) => walk(c, d + 1));
  })(document.body, 0);
  if (!target) {
    return { ok: false, url: location.href, host: location.hostname,
      loggedIn: location.hostname.includes('zhihuiya') };
  }
  const p = target.patent || {};
  const keys = Object.keys(p).sort();
  const cand = {};
  for (const k of ['CLAIMS','CLAIMS_TEXT','CLMS','CLAIM','PRD','PRIORITY','PRIORITY_NUMBER','PRIORITIES',
    'EXPIRY','ESTIMATE_EXPIRY','VALID_UNTIL','CITES','CITED_BY','CITATIONS','CITE','CITED',
    'LEGAL_TL','LEGAL_STATUS','LEGAL','FAMILY_MEMBERS','FAMILY_SIZE','FAMILY_ID','INPADOC']) {
    cand[k] = !(p[k] === undefined || p[k] === null);
  }
  return { ok: true, url: location.href, host: location.hostname,
    pn: p.PN || '', pid: p.PATENT_ID || '', keys, cand,
    hasCnAbs: !!(p.ABST && p.ABST.CN), hasIsd: !!p.ISD };
}`;

// 页面内：点击包含指定文本的导航标签（Vue router-link）
const PROBE_CLICK_TAB = (text) => `() => {
  const els = [...document.querySelectorAll('a.nav-menu__item')];
  const el = els.find((a) => (a.innerText || '').trim() === '${text}')
    || els.find((a) => (a.innerText || '').includes('${text}'));
  if (!el) return { clicked: false, tabs: els.map((a) => (a.innerText || '').trim()) };
  el.click();
  return { clicked: true };
}`;

// 页面内：按组件名白名单收集 Vue 组件数据（清洗循环引用，JSON 安全）
const PROBE_COMPONENTS = (names) => `() => {
  const want = new Set(${JSON.stringify(names)});
  const found = {};
  const seen = new WeakSet();
  const safe = (v, depth, path) => {
    if (v == null) return v;
    const t = typeof v;
    if (t === 'string') return v.length > 4000 ? v.slice(0, 4000) + '…<trunc>' : v;
    if (t === 'number' || t === 'boolean') return v;
    if (t !== 'object') return undefined;
    if (depth > 6) return '[depth]';
    if (seen.has(v)) return '[circular]';
    if (Array.isArray(v)) { seen.add(v); const a = v.slice(0, 40).map((x) => safe(x, depth + 1, path)); seen.delete(v); return a; }
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null) {
      seen.add(v);
      const o = {};
      for (const k of Object.keys(v)) { if (k[0] === '_') continue; const sv = safe(v[k], depth + 1, path + '.' + k); if (sv !== undefined) o[k] = sv; }
      seen.delete(v);
      return o;
    }
    return '[obj]';
  };
  (function walk(root, d) {
    if (!root || d > 22) return;
    if (root.__vue__ && root.__vue__.$options && want.has(root.__vue__.$options.name)) {
      const vm = root.__vue__;
      const name = vm.$options.name;
      if (!(name in found)) found[name] = [];
      const keys = Object.keys(vm.$data || {});
      const pick = {};
      keys.forEach((k) => { pick[k] = safe(vm.$data[k], 0, k); });
      found[name].push({ keys, data: pick });
    }
    [...(root.children || [])].forEach((c) => walk(c, d + 1));
  })(document.body, 0);
  return { found };
}`;

// 标签页 → 组件名白名单（依据 zhihuiya-patsnap skill §6）
const TAB_PROBES = [
  { text: "权利要求", comps: ["Clms"] },
  { text: "法律信息", comps: ["LegalStatus"] },
  { text: "同族专利", comps: ["PatentFamily"] },
  { text: "引用信息", comps: ["CitationCite", "CitationCited"] }
];

async function main() {
  const dataPath = resolve("data/patents.json");
  const patents = JSON.parse(readFileSync(dataPath, "utf8"));
  if (!Array.isArray(patents)) { console.error("data/patents.json 顶层不是数组"); process.exit(2); }

  // 抽样：优先取有 PID 且含 ISD 的 B 型授权记录（详情页信息最全），再补 A 型
  const withPid = patents.filter((r) => r.PID);
  const samples = [
    ...withPid.filter((r) => r.PType === "B" && r.ISD),
    ...withPid.filter((r) => r.PType !== "B")
  ].slice(0, N);
  if (samples.length < N) {
    withPid.slice(0, N).forEach((r) => { if (!samples.includes(r)) samples.push(r); });
  }
  if (!samples.length) { console.error("data/patents.json 无 PID，无法构造详情 URL"); process.exit(2); }

  console.log(`browser-agent: ${BASE}`);
  console.log(`抽样 ${samples.length} 条：${samples.map((r) => r.PN).join(", ")}`);

  // 先做一次连通性 + 登录态预检
  let pre;
  try {
    pre = await evalPage(PROBE_VIEWROOT);
  } catch (e) {
    console.error(`\n[browser-agent 不可达] ${e.message}`);
    console.error("请先启动独立 browser-agent 实例并保持智慧芽登录态，再运行本脚本。");
    process.exit(1);
  }
  if (!pre || !pre.ok) {
    console.error(`\n[未登录或路由不对] host=${pre && pre.host} url=${pre && pre.url}`);
    console.error("智慧芽需要手动登录：headed 窗口登录 / 验证码 / saveCookies 恢复后重试；不要带病跑。");
    process.exit(1);
  }
  console.log(`[预检通过] host=${pre.host}（登录态有效）`);

  const report = { generated: new Date().toISOString().slice(0, 19), base: BASE, samples: [] };

  for (const r of samples) {
    const url = `https://analytics.zhihuiya.com/patent-view?patentId=${r.PID}&sort=pdesc&rows=20`;
    const rec = { PN: r.PN, PID: r.PID, url };
    try {
      console.log(`\n== ${r.PN} (${r.PID}) ==`);
      await goto(url);
      await sleep(7000);
      const vr = await evalPage(PROBE_VIEWROOT);
      rec.viewRoot = vr;
      if (!vr || !vr.ok) { console.log("  ViewRoot 未找到，跳过标签页探测"); report.samples.push(rec); continue; }
      console.log(`  patent keys (${(vr.keys || []).length}): ${(vr.keys || []).join(", ")}`);
      const present = Object.entries(vr.cand || {}).filter(([, v]) => v).map(([k]) => k);
      console.log(`  候选字段命中: ${present.length ? present.join(", ") : "（无）"}`);

      for (const tp of TAB_PROBES) {
        const c = await evalPage(PROBE_CLICK_TAB(tp.text));
        if (!c || !c.clicked) { console.log(`  [tab 未找到] ${tp.text}`); rec[`tab_${tp.text}`] = { clicked: false }; continue; }
        await sleep(4500);
        const comp = await evalPage(PROBE_COMPONENTS(tp.comps));
        rec[`tab_${tp.text}`] = { clicked: true, components: (comp && comp.found) || {} };
        const names = Object.keys((comp && comp.found) || {});
        console.log(`  tab[${tp.text}] → 组件: ${names.length ? names.join(", ") : "（无）"}`);
      }
    } catch (e) {
      console.log(`  [失败] ${e.message}`);
      rec.error = String(e.message);
    }
    report.samples.push(rec);
  }

  if (!outFile) outFile = `scripts/probe-report-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(resolve(outFile), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n探测报告已写入: ${outFile}`);
  console.log("下一步：对照报告中的真实键名，更新 scripts/RE-SCRAPE-DESIGN.md §4 的字段映射后实施重采。");
}

main().catch((e) => { console.error(e); process.exit(1); });
