import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * 构建时读取文章 frontmatter 的发布 / 更新日期，供 sitemap 生成精确的 <lastmod>。
 * 真实的 per-post lastmod 比「每次构建都用当前时间」更可信，避免被搜索引擎判定为
 * 「全站每天都在变」而降低抓取信任度。slug 与 Astro 默认一致（文件名去扩展名后小写）。
 */
function readPostDates() {
  const postsDir = fileURLToPath(new URL('./src/content/posts', import.meta.url));
  const map = new Map();
  let files = [];
  try {
    files = fs.readdirSync(postsDir);
  } catch {
    return map;
  }
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    try {
      const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8');
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) continue;
      const block = fm[1];
      if (/^\s*draft:\s*true\b/m.test(block)) continue;
      // 容忍未补零的日期（如 2026-06-7），统一规整为零填充的 ISO 日期
      const parseDate = (re) => {
        const m = block.match(re);
        if (!m) return null;
        const [, y, mo, d] = m;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      };
      const date =
        parseDate(/^\s*updatedDate:\s*['"]?(\d{4})-(\d{1,2})-(\d{1,2})/m) ||
        parseDate(/^\s*pubDate:\s*['"]?(\d{4})-(\d{1,2})-(\d{1,2})/m);
      if (date) {
        const slug = file.replace(/\.md$/i, '').toLowerCase();
        map.set(slug, new Date(`${date}T00:00:00Z`).toISOString());
      }
    } catch {
      /* 单篇解析失败时跳过，让 sitemap 回退到无 lastmod */
    }
  }
  return map;
}

const postDates = readPostDates();
const latestPostDate =
  [...postDates.values()].sort().at(-1) || new Date().toISOString();

// https://astro.build/config
export default defineConfig({
  site: 'https://blog.transcircle.org',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // 排除搜索页（robots.txt 已 Disallow）与各类非 HTML 端点，避免无效 / 重复 URL
      filter: (page) => {
        const p = new URL(page).pathname.replace(/\/$/, '') || '/';
        if (p === '/search') return false;
        if (/\.(md|txt|json|xml)$/i.test(p)) return false;
        return true;
      },
      serialize(item) {
        const p = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        let changefreq = 'weekly';
        let priority = 0.7;
        let lastmod = item.lastmod;

        if (p === '/') {
          changefreq = 'daily';
          priority = 1.0;
          lastmod = latestPostDate;
        } else if (p.startsWith('/posts/')) {
          changefreq = 'monthly';
          priority = 0.8;
          const slug = p.slice('/posts/'.length);
          const d = postDates.get(slug);
          if (d) lastmod = d;
        } else if (p === '/tags') {
          changefreq = 'weekly';
          priority = 0.5;
          lastmod = latestPostDate;
        } else if (p.startsWith('/tags/')) {
          changefreq = 'weekly';
          priority = 0.4;
          lastmod = latestPostDate;
        }

        return {
          ...item,
          changefreq,
          priority,
          ...(lastmod ? { lastmod } : {}),
        };
      },
    }),
  ],
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
