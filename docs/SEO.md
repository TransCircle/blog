# 跨环博客 SEO / GEO 规范与操作手册

> 适用于 `blog.transcircle.org`。本文记录 URL 规范、各项 SEO / GEO 产物、代码里的唯一信息源、
> 上线后必须在各平台完成的操作，以及 Search Console 问题的排查方法。
> 组织实体与主站（`transcircle.org`，仓库 TransCircle/TransCircle）共用，改名称 / 社交账号时两边一起改。

## 1. 目标

- **SEO**：每篇文章以唯一、稳定、带尾斜杠的 URL 被 Google / Bing / 百度等收录；重复副本（PDF、Markdown 原文、搜索页、预览域名）不参与排名。
- **GEO**：AI 检索与问答（ChatGPT、Claude、Perplexity、Gemini、Copilot 等）能抓到全文、正确识别实体（跨环 / TransCircle Project），并按署名 + 原始链接引用。

## 2. URL 规范（最重要）

| 类型 | 形式 | 例子 |
|---|---|---|
| 页面 | **恒带尾斜杠** | `/posts/project-kickoff/`、`/tags/GAHT/`、`/about/` |
| 文件端点 | 不带尾斜杠 | `/posts/project-kickoff/index.html.md`、`/print/project-kickoff.pdf`、`/rss.xml` |
| 中文标签 | 百分号编码 | `/tags/%E8%A1%80%E6%A3%80/`（血检） |
| 文章 slug | 文件名去 `.md` 后**小写** | `HRT-choices-….md` → `/posts/hrt-choices-…/` |

- 站内链接**一律**调用 `src/lib/seo/url.ts`（`postPath` / `tagPath` / `absoluteUrl` …），不得手写 `/posts/${slug}`。
- `astro.config.mjs` 设置了 `trailingSlash: 'always'`：开发服务器里访问不带斜杠的页面会直接 404，写错的链接在本地就能发现。
- **尽量不要改已发布文章的文件名**（即 URL）。确需改名或删除时，301 会自动生成（见 §4.1），无需手写规则。

## 3. 产物一览

| 产物 | 路径 | 来源 |
|---|---|---|
| 站点地图 | `/sitemap-index.xml` → `/sitemap-0.xml` | `astro.config.mjs`（真实 lastmod、文章 OG 图片条目；排除 noindex 与文件端点） |
| 结构化数据 | 每页 `<head>` 一个 JSON-LD `@graph` | `src/lib/seo/schema.ts` |
| 301 重定向 | `/_redirects` | `src/lib/seo/redirects.ts`，构建时由 `src/integrations/seo-files.ts` 生成并校验 |
| 响应头 | `/_headers` | `src/lib/seo/headers.ts`（noindex、canonical Link、缓存、安全头） |
| 爬虫规则 | `/robots.txt`、`/ai.txt` | `public/` |
| AI 索引 / 全文 | `/llms.txt`、`/llms-full.txt` | `src/pages/llms*.ts` |
| 单篇原文 | `/posts/<slug>/index.html.md`（llms.txt 约定；旧地址 `/posts/<slug>.md` 301 过来） | `src/pages/posts/[slug]/index.html.md.ts` |
| 订阅源（全文） | `/rss.xml`、`/atom.xml`、`/feed.json` | `src/pages/*.ts` + `src/lib/feed.ts` |
| 关于 | `/about/` | `src/pages/about.astro` |
| 作者 | `/authors/`、`/authors/<作者 id>/` | `src/pages/authors/*.astro`（数据：`src/data/authors.json`，读取与校验：`src/lib/authors.ts`） |
| 身份与联系 | `/humans.txt`、`/.well-known/security.txt` | `public/` |
| 图标 / 应用 | favicon（16–512）、`site.webmanifest`、`browserconfig.xml` | `scripts/generate-icons.mjs`、`public/` |
| 社交分享图 | `/og-cover.png`、`/og/<slug>.png` | `src/lib/og/render.ts` |

### 3.1 结构化数据

每页：`Organization`（`@id` = `https://transcircle.org/#organization`，与主站同一实体）、`WebSite`（含 `SearchAction`、`publishingPrinciples`）、`WebPage`（按页面类型为 `CollectionPage` / `ItemPage` / `AboutPage`）、`ImageObject`、`BreadcrumbList`。

