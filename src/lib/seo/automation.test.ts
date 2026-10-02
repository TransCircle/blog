import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { absolutizeHtml, extractImages, footnotePrefix, isolateForBundle, normalizeHeadings } from './content';
import { splitFrontmatter, toDate, toPeople } from './post-files';
import { postSlug } from './frontmatter';
import {
  bodyOf,
  contentModifiedDates,
  frontmatterLines,
  isContentCommit,
  isLaterDay,
  resolveModified,
} from './git-dates';
import { parseNameStatus } from './git';
import { readPostFiles } from './post-files';
import { authorPath, authorSlug } from './url';
import { collectAuthors } from '../../utils/authors';
import { getAuthor, resolvePerson, validateRegistry } from '../authors';
import { rehypeDemoteH1 } from '../markdown/rehype-image-attributes.mjs';
import rehypeStripUnsafe from '../markdown/rehype-strip-unsafe.mjs';
import rehypeExternalLinks from '../markdown/rehype-external-links.mjs';

const d = (s: string): Date => new Date(s);

describe('自动修改日期', () => {
  it('维护性提交（style / refactor …）不算内容更新', () => {
    expect(isContentCommit(':lipstick: style(posts): add spaces')).toBe(false);
    expect(isContentCommit(':recycle: refactor(posts): normalize footnotes')).toBe(false);
    expect(isContentCommit(':memo: docs(posts): add unit conversions')).toBe(true);
    expect(isContentCommit(':bug: fix(posts): correct dosage')).toBe(true);
    expect(isContentCommit('Add files via upload')).toBe(true);
  });

  it('解析提交列表：新建、修改、改名、删除都带上前后路径', () => {
    const log = [
      'commit h3 2026-07-20T10:00:00+08:00 :memo: docs(posts): 正文修订',
      '',
      'M\tsrc/content/posts/a.md',
      'commit h2 2026-07-10T10:00:00+08:00 Rename file',
      '',
      'R095\tsrc/content/posts/旧名.md\tsrc/content/posts/b.md',
      'commit h1 2026-07-01T10:00:00+08:00 :sparkles: feat(posts): 新文章',
      '',
      'A\tsrc/content/posts/a.md',
      'D\tsrc/content/posts/c.md',
      'M\tsrc/content/posts/not-markdown.txt',
    ].join('\n');
    expect(parseNameStatus(log).map((c) => [c.hash, c.status, c.oldPath, c.newPath])).toEqual([
      ['h3', 'M', 'src/content/posts/a.md', 'src/content/posts/a.md'],
      ['h2', 'R', 'src/content/posts/旧名.md', 'src/content/posts/b.md'],
      ['h1', 'A', null, 'src/content/posts/a.md'],
      ['h1', 'D', 'src/content/posts/c.md', null],
    ]);
  });

  it('按每个版本自己的 frontmatter 边界比较正文', () => {
    const v1 = '---\ntitle: a\n---\n正文第一行\n';
    const v2 = '---\ntitle: a\ntags: [x, y]\ncategory: 新分类\n---\n正文第一行';
    const v3 = '---\ntitle: a\n---\n正文第一行（修订）\n';
    expect(bodyOf(v1)).toBe(bodyOf(v2)); // 只改 frontmatter（而且变长了）
    expect(bodyOf(v1)).not.toBe(bodyOf(v3));
  });

  it('本仓库：维护性提交与只改 frontmatter 的提交不产生修改日期', () => {
    const dates = contentModifiedDates(process.cwd());
    for (const date of dates.values()) expect(date.getTime()).toBeLessThanOrEqual(Date.now());
    // 9402486（:recycle: refactor 整理标签）只动了 frontmatter，不应让 re-issues-28 晚于 2026-07-14
    const reIssues = dates.get('re-issues-28');
    if (reIssues) expect(reIssues.getTime()).toBeLessThan(new Date('2026-07-14T00:00:00Z').getTime());
  });

  it('修改时间取 pubDate / updatedDate / git 的最晚者，发布 24 小时内的 git 修改不算', () => {
    const pub = d('2026-06-01T00:00:00Z');
    expect(resolveModified(pub, undefined, d('2026-06-01T12:00:00Z'))).toEqual(pub);
    expect(resolveModified(pub, undefined, d('2026-06-10T00:00:00Z'))).toEqual(d('2026-06-10T00:00:00Z'));
    expect(resolveModified(pub, d('2026-06-20T00:00:00Z'), d('2026-06-10T00:00:00Z'))).toEqual(d('2026-06-20T00:00:00Z'));
    expect(isLaterDay(d('2026-06-02T00:00:00Z'), pub)).toBe(true);
    expect(isLaterDay(d('2026-06-01T23:00:00Z'), pub)).toBe(false);
  });

  it('frontmatter 行数', () => {
    expect(frontmatterLines('---\ntitle: a\n---\n正文')).toBe(3);
    expect(frontmatterLines('正文')).toBe(0);
  });
});

