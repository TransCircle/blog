/**
 * 正文 Markdown 的 rehype 插件链：astro.config.mjs 与测试共用同一份，顺序即执行顺序。
 *
 * Astro 的管线是：remark → remark-rehype → Shiki → 【本插件链】→ 图片 → 标题 id → rehypeRaw → 输出。
 * 注意 Astro 自带的 rehypeRaw 排在最后，所以本链第一步必须自己先解析原始 HTML（见下）。
 */
import rehypeRaw from 'rehype-raw';
import rehypeCallouts from './rehype-callouts.mjs';
import rehypeExternalLinks from './rehype-external-links.mjs';
import rehypeImageAttributes, { rehypeDemoteH1 } from './rehype-image-attributes.mjs';
import rehypeStripUnsafe from './rehype-strip-unsafe.mjs';

/**
 * 将 Markdown 表格包裹进 <div class="table-wrapper">，
 * 过宽的表格在容器内横向滚动，而不是撑出页面级横向滚动
 */
function rehypeTableWrapper() {
  return (tree) => {
    const wrap = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        if (child.type === 'element' && child.tagName === 'table') {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrapper'] },
            children: [child],
          };
        }
        wrap(child);
        return child;
      });
    };
    wrap(tree);
  };
}

/**
 * 剥离 GFM 脚注条目末尾的回跳锚点（↩ ↩² ↩³ …）。
 *
 * remark-gfm 会为「每一次引用」都在脚注条目后面挂一个回跳箭头：一条文献被引 4 次
 * 就有 4 个箭头，本站某篇文章 24 条脚注一共挂了 132 个，纯粹是噪声。
 *
 * 这里在 HTML 树上直接删掉这些锚点（而不是用 CSS 藏起来——藏起来屏幕阅读器仍会
 * 念到、键盘仍会 Tab 到）。「怎么回去」改由 FootnotePopover 承担：正文里的引用标记
 * 悬停/聚焦即可预览脚注全文，通常无需跳转；真的跳过去时，脚本才注入**一个**
 * 「返回正文」链接。
 */
function rehypeStripFootnoteBackrefs() {
  const isBackref = (node) =>
    node.type === 'element' &&
    node.tagName === 'a' &&
    node.properties &&
    'dataFootnoteBackref' in node.properties;

  return (tree) => {
    const visit = (node) => {
      if (!Array.isArray(node.children)) return;

      // GFM 给注释区生成的是 sr-only 的英文标题 "Footnotes"（屏幕阅读器会读到，
      // 引用标记的 aria-describedby 也指向它）。本站是中文站，改成「注释」。
      if (
        node.type === 'element' &&
        node.tagName === 'h2' &&
        node.properties &&
        node.properties.id === 'footnote-label'
      ) {
        node.children = [{ type: 'text', value: '注释' }];
        return;
      }

      if (node.children.some(isBackref)) {
        node.children = node.children.filter((child) => !isBackref(child));
        // 箭头前后残留的空白文本节点会在句末留下多余空格，一并收干净
        while (
          node.children.length > 0 &&
          node.children[node.children.length - 1].type === 'text' &&
          node.children[node.children.length - 1].value.trim() === ''
        ) {
          node.children.pop();
        }
        const last = node.children[node.children.length - 1];
        if (last && last.type === 'text') last.value = last.value.replace(/\s+$/, '');
      }

      node.children.forEach(visit);
    };
    visit(tree);
  };
}

export const rehypePlugins = [
  // 不先解析的话，正文里手写的原始 HTML（<img>、<a>、<script> …）在下面这些插件眼里只是未解析的 raw 节点，
  // 清洗、外链 rel、图片尺寸、h1 降级都作用不到。先解析后，Astro 自带的 rehypeRaw 就无事可做了。
  rehypeRaw,
  // 安全兜底紧随其后：后续插件与页面 / Feed 看到的都是清洗过的 HTML
  rehypeStripUnsafe,
  rehypeCallouts,
  rehypeTableWrapper,
  rehypeStripFootnoteBackrefs,
  rehypeDemoteH1,
  rehypeImageAttributes,
  rehypeExternalLinks,
];
