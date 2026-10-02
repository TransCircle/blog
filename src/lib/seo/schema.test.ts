import { describe, expect, it } from 'vitest';
import { FAQ_ENTRIES } from './faq';
import {
  BLOG_ID,
  blogNode,
  itemListNode,
  blogPostingNode,
  breadcrumbNode,
  buildGraph,
  faqPageNodes,
  organizationNode,
  personNode,
  primaryImageNode,
  serializeJsonLd,
  webPageNode,
  websiteNode,
  type JsonLdNode,
} from './schema';
import { ORG_ALTERNATE_NAMES, ORG_ID, SOCIAL_PROFILES } from './site';
import { resolvePerson } from '../authors';
import { absoluteUrl, postMarkdownPath } from './url';

/** 收集图中所有「定义」的 @id 与所有「引用」（只有 @id 一个键的对象）。 */
function collect(graph: JsonLdNode): { ids: Set<string>; refs: string[] } {
  const ids = new Set<string>();
  const refs: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const keys = Object.keys(record);
    const id = record['@id'];
    if (typeof id === 'string') {
      if (keys.length === 1) refs.push(id);
      else ids.add(id);
    }
    for (const key of keys) if (key !== '@id') visit(record[key]);
  };
  visit(graph);
  return { ids, refs };
}

function expectResolved(graph: JsonLdNode): void {
  const { ids, refs } = collect(graph);
  const missing = refs.filter((r) => !ids.has(r));
  expect(missing).toEqual([]);
}

const postUrl = 'https://blog.transcircle.org/posts/demo/';
const image = 'https://blog.transcircle.org/og/demo.png?v=2';

function articleGraph(): JsonLdNode {
  const { article, people } = blogPostingNode({
    url: postUrl,
    title: '示例文章',
    description: '示例描述',
    datePublished: new Date('2026-06-01T00:00:00Z'),
    dateModified: new Date('2026-07-01T00:00:00Z'),
    authors: [resolvePerson('axzameyzed'), resolvePerson('transcircle-copywriting')],
    editors: [resolvePerson('axzameyzed')],
    tags: ['GAHT'],
    tagUrls: ['https://blog.transcircle.org/tags/GAHT/'],
    category: '跨性别医疗',
    wordCount: 1200,
    timeRequired: 'PT3M',
    imageUrl: image,
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    markdownUrl: absoluteUrl(postMarkdownPath('demo')),
    pdfUrl: 'https://blog.transcircle.org/print/demo.pdf',
    citations: [{ name: '文献', url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }],
  });
  const crumbs = [
    { name: '首页', url: 'https://blog.transcircle.org/' },
    { name: '示例文章', url: postUrl },
  ];
  return buildGraph([
    organizationNode(),
    websiteNode(),
    webPageNode({
      url: postUrl,
      title: '示例文章',
      description: '示例描述',
      type: 'ItemPage',
      imageUrl: image,
      breadcrumbs: crumbs,
      mainEntityId: String(article['@id']),
    }),
    primaryImageNode(postUrl, image, 'alt'),
    breadcrumbNode(postUrl, crumbs),
    blogNode(),
    article,
    ...people,
  ]);
}

