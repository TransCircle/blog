# 跨环博客 · 设计落地说明（相对设计系统 v3.0 的偏离记录）

> **规范本体不在这里。** 全站唯一视觉规范源是 `docs/DESIGN.md`（TransCircle 设计系统 v3.0「Spectrum / 光谱」）。
> 本文件只记录博客仓库**偏离规范、补充规范、或规范未覆盖**的部分，以及这些决定的理由。
> 规范里已经写清楚的数值（色阶、字阶、间距、圆角、动效曲线……）一律不在此复制，避免两份真值源打架。

**对应规范版本**：v3.0（2026-09-13）　**本文件状态**：现行有效

---

## 0. 令牌落地

- 唯一真值源：`src/styles/theme.css`。排版与全局基元在 `src/styles/global.css`，组件视觉走 Astro scoped `<style>`。
- 暗色**双通道**声明：`@media (prefers-color-scheme: dark) :root:not([data-theme])`（无 JS 回退）与 `:root[data-theme='dark']`（JS 锁定）两块取值逐条一致，改一处必须改两处。
- 组件层只允许 `var(--token)`，不得写死色值 / 圆角 / 时长。唯二例外见 §6（OG 卡片与 PDF 渲染管线）。

### 0.1 博客扩展令牌（规范 §2 没有、但博客必须有）

| 令牌 | 值（亮 / 暗） | 为什么需要 |
|---|---|---|
| `--code-bg` | `var(--surface-2)` / `#141021` | 设计系统面向应用，没有「代码块面」这一语义；§5.13 规定的暗色代码底 `#141021` 不在 §2 色表里，固化成令牌以免散写。 |
| `--focus-ring` | `rgba(244,63,126,.25)` / `rgba(255,92,158,.25)` | §5.4 的 `color-mix()` 焦点光晕要求附硬编码回退，这条就是那个回退档。 |
| `--pink-600-hover` | `#E02E70` / `#FF4D94` | §5.1 把主按钮 hover 的加深值写在组件规范正文里而非 §2 色表；固化成令牌，避免各组件各写一遍 hex。 |
| `--on-pink` | `#210A16`（两主题同值） | §5.1 / §5.6 反复出现的「落在粉实底上的墨字」。 |
| `--flag-white` | `#FFFFFF`（两主题同值） | 旗帜条纹的白段是品牌常量。`--surface` / `--ink` 都随主题翻转，拿它们当「白」会让暗色主题下的旗子失真。 |
| `--app-nav-height` | 运行时测量值，回退 `var(--nav-h)` | `--nav-h` 是设计值；顶栏实际高度随断点 / 字号 / 换行变化，由 Header 脚本实时写入，供 `scroll-margin-top` 与阅读进度条定位消费。 |

---

## 1. 内容形态决定

### 1.1 文章卡片**不放封面图**

9 篇文章全部是长文，无一配图，frontmatter 的 `cover` 字段实际为空。规范 §5.5 的卡片本就不要求图片，这里明确记为决定而非遗漏：

- `PostCard.astro` 是纯文字卡：分类 chip + 日期 → 标题（2 行截断）→ 摘要（2 行截断）→ 作者 / 标签行。
- 不引入「无图占位块」「首字母色块」这类补位装饰（§1.6 禁止装饰性色块）。
- `cover` 字段**保留**（内容 schema 不动），文章页仍会渲染页内题图；只是列表卡不消费它。

### 1.2 卡片网格固定两列，而非 `auto-fill(minmax(320px, 1fr))`

规范 §4 给的是通用卡片网格。博客的卡片没有封面图、信息量小（标题 + 两行摘要），在 1280px 内容轨上按 320px 自动填充会排到 3–4 列，标题几乎必然吃满 2 行截断。

**落地**：`.posts-grid` 在 ≥768px 为 `repeat(2, minmax(0, 1fr))`，以下单列。首页、分页页、标签详情页、搜索结果共用这一条。

### 1.3 列表页走内容轨，文章页走阅读轨

