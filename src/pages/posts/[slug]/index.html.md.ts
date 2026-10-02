import type { APIContext } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { formatPeople } from '@utils/posts';
import { isoDate, normalizeHeadings } from '@/lib/seo/content';
import { postModified } from '@/lib/seo/git-dates';
import { CONTENT_LICENSE_URLS, SITE_NAME, SITE_NAME_EN } from '@/lib/seo/site';
import { absoluteUrl, authorPath, postPath } from '@/lib/seo/url';

/**
 * /posts/<slug>/index.html.md — 文章的 Markdown 原文，面向 AI 摄取与离线阅读。
 *
 * 路径遵循 llms.txt 规范：页面 URL 以 `/` 结尾时，Markdown 版本位于 `<URL>index.html.md`。
 * 每篇原文与文章页同目录，Cloudflare 的 _headers 只需一条占位符规则（/posts/:slug/index.html.md）
 * 就能为全部文章加上 X-Robots-Tag: noindex 与指回文章页的 canonical Link 头，规则数不随文章增长。
 * 旧地址 /posts/<slug>.md 会 301 到这里（src/lib/seo/redirects.ts）。
 *
 * 输出一份干净的 YAML frontmatter（canonical、作者、日期、协议、推荐引用格式）+ 正文。
 */
export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .map((post: CollectionEntry<'posts'>) => ({
      params: { slug: post.slug },
      props: { post },
    }));
}

/** YAML 双引号字符串。 */
const q = (value: string): string => JSON.stringify(value);

export async function GET({ props }: APIContext): Promise<Response> {
  const { post } = props as { post: CollectionEntry<'posts'> };
  const d = post.data;
  const url = absoluteUrl(postPath(post.slug));
  const modified = postModified(post);
  const licenseUrl = CONTENT_LICENSE_URLS[d.contentLicense];
  const citation = `${formatPeople(d.author)}. ${d.title}[EB/OL]. ${SITE_NAME}（${SITE_NAME_EN}）, ${isoDate(d.pubDate)}. ${url}`;

  const frontmatter = [
    '---',
    `title: ${q(d.title)}`,
    d.description ? `description: ${q(d.description)}` : null,
    `canonical: ${q(url)}`,
    `site: ${q(`${SITE_NAME} ${SITE_NAME_EN}`)}`,
    `author: [${d.author.map((a: { name: string }) => q(a.name)).join(', ')}]`,
    `author_url: [${d.author.map((a: { id: string }) => q(absoluteUrl(authorPath(a.id)))).join(', ')}]`,
    d.editor.length > 0 ? `editor: [${d.editor.map((a: { name: string }) => q(a.name)).join(', ')}]` : null,
    d.reviewedBy.length > 0 ? `reviewed_by: [${d.reviewedBy.map((a: { name: string }) => q(a.name)).join(', ')}]` : null,
    d.lastReviewed ? `last_reviewed: ${isoDate(d.lastReviewed)}` : null,
    `published: ${isoDate(d.pubDate)}`,
    modified > d.pubDate ? `updated: ${isoDate(modified)}` : null,
    `category: ${q(d.category)}`,
    `tags: [${d.tags.map(q).join(', ')}]`,
    `license: ${q(d.contentLicense)}`,
    licenseUrl ? `license_url: ${q(licenseUrl)}` : null,
    d.codeLicense ? `code_license: ${q(d.codeLicense)}` : null,
    `cite_as: ${q(citation)}`,
    'language: zh-CN',
    '---',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  // 与页面同一规则（rehypeDemoteH1）：正文开头若已有与标题相同的 `# 标题` 就不再重复；
  // 其余 `#` 一级标题降为二级，保证原文里只有一个 H1
  const content = normalizeHeadings((post.body || '').trim(), d.title);
  const body = `${frontmatter}\n\n# ${d.title}\n\n${content}\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
