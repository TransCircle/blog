# 跨环博客 TransCircle Blog

> 跨环（TransCircle Project）官方博客：记录项目进展、社群知识与跨性别议题。
> 
> 在线地址：[blog.transcircle.org](https://blog.transcircle.org)

---

## 目录

- [快速开始](#快速开始)
- [发布文章](#发布文章)
- [修改文章](#修改文章)
- [文章格式说明](#文章格式说明)
- [社交分享图（OG 卡片）](#社交分享图og-卡片)
- [品牌图标](#品牌图标)
- [本地预览](#本地预览)
- [发布流程](#发布流程)
- [项目结构](#项目结构)

---

## 快速开始

博客文章存放在 `src/content/posts/` 目录下，以 Markdown 文件形式管理。

### 你需要知道的

- **文章文件**：`src/content/posts/文章标题.md`
- **图片资源**：`public/images/`
- **无需编写代码**：只需要编辑 Markdown 文件

---

## 发布文章

### 方式一：直接编辑（推荐）

1. 进入 `src/content/posts/` 目录
2. 新建一个 `.md` 文件，文件名建议使用英文（如 `weekly-report-01.md`）
3. 在文件开头填写文章信息（Frontmatter）：

```markdown
---
title: '文章标题'
description: '文章简介，会显示在列表中'
pubDate: 2026-05-21
author: '作者名称'                # 想让署名可点，写成 { name: '...', link: 'https://...' }
category: '开发进度'
tags: ['标签1', '标签2']
---

## 正文标题

正文内容支持 Markdown 格式：

- **粗体文字**
- *斜体文字*
- [链接文字](https://example.com)
- `行内代码`

### 代码块

```typescript
const example = "代码会自动高亮";
```

### 图片

![图片描述](/images/example.png)
```

4. 保存文件，提交到 Git 仓库即可

### 方式二：复制模板

1. 复制 `src/content/posts/project-kickoff.md`
2. 修改文件名和内容
3. 保存并提交

---

## 修改文章

1. 找到 `src/content/posts/` 下对应的文章文件
2. 修改内容
3. 如需更新发布时间，修改 `pubDate` 字段，或添加 `updatedDate` 字段：

```markdown
---
title: '原标题'
pubDate: 2026-05-20
updatedDate: 2026-05-21  # 添加这行表示更新时间
---
```

---

## 文章格式说明

### Frontmatter 字段（文件开头的元数据）

| 字段 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `title` | ✅ | 文章标题 | `'项目启动报告'` |
| `description` | 可选 | 文章简介，显示在列表中 | `'本周完成的工作内容'` |
| `pubDate` | ✅ | 发布日期 | `2026-05-21` |
| `updatedDate` | 可选 | 更新日期 | `2026-05-22` |
| `author` | 可选 | 作者署名（默认：TransCircle 项目组），写法见下节 | `'张三'` |
| `editor` | 可选 | 编辑署名，**不写就不显示**，写法见下节 | `'李四'` |
| `category` | 可选 | 分类（默认：general） | `'开发进度'` 或 `'团队报告'` |
| `tags` | 可选 | 标签数组 | `['前端', 'astro']` |
| `cover` | 可选 | 封面图路径 | `'/images/cover.png'` |
| `draft` | 可选 | 草稿标记（默认：false） | `true` 或 `false` |
| `contentLicense` | 可选 | 内容协议（默认：CC-BY-SA-4.0） | `'CC-BY-SA-4.0'` |
| `codeLicense` | 可选 | 代码协议（默认：AGPL-3.0） | `'AGPL-3.0'` |

### 作者与编辑署名（`author` / `editor`）

两个字段的写法完全一样，支持三种形式，可以混着用：

```markdown
---
# 1. 只写名字：不带链接，署名显示为纯文本，点不了
author: 'TransCircle 文案组'

# 2. 名字 + 链接：署名可点，在新标签页打开
author: { name: '翅膀', link: 'https://x.com/axzameyzed' }

# 3. 多个人：写成列表，带不带链接可以混排
author:
  - { name: '羽莉', link: 'https://x.com/liwanmiaohy' }
  - { name: 'Oakley Huang', link: 'https://x.com/YangyanH5' }
  - 'TransCircle 文案组'          # 这一位没有链接，就是纯文本
---
```

几条规则：

- **不写 `link` 就是没有链接**，署名保持纯文本、不做跳转，也不会被"顺手"指向主站。
- **不写 `editor` 就是没有编辑**，文章页、分享图、结构化数据里都不会出现「编辑」这一行；
  不会自动署上团队名。
- `author` 不写时才回退到 `TransCircle 项目组`。
- `link` 只接受 `http(s)` 链接，其它协议（如 `javascript:`）会在构建时直接报错。
- 多人署名用顿号（、）连接；点击带链接的署名会先弹出外链确认框。

### 常用分类

- `开发进度` - 开发进展报告
- `团队报告` - 团队周报/月报
- `技术分享` - 技术文章
- `general` - 其他

### 许可协议

每篇文章底部会显示两个协议徽章：

**内容协议（contentLicense）**：
- `CC-BY-SA-4.0`（默认）- 知识共享 署名-相同方式共享 4.0
- `CC-BY-4.0` - 知识共享 署名 4.0
- `CC0-1.0` - 公共领域
- `Proprietary` - 保留所有权利

**代码协议（codeLicense）**：
- `AGPL-3.0`（默认）- GNU Affero General Public License v3.0
- `MIT` - MIT License
- `Apache-2.0` - Apache License 2.0
- `BSD-3-Clause` - BSD 3-Clause License
- `Proprietary` - 保留所有权利

不指定时使用默认值。示例：

```markdown
---
title: '文章标题'
contentLicense: 'CC-BY-4.0'
codeLicense: 'MIT'
---
```

### Markdown 基础语法

```markdown
# 一级标题
## 二级标题
### 三级标题

**粗体文字**
*斜体文字*
~~删除线~~

- 无序列表项
- 无序列表项

1. 有序列表项
2. 有序列表项

[链接文字](https://example.com)
![图片描述](/images/pic.png)

> 引用文字

| 表格 | 表头 |
|------|------|
| 内容 | 内容 |
```

### 提示 / 警告框（Callout）

需要让某段内容「跳出来」——比如用药风险、医疗免责声明、操作提醒——就用**提示框**。写法沿用 GitHub 的告示语法：在引用块（`>`）的第一行写 `[!类型]`，正文照常写在后面的行里。

```markdown
> [!WARNING]
> 请**定期进行血检**以确定药物的实际作用；若出现身体不适或血检结果异常，请及时停药并就医。
```

上面会渲染成一个带图标与「警告」标题的琥珀色框。一共有五种类型：

| 标记 | 默认标题 | 颜色 | 适用场景 |
|------|---------|------|---------|
| `[!NOTE]` | 备注 | 蓝 | 中性的补充信息 |
| `[!TIP]` | 提示 | 绿 | 操作建议、小窍门 |
| `[!IMPORTANT]` | 重要 | 粉 | 必须知道、但不涉及危险的关键点 |
| `[!WARNING]` | 警告 | 琥珀 | 需要留意、可能有风险 |
| `[!CAUTION]` | 危险 | 红 | 严重后果或强烈禁止 |

**自定义标题**：类型标记后面、同一行内还能写自己的标题，覆盖默认字样：

```markdown
> [!NOTE] 医疗免责声明
> 本文仅供信息参考，不构成任何医疗建议。
```

几条要点：

- 正文可以有**多段**，也能包含加粗、列表、链接、脚注等任意 Markdown。
- 类型不区分大小写，`[!warning]` 与 `[!WARNING]` 等价。
- 只有**第一行是 `[!类型]`** 的引用块才会变成提示框；普通引用块（如放名言、放整段说明的 `> …`）保持原样，不受影响。

---

## 社交分享图（OG 卡片）

每篇文章在**构建时自动生成**一张 1200×630 的社交分享图（OG Image），无需手动制作。
分享到微信 / X / Telegram / Slack 等平台时，预览图会呈现一张仿 GitHub 仓库卡片风格、
符合站点粉色设计系统的卡片，包含：

- 文章标题与简介
- 发布日期、更新日期（若有）、作者、预计阅读时长
- 标签与分类徽标

卡片由 `src/lib/og/render.ts`（satori 排版 → resvg 栅格化）绘制，端点为
`src/pages/og/[...slug].png.ts`，产物路径为 `/og/<slug>.png`，已自动写入文章页的
`og:image` / `twitter:image`。frontmatter 里的 `cover` 仅作页内题图，不再用作分享图。

首页、标签页等非文章页面共用一张站点默认封面 `/og-cover.png`，由
`src/pages/og-cover.png.ts` 在构建时生成（与文章卡同一套画布与品牌横幅），
无需手工维护图片文件。

### 字体（少数情况下需要重新生成）

卡片中文使用裁剪过的 Noto Sans SC 子集（仅含文章中出现过的字形，约 90 KB/字重，
位于 `src/assets/og/fonts/`）。**仅当**新文章的标题 / 简介 / 标签 / 作者里用到了
此前从未出现过的生僻字、且卡片上显示为「□」时，才需要重新生成：

```bash
pnpm run og:fonts   # 重新裁剪字体子集，随后提交更新后的 .woff 文件
```

绝大多数常用汉字已被现有文章覆盖，通常无需关心这一步。

---

## 文章 PDF 导出

每篇文章文末都有一个「**下载 PDF**」链接，读者点一下即可下载一份**文字型 PDF**
（可选中、可搜索、链接可点、矢量高清、白底、每页顶部带站点标识），适合离线阅读与打印。

这些 PDF 在**构建时自动生成**，无需手动制作：

1. `astro build` 先产出每篇文章的「打印视图」`dist/print/<slug>/index.html`
   （由 `src/pages/print/[...slug].astro` 渲染——一份只含 logo、文章头、正文、脚注、协议的
   干净文档，去掉了导航 / 页脚 / 主题切换等站点 UI）。这些 HTML 只是 PDF 的**渲染源**。
2. `scripts/generate-pdfs.mjs` 再用无头 Chrome 打开这些页面，以浏览器打印引擎输出
   `dist/print/<slug>.pdf`（`/print/<slug>.pdf`），**并随即删除对应的 HTML 目录**——
   最终 `dist/print/` 下只保留干净的 `.pdf`，不把中间产物部署上线。

二者已合并进 `pnpm run build`（即 `astro build && node scripts/generate-pdfs.mjs`），
因此 Cloudflare Pages 现有的构建流程会**自动**产出 PDF，无需改动。

> 本地开发：`pnpm run dev` **不**生成 PDF（那是构建产物）。因此文末「下载 PDF」在 dev 下
> 改为指向可实时渲染的打印视图页（用于预览排版）；`pnpm run build` / 线上部署时才是真正的
> `.pdf` 下载。要在本地看成品 PDF，用 `pnpm run build` 后打开 `dist/print/*.pdf`。

几个要点：

- **中文字体**：CF 构建环境没有中文系统字体，脚本会从**已渲染的 HTML** 收集全部用到的
  字形（连 callout 标签、脚注「注释」等由插件生成、Markdown 源里没有的文字也一并覆盖），
  据此把 Noto Sans SC 子集化后内嵌进 PDF——既不缺字、体积又小，且**未来新增的组件文字会自动纳入**。
- **正文样式复用** `.article-content`，所以任何未来新增、影响正文的全局样式都会自动出现在 PDF 里。
- **每页顶部 logo** 由打印引擎的每页页眉渲染（读取 `src/assets/brand/transcircle-horizontal.svg`）。
- **失败不阻断部署**：在 Cloudflare 构建中若无头浏览器不可用，脚本会跳过并以 0 退出
  （沿用 `indexnow` 的约定），部署照常，只是这次没有更新 PDF。

### 相关命令

```bash
pnpm run build       # 构建站点并生成全部文章 PDF（CF 用这个）
pnpm run build:site  # 只构建站点、不生成 PDF（本地快速预览产物时用）
pnpm run pdf         # 站点已构建（dist/ 存在）时，单独重跑 PDF 生成
```

> 依赖说明：PDF 生成依赖 `puppeteer`。`package.json` 里的
> `pnpm.onlyBuiltDependencies` 已放行它的安装脚本，`pnpm install` 会自动下载配套的
> Chromium（约 150 MB，含在 pnpm 缓存中）。首次生成若本地无字体源，会从
> notofonts/noto-cjk 下载完整 Noto Sans SC 到 `.cache/`（与 `og:fonts` 共用缓存）。

---

## 品牌图标

站点图标只有一个源文件，全部产物都由它生成：

| 文件 | 用途 |
| --- | --- |
| `src/assets/brand/transcircle-mark.svg` | 纯图标（环形标），**图标唯一源文件** |
| `src/assets/brand/transcircle-horizontal.svg` | 横幅 Logo（图标 + 字标），用于 OG 卡片页眉与封面 |

更换品牌标志时，替换上面两个 SVG，然后运行：

```bash
pnpm run icons   # 重新生成 public/ 下的全部图标，随后一并提交
```

脚本 `scripts/generate-icons.mjs` 会写出：`logo-mark.svg`（矢量图标，供页头 / 页脚与
现代浏览器的 `rel="icon"` 使用）、`favicon.ico`（16/32/48）、`favicon.png`、
`icon-192.png`、`icon-512.png`、`icon-maskable.png`（Android 需要的安全区留白 + 白底）、
`apple-touch-icon.png`（iOS 不支持透明，故补白底）。

OG 卡片的品牌横幅直接读取 `transcircle-horizontal.svg`，因此改完图标重新构建即可，
不需要额外操作。

---

## 本地预览

### 前置要求

- Node.js >= 24
- pnpm（包管理器）

### 安装依赖（首次）

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm run dev
```

访问 http://localhost:4321 预览

### 构建（生成静态文件）

```bash
pnpm run build
```

构建结果输出到 `dist/` 目录

---

## 发布流程

博客已连接 Cloudflare Pages，推送代码后自动部署。

### 发布步骤

1. **编辑/添加文章**
   ```bash
   # 修改或添加 src/content/posts/ 下的文件
   ```

2. **本地预览（可选）**
   ```bash
   pnpm run dev
   ```

3. **提交更改**
   ```bash
   git add src/content/posts/新文章.md
   git commit -m ":memo: docs(posts): add weekly development report"
   git push
   ```

4. **自动部署**
   - 代码推送到 main 分支后
   - Cloudflare Pages 会自动构建并部署
   - 约 1-2 分钟后可在 blog.transcircle.org 看到更新

### 提交规范

使用以下格式提交：

```
:memo: docs(posts): 添加文章标题或简要描述
```

常用前缀：
- `:memo:` - 添加/修改文章
- `:bug:` - 修正文章错误
- `:fire:` - 删除文章

---

## 项目结构

```
blog/
├── src/
│   ├── content/posts/     # 文章目录（你主要操作这里）
│   ├── components/        # UI 组件
│   ├── layouts/           # 页面布局
│   ├── pages/             # 页面路由
│   ├── assets/
│   │   ├── brand/         # 品牌 SVG（图标 / 横幅 Logo 的源文件）
│   │   └── og/fonts/      # OG 卡片用的 Noto Sans SC 子集字体
│   ├── lib/og/            # OG 卡片绘制
│   ├── lib/markdown/      # Markdown 扩展（提示 / 警告框等 rehype 插件）
│   └── styles/            # 样式文件
├── scripts/               # 构建期工具（图标生成、字体子集、IndexNow）
├── public/                # 静态资源（图片、图标等，图标由脚本生成）
├── dist/                  # 构建输出（自动生成）
└── ...配置文件
```

---

## 常见问题

### Q: 添加图片放在哪里？
A: 图片放在 `public/images/` 目录下，文章中引用路径为 `/images/图片名.png`

### Q: 文章什么时候显示？
A: `pubDate` 为过去的日期会立即显示；未来日期的文章会等到日期到达后自动显示

### Q: 想暂存不发布的文章？
A: 在 Frontmatter 中设置 `draft: true`，该文章不会出现在网站上

### Q: 如何删除文章？
A: 直接删除 `src/content/posts/` 下的对应文件并提交即可

### Q: 标签和分类有什么区别？
A: 分类是文章的大类（如"开发进度"），标签是更细粒度的关键词（如"astro", "前端"）。一篇文章只有一个分类，可以有多个标签

---

## 设计规范

本项目遵循 TransCircle 全局设计系统（`../docs/DESIGN.md`），落地方式与博客特有的偏离记录在
[`DESIGN.md`](DESIGN.md)：

- 两套主题：浅色 / 深色（高对比度模式已按全局规范移除，对比度由令牌自身色值保证）
- 所有颜色 / 圆角 / 字号 / 动效走 CSS 变量，组件里不写死数值
- 外壳宽 1280px、正文宽 960px；所有交互支持键盘导航与屏幕阅读器

---

## 技术栈

- [Astro](https://astro.build/) - 静态站点生成器
- TypeScript - 类型安全
- Markdown - 文章格式
- Shiki - 代码语法高亮
- Fuse.js - 搜索功能

---

## SEO / GEO 与搜索引擎收录

本站针对传统搜索引擎（SEO）与生成式引擎 / AI 检索（GEO）做了系统优化。**以下产物在每次 `pnpm run build` 时自动生成，无需手动维护，永不过期：**

| 产物 | 路径 | 说明 |
|------|------|------|
| 站点地图 | `/sitemap-index.xml` | 含每篇文章真实的 `lastmod`、`changefreq`、`priority`；自动排除搜索页 |
| 结构化数据 | 各页 `<head>` 内 JSON-LD | Organization / WebSite（含站内搜索框）/ Blog / BlogPosting / FAQPage / BreadcrumbList / CollectionPage |
| AI 索引 | `/llms.txt` | 遵循 llmstxt.org 约定：实体消歧 + 自动文章清单 |
| AI 全文快照 | `/llms-full.txt` | 内联**全部文章正文**，供 LLM / RAG 一次性摄取 |
| 文章 Markdown 原文 | `/posts/<slug>.md` | 每篇文章的纯 Markdown 版本，便于 AI 抓取 |
| 搜索索引 | `/search-index.json` | 客户端全文搜索数据 |
| RSS | `/rss.xml` | 文章订阅源 |
| 爬虫规则 | `/robots.txt`、`/ai.txt` | 显式欢迎主流搜索引擎与 AI 爬虫 |

> 注意：`llms.txt` / `llms-full.txt` / `search-index.json` 现由 `src/pages/*.ts` 端点在构建时生成，**不再提交到 `public/`**，因此不会随内容更新而出现陈旧副本。

### 让引擎「最快收录」要做的事

这些步骤需要账号或在部署后执行，无法纯靠代码完成：

1. **Google Search Console**（<https://search.google.com/search-console>）：添加资源 `blog.transcircle.org` → 提交站点地图 `sitemap-index.xml`。如需站点验证，可在文章 frontmatter 之外，于 `Layout.astro` 的 `<head>` 加一行 `<meta name="google-site-verification" content="...">`。
2. **Bing Webmaster Tools**（<https://www.bing.com/webmasters>）：添加站点并提交 sitemap（可直接从 GSC 导入）。Bing 验证后即自动支持 IndexNow。
3. **IndexNow 主动推送**（让 Bing / Yandex / Seznam 等即时收录）。IndexNow 只是「通知 URL 变更」的一次 HTTP 请求，提交的是绝对 URL，**在哪里运行都可以，不需要跑在生产服务器上**。本项目部署在 Cloudflare Pages，按偏好三选一：

   - **方式 A · Cloudflare Crawler Hints（推荐，零维护）**：登录 Cloudflare → 选择 `transcircle.org` 域名 → **Caching / 缓存 → Configuration → Crawler Hints** 开启即可。之后 Cloudflare 会在内容变化时自动通过 IndexNow 推送，**无需本脚本**。要求该域名通过 Cloudflare 代理（Pages 自定义域名默认满足）。
   - **方式 B · 嵌入 Pages 构建命令（全自动、可控）**：在 Cloudflare Pages 项目设置里，把「构建命令」改为：
     ```
     pnpm run build && pnpm run indexnow
     ```
     脚本已做适配：**仅在生产分支（默认 `main`）提交**，且在 Cloudflare 构建环境中即使提交失败也**不会让部署失败**。生产分支名不同可设环境变量 `INDEXNOW_PRODUCTION_BRANCH`。
   - **方式 C · 本地手动（最简单）**：每次发文部署后，在本地跑一次：
     ```bash
     pnpm run build && pnpm run indexnow
     ```
     因为提交的是线上绝对 URL，本地运行同样生效。

   > 密钥文件 `public/b1ba2832c93fda19d24eb2a7b7e91ca3.txt` 部署后可通过 `https://blog.transcircle.org/b1ba2832c93fda19d24eb2a7b7e91ca3.txt` 访问，用于所有权校验，**请勿删除或改名**。
4. **首次或大更新后**：在 GSC 用「网址检查 → 请求编入索引」对首页与新文章手动催收，通常最快。

---

## 许可证

项目代码：AGPL-3.0
