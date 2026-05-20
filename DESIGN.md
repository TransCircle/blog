# Design System - TransCircle

## Visual Theme & Atmosphere

- **整体风格**：温柔、坚定、社群感。以粉色为核心视觉符号，传递包容与抗争并存的气质。大量留白与柔和圆角营造安全感，同时通过清晰的排版和充足的对比度确保可读性。
- **设计哲学**：
  - **可及性优先**：默认提供高对比度模式，所有交互均支持键盘操作和屏幕阅读器。
  - **尊重用户偏好**：自动适配系统主题，尊重 `prefers-reduced-motion` 设置。
  - **语义化与包容性**：避免硬编码颜色，使用 CSS 自定义属性实现主题切换；所有图标均提供无障碍属性。

---

## Color Palette & Semantic Roles

项目使用 **CSS 自定义属性（CSS Variables）** 定义设计 token，通过 `data-theme` 属性在 `light`、`dark`、`contrast` 三种模式间切换。

| Role | Light Mode | Dark Mode | Contrast Mode | Usage Scenarios | WCAG Note |
|------|-----------|-----------|---------------|-----------------|-----------|
| `--bg-color` | `#fff9fb` | `#12121a` | `#000000` | 页面背景 | Light: 高对比；Contrast: AAA |
| `--text-main` | `#000000` | `#f0f0f5` | `#ffffff` | 主标题、重要文本 | Contrast: 21:1 |
| `--text-secondary` | `#666666` | `#a0a0b0` | `#ffffff` | 次要文本、描述 | Light: 5.7:1 (AA) |
| `--text-muted` | `#888888` | `#808090` | `#ffffff` | 辅助信息、禁用态 | Light: 3.5:1 |
| `--text-body` | `#333333` | `#c0c0d0` | `#ffffff` | 正文段落 | Light: 12.6:1 |
| `--primary-pink` | `#ff85a2` | `#ff85a2` | `#ffaa00` | 高亮、焦点轮廓、品牌色 | 在深色下对比度需注意 |
| `--soft-pink` | `#ffccd5` | `#3a2a35` | `#332200` | 分割线、装饰背景 | |
| `--accent-pink` | `#f06292` | `#ff6b9d` | `#ffaa00` | 主按钮背景、强调色 | 作为按钮背景配白色文字满足 AA |
| `--nav-bg` | `rgba(255,251,252,0.85)` | `rgba(24,24,35,0.85)` | `rgba(0,0,0,0.95)` | 导航栏毛玻璃背景 | 配合 backdrop-filter |
| `--divider-color` | `#ffccd5` | `#2a2a3a` | `#ffffff` | 分割线、边框 | |
| `--hover-bg` | `#ffedf1` | `#2a1f25` | `#332200` | 悬停背景 | |
| `--cta-hover` | `#cc537c` | `#cc537c` | `#cc8800` | CTA 按钮悬停 | 硬编码回退 |
| `--shadow-color` | `rgba(240,98,145,0.128)` | `rgba(255,107,156,0.098)` | `rgba(255,170,0,0.3)` | 阴影基色 | |
| `--shadow-color-hover` | `rgba(240,98,146,0.4)` | `rgba(255,107,157,0.4)` | `rgba(255,170,0,0.5)` | 悬停阴影 | |
| `--overlay-bg` | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.8)` | 遮罩层 | |

### CSS 变量定义（简化版）

```css
:root {
  /* Light (default) */
  --bg-color: #fff9fb;
  --text-main: #000000;
  --text-secondary: #666666;
  --text-muted: #888888;
  --text-body: #333333;
  --primary-pink: #ff85a2;
  --soft-pink: #ffccd5;
  --accent-pink: #f06292;
  --nav-bg: rgba(255, 251, 252, 0.85);
  --divider-color: #ffccd5;
  --hover-bg: #ffedf1;
  --hover-bg-mix: color-mix(in srgb, var(--primary-pink) 15%, white);
  --cta-hover: #cc537c;
  --cta-hover-mix: color-mix(in srgb, var(--accent-pink) 85%, black);
  --shadow-color: rgba(240, 98, 145, 0.128);
  --shadow-color-hover: rgba(240, 98, 146, 0.4);
  --overlay-bg: rgba(0, 0, 0, 0.3);
}

