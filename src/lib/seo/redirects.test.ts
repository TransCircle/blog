import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPostFiles } from './post-files';
import {
  LEGACY_TAGS,
  MAX_DYNAMIC_REDIRECTS,
  MAX_REDIRECT_LINE,
  MAX_STATIC_REDIRECTS,
  RENAMED_POSTS,
  buildRedirects,
  countRedirects,
  matchRedirect,
  serializeRedirects,
  splitOverlong,
  validateRedirects,
} from './redirects';
import { postMarkdownPath, postPath, tagPath } from './url';

const posts = readPostFiles(path.resolve(process.cwd(), 'src/content/posts')).filter((p) => !p.draft);
const tags = [...new Set(posts.flatMap((p) => p.tags))];
const rules = buildRedirects({ posts, tags });

/** 模拟构建产物：每篇文章、每个标签、各列表页与文件端点。 */
const existing = new Set<string>([
  '/',
  '/tags/',
  '/about/',
  '/authors/',
  '/search/',
  '/rss.xml',
  '/atom.xml',
  '/sitemap-index.xml',
  ...posts.flatMap((p) => [postPath(p.slug), postMarkdownPath(p.slug), `/print/${p.slug}.pdf`]),
  ...tags.map((t) => decodeURIComponent(tagPath(t))),
]);
// validateRedirects 传入的已是解码后的路径
const exists = (p: string): boolean => existing.has(p);

const target = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;

describe('_redirects 规则', () => {
  it('读到了全部文章', () => {
    expect(posts.length).toBeGreaterThanOrEqual(9);
  });

  it('来源不遮蔽现存页面、目标都存在、没有链式跳转', () => {
    expect(validateRedirects(rules, exists)).toEqual([]);
  });

  it('Search Console 报 404 的旧标签全部 301 到现行标签', () => {
    expect(target('/tags/HRT/')).toBe(tagPath('GAHT'));
    expect(target('/tags/HRT')).toBe(tagPath('GAHT'));
    expect(target('/tags/astro/')).toBe(tagPath('Astro'));
    expect(target('/tags/design-system/')).toBe(tagPath('设计规范'));
    expect(target('/tags/历史记载/')).toBe(tagPath('争议'));
    expect(target(`/tags/${encodeURIComponent('历史记载')}/`)).toBe(tagPath('争议'));
    expect(target('/tags/wiki/')).toBe('/tags/');
    for (const legacy of Object.keys(LEGACY_TAGS)) {
      expect(target(`/tags/${legacy}/`), legacy).toBeDefined();
    }
  });

  it('改名文章的旧 URL 指向新文章', () => {
    for (const [oldStem, slug] of Object.entries(RENAMED_POSTS)) {
      expect(target(`/posts/${oldStem}/`)).toBe(postPath(slug));
      expect(target(`/posts/${encodeURIComponent(oldStem)}/`)).toBe(postPath(slug));
      expect(target(`/posts/${oldStem}.md/`)).toBe(postPath(slug));
    }
  });

  it('早期 /posts/<文件名>.md/ 路由与大小写不同的 slug 都被合并', () => {
    expect(target('/posts/project-kickoff.md/')).toBe(postPath('project-kickoff'));
    expect(target('/posts/HRT-choices-individual-differences/')).toBe(
      postPath('hrt-choices-individual-differences')
    );
    // 旧版 Markdown 原文地址 → 新地址（llms.txt 约定的 index.html.md）
    expect(target('/posts/project-kickoff.md')).toBe(postMarkdownPath('project-kickoff'));
    expect(target('/posts/HRT-choices-individual-differences.md')).toBe(
      postMarkdownPath('hrt-choices-individual-differences')
    );
    // 新地址本身不能被重定向
    expect(target(postMarkdownPath('project-kickoff'))).toBeUndefined();
  });

  it('打印视图与常见猜测路径', () => {
    expect(target('/print/project-kickoff/')).toBe(postPath('project-kickoff'));
    expect(target('/sitemap.xml')).toBe('/sitemap-index.xml');
    expect(target('/feed/')).toBe('/rss.xml');
    expect(target('/posts/')).toBe('/');
    // 不存在的 /page/… 与 /tag/<未知> 不重定向（返回真实 404，避免软 404 与 301 → 404）
    expect(matchRedirect(rules, '/page/arbitrary/')).toBeNull();
    expect(matchRedirect(rules, '/tag/not-a-tag/')).toBeNull();
    expect(countRedirects(rules).dynamic).toBe(0);
  });

  it('单数写法的旧标签一跳直达（不经通配规则再跳一次）', () => {
    expect(target('/tag/astro/')).toBe(tagPath('Astro'));
    expect(target('/tag/HRT/')).toBe(tagPath('GAHT'));
    expect(matchRedirect(rules, '/tag/astro/')?.to).toBe(tagPath('Astro'));
    // 现行标签也有显式的单数写法规则
    expect(target('/tag/GAHT/')).toBe(tagPath('GAHT'));
  });

  it('校验能发现经通配规则形成的链式跳转', () => {
    const bad = [
      { from: '/tags/old/', to: '/tags/new/', status: 301 as const },
      { from: '/tag/:name/', to: '/tags/:name/', status: 301 as const },
    ];
    const problems = validateRedirects(bad, () => true, []).map((p) => p.problem);
    expect(problems.some((p) => p.includes('/tag/old/'))).toBe(true);
  });

  it('规则数在 Cloudflare 上限内', () => {
    const counts = countRedirects(rules);
    expect(counts.static).toBeLessThanOrEqual(MAX_STATIC_REDIRECTS);
    expect(counts.dynamic).toBeLessThanOrEqual(MAX_DYNAMIC_REDIRECTS);
  });

  it('每条规则都是 301', () => {
    expect(rules.every((r) => r.status === 301)).toBe(true);
  });

  it('序列化为 Cloudflare 格式', () => {
    const text = serializeRedirects(rules);
    expect(text).toContain(`/tags/HRT/ ${tagPath('GAHT')} 301`);
  });
});

describe('第 16 轮回归', () => {
  it('补充别名不会撞上另一篇现存文章的地址（slug guide 与 guide.md 并存）', () => {
    const rules = buildRedirects({
      posts: [
        { slug: 'guide', fileStem: 'guide', title: 'A' },
        { slug: 'guide.md', fileStem: 'other', title: 'B' },
      ],
      tags: [],
      history: { posts: {}, renames: {}, tags: [], tagRenames: {} },
    });
    expect(rules.some((r) => r.from === '/posts/guide.md/' || r.from === '/posts/guide.md')).toBe(false);
  });

  it('超过 1000 字符的规则被拆出来（不写进 _redirects）', () => {
    const tag = '文'.repeat(70);
    const rules = buildRedirects({ posts: [], tags: [tag], history: { posts: {}, renames: {}, tags: [], tagRenames: {} } });
    const { kept, overlong } = splitOverlong(rules);
    expect(overlong.length).toBeGreaterThan(0);
    expect(kept.every((r) => `${r.from} ${r.to} ${r.status}`.length <= MAX_REDIRECT_LINE)).toBe(true);
  });
});
