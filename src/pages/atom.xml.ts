import { cdata, getFeedItems, xmlEscape } from '@/lib/feed';
import { LOGO, SITE_DESCRIPTION, SITE_NAME, SITE_NAME_EN, SITE_URL } from '@/lib/seo/site';
import { absoluteUrl } from '@/lib/seo/url';

/**
 * /atom.xml — Atom 1.0（RFC 4287），含全文、作者主页、分类与版权声明。
 *
 * 许可证只在条目上逐条声明（rel="license"，RFC 4946）：Feed 级的许可证链接会被没有自己许可证链接的条目继承，
 * 「保留所有权利」（Proprietary）的文章就会被机器误读为开放授权。
 */
export async function GET(): Promise<Response> {
  const items = await getFeedItems();
  const selfUrl = absoluteUrl('/atom.xml');
  const updated = items.map((i) => i.updated).sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date(0);

  const entries = items
    .map(
      (item) => `  <entry>
    <title>${xmlEscape(item.title)}</title>
    <link rel="alternate" type="text/html" href="${item.url}" />${item.licenseUrl ? `\n    <link rel="license" href="${item.licenseUrl}" />` : ''}
    <id>${item.url}</id>
    <published>${item.published.toISOString()}</published>
    <updated>${item.updated.toISOString()}</updated>
${item.authors
  .map(
    (a) => `    <author>
      <name>${xmlEscape(a.name)}</name>${a.link ? `\n      <uri>${xmlEscape(a.link)}</uri>` : ''}
    </author>`
  )
  .join('\n')}
    <category term="${xmlEscape(item.category)}" />
${item.tags.map((tag, i) => `    <category term="${xmlEscape(tag)}" scheme="${item.tagUrls[i]}" />`).join('\n')}
    <summary type="text">${xmlEscape(item.summary)}</summary>
    <rights>${xmlEscape(item.rightsText)}</rights>
    <content type="html">${cdata(item.html)}</content>
  </entry>`
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <title>${xmlEscape(`${SITE_NAME} ${SITE_NAME_EN}`)}</title>
  <subtitle>${xmlEscape(SITE_DESCRIPTION)}</subtitle>
  <link rel="alternate" type="text/html" href="${SITE_URL}" />
  <link rel="self" type="application/atom+xml" href="${selfUrl}" />
  <id>${SITE_URL}</id>
  <updated>${updated.toISOString()}</updated>
  <author>
    <name>TransCircle 项目组</name>
    <uri>https://transcircle.org/</uri>
  </author>
  <icon>${LOGO.url}</icon>
  <logo>${LOGO.url}</logo>
  <rights>${xmlEscape('内容采用 CC BY-SA 4.0 授权，个别文章以文末标注为准')}</rights>
  <generator uri="https://astro.build/">Astro</generator>
${entries}
</feed>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
}
