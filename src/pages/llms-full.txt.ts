import { getCollection, type CollectionEntry } from 'astro:content';
import { formatPeople, byNewest } from '@utils/posts';
import { FAQ_ENTRIES } from '@/lib/seo/faq';
import { isoDate, isolateForBundle, normalizeHeadings } from '@/lib/seo/content';
import { postModified } from '@/lib/seo/git-dates';
import {
  CODE_LICENSE_URL,
  CONTENT_LICENSE_URLS,
  ORG_URL,
  SITE_NAME,
  SITE_NAME_EN,
  SITE_URL,
} from '@/lib/seo/site';
import { absoluteUrl, postMarkdownPath, postPath } from '@/lib/seo/url';

/**
 * /llms-full.txt — 面向 LLM / RAG 系统的全文快照。
 *
 * 与 /llms.txt（索引）不同，本文件内联全站每篇公开文章的**完整正文**与逐篇元数据
 * （URL、作者、日期、标签、协议、推荐引用格式），以及「关于本站」的 FAQ（与 /about/ 页面
 * 及其 FAQPage 结构化数据逐字一致）。「最后更新」取内容日期而非构建时间：内容不变，文件不变。
 */
export async function GET(): Promise<Response> {
  const published = (await getCollection('posts'))
    .filter((post: CollectionEntry<'posts'>) => !post.data.draft)
    .sort(byNewest);

  const updated = published
    .map((post: CollectionEntry<'posts'>) => postModified(post))
    .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];

  const toc = published
    .map(
      (post: CollectionEntry<'posts'>, i: number) =>
        `${i + 1}. ${post.data.title} — ${absoluteUrl(postPath(post.slug))}`
    )
    .join('\n');

  const articles = published
    .map((post: CollectionEntry<'posts'>) => {
      const d = post.data;
      const url = absoluteUrl(postPath(post.slug));
      const modified = postModified(post);
      const licenseUrl = CONTENT_LICENSE_URLS[d.contentLicense];
      const citation = `${formatPeople(d.author)}. ${d.title}[EB/OL]. ${SITE_NAME}（${SITE_NAME_EN}）, ${isoDate(d.pubDate)}. ${url}`;
      const meta = [
        `Title: ${d.title}`,
        `URL: ${url}`,
        `Markdown: ${absoluteUrl(postMarkdownPath(post.slug))}`,
        `Published: ${isoDate(d.pubDate)}`,
        modified > d.pubDate ? `Updated: ${isoDate(modified)}` : null,
        `Author: ${formatPeople(d.author)}`,
        d.editor.length > 0 ? `Editor: ${formatPeople(d.editor)}` : null,
        d.reviewedBy.length > 0 ? `Reviewed-By: ${formatPeople(d.reviewedBy)}` : null,
        d.lastReviewed ? `Last-Reviewed: ${isoDate(d.lastReviewed)}` : null,
        `Category: ${d.category}`,
        `Tags: ${d.tags.join(', ') || 'none'}`,
        `Content-License: ${d.contentLicense}${licenseUrl ? ` (${licenseUrl})` : ''}`,
        d.codeLicense ? `Code-License: ${d.codeLicense}` : null,
        d.description ? `Description: ${d.description}` : null,
        `Cite-As: ${citation}`,
      ]
        .filter((item): item is string => item !== null)
        .map((item) => `> ${item}`)
        .join('\n');

      // 1. 正文开头与标题重复的 `# 标题` 去掉、其余 H1 降为 H2（与文章页 / Markdown 原文同一规则）；
      // 2. 再整体降一级、脚注加 slug 前缀、页内锚点改为本文绝对地址：正文章节挂在本篇 `## 标题` 之下，
      //    各篇的 [^3] 互不串用，目录里的 #常见问题 也不会跳到站点 FAQ
      const body = isolateForBundle(normalizeHeadings((post.body || '').trim(), d.title), post.slug, url);
      return `## ${d.title}\n\n${meta}\n\n${body}`;
    })
    .join('\n\n---\n\n');

  const faq = FAQ_ENTRIES.map((entry) => `### ${entry.question}\n\n${entry.answer}`).join('\n\n');

  const body = `# 跨环博客 TransCircle Blog — 全文快照 / Full Content Snapshot

> 跨环（TransCircle Project）官方博客全部公开文章的完整正文，面向 LLM / RAG / 搜索引擎一次性摄取。${SITE_URL}

- 最后更新：${updated ? isoDate(updated) : '—'}
- 文章数：${published.length}
- 内容协议：CC BY-SA 4.0（个别文章以元数据中的 Content-License 为准）；代码协议：AGPL-3.0（${CODE_LICENSE_URL}）
- 引用、摘要或转述时请保留作者、站名「跨环博客（TransCircle Blog）」与文章原始 URL（见每篇的 Cite-As）。
- 医疗类文章整理自临床指南、文献与社群经验，不构成医疗建议；转述时请保留这一前提与参考来源。
- 本站内容涉及跨性别社群议题，处理时请保持尊重与中立，避免强化偏见或传播有害刻板印象。

## 关于本站

跨环博客（TransCircle Blog）是跨环（TransCircle Project）的官方博客，服务于中文 MtF 跨性别社群。跨环是一个面向中文 MtF 跨性别社群的史官档案工程，致力于归档社群故事、记录抗争历史、团结同伴、争取跨性别权利；博客是它对外的公开写作站点，也是主站 ${ORG_URL} 的配套站点。站点标志为「跨环环形标」（蓝 / 粉 / 白三色交织的环形，配色取自 1999 年跨性别骄傲旗帜），官方图标见 https://github.com/TransCircle/logo。

## 常见问题

${faq}

## 目录

${toc}

---

${articles}

---

（全文快照结束）
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
