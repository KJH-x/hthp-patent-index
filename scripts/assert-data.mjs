#!/usr/bin/env node
/*
 * assert-data.mjs — hthp-patent 数据不变量校验（零依赖，仅 Node 内置模块）
 *
 * 校验 patents.json 的发布门槛不变量：
 *   - 记录总数 / 必填字段存在性与类型（数组字段）
 *   - ISD 覆盖率（当前 294）与日期格式（且 ISD 不早于 PBD）
 *   - FAM 族一致性（610 族、31 族 >1 成员、每族恰 2 件、索引自洽）
 *   - PN 重复检测 / 格式软警告
 *   - stats.json 与 patents.json 自洽（total、byYear 求和、2026 回归锚点）
 *   - schema v2 向前兼容（COUNTRY/ADC/PDF_IMAGE_COUNT/FAMILY_MEMBERS/FAMILY_SIZE/familyOf/LEGAL_TL/PRD/CLAIMS 出现时才校验）
 *
 * 用法（在仓库根目录）：
 *   node scripts/assert-data.mjs
 *   node scripts/assert-data.mjs --data data\patents.json --stats data\stats.json
 *   node scripts/assert-data.mjs --records=641 --isd=294 --fam-total=610 --fam-multi=31
 *   node scripts/assert-data.mjs --json              # 机器可读 JSON 摘要
 * 退出码：0 = 通过；1 = 存在不变量违反；2 = 参数错误。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const EXPECT = {
  records: 641,    // patents.json 记录总数
  isd: 294,        // ISD 非空记录数
  famTotal: 610,   // 去重后族总数
  famMulti: 31,    // 成员数 >1 的族数
  year2026: 477,   // stats.byYear 最新年 2026 计数（回归锚点）
  country: 641,    // COUNTRY 非空数（H1 1a 回补后）
  adc: 542,        // ADC 非空（数组非空）记录数
  pic: 610,        // PDF_IMAGE_COUNT 非空（数字）记录数
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PN_RE = /^[A-Z]{1,3}\d{8,11}[A-Z]?\d?$/;
// 主记录规则（与 app.js buildFamilyIndex / 导出端 familyOf 同一算法）：
// PBD 降序 → PType 优先 B>A>U>S → PN 降序
const PTYPE_ORDER = { B: 0, A: 1, U: 2, S: 3 };

function usage() {
  return `用法:
  node scripts/assert-data.mjs [选项]

选项:
  --data <path>       patents.json 路径（默认 data/patents.json）
  --stats <path>      stats.json 路径（默认 data/stats.json；不存在则跳过 stats 校验）
  --records=N         期望记录总数（默认 ${EXPECT.records}）
  --isd=N             期望 ISD 非空数（默认 ${EXPECT.isd}）
  --fam-total=N       期望族总数（默认 ${EXPECT.famTotal}）
  --fam-multi=N       期望 >1 成员的族数（默认 ${EXPECT.famMulti}）
  --year2026=N        期望 2026 年公开计数（默认 ${EXPECT.year2026}；-1 跳过）
  --country=N         期望 COUNTRY 非空数（默认 ${EXPECT.country}）
  --adc=N             期望 ADC 非空数（默认 ${EXPECT.adc}）
  --pic=N             期望 PDF_IMAGE_COUNT 非空数（默认 ${EXPECT.pic}）
  --json              输出 JSON 摘要
  -h, --help          显示本帮助`;
}

const args = process.argv.slice(2);
const opt = { ...EXPECT };
let dataPath = "data/patents.json";
let statsPath = "data/stats.json";
let jsonOut = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") { console.log(usage()); process.exit(0); }
  else if (a === "--json") jsonOut = true;
  else if (a === "--data") dataPath = args[++i];
  else if (a === "--stats") statsPath = args[++i];
  else {
    const m = /^--(records|isd|fam-total|fam-multi|year2026|country|adc|pic)=(.+)$/.exec(a);
    if (m) opt[m[1]] = m[2] === "-1" && m[1] === "year2026" ? -1 : +m[2];
    else { console.error("未知参数:", a, "\n" + usage()); process.exit(2); }
  }
}

const errors = [];
const warnings = [];
const infos = [];
function assert(cond, msg) { if (!cond) errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function info(msg) { infos.push(msg); }

function readJson(p) {
  const raw = readFileSync(p, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
}

dataPath = resolve(dataPath);
if (!existsSync(dataPath)) { console.error("找不到数据文件:", dataPath); process.exit(2); }
const patents = readJson(dataPath);
if (!Array.isArray(patents)) { console.error("patents.json 顶层不是数组"); process.exit(2); }
info(`已加载 ${patents.length} 条记录: ${dataPath}`);

/* ---------- 1. 记录总数 ---------- */
assert(patents.length === opt.records,
  `记录总数应=${opt.records}，实际=${patents.length}`);

