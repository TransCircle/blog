import { cdata, getFeedItems, xmlEscape } from '@/lib/feed';
import {
  CONTACT_EMAIL,
  CONTENT_LICENSE_URL,
  LOGO,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_NAME_EN,
  SITE_URL,
} from '@/lib/seo/site';
import { absoluteUrl } from '@/lib/seo/url';

/**
 * /rss.xml — RSS 2.0，含全文（content:encoded）、作者（dc:creator）、分类与自引用 atom:link。
 */
export async function GET(): Promise<Response> {
  const items = await getFeedItems();
  const selfUrl = absoluteUrl('/rss.xml');
  const lastBuild = items.map((i) => i.updated).sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date(0);

  const itemXml = items
    .map(
      (item) => `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <pubDate>${item.published.toUTCString()}</pubDate>
      <dc:creator>${xmlEscape(item.authorText)}</dc:creator>
      <dc:rights>${xmlEscape(item.rightsText)}</dc:rights>
      <category>${xmlEscape(item.category)}</category>
${item.tags.map((tag, i) => `      <category domain="${item.tagUrls[i]}">${xmlEscape(tag)}</category>`).join('\n')}
      <description>${xmlEscape(item.summary)}</description>
      <content:encoded>${cdata(item.html)}</content:encoded>
    </item>`
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(`${SITE_NAME} ${SITE_NAME_EN}`)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>zh-CN</language>
    <copyright>${xmlEscape(`内容采用 CC BY-SA 4.0 授权（${CONTENT_LICENSE_URL}），个别文章以文末标注为准`)}</copyright>
    <managingEditor>${CONTACT_EMAIL} (TransCircle 项目组)</managingEditor>
    <webMaster>${CONTACT_EMAIL} (TransCircle 项目组)</webMaster>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <ttl>1440</ttl>
    <image>
      <url>${LOGO.url}</url>
      <title>${xmlEscape(`${SITE_NAME} ${SITE_NAME_EN}`)}</title>
      <link>${SITE_URL}</link>
    </image>
${itemXml}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
