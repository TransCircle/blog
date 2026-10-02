import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { rehypePlugins } from './src/lib/markdown/pipeline.mjs';
import { fileURLToPath } from 'node:url';
import { seoFiles } from './src/integrations/seo-files';
import { readPostFiles, postLastmod } from './src/lib/seo/post-files';
import { filesLastCommitDate } from './src/lib/seo/git-dates';
import { OG_IMAGE_VERSION, SITE_ORIGIN } from './src/lib/seo/site';
import { encodePathSegment, normalizePagePath } from './src/lib/seo/url';

/**
 * 构建时读取文章 frontmatter，供 sitemap 生成精确的 <lastmod> 与图片条目。
 * 真实的 per-post lastmod 比「每次构建都用当前时间」更可信，避免被搜索引擎判定为
 * 「全站每天都在变」而降低抓取信任度。
 */
const posts = readPostFiles(fileURLToPath(new URL('./src/content/posts', import.meta.url))).filter(
  (post) => !post.draft
);
const postBySlug = new Map(posts.map((post) => [post.slug, post]));
const isoOrNull = (date) => (date ? date.toISOString() : null);
const latestPostDate =
  posts
    .map((post) => isoOrNull(postLastmod(post)))
    .filter(Boolean)
    .sort()
    .at(-1) || undefined;

/** 关于页的 lastmod：页面与 FAQ 数据源文件的最近提交时间（拿不到 git 就不给）。 */
const aboutLastmod = isoOrNull(filesLastCommitDate(['src/pages/about.astro', 'src/lib/seo/faq.ts']));

/** 标签页的 lastmod：该标签下最新文章的修改时间，而不是全站统一的日期。 */
function tagLastmod(tag) {
  return posts
    .filter((post) => post.tags.includes(tag))
    .map((post) => isoOrNull(postLastmod(post)))
    .filter(Boolean)
    .sort()
    .at(-1);
}

/** 作者页的 lastmod：该作者（作者或编辑）最新文章的修改时间。slug 即作者 id。 */
function authorLastmod(id) {
  return posts
    .filter((post) => post.people.includes(id))
    .map((post) => isoOrNull(postLastmod(post)))
    .filter(Boolean)
    .sort()
    .at(-1);
}