- 列表 / 标签 / 搜索页：`.container.is-wide`（`--w-content` 1280px），与顶栏、页脚内条同宽同左缘。
- 文章页 / 404：`.container`，宽度为 `calc(var(--w-reading) + 2 * clamp(16px, 4vw, 48px))`。
  §4 的 `--w-reading` 是**文字列宽**，所以容器要在 46rem 之外再加两侧内边距，否则正文实际只有 640px。
- 水平内边距全站唯一表达式 `clamp(16px, 4vw, 48px)`，顶栏 / 内容 / 页脚逐字一致（§4）。

---

## 2. 打印 / PDF 视图约束（本仓库最强的额外约束）

`/print/<slug>` 是 **PDF 的渲染源**：`astro build` 产出该页 HTML → `scripts/generate-pdfs.mjs` 用无头 Chrome 打开、注入子集化中文字体、`page.pdf()` 输出 `/print/<slug>.pdf`。`page.pdf()` 走 **print media**，所以任何进入 `global.css` 的样式都会影响 PDF。

硬性约束：

1. **正文类名 `.article-content` 不得改名**（不改叫 `.prose`）。打印页、脚注组件（`FootnotePopover`）、进度条脚本都以它为锚点，重命名会同时打穿 PDF 排版与脚注交互。
2. `global.css` 末尾有一段 `@media print`，负责把**站点 UI 与全部动效**从纸面上摘掉：
   - `display: none`：skip-link、顶栏、页脚、阅读进度条、主题开关、移动抽屉、外链确认弹窗、脚注悬浮卡；
   - reveal 元素强制 `opacity: 1 / transform: none`（纸上不滚动，IntersectionObserver 永不触发，不兜底就会整块空白）；
   - 全局 `animation / transition / backdrop-filter / box-shadow` 置 `none !important`（玻璃在部分引擎的打印路径下会糊成灰块）。
   `ReadingProgress.astro` 组件内另有一份 `@media print { display: none }`，双保险。
3. 打印页自己的配色是**硬编码**的（白纸、深灰字、`#e6d3da` 细线），刻意不走主题令牌：PDF 不存在主题切换，且必须在 `data-theme=light` 下绝对稳定。这是允许写死 hex 的两处例外之一。
4. 改任何影响 `.article-content` 的全局样式后，都要顺手确认打印视图仍然可读（`pnpm build:site` 后打开 `dist/print/<slug>/index.html`）。

---

## 3. 组件层面的偏离

### 3.1 正文行内链接不做「下划线从左侧长入」

§5.2 要求链接 hover 时下划线 `::after scaleX(0→1)` 长入。绝对定位的 `::after` 只覆盖元素的**首个行盒**，而中文长句里的行内链接经常折行，效果会变成「只给第一行画了半条线」。

**落地**：

- 正文（`.article-content a`）用真 `text-decoration`：默认无下划线，hover / focus-visible 出现，`text-underline-offset: 3px`。
- 长入动画收进全局工具类 `.link-grow`，只给**确定不折行**的独立链接用（面包屑等）。

### 3.2 Callout 不用彩色左边框

自研 rehype 插件（`src/lib/markdown/rehype-callouts.mjs`）把 `> [!NOTE]` 类引用块转成 `.callout`。旧版是「软色底 + 4px 彩色左边条」，正是 §1.6 点名禁止的模板。

**落地**：1px 语义色描边 + 语义软色底 + 语义色标题/图标，配色逐条对应 §2.4 语义组：`note→info`、`tip→success`、`warning→warning`、`caution→error`。`important` 在 §2.4 没有对应项（语义组里没有「品牌」档），取粉 ramp 的软面：`--pink-100 / --pink-300 / --pink-700`。

引用块（`blockquote`）另行保留 §5.13 规定的 2px `--blue-400` 左边条 —— 那是规范明确要求的，与「彩色左边框卡片」不是一回事。

### 3.3 旗帜条纹的同屏计数

§3.1 允许四种场景，§1.5 要求签名元素克制。博客同屏最多出现两处，且形态不同级：