| 页面 | 额外节点 |
|---|---|
| 首页（不分页，列出全部文章） | `Blog`、`ItemList`（完整的 `BlogPosting` 只在文章页输出，列表页不放缺字段的简要节点） |
| 文章 | `BlogPosting`（作者 / 编辑为独立 `Person`，团队署名为子 `Organization`；`about` 标签、`citation` 参考文献、`timeRequired`、`wordCount`、`license`、`encoding` 指向 Markdown 与 PDF） |
| 标签 / 作者总览 | `ItemList` |
| 作者页 | `ProfilePage` + `Person`（团队为子 `Organization`），`sameAs` 外部主页，文章 `ItemList` |
| 关于 | `FAQPage`（与页面可见 FAQ 逐字一致，数据源 `src/lib/seo/faq.ts`） |

规则：结构化数据必须对应页面上**可见**的内容；所有 `@id` 引用必须能在同一页解析（`pnpm test` 与 `pnpm check:seo` 都会检查）。

### 3.2 收录与排除

| URL | 抓取 | 收录 | 手段 |
|---|---|---|---|
| 页面（首页、文章、标签、作者、关于） | ✓ | ✓ | 自指 canonical，进 sitemap |
| `/search/`、`/404.html` | ✓ | ✗ | `meta robots` + `X-Robots-Tag: noindex`，不声明 canonical |
| `/posts/<slug>/index.html.md` | ✓ | ✗ | 一条占位符规则：`X-Robots-Tag: noindex` + `Link: <文章>; rel="canonical"` |
| `/print/<slug>.pdf` | ✓ | ✗ | `/print/*` 一条规则：`X-Robots-Tag: noindex` |
| `*.pages.dev` 预览域名 | ✓ | ✗ | `_headers` 按主机名加 `X-Robots-Tag: noindex` |

**不要在 robots.txt 里 Disallow 这些 URL**：被屏蔽的 URL 爬虫读不到 noindex，GSC 会报「已被 robots.txt 屏蔽」。

> Cloudflare Pages 的 `_redirects` 最多 2000 条静态 + 100 条动态规则，超出时构建失败并提示；届时把最早的历史规则迁到 Cloudflare Bulk Redirects。
> 单条规则最多 1000 个字符（很长的中文标签编码后可能超出）：超长的规则会被跳过并在构建日志里列出，需要保留的请在 Bulk Redirects 里补上。
>
> Cloudflare Pages 的 `_headers` 最多 100 条规则。本站全部用通配 / 占位符规则（约 35 条），数量不随文章增长；
> 超限时构建会失败。新增响应头时请继续用占位符（`/posts/:slug/…`），不要逐篇生成规则。
> `_headers` 支持 `:name` 占位符（按 `/` 分段匹配），并可在头的值里引用一次，见
> <https://developers.cloudflare.com/pages/configuration/headers/>（示例 `/movies/:title` → `x-movie-name: You are watching ":title"`）。

## 4. 开发与校验

```bash
pnpm test         # vitest：URL、JSON-LD、重定向、静态文件一致性
pnpm build        # 构建（含 PDF；在 Cloudflare 生产分支还会推送 IndexNow / 百度）
pnpm check:seo    # 扫描 dist/：内链尾斜杠与死链、canonical、h1、title/description、JSON-LD、sitemap、_redirects、robots
pnpm verify       # 以上全部
```

### 4.1 发文 / 改名 / 删文时什么是自动的

**新增文章**只需要把 `.md` 放进 `src/content/posts/`，以下全部在 dev / build 时自动更新，不需要改任何其他文件：
文章页、首页列表、标签页（新标签自动建页并自动生成导语）、作者页（新署名自动建页）、相关文章 / 上一篇下一篇、sitemap（含分享图与正文配图、lastmod）、
RSS / Atom / JSON Feed、`llms.txt` / `llms-full.txt`、Markdown 原文、PDF、OG 分享图、搜索索引、`_headers`、IndexNow / 百度推送。

- **OG 字体**：`pnpm dev` / `pnpm build` 会先跑 `generate-og-fonts.mjs --if-needed`，新文章带来子集外的字符时自动重新裁剪
  `src/assets/og/fonts/`（首次需联网下载源字体）。这些文件变了就随文章一起提交；忘了提交也不影响线上——构建机会再裁剪一次。
