/**
 * 站内 URL 的唯一构造处。
 *
 * 站点以 directory 格式构建（dist/posts/<slug>/index.html），Cloudflare Pages 对不带
 * 尾斜杠的请求会 308 到带斜杠版本。内链、canonical、sitemap、Feed、llms.txt 若写法不一，
 * Google Search Console 就会把这些 URL 报成「网页会自动重定向」。所以：
 *
 *  - 所有 HTML 页面路径**恒带尾斜杠**；
 *  - 文件端点（.md / .pdf / .png / .xml / .json / .txt）**恒不带**尾斜杠；
 *  - 任何组件都不得手写 `/posts/${slug}` 之类的字面量，一律调用这里的函数。
 */
import { SITE_ORIGIN, SITE_URL } from './site';

/**
 * 把一个 path 段编码成 URL 安全形式（标签可能含中文、空格等）。全站页面链接、canonical、sitemap、
 * _redirects 都用它，保证同一个地址只有一种写法。encodeURIComponent 不编码 `*`，
 * 而 `*` 在 Cloudflare _redirects 里是通配符，所以额外编码成 %2A。
 */
export function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/\*/g, '%2A');
}

const segment = encodePathSegment;

export const HOME_PATH = '/';
export const TAGS_PATH = '/tags/';
export const SEARCH_PATH = '/search/';
export const ABOUT_PATH = '/about/';

export function postPath(slug: string): string {
  return `/posts/${segment(slug)}/`;
}

/**
 * 文章 Markdown 原文端点（src/pages/posts/[slug]/index.html.md.ts）。
 * llms.txt 规范：以 `/` 结尾的页面，Markdown 版本在 `<URL>index.html.md`。
 */
export function postMarkdownPath(slug: string): string {
  return `/posts/${segment(slug)}/index.html.md`;
}

/** 文章 PDF（scripts/generate-pdfs.mjs 生成）。 */
export function postPdfPath(slug: string): string {
  return `/print/${segment(slug)}.pdf`;
}

/** 文章打印视图（仅开发服务器可访问；生产构建会在生成 PDF 后删除它）。 */
export function postPrintPath(slug: string): string {
  return `/print/${segment(slug)}/`;
}

/** 文章 OG 卡片（src/pages/og/[...slug].png.ts）。 */
export function postOgImagePath(slug: string): string {
  return `/og/${segment(slug)}.png`;
}

export function tagPath(tag: string): string {
  return `/tags/${segment(tag)}/`;
}

export const AUTHORS_PATH = '/authors/';

/**
 * 名称归一化：去首尾空白、转小写、空白换成连字符（Oakley Huang → oakley-huang）。
 * 作者页 URL 已改用登记表里的 id；这个函数只用于把历史上按署名生成的旧作者页 URL 对应回作者。
 */
export function authorSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/** 作者页：/authors/<作者 id>/（id 见 src/data/authors.json）。 */
export function authorPath(id: string): string {
  return `/authors/${segment(id)}/`;
}

export function searchPath(query?: string): string {
  return query ? `${SEARCH_PATH}?q=${encodeURIComponent(query)}` : SEARCH_PATH;
}

/** 站内 path → 绝对 URL（canonical、og:url、sitemap、Feed、JSON-LD 统一走这里）。 */
export function absoluteUrl(pathname: string): string {
  if (/^https?:\/\//.test(pathname)) return pathname;
  if (pathname === '' || pathname === '/') return SITE_URL;
  return `${SITE_ORIGIN}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/**
 * 规整任意页面 path 为「带尾斜杠」形式（文件端点除外）。
 * Layout 用它从 Astro.url.pathname 推 canonical，确保与内链写法一致。
 */
export function normalizePagePath(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/';
  // 构建期 Astro.url.pathname 可能是原文（/tags/血检/）也可能已编码，
  // 先逐段解码再编码，保证与 tagPath() 的写法逐字一致
  const encoded = pathname
    .split('/')
    .map((part) => {
      try {
        return encodePathSegment(decodeURIComponent(part));
      } catch {
        return part;
      }
    })
    .join('/');
  const last = encoded.split('/').pop() ?? '';
  if (/\.[a-z0-9]+$/i.test(last)) return encoded;
  return encoded.endsWith('/') ? encoded : `${encoded}/`;
}
