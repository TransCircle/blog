/**
 * JSON-LD（schema.org）构建器。每个页面输出**一个** `@graph`，节点之间用 `@id` 互相引用，
 * 所有引用都能在同一页内解析（由 schema.test.ts 保证）。
 *
 * 组织实体沿用主站的 @id（https://transcircle.org/#organization），博客的 WebSite / Blog /
 * 文章节点都以它为 publisher，搜索引擎与 AI 会把两站归并到同一个实体下。
 */
import type { Citation } from './content';
import type { FaqEntry } from './faq';
import {
  CONTENT_LICENSE_URL,
  LOGO,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  ORG_ALTERNATE_NAMES,
  ORG_DESCRIPTION,
  ORG_FOUNDING_DATE,
  ORG_ID,
  ORG_NAME,
  ORG_URL,
  SISTER_SITES,
  SITE_DESCRIPTION,
  SITE_FOUNDING_DATE,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_NAME_EN,
  SITE_URL,
  SOCIAL_PROFILES,
} from './site';
import { authorLinks, type Author } from '../authors';
import { ABOUT_PATH, absoluteUrl, authorPath } from './url';

export type JsonLdNode = Record<string, unknown>;

export const WEBSITE_ID = `${SITE_URL}#website`;
export const BLOG_ID = `${SITE_URL}#blog`;
export const LOGO_ID = `${SITE_URL}#logo`;

export const webPageId = (url: string): string => `${url}#webpage`;
export const breadcrumbId = (url: string): string => `${url}#breadcrumb`;
export const articleId = (url: string): string => `${url}#article`;
export const primaryImageId = (url: string): string => `${url}#primaryimage`;
export const itemListId = (url: string): string => `${url}#itemlist`;
export const faqId = (url: string): string => `${url}#faq`;

const ref = (id: string): JsonLdNode => ({ '@id': id });

/* ── 人物 ──────────────────────────────────────────────── */

/** 署名输入：作者登记表条目（src/data/authors.json）。 */
export type PersonInput = Pick<Author, 'id' | 'name' | 'type' | 'bio' | 'links' | 'aliases'>;

/** 署名实体的 @id：挂在站内作者页上，全站各页引用同一个 @id，搜索引擎与 AI 会把它们归并为一个实体。 */
export const personId = (id: string): string => `${absoluteUrl(authorPath(id))}#person`;

/**
 * 个人为 Person（affiliation 指向跨环），项目内部团队为 Organization（parentOrganization 指向跨环）。
 * 信息只来自登记表，所以每一页对同一实体的描述完全一致。
 *
 * sameAs 表示「这些页面标识的是同一个实体」：个人的外部主页（X、GitHub、个人网站）确实就是本人，写进 sameAs；
 * 团队登记的链接是整个跨环组织的官网 / GitHub，标识的是母组织而不是这个小组，不能写进 sameAs
 * （否则等于声明「文案组就是跨环」）——团队与组织的关系只用 parentOrganization 表达，链接仅在作者页展示。
 */