/* ---------- 2. 必填字段存在性与类型 ---------- */
const REQUIRED_STR = ["PN", "TITLE", "APD", "PBD", "FAM", "PType", "Direction"];
const REQUIRED_ARR = ["ANCS", "IN", "IPCR", "LEGAL"];
for (const k of REQUIRED_STR) {
  const bad = patents.filter((r) => r[k] === undefined || r[k] === null || r[k] === "");
  assert(bad.length === 0, `${k} 缺值 ${bad.length} 条${bad.length ? `（例: ${bad[0].PN}）` : ""}`);
}
for (const k of REQUIRED_ARR) {
  const bad = patents.filter((r) => !Array.isArray(r[k]));
  assert(bad.length === 0, `${k} 应为数组，非数组 ${bad.length} 条`);
}
assert(patents.filter((r) => !r.PID).length === 0, "PID 存在缺值记录");

/* ---------- 3. 日期格式与 ISD 覆盖率 ---------- */
for (const k of ["APD", "PBD"]) {
  const bad = patents.filter((r) => r[k] && !DATE_RE.test(r[k]));
  assert(bad.length === 0, `${k} 日期格式异常 ${bad.length} 条${bad.length ? `（例: ${bad[0][k]} @ ${bad[0].PN}）` : ""}`);
}
const isdCount = patents.filter((r) => r.ISD).length;
assert(isdCount === opt.isd, `ISD 非空数应=${opt.isd}，实际=${isdCount}`);
const badIsd = patents.filter((r) => r.ISD && !DATE_RE.test(r.ISD));
assert(badIsd.length === 0, `ISD 日期格式异常 ${badIsd.length} 条`);
const isdEarly = patents.filter((r) => r.ISD && r.PBD && r.ISD < r.PBD);
assert(isdEarly.length === 0, `ISD 早于 PBD 的记录 ${isdEarly.length} 条`);

/* ---------- 4. FAM 族一致性 ---------- */
const byFam = new Map();
for (const r of patents) {
  if (!r.FAM) { assert(false, `记录 ${r.PN} 缺 FAM`); continue; }
  if (!byFam.has(r.FAM)) byFam.set(r.FAM, []);
  byFam.get(r.FAM).push(r);
}
assert(byFam.size === opt.famTotal, `族总数应=${opt.famTotal}，实际=${byFam.size}`);
const multi = [...byFam.values()].filter((a) => a.length > 1);
assert(multi.length === opt.famMulti, `>1 成员的族数应=${opt.famMulti}，实际=${multi.length}`);
const sizeDist = [...byFam.values()].reduce((m, a) => { m[a.length] = (m[a.length] || 0) + 1; return m; }, {});
assert(sizeDist[1] + (sizeDist[2] || 0) === byFam.size && (sizeDist[2] || 0) === multi.length,
  `族大小分布应为 {1:${byFam.size - opt.famMulti}, 2:${opt.famMulti}}，实际=${JSON.stringify(sizeDist)}`);
const sumMembers = [...byFam.values()].reduce((s, a) => s + a.length, 0);
assert(sumMembers === patents.length, `族成员合计应=${patents.length}，实际=${sumMembers}`);
const pnByFam = patents.filter((r) => !byFam.has(r.FAM));
assert(pnByFam.length === 0, "存在 FAM 不在 byFam 索引中的记录（索引自洽性破坏）");

