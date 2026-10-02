/**
 * RSS / Atom / JSON Feed 共用的数据准备：取已发布文章、渲染全文 HTML、把站内相对链接改成绝对链接。
 *
 * 全文输出让阅读器与 AI 聚合器拿到完整内容（而不是只有摘要），同时保留原文链接与署名。
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getCollection, type CollectionEntry } from 'astro:content';
import { formatPeople, byNewest } from '@utils/posts';
import { absolutizeHtml, metaDescription } from '@/lib/seo/content';
import { postModified } from '@/lib/seo/git-dates';
import { CODE_LICENSES, CONTENT_LICENSE_NAMES, CONTENT_LICENSE_URLS, OG_IMAGE_VERSION } from '@/lib/seo/site';
import { absoluteUrl, postOgImagePath, postPath, tagPath } from '@/lib/seo/url';

export interface FeedItem {
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string;
  readonly html: string;
  readonly published: Date;
  readonly updated: Date;
  readonly authors: ReadonlyArray<{ name: string; link?: string | undefined }>;
  readonly authorText: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly tagUrls: readonly string[];
  readonly image: string;
  /** 本篇的内容协议（每篇可能不同，Feed 不能只声明站点默认协议）。 */
  readonly licenseName: string;
  /** 协议 URL；Proprietary 为 null。 */
  readonly licenseUrl: string | null;
  /** 正文代码片段的协议（frontmatter codeLicense；没写就是没有代码要授权）。 */
  readonly codeLicense: { readonly name: string; readonly url: string | null } | null;
  /** 文字与代码协议的完整说明（Atom rights / RSS dc:rights 使用）。 */
  readonly rightsText: string;
}

export async function getFeedItems(): Promise<FeedItem[]> {
  const posts = (await getCollection('posts'))
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .sort(byNewest);

  const container = await AstroContainer.create();

  return Promise.all(
    posts.map(async (post: CollectionEntry<'posts'>) => {
      const { Content } = await post.render();
      const d = post.data;
      const url = absoluteUrl(postPath(post.slug));
      const summary = metaDescription(d.description, d.title, post.body || '');
      const licenseName = CONTENT_LICENSE_NAMES[d.contentLicense] ?? d.contentLicense;
      const licenseUrl = CONTENT_LICENSE_URLS[d.contentLicense] ?? null;
      const authorText = formatPeople(d.author);
      // 代码协议与文字协议分开声明：Feed 分发全文（含代码块），离开站点后不能让读者以为代码也是 CC 协议
      const codeLicense = d.codeLicense ? (CODE_LICENSES[d.codeLicense] ?? { name: d.codeLicense, url: null }) : null;
      const describe = (name: string, link: string | null): string => (link ? `${name}（${link}）` : name);
      const rightsText = codeLicense
        ? `文字：${describe(licenseName, licenseUrl)}；代码：${describe(codeLicense.name, codeLicense.url)}`
        : describe(licenseName, licenseUrl);
      const codeFooter = codeLicense
        ? codeLicense.url
          ? `文中代码采用 <a href="${codeLicense.url}" rel="license nofollow noopener noreferrer">${xmlEscape(codeLicense.name)}</a> 协议。`
          : `文中代码${xmlEscape(codeLicense.name)}。`
        : '';
      // 保留所有权利的文章不在 Feed 里分发全文，只给摘要与原文链接
      const body = licenseUrl
        ? absolutizeHtml(await container.renderToString(Content), url)
        : `<p>${xmlEscape(summary)}</p>`;
      // 文末署名与协议：阅读器、聚合器转载全文时也带着出处与许可信息
      const footer = `<hr /><p>本文原载于<a href="${url}">跨环博客（TransCircle Blog）</a>，作者：${xmlEscape(authorText)}。${
        licenseUrl
          ? `文字内容采用 <a href="${licenseUrl}" rel="license nofollow noopener noreferrer">${xmlEscape(licenseName)}</a> 协议，转载请保留署名与原文链接。`
          : '保留所有权利，请阅读原文。'
      }${codeFooter}</p>`;
      const html = `${body}\n${footer}`;
      return {
        slug: post.slug,
        url,
        title: d.title,
        summary,
        html,
        published: d.pubDate,
        updated: postModified(post),
        authors: d.author,
        authorText,
        category: d.category,
        tags: d.tags,
        tagUrls: d.tags.map((tag: string) => absoluteUrl(tagPath(tag))),
        image: `${absoluteUrl(postOgImagePath(post.slug))}?v=${OG_IMAGE_VERSION}`,
        licenseName,
        licenseUrl,
        codeLicense,
        rightsText,
      };
    })
  );
}

/** XML 文本转义。 */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** CDATA 包裹（正文 HTML 里若出现 ]]> 需要拆开）。 */
export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}