[data-theme="dark"] { /* ... */ }
[data-theme="contrast"] { /* 黑底白字 + 橙色高亮 */ }
```

### color-mix() 渐进增强
项目大量使用 `color-mix()` 实现悬停态的平滑过渡，同时提供硬编码回退值以兼容旧浏览器。

---

## Typography

- **字体族**：系统字体栈 `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **字重**：400 (normal)、500 (medium)、600 (semibold)、700 (bold)
- **基础字号**：浏览器默认（通常为 16px）

| 层级 | 字号 | 字重 | 行高 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| 页面标题 (h1) | `2rem` (32px) | 700 | 默认 | `-0.02em` | 主标题 |
| 副标题 | `1rem` (16px) | 400 | 默认 | 默认 | 副标题、描述 |
| 正文段落 | `0.95rem` | 400 | `1.6` | 默认 | 介绍文本 |
| 正文 (小) | `0.92rem` | 400 | `1.75` | 默认 | README 内容 |
| 区块标题 | `0.68rem` | 600 | 默认 | `0.1em` | 分区标题（uppercase） |
| 导航链接 | `0.9rem` | 400 | 默认 | 默认 | 导航项 |
| 社交链接名称 | `0.9rem` | 500 | 默认 | 默认 | 社交列表 |
| 社交链接 handle | `0.82rem` | 400 | 默认 | 默认 | 用户名 |
| 按钮文字 | `0.875rem` | 500 | 默认 | 默认 | CTA 按钮 |

- **响应式缩放**：在 `1280px` 以下导航链接缩小至 `0.85rem`；移动端整体保持比例，主要通过间距和布局调整。

---

## Spacing & Layout

### 基础间距
- 使用 `rem` 作为单位，基于根字体大小（16px）的倍数系统。
- 常用值：`0.15rem`、`0.5rem`、`0.65rem`、`0.75rem`、`1rem`、`1.4rem`、`2rem`、`2.5rem`、`4rem`。

### 容器与布局
| 元素 | 最大宽度 | 水平内边距 | 说明 |
|------|----------|------------|------|
| 主内容区 | `760px` | `2.5rem 4rem` (桌面) / `1.5rem` (移动) | 居中，阅读宽度 |
| 页脚内容 | `1400px` | `0 3rem` | 更宽，适配版权信息 |
| 导航栏 | 100% | `0.75rem 3rem` (桌面) / `1rem 1.5rem` (移动) | 固定顶部 |

### 响应式断点
| 断点 | 目标设备 | 关键变化 |
|------|----------|----------|
| `1280px` | 大屏笔记本 | 导航栏 padding 减小，导航间距 `2rem → 1rem` |
| `1200px` | 平板/小笔记本 | **汉堡菜单出现**，桌面导航隐藏，侧边抽屉展开 |
| `1100px` | — | 浮动目录 (FloatingTOC) 显示 |
| `1024px` | 平板 | 主内容 padding 减小至 `2rem 2.5rem` |
| `768px` | 手机 | 主内容全宽，`CTA` 按钮垂直堆叠，社交 handle 隐藏 |

### 常见布局模式
- **Navbar + Main + Footer**：经典单页布局，导航固定，主内容居中。
- **Sidebar Overlay**：移动端汉堡菜单触发 `280px` 宽侧边抽屉，配合全屏遮罩。
- **Floating TOC**：桌面端右侧固定浮动目录（`position: fixed`），窄屏隐藏。

---

## Components & Patterns

### Button / CTA

**Primary CTA**
```css
background-color: var(--accent-pink);
color: white;
padding: 0.5rem 1.2rem;
border-radius: 50px; /* pill shape */
font-size: 0.875rem;
font-weight: 500;
box-shadow: 0 2px 8px rgba(240, 98, 146, 0.25);
transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
```
- **Hover**：`translateY(-1px)`，背景变暗（`color-mix` 85% black），阴影加深
- **Disabled**：未定义，需遵循 `opacity: 0.5` + `cursor: not-allowed` 惯例
- **移动端**：全宽居中