/* ---------- 5. 主记录算法与 familyOf 一致性（v2 向前兼容） ---------- */
function mainOf(members) {
  return members.slice().sort((a, b) =>
    (b.PBD || "").localeCompare(a.PBD || "") ||
    ((PTYPE_ORDER[b.PType] ?? 9) - (PTYPE_ORDER[a.PType] ?? 9)) ||
    b.PN.localeCompare(a.PN))[0];
}
if (patents.some((r) => Object.prototype.hasOwnProperty.call(r, "familyOf"))) {
  for (const [fam, members] of byFam) {
    const selfs = members.filter((m) => m.familyOf === m.PN);
    assert(selfs.length === 1, `族 ${fam} familyOf 自指记录应恰 1 条，实际 ${selfs.length}`);
    const main = mainOf(members);
    assert(selfs[0] && selfs[0].PN === main.PN,
      `族 ${fam} familyOf 主记录(${selfs[0] && selfs[0].PN})与回退算法(${main.PN})不一致`);
    for (const m of members) {
      assert(m.familyOf === main.PN, `族 ${fam} 成员 ${m.PN} familyOf 应指向主记录 ${main.PN}，实际 ${m.familyOf}`);
    }
  }
} else {
  info("v1 数据：无 familyOf 字段，主记录由前端回退算法决定（规则：PBD 降序→PType B>A>U→PN 降序）");
}

/* ---------- 6. PN 重复与格式 ---------- */
const seen = new Set();
const dups = [];
for (const r of patents) {
  if (seen.has(r.PN)) dups.push(r.PN);
  seen.add(r.PN);
}
assert(dups.length === 0, `PN 重复 ${dups.length} 件${dups.length ? `: ${dups.slice(0, 10).join(", ")}` : ""}`);
const pnBad = patents.filter((r) => !PN_RE.test(r.PN));
if (pnBad.length) warn(`PN 格式非常规（${PN_RE}）${pnBad.length} 条: ${pnBad.map((r) => r.PN).join(", ")}`);

/* ---------- 7. schema v2 向前兼容（出现时才校验类型） ---------- */
const v2Checks = [
  ["COUNTRY", (r) => r.COUNTRY === null || typeof r.COUNTRY === "string", "应为字符串或 null"],
  ["PDF_IMAGE_COUNT", (r) => typeof r.PDF_IMAGE_COUNT === "number" || r.PDF_IMAGE_COUNT === null, "应为 number 或 null"],
  ["ADC", (r) => r.ADC === null || (Array.isArray(r.ADC) && r.ADC.every((x) => typeof x === "string")), "应为 string[] 或 null"],
  ["FAMILY_MEMBERS", (r) => Array.isArray(r.FAMILY_MEMBERS) && r.FAMILY_MEMBERS.every((x) => typeof x === "string"), "应为 string[]"],
  ["FAMILY_SIZE", (r) => typeof r.FAMILY_SIZE === "number" && r.FAMILY_SIZE >= 1, "应为 ≥1 的 number"],
  ["CLAIMS", (r) => typeof r.CLAIMS === "string", "应为 string"],
  ["PRD", (r) => !r.PRD || DATE_RE.test(r.PRD), "应为 YYYY-MM-DD 或空"],
  ["LEGAL_TL", (r) => !Array.isArray(r.LEGAL_TL) || r.LEGAL_TL.every((x) => x && typeof x.date === "string" && typeof x.status === "string"), "每项应含 date/status 字符串"],
];
for (const [k, chk, desc] of v2Checks) {
  if (!patents.some((r) => Object.prototype.hasOwnProperty.call(r, k))) {
    info(`v1 数据：无 ${k} 字段（回补后校验将自动启用）`);
    continue;
  }
  const bad = patents.filter((r) => Object.prototype.hasOwnProperty.call(r, k) && !chk(r));
  assert(bad.length === 0, `${k} 类型不合法（${desc}） ${bad.length} 条${bad.length ? `（例: ${bad[0].PN}）` : ""}`);
}
if (patents.some((r) => r.FAMILY_SIZE !== undefined)) {
  for (const [fam, members] of byFam) {
    for (const m of members) {
      if (m.FAMILY_SIZE !== undefined) {
        assert(m.FAMILY_SIZE === members.length, `记录 ${m.PN} FAMILY_SIZE=${m.FAMILY_SIZE} 应等于族成员数 ${members.length}`);
      }
    }
  }
}