describe('JSON-LD 图', () => {
  it('文章页所有 @id 引用都能在本页解析', () => {
    expectResolved(articleGraph());
  });

  it('首页（Blog + ItemList）所有引用都能解析，且不含缺字段的 BlogPosting 摘要', () => {
    const home = 'https://blog.transcircle.org/';
    const graph = buildGraph([
      organizationNode(),
      websiteNode(),
      webPageNode({ url: home, title: 't', description: 'd', type: 'CollectionPage', mainEntityId: BLOG_ID }),
      blogNode(),
      itemListNode(home, '全部文章', [{ url: postUrl, name: '示例' }]),
    ]);
    expectResolved(graph);
    expect((graph['@graph'] as JsonLdNode[]).some((n) => n['@type'] === 'BlogPosting')).toBe(false);
  });

  it('关于页 FAQPage 与可见 FAQ 数据一致', () => {
    const url = 'https://blog.transcircle.org/about/';
    const faq = faqPageNodes(url, FAQ_ENTRIES);
    const questions = faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    expect(questions.map((q) => q.name)).toEqual(FAQ_ENTRIES.map((e) => e.question));
    expect(questions.map((q) => q.acceptedAnswer.text)).toEqual(FAQ_ENTRIES.map((e) => e.answer));
  });

  it('同一 @id 只输出一次', () => {
    const graph = buildGraph([organizationNode(), organizationNode()]);
    expect((graph['@graph'] as unknown[]).length).toBe(1);
  });

  it('团队编辑写在 contributor（editor 只接受 Person）', () => {
    const { article } = blogPostingNode({
      url: postUrl,
      title: 't',
      description: 'd',
      datePublished: new Date('2026-06-01T00:00:00Z'),
      dateModified: new Date('2026-06-01T00:00:00Z'),
      authors: [resolvePerson('axzameyzed')],
      editors: [resolvePerson('yangyanh5'), resolvePerson('transcircle-copywriting')],
      tags: [],
      tagUrls: [],
      category: 'c',
      wordCount: 1,
      timeRequired: 'PT1M',
      imageUrl: image,
      markdownUrl: absoluteUrl(postMarkdownPath('demo')),
      pdfUrl: 'https://blog.transcircle.org/print/demo.pdf',
      citations: [],
    });
    expect(article.editor).toEqual([{ '@id': 'https://blog.transcircle.org/authors/yangyanh5/#person' }]);
    expect(article.contributor).toEqual([{ '@id': 'https://blog.transcircle.org/authors/transcircle-copywriting/#person' }]);
  });

  it('作者与编辑是同一人时只输出一个 Person', () => {
    const graph = articleGraph();
    const people = (graph['@graph'] as JsonLdNode[]).filter((n) => n['@type'] === 'Person');
    expect(people).toHaveLength(1);
  });
});

describe('组织实体与主站一致', () => {
  it('@id、别名与 sameAs 取自 site.ts', () => {
    const org = organizationNode();
    expect(org['@id']).toBe('https://transcircle.org/#organization');
    expect(org['@id']).toBe(ORG_ID);
    expect(org.alternateName).toEqual([...ORG_ALTERNATE_NAMES]);
    expect(org.sameAs).toEqual([...SOCIAL_PROFILES]);
  });

  it('署名实体来自登记表：团队为 Organization，个人为 Person，外部主页进 sameAs', () => {
    expect(personNode(resolvePerson('transcircle-team'))['@type']).toBe('Organization');
    // 团队登记的是母组织的链接，不能声明为同一实体
    expect(personNode(resolvePerson('transcircle-team')).sameAs).toBeUndefined();
    const person = personNode(resolvePerson('liwanmiaohy'));
    expect(person['@type']).toBe('Person');
    expect(person['@id']).toBe('https://blog.transcircle.org/authors/liwanmiaohy/#person');
    expect(person.url).toBe('https://blog.transcircle.org/authors/liwanmiaohy/');
    expect(person.sameAs).toEqual(['https://x.com/liwanmiaohy']);
  });
});

describe('serializeJsonLd', () => {
  it('转义 < > &，正文里的 </script> 不会闭合脚本', () => {
    const out = serializeJsonLd({ text: '</script><b>&' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(JSON.parse(out)).toEqual({ text: '</script><b>&' });
  });
});

describe('FAQ 数据', () => {
  it('锚点 id 唯一，问答非空', () => {
    const ids = FAQ_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of FAQ_ENTRIES) {
      expect(entry.question.length).toBeGreaterThan(4);
      expect(entry.answer.length).toBeGreaterThan(20);
    }
  });
});