describe('作者页', () => {
  it('作者页 URL 用作者 id', () => {
    expect(authorPath('axzameyzed')).toBe('/authors/axzameyzed/');
    expect(authorSlug('Oakley Huang')).toBe('oakley-huang');
  });

  it('汇总作者与编辑（按 id），同篇既是作者又是编辑只算作者', () => {
    const a = resolvePerson('axzameyzed');
    const b = resolvePerson('yangyanh5');
    const posts = [
      { data: { author: [a], editor: [a, b] } },
      { data: { author: [b], editor: [] } },
    ];
    const profiles = collectAuthors(posts);
    const pa = profiles.find((p) => p.author.id === 'axzameyzed');
    const pb = profiles.find((p) => p.author.id === 'yangyanh5');
    expect(pa?.authored).toHaveLength(1);
    expect(pa?.edited).toHaveLength(0);
    expect(pb?.authored).toHaveLength(1);
    expect(pb?.edited).toHaveLength(1);
  });

  it('构建配置层读出每篇文章的作者 id，且全部已登记', () => {
    const files = readPostFiles(path.resolve(process.cwd(), 'src/content/posts'));
    const hrt = files.find((f) => f.slug === 'hrt-choices-individual-differences');
    expect(hrt?.people).toEqual(['liwanmiaohy', 'axzameyzed', 'yangyanh5']);
    for (const f of files) {
      expect(f.people.length).toBeGreaterThan(0);
      for (const id of f.people) expect(getAuthor(id), `${f.fileStem}: ${id}`).toBeDefined();
    }
  });
});

describe('作者登记表', () => {
  it('当前 authors.json 通过校验', () => {
    expect(validateRegistry({ authors: [] })).toEqual([]);
  });

  it('能发现重复 id、非法 id、非 http 链接与名称冲突', () => {
    const problems = validateRegistry({
      authors: [
        { id: 'a', name: '甲', type: 'person', links: { x: 'javascript:alert(1)' } },
        { id: 'a', name: '乙', type: 'person' },
        { id: 'Bad Id', name: '丙', type: 'robot' },
        { id: 'd', name: '丁', type: 'person', aliases: ['甲'] },
        { id: 'e', name: 'Alex Smith', type: 'person' },
        { id: 'f', name: 'alex-smith', type: 'person' },
      ],
    });
    expect(problems.join('\n')).toMatch(/http\(s\)/);
    expect(problems.join('\n')).toMatch(/id 重复/);
    expect(problems.join('\n')).toMatch(/id 只能用/);
    expect(problems.join('\n')).toMatch(/type 只能是/);
    expect(problems.join('\n')).toMatch(/冲突/);
    // 「Alex Smith」与「alex-smith」归一化后是同一个旧 URL
    expect(problems.some((p) => p.includes('（f）') && p.includes('冲突'))).toBe(true);
  });
});