- **通栏条纹**：只有页脚顶部那一条（3px 满宽），全站唯一；
- **迷你指示条**：顶栏当前导航项下的 24×3px（§3.1 明确列为独立场景，属于状态指示而非装饰）。

移动端抽屉里的当前项**不放条纹**，改用 `--pink-600` 实底 + `--on-pink` 墨字（§5.6 选中态配方），避免抽屉与页脚在同屏各挂一条。

### 3.4 滚动 reveal 不套在正文段落上

§6.4 的 reveal 面向「首屏以下的区块」。文章正文若逐段淡入，会在阅读中途制造等待。

**落地**：文章页只给文章头、导出区、标签区、协议区加 `data-reveal`；`.article-content` 恒可见。首页 hero、卡片、标签 chip 正常参与 reveal（同组内 60ms 交错，序号 `--i` 由 `Layout.astro` 的脚本按同父元素计数写入）。

降级三重保险：初始隐藏态只在 `html.js` + `prefers-reduced-motion: no-preference` 下生效；无 `IntersectionObserver` 时直接全部标记为已入场；print 下强制可见。

### 3.5 ThemeToggle 的圆形过渡是「图标级」而非「全页级」

§5.11 要求切换时 `clip-path: circle()` 圆形遮罩过渡。博客把它做在按钮内部的两枚图标上（月亮/太阳互相揭示，`--dur-3`），**不做全页圆形揭示**：全页遮罩需要在 `<html>` 上叠加临时层，与本站「首屏 paint 前写入 `data-theme`」的防闪白引导脚本相互干扰，收益不抵风险。全局配色过渡（§6.5）仍在 `body` 上以 `--dur-3` 生效。

### 3.6 可点 chip

设计系统 §5.6 的 chip 是只读徽章，没有「可点 chip」这一档。博客的标签本质是导航入口，取 chip 的默认态配色（`--pink-100` / `--pink-700` / `--r-xs`），hover 加深一档到 `--pink-200`，并用伪元素把触屏命中区撑到 44px（直接给 `min-height: 44px` 会把 26px 的 chip 拉成高盒子）。

---

## 4. 主题与无障碍

- **主题维度只有 `light` / `dark`**。高对比度模式是设计系统的硬性非目标，**不得重新引入**：不写 `prefers-contrast` / `forced-colors` 分支，不加 `--*-hc` 令牌。对比度由令牌色值本身保证（§7）。
- `localStorage` 键 `transcircle-theme`，白名单只认 `light` / `dark`；历史上存过的 `'contrast'` 会被引导脚本清掉。
- 粉色做文字只能用 `--pink-700`；链接与信息文字用 `--blue-600`（§7）。
- `focus-visible` 全局 `2px solid var(--pink-600)` + offset 2px；输入类控件改用 `box-shadow: 0 0 0 3px var(--focus-ring)`（聚焦时绝不位移）。
- 触控目标 ≥44px（`--tap-min`）：小控件一律用伪元素撑命中区，保持视觉尺寸不变。
- 状态不靠颜色单独传达；所有动效包在 `prefers-reduced-motion` 下可被关闭。

---

## 5. 字体

- 自托管 latin 子集 woff2，放 `public/fonts/`，`@font-face` 在 `global.css`，`<link rel="preload">` 在 `Layout.astro`。**零第三方字体请求**。
- 两个文件各自是 Google Fonts 的**可变字体 latin 子集**，一个文件覆盖所需字重区间：
  `nunito-brand-latin.woff2`（`font-weight: 400 900`）、`space-grotesk-latin.woff2`（`font-weight: 400 600`）。
- `unicode-range` 限定 latin：**中文一律由 `--font-sans` 系统栈呈现**，中文不做 webfont；Nunito Brand 仅用于 TransCircle 品牌词。
- Space Grotesk 的大型标签或数字展示每页最多 2 处（§3.4）；中文标题保持自然字距，通过字号、字重与行高建立层级。
- `--font-tech`（Space Grotesk）用于元信息：卡片日期 / 作者行、eyebrow、分页页码、标签计数、404 数字、页脚版权行。中文部分自动回退系统栈，只有数字与拉丁词吃到该字体，这是预期效果。