export function personNode(author: PersonInput): JsonLdNode {
  const profileUrl = absoluteUrl(authorPath(author.id));
  const sameAs = author.type === 'team' ? [] : authorLinks(author as Author).map((l) => l.url);
  const common = {
    '@id': personId(author.id),
    name: author.name,
    ...(author.aliases.length > 0 ? { alternateName: [...author.aliases] } : {}),
    url: profileUrl,
    ...(author.bio ? { description: author.bio } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
  return author.type === 'team'
    ? { '@type': 'Organization', ...common, parentOrganization: ref(ORG_ID) }
    : { '@type': 'Person', ...common, affiliation: ref(ORG_ID) };
}

/** 作者页：ProfilePage，mainEntity 为该署名实体。 */
export function profilePageNodes(
  pageUrl: string,
  person: PersonInput,
  stats: { readonly articles: number; readonly latest?: Date | undefined }
): JsonLdNode[] {
  const node = personNode(person);
  return [
    {
      ...node,
      mainEntityOfPage: ref(webPageId(pageUrl)),
      ...(node['@type'] === 'Person'
        ? { agentInteractionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WriteAction', userInteractionCount: stats.articles } }
        : {}),
    },
  ];
}

/* ── 全站节点 ──────────────────────────────────────────── */

export function organizationNode(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ORG_NAME,
    alternateName: [...ORG_ALTERNATE_NAMES],
    url: ORG_URL,
    logo: {
      '@type': 'ImageObject',
      '@id': LOGO_ID,
      url: LOGO.url,
      contentUrl: LOGO.url,
      width: LOGO.width,
      height: LOGO.height,
      caption: '跨环环形标',
    },
    image: ref(LOGO_ID),
    description: ORG_DESCRIPTION,
    foundingDate: ORG_FOUNDING_DATE,
    sameAs: [...SOCIAL_PROFILES],
    knowsAbout: [
      '跨性别',
      'MtF 跨性别女性',
      '性别肯定激素治疗（GAHT）',
      '激素替代治疗（HRT）',
      '跨性别医疗',
      '跨性别社群档案',
      '跨性别历史',
      'transgender healthcare',
      'Chinese MtF transgender community',
    ],
    // 姊妹站的 @id 与主站 JSON-LD 里的 WebSite 节点一致（<url>#website）
    owns: [
      ...SISTER_SITES.map((site) => ({ '@type': 'WebSite', '@id': `${site.url}#website`, url: site.url, name: site.name })),
      ref(WEBSITE_ID),
    ],
  };
}

export function websiteNode(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    alternateName: [SITE_NAME_EN, `${SITE_NAME} ${SITE_NAME_EN}`],
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANGUAGE,
    publisher: ref(ORG_ID),
    copyrightHolder: ref(ORG_ID),
    copyrightYear: Number(SITE_FOUNDING_DATE.slice(0, 4)),
    dateCreated: SITE_FOUNDING_DATE,
    license: CONTENT_LICENSE_URL,
    isAccessibleForFree: true,
    publishingPrinciples: absoluteUrl(ABOUT_PATH),
    // Google 已停用站内搜索框富结果，但 Bing 等仍会读取；/search/ 可抓取（noindex），不构成冲突
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}search/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/* ── 页面级节点 ────────────────────────────────────────── */

export type WebPageType = 'WebPage' | 'CollectionPage' | 'AboutPage' | 'SearchResultsPage' | 'ItemPage' | 'ProfilePage';

export interface Breadcrumb {
  readonly name: string;
  readonly url: string;
}

export interface WebPageInput {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly type?: WebPageType | undefined;
  readonly imageUrl?: string | undefined;
  readonly breadcrumbs?: readonly Breadcrumb[] | undefined;
  readonly datePublished?: Date | undefined;
  readonly dateModified?: Date | undefined;
  /** 页面主体节点的 @id（文章、FAQ、列表）。 */
  readonly mainEntityId?: string | undefined;
  /** 审阅者实体的 @id（personId）。 */
  readonly reviewedBy?: readonly string[] | undefined;
  /** 最近一次审阅日期。 */
  readonly lastReviewed?: Date | undefined;
}

export function primaryImageNode(url: string, imageUrl: string, caption: string): JsonLdNode {
  return {
    '@type': 'ImageObject',
    '@id': primaryImageId(url),
    url: imageUrl,
    contentUrl: imageUrl,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    caption,
    inLanguage: SITE_LANGUAGE,
  };
}

export function webPageNode(page: WebPageInput): JsonLdNode {
  const hasCrumbs = (page.breadcrumbs?.length ?? 0) > 0;
  return {
    '@type': page.type ?? 'WebPage',
    '@id': webPageId(page.url),
    url: page.url,
    name: page.title,
    description: page.description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: ref(WEBSITE_ID),
    about: ref(ORG_ID),
    ...(page.imageUrl ? { primaryImageOfPage: ref(primaryImageId(page.url)), image: ref(primaryImageId(page.url)) } : {}),
    ...(hasCrumbs ? { breadcrumb: ref(breadcrumbId(page.url)) } : {}),
    ...(page.datePublished ? { datePublished: page.datePublished.toISOString() } : {}),
    ...(page.dateModified ? { dateModified: page.dateModified.toISOString() } : {}),
    ...(page.mainEntityId ? { mainEntity: ref(page.mainEntityId) } : {}),
    ...(page.reviewedBy && page.reviewedBy.length > 0 ? { reviewedBy: page.reviewedBy.map(ref) } : {}),
    ...(page.lastReviewed ? { lastReviewed: page.lastReviewed.toISOString().slice(0, 10) } : {}),
    potentialAction: [{ '@type': 'ReadAction', target: [page.url] }],
  };
}

export function breadcrumbNode(url: string, crumbs: readonly Breadcrumb[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId(url),
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export interface ListItemInput {
  readonly url: string;
  readonly name: string;
}

export function itemListNode(pageUrl: string, name: string, items: readonly ListItemInput[]): JsonLdNode {
  return {
    '@type': 'ItemList',
    '@id': itemListId(pageUrl),
    name,
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
    })),
  };
}

/**
 * 站点即「博客」实体。只描述博客本身，不内联文章：完整的 BlogPosting 只在各文章页输出
 * （Google 的 Article 结构化数据要求 author / image 等字段，列表页的简要节点达不到，反而会被判为不完整）。
 * 首页的文章列表用 ItemList 表达。
 */
export function blogNode(): JsonLdNode {
  return {
    '@type': 'Blog',
    '@id': BLOG_ID,
    url: SITE_URL,
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANGUAGE,
    isPartOf: ref(WEBSITE_ID),
    publisher: ref(ORG_ID),
    license: CONTENT_LICENSE_URL,
  };
}

export interface BlogPostingInput {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly datePublished: Date;
  readonly dateModified: Date;
  readonly authors: readonly PersonInput[];
  readonly editors: readonly PersonInput[];
  readonly tags: readonly string[];
  readonly tagUrls: readonly string[];
  readonly category: string;
  readonly wordCount: number;
  readonly timeRequired: string;
  readonly imageUrl: string;
  readonly licenseUrl?: string | undefined;
  readonly markdownUrl: string;
  readonly pdfUrl: string;
  readonly citations: readonly Citation[];
  /** 正文配图（绝对 URL + alt）。 */
  readonly bodyImages?: ReadonlyArray<{ readonly url: string; readonly alt: string }> | undefined;
}

export function blogPostingNode(post: BlogPostingInput): { article: JsonLdNode; people: JsonLdNode[] } {
  const authorNodes = post.authors.map(personNode);
  const editorNodes = post.editors.map(personNode);
  const personEditors = editorNodes.filter((n) => n['@type'] === 'Person');
  const teamEditors = editorNodes.filter((n) => n['@type'] !== 'Person');
  // 同一人同时是作者和编辑时只输出一个节点
  const people = [...authorNodes, ...editorNodes].filter(
    (node, index, all) => all.findIndex((n) => n['@id'] === node['@id']) === index
  );

  const article: JsonLdNode = {
    '@type': 'BlogPosting',
    '@id': articleId(post.url),
    url: post.url,
    mainEntityOfPage: ref(webPageId(post.url)),
    isPartOf: [ref(BLOG_ID), ref(WEBSITE_ID)],
    headline: post.title.slice(0, 110),
    name: post.title,
    description: post.description,
    abstract: post.description,
    datePublished: post.datePublished.toISOString(),
    dateModified: post.dateModified.toISOString(),
    author: authorNodes.map((n) => ref(String(n['@id']))),
    // schema.org 的 editor 只接受 Person：个人编辑用 editor；团队编辑（Organization）改用 contributor，
    // 页面上的可见署名仍写作「编辑」，不为满足类型把团队伪装成个人
    ...(personEditors.length > 0 ? { editor: personEditors.map((n) => ref(String(n['@id']))) } : {}),
    ...(teamEditors.length > 0 ? { contributor: teamEditors.map((n) => ref(String(n['@id']))) } : {}),
    publisher: ref(ORG_ID),
    copyrightHolder: ref(ORG_ID),
    copyrightYear: post.datePublished.getUTCFullYear(),
    // 首图为分享卡片（1200×630），其后是正文配图：Google 建议提供多张、多比例的文章图片
    image: [
      ref(primaryImageId(post.url)),
      ...(post.bodyImages ?? []).map((img) => ({
        '@type': 'ImageObject',
        url: img.url,
        contentUrl: img.url,
        ...(img.alt ? { caption: img.alt } : {}),
      })),
    ],
    thumbnailUrl: post.imageUrl,
    keywords: post.tags.join(', '),
    about: post.tags.map((tag, index) => ({
      '@type': 'Thing',
      name: tag,
      url: post.tagUrls[index],
    })),
    articleSection: post.category,
    genre: post.category,
    wordCount: post.wordCount,
    timeRequired: post.timeRequired,
    inLanguage: SITE_LANGUAGE,
    isAccessibleForFree: true,
    ...(post.licenseUrl ? { license: post.licenseUrl } : {}),
    // 同一作品的其他格式：Markdown 原文（便于 AI 摄取）与 PDF
    encoding: [
      { '@type': 'MediaObject', contentUrl: post.markdownUrl, encodingFormat: 'text/markdown' },
      { '@type': 'MediaObject', contentUrl: post.pdfUrl, encodingFormat: 'application/pdf' },
    ],
    ...(post.citations.length > 0
      ? {
          citation: post.citations.map((c) => ({ '@type': 'CreativeWork', name: c.name, url: c.url })),
        }
      : {}),
  };

  return { article, people };
}

export function faqPageNodes(pageUrl: string, entries: readonly FaqEntry[]): JsonLdNode {
  return {
    '@type': 'FAQPage',
    '@id': faqId(pageUrl),
    url: pageUrl,
    inLanguage: SITE_LANGUAGE,
    isPartOf: ref(WEBSITE_ID),
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      '@id': `${pageUrl}#faq-${entry.id}`,
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/* ── 组装与序列化 ──────────────────────────────────────── */

export function buildGraph(nodes: readonly JsonLdNode[]): JsonLdNode {
  // 同一 @id 只保留第一次出现（例如列表页与文章页都可能带同一篇文章的摘要）
  const seen = new Set<string>();
  const graph = nodes.filter((node) => {
    const id = node['@id'];
    if (typeof id !== 'string') return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** 转义 `<`、`>`、`&`：正文里出现 `</script>` 也不会提前闭合脚本标签。 */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
