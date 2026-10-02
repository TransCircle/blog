import { getFeedItems } from '@/lib/feed';
import { LOGO, SITE_DESCRIPTION, SITE_LANGUAGE, SITE_NAME, SITE_NAME_EN, SITE_URL } from '@/lib/seo/site';
import { absoluteUrl } from '@/lib/seo/url';

/**
 * /feed.json — JSON Feed 1.1（https://www.jsonfeed.org/version/1.1/），含全文。
 */
export async function GET(): Promise<Response> {
  const items = await getFeedItems();

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${SITE_NAME} ${SITE_NAME_EN}`,
    home_page_url: SITE_URL,
    feed_url: absoluteUrl('/feed.json'),
    description: SITE_DESCRIPTION,
    icon: LOGO.url,
    favicon: absoluteUrl('/favicon-96x96.png'),
    language: SITE_LANGUAGE,
    authors: [{ name: 'TransCircle 项目组', url: 'https://transcircle.org/' }],
    items: items.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      summary: item.summary,
      content_html: item.html,
      image: item.image,
      date_published: item.published.toISOString(),
      date_modified: item.updated.toISOString(),
      authors: item.authors.map((a) => ({ name: a.name, ...(a.link ? { url: a.link } : {}) })),
      tags: [item.category, ...item.tags],
      language: SITE_LANGUAGE,
      // JSON Feed 扩展字段（以下划线开头）：每篇文章自己的内容协议
      _license: {
        content: { name: item.licenseName, ...(item.licenseUrl ? { url: item.licenseUrl } : {}) },
        ...(item.codeLicense
          ? { code: { name: item.codeLicense.name, ...(item.codeLicense.url ? { url: item.codeLicense.url } : {}) } }
          : {}),
      },
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
  });
}
