# H1 数据回补设计（1a 免重采已落地 / 1b 待重采字段）

> 仓库：`C:\_CustomPrograms\Pages\hthp-patent`（静态站点，实施侧）
> 源工作区：`C:\_CustomPrograms\AnAgent\workspace\hthp-patent-investigation-20260820\`（采集/导出侧）
> 依据：`feature-audit-20260829/hthp/BLUEPRINTS.md` 蓝图 #1。
> 本文件只设计、不执行重采；**重采必须人工登录智慧芽**（见 §6）。

---

## 1. 状态总览（2026-08-29 实测）

| 字段 | 源记录 | 站点现状 | 结论 |
|---|---|---|---|
| `COUNTRY` | 641 非空 | **已回补 641 非空** | ✅ 1a 已落地 |
| `ADC` | present 610 / 非空 542 | **已回补 641 present / 542 非空**（缺键兜底 `null`） | ✅ 1a 已落地 |
| `PDF_IMAGE_COUNT` | present 610 / 非空 610 | **已回补 641 present / 610 非空**（缺键兜底 `null`） | ✅ 1a 已落地 |
| `ISD`（授权公告日） | 294 | 294（前端已渲染"授权公告日"） | ✅ 前端已显示 |
| `CLAIMS` | 非空 1（`CLAIMS_TEXT`） | 1 | ❌ 待重采 |
| `PRD`（优先权日） | 非空 0 | 0 | ❌ 待重采 |
| `CITES[]` / `CITED_BY[]` | — | 0 | ❌ 待重采 |
| `LEGAL_TL[]`（法律时间线） | — | 0 | ❌ 待重采（**H5 明确不做前端时间线**，数据可采但前端不渲染） |
| `EXPIRY`（预估过期日） | — | 0 | ❌ 待重采（或前端按 `APD+法定年限` 估算） |
| `FAMILY_MEMBERS[]` / `FAMILY_SIZE` | `FAM` 641 | 0 | ⚠️ 样本内可前端按 `FAM` 聚族（已实现 H2）；真实全球族成员需重采 |

## 2. H1 1a 免重采回补（已落地，此处只留"再导出防丢"清单）

站点 `data/patents.json` 已回补三字段。**再导出时源工作区 `export_site_data.ps1` 必须补映射**，否则重导即丢：

```powershell
# 追加到 [PSCustomObject]@{ ... } 字段白名单
COUNTRY   = [string]$r.COUNTRY                        # 直传字符串，空给 ''
ADC       = $(if ($r.ADC) { @($r.ADC | ForEach-Object { [string]$_ }) } else { $null })  # 直传数组，勿 Split-Field（避免把"集中供热，蓄热"拆两段）
PDF_IMAGE_COUNT = $(if ($null -eq $r.PDF_IMAGE_COUNT) { $null } else { [int]$r.PDF_IMAGE_COUNT })  # 数字或 null
```

- 缺键兜底：`ADC`/`PDF_IMAGE_COUNT` 缺失一律写 `null`（前端 `adcBlock`/`picLine` 已做 `Array.isArray`/`typeof number` 判空，`null` 安全）。
- 验证：`node scripts/assert-data.mjs`（COUNTRY=641 / ADC=542 / PIC=610 锚点）。

## 3. schema v2 追加字段（全部可选，向后兼容）

```jsonc
{
  "CLAIMS": "1. …；2. …",            // string，可空（重点权利要求或全文）
  "PRD": "2024-06-28",               // string YYYY-MM-DD，可空
  "CITES": ["CN102230687A"],         // string[] 前引
  "CITED_BY": ["CN122328909A"],      // string[] 后引
  "LEGAL_TL": [ { "date": "2026-01-15", "status": "授权", "basis": "code=3" } ],  // 法律事件时间线（升序）
  "EXPIRY": "2035-06-28",            // string，可空（重采或 APD+年限估算，估算标记 EXPIRY_SRC:"estimate"）
  "FAMILY_SIZE": 2,                  // number ≥1（样本内族大小）
  "FAMILY_MEMBERS": ["CN119123396A"] // string[] 样本内同族 PN（含自身）
}
```

前端对缺失字段一律降级（`r.CLAIMS ? … : ""`、`Array.isArray(r.LEGAL_TL) && r.LEGAL_TL.length`），v1 数据无异常。

## 4. 重采设计（H1 1b，未执行）

### 4.1 字段探测（第一步，必须先做）

智慧芽详情页 Vue 键名无法静态预知（`process_patent.ps1` 现只取到 `CLAIMS_TEXT` 且 641 条仅 1 条有值）。实施第一步是运行：

```powershell
node scripts/probe-detail-fields.mjs 3        # 抽样 3 条（默认端口 8932）
```

脚本会：
1. 从 `data/patents.json` 抽样（B 型授权优先）；
2. 打开 `analytics.zhihuiya.com/patent-view?patentId=PID&sort=pdesc&rows=20`；
3. dump `ViewRoot.patent` 全部键 + 候选字段命中；
4. 依次切到「权利要求 / 法律信息 / 同族专利 / 引用信息」标签页，提取 `Clms` / `LegalStatus` / `PatentFamily` / `CitationCite` / `CitationCited` 组件数据；
5. 写 `scripts/probe-report-YYYY-MM-DD.json`。

**拿到真实键名后**再据实更新 `process_patent.ps1` / `extract_patent.ps1` 的提取字段（见 §5）。

### 4.2 采集脚本扩展点（源工作区）

| 文件 | 改动 |
|---|---|
| `data\process_patent.ps1`（eval 提取，约 :50-64） | 追加详情字段抓取：权利要求全文（组件 `Clms` 的 `claim.CLMS.CN`）、前引/后引（引用标签页表格）、法律事件时间线（组件 `LegalStatus`）、预估过期日、同族成员。**保留既有字段输出**，新字段取不到给空值，绝不中断采集 |
| `data\extract_patent.ps1`（提取函数 `rec`，约 :36-59） | 与 process_patent 同步追加同一组可选字段（仅提取不下载 PDF） |
| `data\export_site_data.ps1`（白名单，:56-71） | §2 的三字段映射 + 新字段映射（缺省空串/空数组） |

### 4.3 批量回补脚本（新建 `backfill_detail.ps1`）

- 遍历 `data\patent_records\*.json`，对缺失新字段的记录调用浏览器代理（8932）重取详情字段，**覆盖写入本记录 JSON（只增不改既有字段）**。
- 参数：`-OnlyMissing`、`-PN <白名单>`、断点续跑（重跑跳过已补齐项）。
- 失败不中断：单件 try/catch，记录 `PN+原因` 到 `backfill_log.tsv`，跑完汇总。
- 未登录即中止并 Bark 通知，不要带病跑 641 条。

### 4.4 优先范围与工作量

- 优先重点记录（`MASTER_LIST.md` 清单 / 初版 127 件），后全量 641（B 授权优先）。
- 若无法干净界定 127，直接全量顺序回补，省一次区分。

## 5. 前端配套（重采后自动生效，无需再改代码）

- `showDetail` 的 `claimsBlock`（`r.CLAIMS` 非空渲染"权利要求"）已就位；
- `meta` 行 `r.PRD ? 优先权日 : ""` 已就位；
- 引证/时间线/族成员区块未实现（按 H5 不做时间线；引证 `citesHtml` 需新增，当前**未实现**——若未来重采到 CITES/CITED_BY，需补 `citesHtml(r)` + `.cites` 样式，属后续小改）。

## 6. 边界与铁律

- **登录态**：智慧芽登录有效期短（`MAINTENANCE.md:50-52`）。重采前确认 URL 域为 `analytics.zhihuiya.com`；失效则请用户重新登录并 `saveCookies`。
- **COUNTRY=WO**：本库 1 条 `WO2026170797A1`，正常显示。
- **EXPIRY 缺失降级**：`APD+年限` 估算（发明 20 / 实用新型 10，PType 区分），标记 `EXPIRY_SRC:"estimate"`，仅排序参考。
- **LEGAL_TL 映射漂移**：status 存中文（复用源 `legal_status_map.json` label），避免与前端码表各自维护漂移。
- **零回归硬门槛**：回补只增不改；`scripts/assert-data.mjs` 对同 PN 旧 22 字段 diff 为空。
- **H5 范围**：法律时间线**不渲染**（用户明确），仅数据可采；不做法律状态筛选维度。

## 7. 回滚 / 迁移

- 数据先行（先重导 `patents.json` 发布 v2），前端随后；两阶段均向后兼容，可交错上线。
- 回滚：git 恢复 `data/patents.json` / `app.js` / `style.css`（新增字段删除即回 v1，新旧前端均可读）。
- 源工作区脚本改动不破坏既有 `patent_records/*.json`（只增字段），回退脚本文件即可。