- **改名 / 删文 / 删改标签的 301**：构建时从 git 历史 + `src/data/url-history.json` 得知曾经存在的文章与标签，
  凡是现在不存在的都自动生成 301：
  - 文章：git 识别的改名 → 新文章；否则同标题的现存文章 → 该文章；否则不重定向，返回真实 404（把无关旧文章都跳首页会被 Google 视为软 404）。
  - 标签：git 里「删一个加一个」的替换链（如 HRT → GAHT）→ 新标签；否则大小写不同的现行标签；否则 → 标签总览。
  - `url-history.json` 在 dev / build 时自动补写，**请随文章一起提交**，这样即使构建机是浅克隆也能生成完整规则。
  - `redirects.ts` 里的 `LEGACY_TAGS` / `RENAMED_POSTS` 只在想覆盖自动结果时使用。
  - 找不到去向的历史文章会在构建日志里列出（`以下历史文章找不到去向…`）。真删除可以忽略；如果其实是**文件名和标题同时改了**、而构建机是浅克隆拿不到改名提交，请在 `RENAMED_POSTS` 补一条，或在本地完整仓库里构建一次，让改名写入 `src/data/url-history.json` 后提交。

- **修改日期**：「更新于」、sitemap lastmod、`dateModified`、Feed 的 updated 取 frontmatter `updatedDate` 与 git 正文修改时间的较晚者
  （`src/lib/seo/git-dates.ts`）。只改 frontmatter 的提交、提交类型为 `style` / `refactor` / `chore` / `build` / `ci` / `test` / `perf`
  的维护性提交、发布后 24 小时内的校对都不算更新。`updatedDate` 仍可手写，用于强制标注一次更新。
- **正文一级标题**：与文章标题相同的 `# 标题` 自动删除，其他 `#` 自动降为二级标题（一页只有一个 h1）。
- **作者**：作者信息集中在 `src/data/authors.json`（id、显示名、类型、简介、外部链接、曾用名），文章只写作者 id，
  未登记的 id 会让构建失败。作者页 `/authors/<id>/`（ProfilePage + Person / 团队 Organization，全部外部链接写进 `sameAs`，
  简介写进 `description`）自动生成；按旧名字 / 曾用名生成过的作者页 URL 自动 301 到对应作者，找不到对应的才跳 `/authors/`。
- **章节目录**：≥ 4 个二级标题且 ≥ 3000 字的文章自动生成目录（`src/components/TableOfContents.astro`），正文开头已有手写目录 / 快速导航的跳过。
- **审阅信息**：任何文章都可以在 frontmatter 写 `reviewedBy`（审阅者 id）与 `lastReviewed`（审阅日期），
  显示在署名区并写进 `WebPage.reviewedBy` / `lastReviewed`，审阅者的作者页会列出「审阅的文章」。只有真正审阅过才填写。
  免责声明等文字由作者在正文中自行撰写，站点不做自动判断或补充。
- **部署门禁**：`pnpm build` 在生成 PDF 后运行 `check-seo`，有错误就让构建失败，Cloudflare 保持线上旧版本，也不会向搜索引擎推送。

仍需人工的只有写作本身：`description`，以及可选的标签人工导语。

新增内容时的检查清单：

- 文章 `description` 写成一句完整的话（60 字以上最佳）；过短时系统会自动补正文首段作为 meta description。
- 新标签会自动生成导语；想写得更好时在 `src/data/tag-descriptions.ts` 补一句（`check:seo` 会提示哪些还是自动的）。
- 提交时带上自动更新的 `src/data/url-history.json` 与 `src/assets/og/fonts/`（如有变化）。
- 正文图片写 alt；放在 `public/images/` 的图片会自动补 `width` / `height` / `loading="lazy"`。
- 参考文献写成脚注并附链接：会进入 `BlogPosting.citation`。

## 5. 上线后操作（需要账号，代码无法代劳）

### 5.1 Cloudflare

1. **Pages 构建命令**保持 `pnpm run build`（已内含 IndexNow / 百度推送，仅在生产分支执行）。若之前按旧文档改成了 `pnpm run build && pnpm run indexnow`，改回来，避免重复提交。
2. **环境变量**（Pages → Settings → Environment variables，Production）：
   - `PUBLIC_GOOGLE_SITE_VERIFICATION`、`PUBLIC_BING_SITE_VERIFICATION`、`PUBLIC_BAIDU_SITE_VERIFICATION`、`PUBLIC_YANDEX_SITE_VERIFICATION`、`PUBLIC_SOGOU_SITE_VERIFICATION`、`PUBLIC_360_SITE_VERIFICATION`：各平台 HTML 标签验证的 content 值（用 DNS 验证的平台可不填）。
   - `BAIDU_PUSH_TOKEN`：百度搜索资源平台「普通收录 → API 提交」的 token。
