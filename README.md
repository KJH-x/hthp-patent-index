# hthp-patent

高温热泵专利技术情报库 — 静态查阅站点。

## 项目简介

围绕"高温热泵及其相关循环、工质、部件、控制与行业应用"的专利情报调查成果，提供可检索/筛选/统计的专利元数据浏览。**官方 PDF 原文仅限内网下载，不发布到公网。**

## 技术栈

纯静态：HTML + CSS + JavaScript（无构建、零依赖），数据为 JSON。部署于 GitHub Pages / Cloudflare Pages。

## 目录结构

```text
hthp-patent/
├── index.html          # 站点入口
├── style.css
├── app.js              # 检索/筛选/排序/详情/统计（含 PDF_BASE 内网下载配置）
├── data/
│   ├── patents.json    # 3280 件专利结构化元数据（含 v2 回补字段 COUNTRY/ADC/PDF_IMAGE_COUNT）
│   └── stats.json      # 统计汇总（年份/方向/申请人）
├── scripts/
│   ├── assert-data.mjs         # 数据不变量校验（发布门槛，零依赖 Node）
│   ├── probe-detail-fields.mjs # H1 1b 字段探测（需登录，见其头部注释）
│   └── RE-SCRAPE-DESIGN.md     # H1 1b 回补设计（CLAIMS/PRD/引证/优先权/过期日）
└── README.md
```

> `pdf/` 目录**不提交到本仓库**（内网专用，见下）。

## 数据来源与更新

- 数据采集自智慧芽专利平台（2026-08 ~ 2026-09），共 **3280** 件结构化记录。
- 源数据与维护规范位于：
  `C:\_CustomPrograms\AnAgent\workspace\hthp-patent-investigation-20260820\`
- 更新站点数据（**只同步 data，勿覆盖本仓库前端**——仓库 app.js/index.html 领先于源工作区 site/）：
  ```powershell
  # 在源工作区运行
  .\data\export_site_data.ps1   # 重新生成 patents.json / stats.json（已含 COUNTRY/ADC/PDF_IMAGE_COUNT 映射）
  Copy-Item site\data\patents.json, site\data\stats.json  .\data\   # 只同步数据文件到本仓库
  ```
- 数据校验（发布门槛，锚点随数据量更新）：
  ```powershell
  node scripts/assert-data.mjs --records=3280 --isd=2257 --fam-total=3165 --fam-multi=112 --country=3280 --adc=3171 --pic=3249
  # 退出码 0=通过
  ```

> **注意（H1 1a）**：源工作区 `export_site_data.ps1` 已含 `COUNTRY` / `ADC`（直传数组勿再拆分）/ `PDF_IMAGE_COUNT`（缺键兜底 `null`）三字段映射，重导不会丢弃。映射代码见 `scripts/RE-SCRAPE-DESIGN.md` §2。

## 内网 PDF 下载（不发布公网）

- 公网站点仅含元数据；点击"内网下载"会跳转到内网 PDF 服务。
- PDF 基址在 `app.js` 顶部 `PDF_BASE` 常量配置，当前为 `https://files.nslc.top/pdfs/`，下载 URL 形如 `{PDF_BASE}<PN>.pdf`。
- 切换/更新内网域名只需修改 `app.js` 顶部 `PDF_BASE` 一处（基址须以 `/` 结尾）。
- 官方 PDF 存放于内网 HFS 服务，**不提交到本仓库**（`pdf/` 目录已 gitignore）。
