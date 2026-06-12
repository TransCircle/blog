import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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

// https://astro.build/config
export default defineConfig({
  site: 'https://blog.transcircle.org',
  output: 'static',
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [rehypeTableWrapper],
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
  vite: {
    build: {
      assetsInlineLimit: 4096,
    },
  },
});
