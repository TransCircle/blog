# TransCircle 开发博客

> TransCircle 团队的开发进度记录与项目报告博客。
> 
> 在线地址：[blog.transcircle.org](https://blog.transcircle.org)

---

## 目录

- [快速开始](#快速开始)
- [发布文章](#发布文章)
- [修改文章](#修改文章)
- [文章格式说明](#文章格式说明)
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
author: '作者名称'
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
| `author` | 可选 | 作者名称（默认：TransCircle Team） | `'张三'` |
| `category` | 可选 | 分类（默认：general） | `'开发进度'` 或 `'团队报告'` |
| `tags` | 可选 | 标签数组 | `['前端', 'astro']` |
| `cover` | 可选 | 封面图路径 | `'/images/cover.png'` |
| `draft` | 可选 | 草稿标记（默认：false） | `true` 或 `false` |
| `contentLicense` | 可选 | 内容协议（默认：CC-BY-SA-4.0） | `'CC-BY-SA-4.0'` |
| `codeLicense` | 可选 | 代码协议（默认：AGPL-3.0） | `'AGPL-3.0'` |

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
│   └── styles/            # 样式文件
├── public/                # 静态资源（图片等）
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

本项目遵循 TransCircle 设计系统：

- 支持三种主题：浅色 / 深色 / 高对比度
- 所有交互支持键盘导航和屏幕阅读器
- 响应式设计，适配手机和桌面端

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
