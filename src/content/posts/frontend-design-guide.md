---
title: '前端组件设计规范'
description: '介绍 TransCircle 博客项目中使用的组件设计规范和无障碍访问实践'
pubDate: 2026-05-21
author: 'TransCircle 前端开发组'
category: '技术分享'
tags: ['前端', 'a11y', '设计规范']
codeLicense: 'AGPL-3.0'
---

## 组件设计原则

在 TransCircle 博客项目中，我们遵循以下组件设计原则：

### 1. 语义化 HTML

所有交互元素必须使用正确的 HTML 标签：

- 按钮使用 `<button>`，不用 `<div>` 模拟
- 链接使用 `<a>`，不用 JavaScript 跳转
- 导航使用 `<nav>`，文章使用 `<article>`

### 2. 无障碍访问

每个交互组件都必须支持：

- **键盘导航**：Tab、Enter、Escape、方向键
- **屏幕阅读器**：`aria-label`、`role` 属性
- **焦点管理**：清晰的焦点指示器

```css
:focus-visible {
  outline: 2px solid var(--primary-pink);
  outline-offset: 2px;
}
```

### 3. 响应式设计

移动优先策略，断点设计：

| 断点 | 目标设备 | 关键变化 |
|------|----------|----------|
| `768px` | 手机 | 内容全宽，按钮垂直堆叠 |
| `1024px` | 平板 | 主内容 padding 减小 |
| `1200px` | 平板/小笔记本 | 汉堡菜单出现 |
| `1280px` | 大屏笔记本 | 导航栏 padding 减小 |

## 主题切换组件

主题切换是一个 `radiogroup` 组件，支持 `light` / `dark` 两种模式（独立高对比度模式已按全局设计规范废止，对比度由两套主题令牌色值本身保证）：

```astro
<div class="theme-toggle" role="radiogroup" aria-label="主题切换">
  <button role="radio" aria-checked="true" data-theme="light">
    <!-- Sun icon -->
  </button>
  <button role="radio" aria-checked="false" data-theme="dark">
    <!-- Moon icon -->
  </button>
</div>
```

## 减少动画支持

尊重用户的 `prefers-reduced-motion` 设置：

```css
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
    animation: none !important;
  }
}
```

## 总结

通过以上规范，我们确保 TransCircle 博客对所有用户都是可访问和友好的。