/** sitemap 排除：noindex 页面（搜索、404）与各类非 HTML 端点。 */
function isSitemapPage(page) {
  const p = new URL(page).pathname;
  if (p === '/search/' || p === '/404/' || p.startsWith('/print/')) return false;
  if (/\.(md|txt|json|xml|png|pdf)$/i.test(p)) return false;
  return true;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 开发服务器与线上行为对齐：Cloudflare Pages 会把 `/posts/x` 308 到 `/posts/x/`，
 * 而 Astro dev 在 trailingSlash: 'always' 下直接返回 404 提示页。这里在 dev 里补上同样的跳转，
 * 手输地址或浏览器自动补全旧地址时不再撞 404。只作用于 dev，不影响构建产物。
 */
function devTrailingSlashRedirect() {
  // dev 下 trailingSlash 也会作用于动态文件端点（posts/[slug]/index.html.md.ts / og/[...slug].png.ts），
  // 只认末尾带 `/` 的写法；构建产物是真实文件，不受影响。这里在 dev 内部改写，对外 URL 不变。
  const DYNAMIC_FILE_ENDPOINTS = [/^\/posts\/[^/]+\/index\.html\.md$/, /^\/og\/[^/]+\.png$/];

  return {
    name: 'transcircle-dev-trailing-slash',
    apply: 'serve',
    // Astro 在 configureServer 的「后置钩子」里把自己的 trailingSlash 检查 unshift 到中间件栈最前；
    // 本插件用 enforce: 'post' + 返回后置钩子，保证在它之后再 unshift，排到真正的第一位
    enforce: 'post',
    configureServer(server) {
      const handler = (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const [pathname, query = ''] = (req.url || '/').split('?');
        if (DYNAMIC_FILE_ENDPOINTS.some((re) => re.test(pathname))) {
          req.url = `${pathname}/${query ? `?${query}` : ''}`;
          return next();
        }
        const last = pathname.split('/').pop() || '';
        // 带扩展名的文件、Vite / Astro 内部路径不处理
        if (pathname.endsWith('/') || last.includes('.') || /^\/(@|_|node_modules\/|src\/)/.test(pathname)) {
          return next();
        }
        res.statusCode = 308;
        res.setHeader('Location', `${pathname}/${query ? `?${query}` : ''}`);
        res.end();
      };
      return () => {
        server.middlewares.stack.unshift({ route: '', handle: handler });      };
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: SITE_ORIGIN,
  output: 'static',
  // 所有页面 URL 恒带尾斜杠：与 directory 构建产物、canonical、sitemap 一致，
  // Cloudflare Pages 不再为内链多跳一次 308（GSC「网页会自动重定向」的根因）
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      filter: isSitemapPage,
      // 只声明实际用到的图片命名空间
      namespaces: { news: false, video: false, xhtml: false, image: true },
      serialize(item) {
        // Astro 生成的 URL 并不按同一规则编码每个路径段（`*`、`:`、`+` 原样保留）：
        // 统一成与 canonical / 内链逐字相同的写法，sitemap 里才不会出现「同一页两种地址」
        const p = normalizePagePath(new URL(item.url).pathname);
        let changefreq = 'weekly';
        let priority = 0.6;
        let lastmod = item.lastmod;
        let img;

        if (p === '/') {
          changefreq = 'daily';
          priority = 1.0;
          lastmod = latestPostDate;
          img = [{ url: `${SITE_ORIGIN}/og-cover.png?v=${OG_IMAGE_VERSION}`, title: '跨环博客 TransCircle Blog' }];
        } else if (/^\/posts\/[^/]+\/$/.test(p)) {
          const slug = safeDecode(p.slice('/posts/'.length, -1));
          const post = postBySlug.get(slug);
          changefreq = 'monthly';
          priority = 0.8;
          if (post) {
            lastmod = isoOrNull(postLastmod(post)) || lastmod;
            // 分享卡片 + 正文配图（站内图片），都进入图片 sitemap
            img = [
              {
                url: `${SITE_ORIGIN}/og/${encodePathSegment(slug)}.png?v=${OG_IMAGE_VERSION}`,
                title: post.title,
              },
              ...post.images
                .filter((image) => image.src.startsWith('/') && !image.src.startsWith('//'))
                .map((image) => ({
                  url: `${SITE_ORIGIN}${encodeURI(safeDecode(image.src))}`,
                  ...(image.alt ? { title: image.alt } : {}),
                })),
            ];
          }
        } else if (p === '/tags/') {
          changefreq = 'weekly';
          priority = 0.6;
          lastmod = latestPostDate;
        } else if (p.startsWith('/tags/')) {
          changefreq = 'weekly';
          priority = 0.5;
          lastmod = tagLastmod(safeDecode(p.slice('/tags/'.length, -1))) || latestPostDate;
        } else if (p === '/authors/') {
          changefreq = 'weekly';
          priority = 0.5;
          lastmod = latestPostDate;
        } else if (p.startsWith('/authors/')) {
          changefreq = 'weekly';
          priority = 0.5;
          lastmod = authorLastmod(safeDecode(p.slice('/authors/'.length, -1))) || latestPostDate;
        } else if (p === '/about/') {
          changefreq = 'monthly';
          priority = 0.7;
          lastmod = aboutLastmod || undefined;
        }

        return {
          ...item,
          url: `${SITE_ORIGIN}${p}`,
          changefreq,
          priority,
          ...(lastmod ? { lastmod } : {}),
          ...(img ? { img } : {}),
        };
      },
    }),
    seoFiles(),
  ],
  markdown: {
    // 插件链定义在 src/lib/markdown/pipeline.mjs（测试用同一份链跑真实 Markdown，保证顺序与构建一致）
    rehypePlugins,
    shikiConfig: {
      // 双主题：Shiki 把两套语法色写成 --shiki-light / --shiki-dark 变量，
      // 由 global.css 按 data-theme 选择。此前固定 github-dark，浅色主题下
      // 代码块也是深色的，与页面割裂。
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      wrap: true,
    },
  },
  vite: {
    plugins: [devTrailingSlashRedirect()],
    build: {
      assetsInlineLimit: 4096,
    },
  },
});