**Secondary CTA**
```css
border: 1.5px solid var(--primary-pink);
color: var(--primary-pink);
border-radius: 50px;
```
- **Hover**：背景填充 `--hover-bg`，边框和文字变为 `--accent-pink`

**Social Link**
- 水平 flex 布局，带图标 + 名称 + handle
- Hover：`background-color: var(--hover-bg)`，圆角 `7px`
- 移动端隐藏 handle

### Card (FloatingTOC)
- 背景：`var(--nav-bg)` + `backdrop-filter: blur(20px) saturate(180%)`
- 边框：`1px solid var(--divider-color)`
- 圆角：`16px`
- 阴影：`0 0 10px var(--shadow-color), 0 2px 8px rgba(0,0,0,0.06)`
- 内边距：`1.4rem 1.1rem`

### Navigation (Navbar)
- **桌面**：水平链接列表，gap `2rem`，链接 hover 有圆角背景高亮
- **移动端**：左侧滑出抽屉 (`280px`)，全屏遮罩 (`--overlay-bg`)
- **ARIA**：`aria-label="主导航"`，汉堡按钮 `aria-expanded` + `aria-controls`
- **键盘**：Escape 关闭菜单，焦点自动移至菜单内首个可聚焦元素，菜单打开时 `main` 元素设置 `inert`

### ThemeToggle
- 三个图标按钮（Sun/Moon/Contrast），`role="radio"` 组合在 `radiogroup` 中
- 尺寸：`32px × 32px`，圆角 `6px`
- Active 态：`background-color: var(--primary-pink)`，文字白色
- **键盘**：支持 Arrow 键循环、Home/End 跳转
- **高对比度**：硬编码黑底白字橙色高亮，确保 AAA 对比度

### Input / Form
- 当前项目中无表单组件。若新增，应遵循：
  - 边框：`1.5px solid var(--divider-color)`
  - Focus：`outline: 2px solid var(--primary-pink)`，`outline-offset: 2px`
  - 圆角：`8px` 或 `50px`（根据类型）

---

## Depth, Shadows & Effects

### 阴影层级
| 层级 | 值 | 用途 |
|------|-----|------|
| Elevation 1 | `0 1px 2px var(--shadow-color)` | 导航栏底边 |
| Elevation 2 | `0 2px 8px rgba(240,98,146,0.25)` | Primary 按钮默认 |
| Elevation 3 | `0 4px 12px rgba(240,98,146,0.4)` | Primary 按钮悬停 |
| Floating Card | `0 0 10px var(--shadow-color), 0 2px 8px rgba(0,0,0,0.06)` | TOC 浮动卡片 |
| Drawer | `4px 0 15px rgba(0,0,0,0.1)` | 移动端导航抽屉 |

### 圆角 Scale
| Token | 值 | 用途 |
|-------|-----|------|
| `sm` | `6px` | 按钮、输入框 |
| `md` | `7-8px` | 链接悬停背景、导航项 |
| `lg` | `10px` | 移动端 TOC 项 |
| `xl` | `16px` | 浮动卡片 |
| `full` | `50px` | CTA 按钮（pill） |

### 过渡动画
| 属性 | 时长 | Easing | 用途 |
|------|------|--------|------|
| `background-color`, `color` | `0.2s` | `ease` | 按钮、链接 |
| `background-color`, `color` | `0.15s` | `ease` | 社交链接（更快） |
| `transform`, `box-shadow` | `0.2s` | `ease` | 按钮悬停抬升 |
| `transform` | `0.3s` | `ease-in-out` | 移动端菜单滑入 |
| `opacity` | `0.3s` | `ease` | 遮罩层淡入 |
| 主题切换 | `0.3s` | `ease` | body 背景/文字色（仅在 `prefers-reduced-motion: no-preference` 时启用） |

---

## Responsive & Accessibility