3. **SSL/TLS → Edge Certificates → Always Use HTTPS**：开启（http → https 301）。
4. **Rules → Redirect Rules / Bulk Redirects**：把 `www.blog.transcircle.org`（如有解析）与 `<project>.pages.dev` 301 到 `https://blog.transcircle.org`，保留路径与查询串。`_headers` 已给 pages.dev 加 noindex，这一步是把旧链接权重也并过来。
5. **Security → Bots / AI Crawl Control**：确认**没有**开启「屏蔽 AI 爬虫」或「托管 robots.txt（Managed robots.txt）」——它们会在本站 robots.txt 之前插入 Disallow 规则，与本站「欢迎 AI 引用」的策略冲突。
6. **Caching → Crawler Hints**：可开启（Cloudflare 自动 IndexNow），与构建脚本并存无害。

### 5.2 Google Search Console

1. 资源建议用「网域」类型 `transcircle.org`（DNS 验证），一次覆盖主站与博客；或单独添加 `https://blog.transcircle.org/`。
2. **站点地图**：提交 `https://blog.transcircle.org/sitemap-index.xml`。
3. **修复验证**：部署后进入「网页 → 未编入索引的原因」，对以下每一项点「验证修正」：
   - 网页会自动重定向 —— 内链已统一带尾斜杠，旧的无斜杠 URL 会逐步掉出报告（它们本来就应该重定向，验证会显示「已通过」或保持为预期状态）。
   - 未找到（404）—— 旧标签、改名文章、旧 `.md/` 路由已 301。
   - 已被 robots.txt 屏蔽 —— robots.txt 已不再 Disallow。
   - 已发现 / 已抓取 - 尚未编入索引 —— 已补内容与内链，验证后等待重新抓取（通常数天至数周）。
4. **网址检查**：对首页、`/authors/`、`/about/` 与近期文章「请求编入索引」。
5. 「增强功能」中确认面包屑、文章等结构化数据无错误；也可用 <https://search.google.com/test/rich-results> 与 <https://validator.schema.org/> 抽查。

### 5.3 其他搜索引擎

- **Bing Webmaster Tools**：从 GSC 导入站点，提交 sitemap；Bing 同时供给 ChatGPT 搜索、Copilot、DuckDuckGo 等，对 GEO 很重要。
- **百度搜索资源平台**：添加站点并验证，提交 sitemap，配置 `BAIDU_PUSH_TOKEN`。
- **Yandex Webmaster**、**Naver Search Advisor**（可选）：提交 sitemap；它们都支持 IndexNow。

### 5.4 上线后自检

每次部署后运行（对正式域名发真实请求，确认 Cloudflare 实际应用了重定向与响应头，包括 `_headers` 占位符是否被替换）：

```bash
pnpm smoke:live                                # 正式域名
pnpm smoke:live -- https://<预览>.pages.dev    # 某个预览部署（额外检查整站 noindex）
```

GitHub Actions 工作流 `.github/workflows/seo-smoke.yml` 会每天自动运行一次（也会在 Cloudflare Pages 上报部署成功后运行，
并可在 Actions 页面手动触发），失败时按仓库通知设置提醒维护者。

也可以手动抽查：

```bash
# 应为 301，一跳到位
curl -sI https://blog.transcircle.org/tags/HRT/ | head -n 3
curl -sI https://blog.transcircle.org/tag/astro/ | head -n 3
curl -sI https://blog.transcircle.org/posts/project-kickoff.md/ | head -n 3
curl -sI https://blog.transcircle.org/posts/project-kickoff.md | head -n 3      # 旧版原文地址 → index.html.md
# 应为 200，带 noindex 与 canonical Link（占位符 :slug 必须被替换成真实 slug）
curl -sI https://blog.transcircle.org/posts/project-kickoff/index.html.md | grep -iE 'x-robots-tag|^link'
# 应为 200，带 noindex
curl -sI https://blog.transcircle.org/print/project-kickoff.pdf | grep -iE 'x-robots-tag'
# 不带斜杠的页面应 308 到带斜杠版本（Cloudflare 行为；站内已不再产生这种链接）
curl -sI https://blog.transcircle.org/tags | head -n 3
```