/* ---------- 7b. H1 1a 回补字段覆盖率（COUNTRY/ADC/PDF_IMAGE_COUNT） ---------- */
const countryCount = patents.filter((r) => r.COUNTRY).length;
assert(countryCount === opt.country, `COUNTRY 非空应=${opt.country}，实际=${countryCount}`);
const adcCount = patents.filter((r) => Array.isArray(r.ADC) && r.ADC.length).length;
assert(adcCount === opt.adc, `ADC 非空应=${opt.adc}，实际=${adcCount}`);
const picCount = patents.filter((r) => typeof r.PDF_IMAGE_COUNT === "number").length;
assert(picCount === opt.pic, `PDF_IMAGE_COUNT 非空应=${opt.pic}，实际=${picCount}`);
if (adcCount) info(`ADC 直传（未二次拆分）抽样: ${JSON.stringify(patents.filter((r) => Array.isArray(r.ADC) && r.ADC.length)[0].ADC)}`);
if (picCount) info(`PDF_IMAGE_COUNT 样例: ${patents.find((r) => typeof r.PDF_IMAGE_COUNT === "number").PN}=${patents.find((r) => typeof r.PDF_IMAGE_COUNT === "number").PDF_IMAGE_COUNT}`);

/* ---------- 8. stats.json 自洽（回归锚点） ---------- */
const statsAbs = resolve(statsPath);
if (existsSync(statsAbs)) {
  const st = readJson(statsAbs);
  assert(st.total === opt.records, `stats.total 应=${opt.records}，实际=${st.total}`);
  const yrSum = (st.byYear || []).reduce((s, x) => s + (x.count || 0), 0);
  assert(yrSum === st.total, `stats.byYear 求和=${yrSum} ≠ total=${st.total}`);
  const lastY = st.byYear && st.byYear[st.byYear.length - 1];
  if (opt.year2026 >= 0) {
    assert(lastY && lastY.year === "2026" && lastY.count === opt.year2026,
      `stats.byYear 最新年应为 2026/${opt.year2026}，实际 ${lastY && lastY.year}/${lastY && lastY.count}`);
  }
  const topSum = (st.topApplicants || []).reduce((s, x) => s + (x.count || 0), 0);
  info(`stats.topApplicants 求和=${topSum}（TOP25 申请人件数，非全量）`);
} else {
  info(`stats.json 不存在（${statsAbs}），跳过 stats 校验`);
}

/* ---------- 9. 报告 ---------- */
if (multi.length) {
  info(`>1 成员的族 ${multi.length} 个（各 ${multi[0].length} 件），示例: ${multi.slice(0, 3).map((a) => `${a[0].FAM}(${a.map((m) => m.PN).join("/")})`).join(", ")}`);
}
const isdByType = patents.reduce((m, r) => { if (r.ISD) m[r.PType] = (m[r.PType] || 0) + 1; return m; }, {});
info(`ISD 覆盖按类型: ${JSON.stringify(isdByType)}（A 型 ISD 常为空属正常）`);

const sum = {
  ok: errors.length === 0 && warnings.length === 0,
  records: patents.length,
  isd: isdCount,
  families: byFam.size,
  famMulti: multi.length,
  country: countryCount,
  adc: adcCount,
  pic: picCount,
  errors: errors.length,
  warnings: warnings.length,
  infos: infos.length,
};

if (jsonOut) {
  console.log(JSON.stringify({ ...sum, errors, warnings, infos }, null, 2));
} else {
  console.log(`\n========== 校验结果 ==========`);
  console.log(`记录数        : ${patents.length}   (期望 ${opt.records})`);
  console.log(`ISD 非空      : ${isdCount}   (期望 ${opt.isd})`);
  console.log(`族总数        : ${byFam.size}   (期望 ${opt.famTotal})`);
  console.log(`>1成员族      : ${multi.length}   (期望 ${opt.famMulti})`);
  console.log(`COUNTRY 非空  : ${countryCount}   (期望 ${opt.country})`);
  console.log(`ADC 非空      : ${adcCount}   (期望 ${opt.adc})`);
  console.log(`附图数非空    : ${picCount}   (期望 ${opt.pic})`);
  console.log(`PN 重复       : ${dups.length}`);
  console.log(`---`);
  for (const i of infos) console.log(`INFO  ${i}`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`FAIL  ${e}`);
  console.log(`---`);
  console.log(errors.length ? `✗ 未通过：${errors.length} 个不变量违反` : "✓ 全部通过");
}

process.exit(errors.length ? 1 : 0);