### 移动优先策略
- CSS 默认隐藏复杂元素（如 FloatingTOC），通过 `min-width` media query 逐步增强。
- 主内容区在移动端全宽，桌面端限制 `760px` 保证阅读体验。

### 触控目标
- 导航链接：`padding: 0.5rem 1rem`（最小 44px 高度）
- 主题切换按钮：`32px × 32px`
- 汉堡菜单：`24px × 18px`（视觉区域，实际点击区域由按钮尺寸决定）

### 暗黑模式
- 通过 `data-theme="dark"` 切换
- 自动检测 `prefers-color-scheme: dark`（仅在用户未手动设置主题时）
- 存储于 `localStorage`（`transcircle-theme`）

### 高对比度模式 (Contrast)
- 黑底白字橙色高亮（`#ffaa00`）
- 为色觉障碍用户专门设计，硬编码颜色确保 AAA 级对比度
- 橙色替代粉色，避免红绿色盲识别困难

### WCAG 关键要求
- **焦点指示器**：`:focus-visible` 统一使用 `2px solid var(--primary-pink)`，`outline-offset: 2px`
- **减少动画**：`@media (prefers-reduced-motion: reduce)` 禁用所有过渡
- **语义化 HTML**：nav/section/main/footer 正确使用，所有交互元素有 aria-label
- **键盘可访问**：所有自定义组件支持完整键盘导航

---

## Do's and Don'ts

### Do
- 始终使用 CSS 变量（`var(--primary-pink)`）而非硬编码颜色，除非在 Contrast 模式的特殊覆盖中。
- 为新增交互组件添加 `aria-label`、`role` 和键盘支持。
- 使用 `color-mix()` 处理悬停态，同时提供硬编码回退。
- 在 `@media (prefers-reduced-motion: reduce)` 中禁用过渡。
- 新组件 hover 背景优先使用 `--hover-bg-mix`（配合 `@supports` 检测）。

### Don't
- 不要任意添加不存在的 CSS 变量，必须先在 `:root` 和 `[data-theme]` 中定义。
- 不要破坏现有的 focus-visible 样式，这是键盘导航的关键视觉线索。
- 不要在高对比度模式下使用粉色（`#ff85a2`），应使用橙色（`#ffaa00`）。
- 不要为装饰性图标添加可聚焦属性，使用 `aria-hidden="true" focusable="false"`。
- 不要省略按钮/链接的 `transition`，突然的颜色变化会造成认知不适。

---

## Agent Usage Guide

### 如何在 Prompt 中引用
> "请严格遵循 TransCircle 的 DESIGN.md 设计系统。使用粉色主题（`--primary-pink: #ff85a2`），支持 Light/Dark/Contrast 三种模式，所有颜色必须通过 CSS 变量引用。组件必须具备完整的键盘导航和 ARIA 属性，尊重 `prefers-reduced-motion`。"

### 示例 Prompt 模板
```
为 TransCircle 项目创建一个新的 [组件名称] 组件。

要求：
- 使用 CSS Modules，样式定义在 [Component].module.css 中
- 颜色必须使用 CSS 变量（如 var(--text-main), var(--accent-pink)）
- 支持三种主题：light / dark / contrast（通过 data-theme 属性）
- hover 态使用 transition: background-color 0.2s ease
- focus-visible 使用 outline: 2px solid var(--primary-pink); outline-offset: 2px;
- 在 @media (prefers-reduced-motion: reduce) 中禁用过渡
- 圆角：按钮 50px（pill），卡片 16px，输入框 8px
- 提供完整的 TypeScript props 接口
- 添加必要的 aria-label 和 role 属性
```

---

## 变更总结 & 发现

### 已提取的 Token
- **颜色**：14 个核心 CSS 变量，覆盖 3 种主题模式
- **排版**：7 个层级，使用 rem 单位，系统字体栈
- **间距**：基于 rem 的灵活系统，无固定 grid
- **组件**：Navbar、ThemeToggle、FloatingTOC、CTA Button、Social Link、LicenseFooter
- **动画**：统一的 `0.2s ease` 模式，带减少动画保护