describe('Feed 中的相对地址', () => {
  it('以文章 URL 为基准解析根相对、普通相对与锚点，已带协议的不动', () => {
    const page = 'https://blog.transcircle.org/posts/current/';
    const html = [
      '<a href="../project-kickoff/">a</a>',
      '<a href="/tags/GAHT/">b</a>',
      '<a href="#user-content-fn-3">c</a>',
      '<img src="/images/x.png">',
      '<a href="https://example.org/">d</a>',
      '<a href="mailto:team@transcircle.org">e</a>',
      '<img src="//cdn.example.org/y.png">',
    ].join('');
    const out = absolutizeHtml(html, page);
    expect(out).toContain('href="https://blog.transcircle.org/posts/project-kickoff/"');
    expect(out).toContain('href="https://blog.transcircle.org/tags/GAHT/"');
    expect(out).toContain('href="https://blog.transcircle.org/posts/current/#user-content-fn-3"');
    expect(out).toContain('src="https://blog.transcircle.org/images/x.png"');
    expect(out).toContain('href="https://example.org/"');
    expect(out).toContain('href="mailto:team@transcircle.org"');
    expect(out).toContain('src="https://cdn.example.org/y.png"');
  });
});

describe('slug 与日期规则（与 Astro / 内容集合一致）', () => {
  it('slug 用 github-slugger，frontmatter 的 slug 优先', () => {
    expect(postSlug('Blood Test')).toBe('blood-test');
    expect(postSlug('100%proof')).toBe('100proof');
    expect(postSlug('HRT-choices-individual-differences')).toBe('hrt-choices-individual-differences');
    expect(postSlug('any-name', { slug: 'custom' })).toBe('custom');
  });

  it('仅日期值一律按 UTC 零点（不受构建机时区影响），容忍未补零', () => {
    expect(toDate('2026-06-7')?.toISOString()).toBe('2026-06-07T00:00:00.000Z');
    expect(toDate('2026-06-07')?.toISOString()).toBe('2026-06-07T00:00:00.000Z');
    expect(toDate('2026-05-21T00:00:00Z')?.toISOString()).toBe('2026-05-21T00:00:00.000Z');
    expect(toDate('not a date')).toBeNull();
  });

  it('文件开头带 UTF-8 BOM 的 frontmatter 照常解析（与 Astro 一致）', () => {
    const { data, body } = splitFrontmatter(`\uFEFF---
title: 'x'
tags: ['GAHT']
---
正文
`);
    expect(data.tags).toEqual(['GAHT']);
    expect(body).toBe('正文\n');
  });

  it('没写时区的日期时间也按 UTC（与 Astro 对未加引号 YAML 时间戳的解析一致）', () => {
    expect(toDate('2026-10-01T00:30:00')?.toISOString()).toBe('2026-10-01T00:30:00.000Z');
    expect(toDate('2026-10-01 0:30')?.toISOString()).toBe('2026-10-01T00:30:00.000Z');
    expect(toDate('2026-10-01T00:30:00+08:00')?.toISOString()).toBe('2026-09-30T16:30:00.000Z');
  });
});

describe('构建配置层的 frontmatter 解析（YAML）', () => {
  it('不带引号的署名与标签也能读出', () => {
    const { data } = splitFrontmatter('---\ntitle: 标题\nauthor: liwanmiaohy\neditor:\n  - axzameyzed\n  - "yangyanh5"\ntags: [GAHT, 血检]\npubDate: 2026-06-7\n---\n正文');
    expect(toPeople(data.author)).toEqual(['liwanmiaohy']);
    expect(toPeople(data.editor)).toEqual(['axzameyzed', 'yangyanh5']);
    expect(data.tags).toEqual(['GAHT', '血检']);
    expect(toDate(data.pubDate)?.toISOString()).toBe('2026-06-07T00:00:00.000Z');
  });
});