Cloudflare 的 `_redirects` 匹配区分大小写，并以原始（编码）路径匹配；规则里同时写了原文与编码两种形式。若自检发现某条中文路径未生效，把 GSC 导出的 URL 原样补进 `redirects.ts`。

### 5.5 主动推送：推哪些 URL、已知取舍

推送的 URL（`scripts/lib/push-urls.mjs`，IndexNow 与百度共用）：最近 30 天正文有更新的、文章文件最近 30 天新加入仓库的、
以及**相对线上 sitemap 新出现的**（推送时线上还是上一个版本，所以能准确找出草稿转正式、改名、新标签页等新地址），外加首页与标签总览。

百度的推送接口只提供 HTTP（HTTPS 入口证书不匹配），`BAIDU_PUSH_TOKEN` 会以明文传输。配置该变量即视为接受这一风险
（影响限于被消耗推送额度）；怀疑泄露时到百度搜索资源平台重置 token。不要为改用 HTTPS 而关闭证书校验。

**推送时机**：

IndexNow / 百度推送在 Cloudflare Pages 的**构建阶段末尾**执行，此时新版本尚未切换上线（通常在构建结束后一两分钟内完成）。
搜索引擎收到通知后是异步排队抓取，一般晚于上线，实际影响很小；首次上线用的 IndexNow key 文件早已在线。
若要严格保证「上线后再推送」，可以在 Cloudflare 部署成功后手动运行 `pnpm run indexnow`，或接入部署完成通知（Deploy Hooks / GitHub Actions）后触发——这需要额外的基础设施，目前未接入。

### 5.6 已知取舍：正文图片

正文图片目前只有少量 PNG，构建时已自动补 `width` / `height` / `loading="lazy"` / `decoding="async"`（避免 CLS）。
图片增多或变大后，再引入多尺寸 WebP / AVIF 与 `srcset`（例如改用 Astro 的 `<Image>` / `astro:assets` 处理 `src/assets` 下的图片）。

### 5.7 已知限制（有意不处理）

下面这些情况现有内容与正常写作流程都碰不到，为它们继续加代码只会增加复杂度，所以只记录、不处理。真遇到时按说明手动处理即可。

- **复杂的文件名历史**：自动 301 能正确处理新增、改标题 / slug / 标签、删除、改一次文件名、改回原名、删除后同名重新发布。
  更复杂的组合（多次改名 + 删除 + 复用文件名交替进行）可能推导不出最理想的去向；构建日志会列出「找不到去向的历史文章」，
  需要时在 `src/lib/seo/redirects.ts` 的 `RENAMED_POSTS` / `LEGACY_TAGS` 手动指定。
- **超长重定向**：单条超过 1000 字符（例如几十个汉字的标签）的规则会被跳过并告警，需要保留时在 Cloudflare Bulk Redirects 补。
- **手写 `srcset`**：PDF 生成时重定位相对 `srcset` 按「逗号 + 空白」拆分候选，特殊写法可能不完整；正文配图请用 Markdown 图片语法。
- **构建校验的 HTML 解析**：`scripts/check-seo.mjs` 用正则读取部分 HTML 信息，注释或属性里手写的「伪标签」可能造成误报（只会报错、不会漏放）。
- **站内搜索偏精确**：为了不混入不相关结果，模糊容错设得很低（`src/lib/search-options.ts`），拼错的词可能搜不到。
- **`llms-full.txt` 是 Markdown 原文**：不经过正文 HTML 清洗，以 `text/plain` + `nosniff` 提供；下游如果把它渲染成 HTML，需要自行清洗。

## 6. 排查 Search Console 报告

1. 在报告里点进具体原因 → 导出 URL 列表。
2. 对照：
   - 带 `.md` / `.pdf` / `/search/` 的 URL 出现在「已排除」是**预期**的（noindex）。
   - 旧 URL 404：先确认 `url-history.json` 已提交（文章 / 标签的 301 是自动的）；仍漏掉的外部 URL（例如别人写错的链接）再手动加到 `redirects.ts` 的 `STATIC_ALIASES`。
   - 「重复网页，Google 选择的规范网页与用户指定的不同」：检查该页 canonical 与内链写法是否一致（`pnpm check:seo`）。
3. 修改后构建部署，再点「验证修正」。
