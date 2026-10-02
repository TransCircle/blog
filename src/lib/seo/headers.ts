/**
 * Cloudflare Pages `_headers` 的唯一来源（构建时由 src/integrations/seo-files.ts 写入 dist/）。
 *
 * 为什么不在 robots.txt 里 Disallow：被 Disallow 的 URL 爬虫根本不会请求，也就读不到 noindex，
 * GSC 会把它们报成「已被 robots.txt 屏蔽」且仍可能以无摘要的形式出现在结果里。
 * 正确做法是允许抓取、用 X-Robots-Tag 声明 noindex；Markdown 原文再用 HTTP Link 头声明 canonical，
 * 把信号合并到文章页。
 *
 * 全部规则都是通配 / 占位符规则，数量固定（不随文章数增长），远低于 Cloudflare 的 100 条上限。
 */
import { SITE_HOST } from './site';
import { absoluteUrl } from './url';

export interface HeaderRule {
  readonly path: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
}

/** Cloudflare Pages 对 _headers 的规则数上限。 */
export const MAX_HEADER_RULES = 100;

const NOINDEX: readonly [string, string] = ['X-Robots-Tag', 'noindex'];
const NOINDEX_FOLLOW: readonly [string, string] = ['X-Robots-Tag', 'noindex, follow'];

export function buildHeaderRules(): HeaderRule[] {
  const rules: HeaderRule[] = [
    // ── 预览部署与 pages.dev 域名：永不收录，避免与正式域名构成重复内容 ──
    { path: `https://:project.pages.dev/*`, headers: [NOINDEX] },
    { path: `https://:version.:project.pages.dev/*`, headers: [NOINDEX] },

    // ── 构建产物与字体：带 hash / 内容稳定，长缓存 ──
    { path: '/_astro/*', headers: [['Cache-Control', 'public, max-age=31536000, immutable']] },
    { path: '/fonts/*', headers: [['Cache-Control', 'public, max-age=31536000, immutable']] },

    // ── 图标：URL 长期稳定（Google 按主机名缓存 favicon），缓存一周 ──
    { path: '/favicon.ico', headers: [['Cache-Control', 'public, max-age=604800'], ['Content-Type', 'image/x-icon']] },
    { path: '/favicon.png', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/logo-mark.svg', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/apple-touch-icon.png', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/icon-192.png', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/icon-512.png', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/icon-maskable.png', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/brand/*', headers: [['Cache-Control', 'public, max-age=604800']] },
    { path: '/images/*', headers: [['Cache-Control', 'public, max-age=604800']] },

    // ── 分享图：一天（版本号见 src/lib/seo/site.ts 的 OG_IMAGE_VERSION） ──
    { path: '/og-cover.png', headers: [['Cache-Control', 'public, max-age=86400']] },
    { path: '/og/*', headers: [['Cache-Control', 'public, max-age=86400']] },

    // ── 不参与收录、但必须允许抓取的页面 ──
    { path: '/search/', headers: [NOINDEX_FOLLOW] },
    { path: '/404.html', headers: [NOINDEX] },
    { path: '/search-index.json', headers: [NOINDEX, ['Cache-Control', 'public, max-age=3600']] },

    // ── SEO / GEO 索引文件：短缓存；本身不进搜索结果 ──
    {
      path: '/robots.txt',
      headers: [NOINDEX, ['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'text/plain; charset=utf-8']],
    },
    { path: '/sitemap-index.xml', headers: [NOINDEX, ['Cache-Control', 'public, max-age=3600']] },
    { path: '/sitemap-*', headers: [NOINDEX, ['Cache-Control', 'public, max-age=3600']] },
    {
      path: '/rss.xml',
      headers: [['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'application/rss+xml; charset=utf-8']],
    },
    {
      path: '/atom.xml',
      headers: [['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'application/atom+xml; charset=utf-8']],
    },
    {
      path: '/feed.json',
      headers: [['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'application/feed+json; charset=utf-8']],
    },
    { path: '/llms.txt', headers: [['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'text/plain; charset=utf-8']] },
    {
      path: '/llms-full.txt',
      headers: [['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'text/plain; charset=utf-8']],
    },
    { path: '/ai.txt', headers: [['Cache-Control', 'public, max-age=3600'], ['Content-Type', 'text/plain; charset=utf-8']] },
    {
      path: '/humans.txt',
      headers: [['Cache-Control', 'public, max-age=86400'], ['Content-Type', 'text/plain; charset=utf-8']],
    },
    {
      path: '/.well-known/security.txt',
      headers: [['Cache-Control', 'public, max-age=86400'], ['Content-Type', 'text/plain; charset=utf-8']],
    },
    {
      path: '/site.webmanifest',
      headers: [['Cache-Control', 'public, max-age=86400'], ['Content-Type', 'application/manifest+json']],
    },
    {
      path: '/browserconfig.xml',
      headers: [['Cache-Control', 'public, max-age=86400'], ['Content-Type', 'application/xml; charset=utf-8']],
    },
  ];

  // ── PDF：整个 /print/ 一条 noindex。PDF 已不参与收录，不再逐篇声明 canonical（noindex 的文件不需要）──
  rules.push({ path: '/print/*', headers: [NOINDEX_FOLLOW, ['Cache-Control', 'public, max-age=86400']] });

  // ── Markdown 原文：一条占位符规则覆盖全部文章（Cloudflare 支持在头的值里引用 :slug）──
  // noindex + canonical 指回文章页。规则数固定，不随文章数量增长。
  rules.push({
    path: '/posts/:slug/index.html.md',
    headers: [
      NOINDEX_FOLLOW,
      ['Link', `<${absoluteUrl('/posts/')}:slug/>; rel="canonical"`],
      ['Content-Type', 'text/markdown; charset=utf-8'],
      ['Cache-Control', 'public, max-age=3600'],
    ],
  });

  // ── 全站共享安全头（只在 /* 出现一次，避免 Cloudflare 合并出重复值） ──
  rules.push({
    path: '/*',
    headers: [
      ['X-Content-Type-Options', 'nosniff'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['Permissions-Policy', 'browsing-topics=()'],
      ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload'],
      ['X-Frame-Options', 'SAMEORIGIN'],
    ],
  });

  return rules;
}

export function serializeHeaders(rules: readonly HeaderRule[]): string {
  const lines = [
    `# ${SITE_HOST} 响应头。由 src/integrations/seo-files.ts 在构建时生成，来源见 src/lib/seo/headers.ts。`,
    '# 请勿手改 dist/_headers；修改 headers.ts 后重新构建。',
    '',
  ];
  for (const rule of rules) {
    lines.push(rule.path);
    for (const [name, value] of rule.headers) lines.push(`  ${name}: ${value}`);
    lines.push('');
  }
  return lines.join('\n');
}
