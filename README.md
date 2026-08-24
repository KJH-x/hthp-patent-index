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
│   ├── patents.json    # 127 件专利结构化元数据
│   └── stats.json      # 统计汇总（年份/方向/申请人）
└── README.md
```

> `pdf/` 目录**不提交到本仓库**（内网专用，见下）。

## 数据来源与更新

- 数据采集自智慧芽专利平台（2026-08），共 127 件结构化记录。
- 源数据与维护规范位于：
  `C:\_CustomPrograms\AnAgent\workspace\hthp-patent-investigation-20260820\`
- 更新站点数据：
  ```powershell
  # 在源工作区运行
  .\data\export_site_data.ps1   # 重新生成 patents.json / stats.json
  Copy-Item site\index.html, site\style.css, site\app.js, site\data\*  .\   # 同步到本仓库
  ```

## 内网 PDF 下载（不发布公网）

- 公网站点仅含元数据；点击"内网下载"会跳转到内网 PDF 服务。
- PDF 基址在 `app.js` 顶部 `PDF_BASE` 常量配置，当前默认 `http://127.0.0.1:8811/pdf/`。
- 内网服务（在源工作区）：
  ```powershell
  python -m http.server 8811 --bind 0.0.0.0 --directory site
  ```
  其中 `site/pdf/` 存放全部 127 件官方 PDF（不在本仓库）。
- 待用户提供内网域名/密钥后，将 `PDF_BASE` 替换为正式内网域名即可，无需改其他代码。