describe('llms-full 拼接前的隔离', () => {
  it('脚注加文章前缀、标题降一级、页内锚点改为本文绝对地址，代码块原样保留', () => {
    const body = '## 小节\n\n正文[^3]，见[常见问题](#常见问题)。\n\n[^3]: 文献\n\n```md\n## 不动 [^3](#x)\n```';
    const p = footnotePrefix('post-a');
    expect(p).toMatch(/^post-a-[0-9a-f]{8}$/);
    expect(isolateForBundle(body, 'post-a', 'https://b.org/posts/a/')).toBe(
      `### 小节\n\n正文[^${p}-3]，见[常见问题](https://b.org/posts/a/#常见问题)。\n\n[^${p}-3]: 文献\n\n\`\`\`md\n## 不动 [^3](#x)\n\`\`\``
    );
  });

  it('不同的中文 slug 得到不同的脚注前缀（不会撞车）', () => {
    expect(footnotePrefix('甲文')).not.toBe(footnotePrefix('乙文'));
    expect(footnotePrefix('甲文')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('Markdown 原文的标题规范化', () => {
  it('去掉与标题相同的开头 H1，其余 H1 降级，代码块不动', () => {
    const body = '# 标题\n\n正文\n\n# 另一节\n\n```bash\n# 注释\n```';
    expect(normalizeHeadings(body, '标题')).toBe('正文\n\n## 另一节\n\n```bash\n# 注释\n```');
  });
});

describe('正文 HTML 安全兜底', () => {
  it('删除 script / iframe、事件属性与 javascript: 链接，保留正常结构', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'script', properties: {}, children: [] },
        { type: 'element', tagName: 'iframe', properties: { src: 'https://x' }, children: [] },
        { type: 'element', tagName: 'img', properties: { src: '/images/a.png', alt: 'a', onError: 'alert(1)' }, children: [] },
        { type: 'element', tagName: 'a', properties: { href: ' JaVaScRiPt:alert(1)' }, children: [] },
        { type: 'element', tagName: 'a', properties: { href: 'https://ok.example' }, children: [] },
        { type: 'element', tagName: 'div', properties: { className: ['callout'] }, children: [] },
      ],
    };
    rehypeStripUnsafe()(tree, { path: 'x.md' });
    expect(tree.children.map((c) => c.tagName)).toEqual(['img', 'a', 'a', 'div']);
    expect(tree.children[0]?.properties).toEqual({ src: '/images/a.png', alt: 'a' });
    expect(tree.children[1]?.properties).toEqual({});
    expect(tree.children[2]?.properties).toEqual({ href: 'https://ok.example' });
  });
});

describe('正文外链 rel', () => {
  it('外链补 nofollow noopener noreferrer，保留已有 rel；自家站点与站内链接不动', () => {
    const a = (href: string, rel?: string) => ({
      type: 'element',
      tagName: 'a',
      properties: rel ? { href, rel: [rel] } : { href },
      children: [],
    });
    const tree = {
      type: 'root',
      children: [a('https://pubmed.ncbi.nlm.nih.gov/1/'), a('https://creativecommons.org/', 'license'), a('https://transcircle.org/'), a('/posts/x/'), a('#fn-1')],
    };
    rehypeExternalLinks()(tree);
    const rels = tree.children.map((c) => (c.properties as { rel?: string[] }).rel);
    expect(rels[0]).toEqual(['nofollow', 'noopener', 'noreferrer']);
    expect(rels[1]).toEqual(['license', 'nofollow', 'noopener', 'noreferrer']);
    expect(rels[2]).toBeUndefined();
    expect(rels[3]).toBeUndefined();
    expect(rels[4]).toBeUndefined();
  });
});

describe('正文配图与一级标题', () => {
  it('提取 Markdown 与 HTML 图片，去重', () => {
    const body = '![甲](/images/a.png)\n<img src="/images/b.png" alt="乙">\n![重复](/images/a.png)';
    expect(extractImages(body)).toEqual([
      { src: '/images/a.png', alt: '甲' },
      { src: '/images/b.png', alt: '乙' },
    ]);
  });

  it('与标题相同的 h1 删除，其余降为 h2', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'h1', children: [{ type: 'text', value: '标题' }] },
        { type: 'element', tagName: 'h1', children: [{ type: 'text', value: '别的' }] },
      ],
    };
    rehypeDemoteH1()(tree, { data: { astro: { frontmatter: { title: '标题' } } } });
    expect(tree.children.map((c) => c.tagName)).toEqual(['h2']);
  });
});