---

## 6. 独立维护的渲染管线（不走 CSS 令牌）

satori（OG 卡片）与 puppeteer（PDF）都不解析 CSS 变量，配色只能写字面量：

- `src/lib/og/render.ts`：内含一份亮色令牌的字面量副本 `C`，取值已对齐 v3.0（`--ink` / `--pink-400` / `--pink-600` / `--pink-700` / `--line` / `--pink-100` / `--surface` / `--on-pink`）。**改令牌时两处必须同步。** 当前卡片使用平色画布、实色旗帜条纹和发丝线，不引入渐变。
- `scripts/generate-pdfs.mjs` + `/print/<slug>`：见 §2。

---

## 7. 与 v3.0 的一致点（逐条核对清单）

| 规范条目 | 博客落地位置 |
|---|---|
| §2 全套令牌 + 暗色双通道 | `src/styles/theme.css` |
| §2.6 / §9 字体自托管、双字体上限 | `global.css` `@font-face` + `Layout.astro` preload + `public/fonts/` |
| §5.1 按钮（40/44px、`--r-sm`、spring 回弹、暗色 glow、禁止 pill） | `components/ui/Button.astro` |
| §5.2 链接（`--blue-600`、offset 3px） | `global.css`（`.link-grow` 见 §3.1 偏离） |
| §5.3 导航（玻璃 + `--glass-blur` + 底部 `--line`、当前项迷你条纹、≤1200 抽屉右侧滑入 + 40ms 交错） | `components/Header.astro` |
| §5.4 表单（44px、`--surface-2`、1.5px `--line-strong`、粉描边 + 光晕） | `pages/search.astro` |
| §5.5 卡片（`--surface` + `--line` + `--r-md` + `--shadow-2`，hover −3px / `--pink-300` / `--shadow-3`，暗色 glow） | `global.css` `.post-card*` + `components/PostCard.astro` |
| §5.6 Chip（`--r-xs`、`--pink-100`/`--pink-700`） | `global.css` `.chip` / `.tag-chip`、`pages/tags/index.astro` chip 墙 |
| §5.7 弹窗（遮罩 + blur(4px)、`--r-lg`、`--shadow-3`、scale(.96→1)、焦点陷阱） | `components/LinkConfirmDialog.astro`、`components/FootnotePopover.astro`（玻璃浮层） |
| §5.8 分页按钮组（`--r-sm`） | `components/Pagination.astro` |
| §5.10 阅读进度条（顶栏下方 2px `--pink-600`，scaleX） | `components/ReadingProgress.astro` |
| §5.11 主题切换圆形过渡 | `components/ThemeToggle.astro`（图标级，见 §3.5） |
| §5.12 空态（48px 线性图标 + 标题 + 提示 + CTA） | `global.css` `.empty-state` + 首页 / 标签页 / 搜索页 |
| §5.13 prose（46rem、`--lh-prose`、行内码 `--pink-100`/`--pink-700`、代码块 `--code-bg` + 13.5px、引用 2px `--blue-400`、表格行 hover、图片 `--r-sm` + `--shadow-1`） | `global.css` `.article-content` |
| §3.1 旗帜条纹 | `global.css` `.flag-stripe` + 页脚 / 顶栏（见 §3.3） |
| §6 微交互目录（hover / reveal / 主题过渡 / `@view-transition`） | `global.css` + `Layout.astro` reveal 脚本 |
| §7 无障碍底线 | 见 §4 |

---

## 8. 验证

```bash
pnpm typecheck    # astro check
pnpm build:site   # astro build（不跑 PDF）
pnpm build        # astro build + scripts/generate-pdfs.mjs（改动影响正文样式时跑）
```

改样式后至少确认：首页（卡片网格 / hero / reveal）、文章页（进度条 / prose / 脚注悬浮卡）、标签 chip 墙、搜索结果卡、打印视图 `dist/print/<slug>/index.html`、以及 `/llms.txt`、`/rss.xml`、`/search-index.json` 等端点仍然正常产出。
