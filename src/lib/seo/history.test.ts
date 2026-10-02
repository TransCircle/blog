import { describe, expect, it } from 'vitest';
import { tagDescription } from '../../data/tag-descriptions';
import type { FileChange } from './git';
import { deriveHistory, mergeHistory, readGitHistory, serializeHistory, type UrlHistory } from './history';
import { slugProblem } from './frontmatter';
import { currentStems, parseNameStatus, readPostChanges, renamesOf } from './git';
import { buildExists, buildRedirects, countRedirects, matchRedirect, unresolvedPosts, validateRedirects } from './redirects';
import { postPath, tagPath } from './url';

const at = (s: string): Date => new Date(s);
const fm = (title: string, tags: string, extra = ''): string => `---\ntitle: '${title}'\n${tags}\n${extra}---\n正文\n`;

/** 从新到旧的改动与对应文件内容（模拟 git log --name-status + cat-file）。 */
const changes: FileChange[] = [
  { hash: 'c3', date: at('2026-07-03'), subject: 'x', status: 'M', oldPath: 'p/guide.md', newPath: 'p/guide.md' },
  { hash: 'c2', date: at('2026-07-02'), subject: 'x', status: 'D', oldPath: 'p/old-post.md', newPath: null },
  { hash: 'c2', date: at('2026-07-02'), subject: 'x', status: 'M', oldPath: 'p/long.md', newPath: 'p/long.md' },
  { hash: 'c1', date: at('2026-07-01'), subject: 'x', status: 'A', oldPath: null, newPath: 'p/guide.md' },
];
const blobs = new Map<string, string | null>([
  ['c3^:p/guide.md', fm('血检指南', "tags: ['HRT', '血检']")],
  ['c3:p/guide.md', fm('血检指南', "tags: ['GAHT', '血检']")],
  ['c2^:p/old-post.md', fm('被删掉的文章', "tags: ['随笔']", 'slug: custom-old\n')],
  // 块状 YAML 列表：被替换的标签远离 tags: 行（diff 上下文里看不到 tags:），整文件解析照样识别
  ['c2^:p/long.md', fm('长列表', 'tags:\n  - a\n  - b\n  - c\n  - d\n  - 旧标签')],
  ['c2:p/long.md', fm('长列表', 'tags:\n  - a\n  - b\n  - c\n  - d\n  - 新标签')],
  ['c1:p/guide.md', fm('血检指南', "tags: ['HRT']")],
]);

describe('由完整文件版本推导 git 历史', () => {
  const parsed = deriveHistory(changes, blobs);

  it('记录出现过的文章、最新标题与实际 slug（包括被删掉的、写过 frontmatter slug 的）', () => {
    expect(parsed.posts).toEqual({ guide: '血检指南', 'old-post': '被删掉的文章', long: '长列表' });
    expect(parsed.slugs).toEqual({ guide: ['guide'], 'old-post': ['custom-old'], long: ['long'] });
  });

  it('记录出现过的全部标签', () => {
    expect([...parsed.tags].sort()).toEqual(['GAHT', 'HRT', 'a', 'b', 'c', 'd', '新标签', '旧标签', '血检', '随笔'].sort());
  });

  it('同一次修改里删一个加一个，识别为标签替换（行内与块状列表都可以）', () => {
    expect(parsed.tagRenames).toEqual({ HRT: 'GAHT', 旧标签: '新标签' });
  });
});

describe('根据历史自动生成 301（无需手写规则）', () => {
  const posts = [
    { slug: 'guide', fileStem: 'guide', title: '血检指南' },
    { slug: 'renamed-post', fileStem: 'renamed-post', title: '改过名的文章' },
    { slug: 'retitled', fileStem: 'retitled', title: '同名文章' },
  ];
  const history = {
    posts: { guide: '血检指南', 'old-name': '改过名的文章', removed: '彻底删除的文章', 'moved-file': '同名文章', 'Upper-Case': '改过名的文章' },
    renames: { 'old-name': 'renamed-post', 'Upper-Case': 'renamed-post' },
    tags: ['GAHT', 'HRT', '随笔', 'Frontend'],
    tagRenames: { HRT: 'GAHT' },
  };
  const rules = buildRedirects({ posts, tags: ['GAHT', 'frontend'], history });
  const target = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;

  it('git 识别的改名 → 新文章（全部公开格式）', () => {
    expect(target('/posts/old-name/')).toBe(postPath('renamed-post'));
    expect(target('/posts/old-name.md')).toBe('/posts/renamed-post/index.html.md');
    expect(target('/posts/old-name/index.html.md')).toBe('/posts/renamed-post/index.html.md');
    expect(target('/print/old-name.pdf')).toBe('/print/renamed-post.pdf');
  });

  it('大写文件名改名后，原大小写与小写 slug 两套地址都直达', () => {
    expect(target('/posts/Upper-Case/')).toBe(postPath('renamed-post'));
    expect(target('/posts/upper-case/')).toBe(postPath('renamed-post'));
    expect(target('/posts/upper-case.md')).toBe('/posts/renamed-post/index.html.md');
    expect(target('/print/upper-case.pdf')).toBe('/print/renamed-post.pdf');
    expect(target('/print/Upper-Case.pdf')).toBe('/print/renamed-post.pdf');
  });

  it('删掉后以同标题重新发布 → 新文章', () => {
    expect(target('/posts/moved-file/')).toBe(postPath('retitled'));
  });

  it('彻底删除且没有替代文章 → 不重定向（返回真实 404，避免软 404）', () => {
    expect(target('/posts/removed/')).toBeUndefined();
    expect(target('/print/removed.pdf')).toBeUndefined();
  });

  it('标签替换链与大小写匹配', () => {
    expect(target('/tags/HRT/')).toBe(tagPath('GAHT'));
    expect(target('/tags/Frontend/')).toBe(tagPath('frontend'));
    expect(target('/tags/随笔/')).toBe('/tags/');
  });

  it('现存的文章与标签不会被重定向', () => {
    expect(target('/posts/guide/')).toBeUndefined();
    expect(target('/tags/GAHT/')).toBeUndefined();
  });
});

describe('历史 slug 与特殊字符', () => {
  it('连续改过 slug：每一个旧 slug 都直达现行文章', () => {
    const slugChanges: FileChange[] = [
      { hash: 'k3', date: at('2026-07-03'), subject: 'x', status: 'M', oldPath: 'p/guide.md', newPath: 'p/guide.md' },
      { hash: 'k2', date: at('2026-07-02'), subject: 'x', status: 'M', oldPath: 'p/guide.md', newPath: 'p/guide.md' },
    ];
    const slugBlobs = new Map<string, string | null>([
      ['k3^:p/guide.md', fm('指南', "tags: ['a']", 'slug: second\n')],
      ['k3:p/guide.md', fm('指南', "tags: ['a']", 'slug: third\n')],
      ['k2^:p/guide.md', fm('指南', "tags: ['a']", 'slug: first\n')],
      ['k2:p/guide.md', fm('指南', "tags: ['a']", 'slug: second\n')],
    ]);
    const derived = deriveHistory(slugChanges, slugBlobs);
    expect(derived.slugs?.guide).toEqual(['first', 'second', 'third']);
    // 清单里只记过 first，git 里还有 second：合并取并集
    const merged = mergeHistory({ ...derived, slugs: { guide: ['second', 'third'] } }, { posts: {}, renames: {}, tags: [], tagRenames: {}, slugs: { guide: ['first'] } });
    expect(merged.slugs?.guide).toEqual(['first', 'second', 'third']);
    const rules = buildRedirects({ posts: [{ slug: 'third', fileStem: 'guide', title: '指南' }], tags: ['a'], history: merged });
    const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
    expect(to('/posts/first/')).toBe('/posts/third/');
    expect(to('/posts/second/')).toBe('/posts/third/');
  });

  it('含空格的标签 / 文件名只生成百分号编码的规则（不产生非法的 _redirects 行）', () => {
    const rules = buildRedirects({
      posts: [{ slug: 'blood-test', fileStem: 'Blood Test', title: 'x' }],
      tags: ['Trans Health'],
      history: { posts: {}, renames: {}, tags: [], tagRenames: {} },
    });
    expect(rules.every((r) => !/\s/.test(r.from) && !/\s/.test(r.to))).toBe(true);
    expect(rules.find((r) => r.from === '/tag/Trans%20Health/')?.to).toBe('/tags/Trans%20Health/');
    expect(rules.find((r) => r.from === '/posts/Blood%20Test/')?.to).toBe('/posts/blood-test/');
  });
});

describe('改名 / 改标签后撤回再改', () => {
  const ch = (hash: string, day: string, status: FileChange['status'], oldPath: string | null, newPath: string | null): FileChange => ({
    hash, date: at(day), subject: 'x', status, oldPath, newPath,
  });

  it('文件 a → b → a → c：只保留每个旧名最新的去向，旧地址都直达 c', () => {
    // 从新到旧
    const changes = [
      ch('r3', '2026-07-03', 'R', 'p/a.md', 'p/c.md'),
      ch('r2', '2026-07-02', 'R', 'p/b.md', 'p/a.md'),
      ch('r1', '2026-07-01', 'R', 'p/a.md', 'p/b.md'),
    ];
    const renames = renamesOf(changes);
    expect(renames).toEqual({ a: 'c', b: 'a' });
    const history = { posts: { a: '旧标题', b: '旧标题' }, renames, tags: [], tagRenames: {} };
    const rules = buildRedirects({ posts: [{ slug: 'c', fileStem: 'c', title: '新标题' }], tags: [], history });
    const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
    expect(to('/posts/a/')).toBe('/posts/c/');
    expect(to('/posts/b/')).toBe('/posts/c/');
  });

  it('标签 alpha → beta → alpha → gamma：两个旧标签都直达 gamma', () => {
    const changes = [
      ch('t3', '2026-07-03', 'M', 'p/x.md', 'p/x.md'),
      ch('t2', '2026-07-02', 'M', 'p/x.md', 'p/x.md'),
      ch('t1', '2026-07-01', 'M', 'p/x.md', 'p/x.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['t3^:p/x.md', fm('X', "tags: ['alpha']")],
      ['t3:p/x.md', fm('X', "tags: ['gamma']")],
      ['t2^:p/x.md', fm('X', "tags: ['beta']")],
      ['t2:p/x.md', fm('X', "tags: ['alpha']")],
      ['t1^:p/x.md', fm('X', "tags: ['alpha']")],
      ['t1:p/x.md', fm('X', "tags: ['beta']")],
    ]);
    const history = deriveHistory(changes, blobs);
    const rules = buildRedirects({ posts: [{ slug: 'x', fileStem: 'x', title: 'X' }], tags: ['gamma'], history });
    const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
    expect(to('/tags/alpha/')).toBe(tagPath('gamma'));
    expect(to('/tags/beta/')).toBe(tagPath('gamma'));
  });

  it('改回原名（a → b → a）：在 b 期间的修改仍归到现在的 a，不成环', () => {
    const changes = [
      ch('m4', '2026-07-20', 'R', 'p/b.md', 'p/a.md'),
      ch('m3', '2026-07-10', 'M', 'p/b.md', 'p/b.md'),
      ch('m2', '2026-07-05', 'R', 'p/a.md', 'p/b.md'),
      ch('m1', '2026-07-02', 'M', 'p/a.md', 'p/a.md'),
    ];
    const stems = currentStems(changes);
    expect(changes.map((c) => stems.get(c))).toEqual(['a', 'a', 'a', 'a']);
  });

  it('删除后同名重新添加：旧文件的历史不串到新文件', () => {
    const changes = [
      ch('n3', '2026-07-20', 'A', null, 'p/a.md'),
      ch('n2', '2026-07-10', 'R', 'p/a.md', 'p/c.md'),
      ch('n1', '2026-07-02', 'M', 'p/a.md', 'p/a.md'),
    ];
    const stems = currentStems(changes);
    expect(changes.map((c) => stems.get(c))).toEqual(['a', 'c', 'c']);
  });

  it('真正的删除后同名重新添加（A → D → A）：新文件不继承旧文件的历史', () => {
    const changes = [
      ch('d4', '2026-10-01', 'A', null, 'p/a.md'),
      ch('d3', '2026-09-01', 'D', 'p/a.md', null),
      ch('d2', '2026-08-20', 'M', 'p/a.md', 'p/a.md'),
      ch('d1', '2026-08-01', 'A', null, 'p/a.md'),
    ];
    const stems = currentStems(changes);
    expect(changes.map((c) => stems.get(c))).toEqual(['a', undefined, undefined, undefined]);
  });

  it('草稿里改标签不影响已发布标签的去向，从未发布的标签也不产生 301', () => {
    const changes = [
      ch('g2', '2026-07-02', 'M', 'p/draft.md', 'p/draft.md'),
      ch('g1', '2026-07-01', 'M', 'p/pub.md', 'p/pub.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['g2^:p/draft.md', fm('草稿', "tags: ['old']", 'draft: true\n')],
      ['g2:p/draft.md', fm('草稿', "tags: ['unpublished']", 'draft: true\n')],
      ['g1^:p/pub.md', fm('公开', "tags: ['old']")],
      ['g1:p/pub.md', fm('公开', "tags: ['current']")],
    ]);
    const history = deriveHistory(changes, blobs);
    expect(history.tagRenames).toEqual({ old: 'current' });
    expect(history.tags).not.toContain('unpublished');
    expect(Object.keys(history.posts)).toEqual(['pub']);
  });

  it('删除后复用文件名：旧文章的 slug 不归给同名的新文章（返回 404）；同标题重新发布才 301', () => {
    const changes = [
      ch('e3', '2026-10-01', 'A', null, 'p/guide.md'),
      ch('e2', '2026-09-01', 'D', 'p/guide.md', null),
      ch('e1', '2026-08-01', 'A', null, 'p/guide.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['e3:p/guide.md', fm('无关的新文章', "tags: ['a']", 'slug: unrelated-article\n')],
      ['e2^:p/guide.md', fm('被删除的文章', "tags: ['a']", 'slug: removed-article\n')],
      ['e1:p/guide.md', fm('被删除的文章', "tags: ['a']", 'slug: removed-article\n')],
    ]);
    const history = deriveHistory(changes, blobs);
    expect(history.slugs?.guide).toEqual(['unrelated-article']);
    // 经过清单序列化 / 读取（浅克隆场景）后同样隔离
    const merged = mergeHistory(history);
    const rules = buildRedirects({ posts: [{ slug: 'unrelated-article', fileStem: 'guide', title: '无关的新文章' }], tags: ['a'], history: merged });
    expect(rules.some((r) => r.from.includes('removed-article'))).toBe(false);

    const republished = buildRedirects({ posts: [{ slug: 'new-slug', fileStem: 'guide', title: '被删除的文章' }], tags: ['a'], history: merged });
    const to = (from: string): string | undefined => republished.find((r) => r.from === from)?.to;
    expect(to('/posts/removed-article/')).toBe('/posts/new-slug/');
    expect(to('/posts/removed-article/index.html.md')).toBe('/posts/new-slug/index.html.md');
    expect(to('/print/removed-article.pdf')).toBe('/print/new-slug.pdf');
  });

  it('跨次构建：旧清单记过已删除文章的 slug，合并 git 隔离结果后不再归给同名新文章', () => {
    const changes = [
      ch('f3', '2026-10-01', 'A', null, 'p/guide.md'),
      ch('f2', '2026-09-01', 'D', 'p/guide.md', null),
      ch('f1', '2026-08-01', 'A', null, 'p/guide.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['f3:p/guide.md', fm('无关的新文章', "tags: ['a']", 'slug: unrelated-article\n')],
      ['f2^:p/guide.md', fm('被删除的文章', "tags: ['a']", 'slug: removed-article\n')],
      ['f1:p/guide.md', fm('被删除的文章', "tags: ['a']", 'slug: removed-article\n')],
    ]);
    // 删除之前那次构建写下的清单
    const oldManifest = { posts: { guide: '被删除的文章' }, slugs: { guide: ['removed-article'] }, renames: {}, tags: ['a'], tagRenames: {} };
    const current = { posts: { guide: '无关的新文章' }, slugs: { guide: ['unrelated-article'] }, renames: {}, tags: ['a'], tagRenames: {} };
    const merged = mergeHistory(current, oldManifest, deriveHistory(changes, blobs));
    expect(merged.slugs?.guide).toEqual(['unrelated-article']);
    // 写回清单后再合并（之后的浅克隆构建）依然隔离
    const again = mergeHistory(current, JSON.parse(serializeHistory(merged)) as UrlHistory);
    expect(again.slugs?.guide).toEqual(['unrelated-article']);
    const rules = buildRedirects({ posts: [{ slug: 'unrelated-article', fileStem: 'guide', title: '无关的新文章' }], tags: ['a'], history: again });
    expect(rules.some((r) => r.from.includes('removed-article'))).toBe(false);
  });

  it('改名后原文件名被另一篇复用：旧 slug 跟着原文章走（含旧清单合并、序列化）', () => {
    const changes = [
      ch('h3', '2026-10-01', 'A', null, 'p/a.md'),
      ch('h2', '2026-09-01', 'R', 'p/a.md', 'p/b.md'),
      ch('h1', '2026-08-01', 'A', null, 'p/a.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['h3:p/a.md', fm('新文章', "tags: ['t']", 'slug: new-article\n')],
      ['h2^:p/a.md', fm('原文章', "tags: ['t']", 'slug: old-article\n')],
      ['h2:p/b.md', fm('原文章', "tags: ['t']", 'slug: moved-article\n')],
      ['h1:p/a.md', fm('原文章', "tags: ['t']", 'slug: old-article\n')],
    ]);
    const posts = [
      { slug: 'new-article', fileStem: 'a', title: '新文章' },
      { slug: 'moved-article', fileStem: 'b', title: '原文章' },
    ];
    const oldManifest = { posts: { a: '原文章' }, slugs: { a: ['old-article'] }, renames: {}, tags: ['t'], tagRenames: {} };
    const current = { posts: { a: '新文章', b: '原文章' }, slugs: { a: ['new-article'], b: ['moved-article'] }, renames: {}, tags: ['t'], tagRenames: {} };
    const merged = mergeHistory(current, oldManifest, deriveHistory(changes, blobs));
    for (const history of [merged, mergeHistory(current, JSON.parse(serializeHistory(merged)) as UrlHistory)]) {
      const rules = buildRedirects({ posts, tags: ['t'], history });
      const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
      expect(to('/posts/old-article/')).toBe('/posts/moved-article/');
      expect(to('/posts/old-article/index.html.md')).toBe('/posts/moved-article/index.html.md');
      expect(to('/print/old-article.pdf')).toBe('/print/moved-article.pdf');
    }
  });

  it('旧文章用的是默认 slug（文件名）：删除或改名后复用文件名，新文章不能抢旧地址', () => {
    // 删除后复用
    const del = [
      ch('k3', '2026-10-01', 'A', null, 'p/guide.md'),
      ch('k2', '2026-09-01', 'D', 'p/guide.md', null),
      ch('k1', '2026-08-01', 'A', null, 'p/guide.md'),
    ];
    const delBlobs = new Map<string, string | null>([
      ['k3:p/guide.md', fm('无关的新文章', "tags: ['t']", 'slug: new-article\n')],
      ['k2^:p/guide.md', fm('被删除的文章', "tags: ['t']")],
      ['k1:p/guide.md', fm('被删除的文章', "tags: ['t']")],
    ]);
    const delRules = buildRedirects({
      posts: [{ slug: 'new-article', fileStem: 'guide', title: '无关的新文章' }],
      tags: ['t'],
      history: mergeHistory(deriveHistory(del, delBlobs)),
    });
    expect(delRules.some((r) => r.from.startsWith('/posts/guide') || r.from.startsWith('/print/guide'))).toBe(false);

    // 改名后复用
    const ren = [
      ch('m3', '2026-10-01', 'A', null, 'p/a.md'),
      ch('m2', '2026-09-01', 'R', 'p/a.md', 'p/b.md'),
      ch('m1', '2026-08-01', 'A', null, 'p/a.md'),
    ];
    const renBlobs = new Map<string, string | null>([
      ['m3:p/a.md', fm('新文章', "tags: ['t']", 'slug: new-article\n')],
      ['m2^:p/a.md', fm('原文章', "tags: ['t']")],
      ['m2:p/b.md', fm('原文章', "tags: ['t']")],
      ['m1:p/a.md', fm('原文章', "tags: ['t']")],
    ]);
    const renRules = buildRedirects({
      posts: [
        { slug: 'new-article', fileStem: 'a', title: '新文章' },
        { slug: 'b', fileStem: 'b', title: '原文章' },
      ],
      tags: ['t'],
      history: mergeHistory(deriveHistory(ren, renBlobs)),
    });
    const to = (from: string): string | undefined => renRules.find((r) => r.from === from)?.to;
    expect(to('/posts/a/')).toBe('/posts/b/');
    expect(to('/posts/a/index.html.md')).toBe('/posts/b/index.html.md');
    expect(to('/print/a.pdf')).toBe('/print/b.pdf');
  });

  it('同一次提交里把文章挪到新文件名、原文件名放进另一篇（git -B -M 的 C + M 输出）', () => {
    const log = [
      'commit c2 2026-10-01T00:00:00Z x',
      '',
      'C099\tp/b.md\tp/a.md',
      'M099\tp/b.md',
      'commit c1 2026-08-01T00:00:00Z x',
      '',
      'A\tp/b.md',
    ].join('\n');
    const changes = parseNameStatus(log);
    expect(changes.map((c) => `${c.status}:${c.oldPath ?? ''}>${c.newPath ?? ''}`)).toEqual(['A:>p/b.md', 'R:p/b.md>p/a.md', 'A:>p/b.md']);
    const blobs = new Map<string, string | null>([
      ['c2:p/b.md', fm('新文章', "tags: ['t']", 'slug: fresh-guide\n')],
      ['c2^:p/b.md', fm('原文章', "tags: ['t']", 'slug: old-guide\n')],
      ['c2:p/a.md', fm('原文章', "tags: ['t']", 'slug: moved-guide\n')],
      ['c1:p/b.md', fm('原文章', "tags: ['t']", 'slug: old-guide\n')],
    ]);
    const rules = buildRedirects({
      posts: [
        { slug: 'fresh-guide', fileStem: 'b', title: '新文章' },
        { slug: 'moved-guide', fileStem: 'a', title: '原文章' },
      ],
      tags: ['t'],
      history: mergeHistory(deriveHistory(changes, blobs)),
    });
    const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
    expect(to('/posts/old-guide/')).toBe('/posts/moved-guide/');
    expect(to('/posts/old-guide/index.html.md')).toBe('/posts/moved-guide/index.html.md');
    expect(to('/print/old-guide.pdf')).toBe('/print/moved-guide.pdf');
  });

  it('原地大改（M<分数>，内容没被挪走）仍是同一篇；真正的复制（C 且源未重写）是新文章', () => {
    const rewrite = parseNameStatus(['commit c3 2026-10-01T00:00:00Z x', '', 'M098\tp/b.md'].join('\n'));
    expect(rewrite.map((c) => `${c.status}:${c.oldPath ?? ''}>${c.newPath ?? ''}`)).toEqual(['M:p/b.md>p/b.md']);
    const copy = parseNameStatus(['commit c4 2026-10-02T00:00:00Z x', '', 'M\tp/b.md', 'C090\tp/b.md\tp/copy.md'].join('\n'));
    expect(copy.map((c) => `${c.status}:${c.oldPath ?? ''}>${c.newPath ?? ''}`)).toEqual(['M:p/b.md>p/b.md', 'A:>p/copy.md']);
  });

  it('改名 → 原名被另一篇复用 → 复用的那篇被删除：它的旧地址返回 404，不跳到改名后的原文章', () => {
    const changes = [
      ch('q4', '2026-10-04', 'D', 'p/a.md', null),
      ch('q3', '2026-10-03', 'A', null, 'p/a.md'),
      ch('q2', '2026-10-02', 'R', 'p/a.md', 'p/b.md'),
      ch('q1', '2026-10-01', 'A', null, 'p/a.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['q4^:p/a.md', fm('无关文章', "tags: ['t']", 'slug: new-article\n')],
      ['q3:p/a.md', fm('无关文章', "tags: ['t']", 'slug: new-article\n')],
      ['q2^:p/a.md', fm('原文章', "tags: ['t']", 'slug: old-article\n')],
      ['q2:p/b.md', fm('原文章', "tags: ['t']", 'slug: old-article\n')],
      ['q1:p/a.md', fm('原文章', "tags: ['t']", 'slug: old-article\n')],
    ]);
    const derived = deriveHistory(changes, blobs);
    expect(derived.renames).toEqual({});
    // 旧清单（复用之前写下的）还记着 a → b
    const oldManifest = { posts: { a: '原文章' }, slugs: { b: ['old-article'] }, renames: { a: 'b' }, tags: ['t'], tagRenames: {} };
    const merged = mergeHistory(oldManifest, derived);
    const rules = buildRedirects({ posts: [{ slug: 'old-article', fileStem: 'b', title: '原文章' }], tags: ['t'], history: merged });
    expect(rules.some((r) => r.from.includes('new-article'))).toBe(false);
  });

  it('拿得到 git 时，清单里 git 推导不出的退休记录被丢弃（例如早先误读了其他分支）', () => {
    const manifest = {
      posts: { a: 'A' },
      renames: {},
      tags: [],
      tagRenames: {},
      retired: { 'a@deadbeef': { stem: 'a', title: 'A', slugs: ['a'] } },
    };
    const derived = { posts: { a: 'A' }, slugs: { a: ['a'] }, renames: {}, tags: [], tagRenames: {}, retired: {}, derived: true };
    expect(mergeHistory(manifest, derived).retired).toEqual({});
    // 没有 git，或 git 历史不完整（浅克隆、补全失败：readGitHistory 不带 derived 标记）时清单原样保留
    expect(Object.keys(mergeHistory(manifest).retired ?? {})).toEqual(['a@deadbeef']);
    expect(Object.keys(mergeHistory(manifest, { ...derived, derived: false }).retired ?? {})).toEqual(['a@deadbeef']);
  });

  it('同一个 slug 先后被两篇文章用过：旧地址归最后用它的那篇，与文件顺序无关', () => {
    const changes = [
      ch('s4', '2026-10-04', 'M', 'p/b.md', 'p/b.md'),
      ch('s3', '2026-10-03', 'A', null, 'p/b.md'),
      ch('s2', '2026-10-02', 'M', 'p/a.md', 'p/a.md'),
      ch('s1', '2026-10-01', 'A', null, 'p/a.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['s4^:p/b.md', fm('B', "tags: ['t']", 'slug: shared\n')],
      ['s4:p/b.md', fm('B', "tags: ['t']", 'slug: beta\n')],
      ['s3:p/b.md', fm('B', "tags: ['t']", 'slug: shared\n')],
      ['s2^:p/a.md', fm('A', "tags: ['t']", 'slug: shared\n')],
      ['s2:p/a.md', fm('A', "tags: ['t']", 'slug: alpha\n')],
      ['s1:p/a.md', fm('A', "tags: ['t']", 'slug: shared\n')],
    ]);
    const history = mergeHistory(deriveHistory(changes, blobs));
    expect(history.slugOwners?.shared).toBe('b');
    for (const posts of [
      [{ slug: 'alpha', fileStem: 'a', title: 'A' }, { slug: 'beta', fileStem: 'b', title: 'B' }],
      [{ slug: 'beta', fileStem: 'b', title: 'B' }, { slug: 'alpha', fileStem: 'a', title: 'A' }],
    ]) {
      const rules = buildRedirects({ posts, tags: ['t'], history });
      expect(rules.find((r) => r.from === '/posts/shared/')?.to).toBe('/posts/beta/');
    }
  });

  it('退休的旧文章改过名：整段生命周期合成一条记录，较早的 slug 也能按最终标题 301', () => {
    const changes = [
      ch('v6', '2026-10-06', 'A', null, 'p/c.md'),
      ch('v5', '2026-10-05', 'A', null, 'p/b.md'),
      ch('v4', '2026-10-04', 'D', 'p/b.md', null),
      ch('v3', '2026-10-03', 'R', 'p/a.md', 'p/b.md'),
      ch('v2', '2026-10-02', 'M', 'p/a.md', 'p/a.md'),
      ch('v1', '2026-10-01', 'A', null, 'p/a.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['v6:p/c.md', fm('最终标题', "tags: ['t']", 'slug: republished\n')],
      ['v5:p/b.md', fm('无关文章', "tags: ['t']", 'slug: unrelated\n')],
      ['v4^:p/b.md', fm('最终标题', "tags: ['t']", 'slug: mid-slug\n')],
      ['v3^:p/a.md', fm('早期标题', "tags: ['t']", 'slug: mid-slug\n')],
      ['v3:p/b.md', fm('最终标题', "tags: ['t']", 'slug: mid-slug\n')],
      ['v2^:p/a.md', fm('早期标题', "tags: ['t']", 'slug: original-slug\n')],
      ['v2:p/a.md', fm('早期标题', "tags: ['t']", 'slug: mid-slug\n')],
      ['v1:p/a.md', fm('早期标题', "tags: ['t']", 'slug: original-slug\n')],
    ]);
    const history = mergeHistory(deriveHistory(changes, blobs));
    const lives = Object.values(history.retired ?? {});
    expect(lives).toHaveLength(1);
    expect(lives[0]?.slugs).toEqual(['mid-slug', 'original-slug']);
    const rules = buildRedirects({
      posts: [
        { slug: 'unrelated', fileStem: 'b', title: '无关文章' },
        { slug: 'republished', fileStem: 'c', title: '最终标题' },
      ],
      tags: ['t'],
      history,
    });
    const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
    expect(to('/posts/mid-slug/')).toBe('/posts/republished/');
    expect(to('/posts/original-slug/')).toBe('/posts/republished/');
  });

  it('退休生命周期开始后，挂在它身上的旧文件名一并关闭，不会并入更早复用该文件名的文章', () => {
    // 从新到旧：A 以 c.md 重新发布；C 复用 b.md；A（已改名为 b.md）被删除；A 由 a.md 改名为 b.md；
    // A 以 a.md 新建；更早的 B 使用 b.md 后被删除
    const changes = [
      ch('w7', '2026-10-07', 'A', null, 'p/c.md'),
      ch('w6', '2026-10-06', 'A', null, 'p/b.md'),
      ch('w5', '2026-10-05', 'D', 'p/b.md', null),
      ch('w4', '2026-10-04', 'R', 'p/a.md', 'p/b.md'),
      ch('w3', '2026-10-03', 'A', null, 'p/a.md'),
      ch('w2', '2026-10-02', 'D', 'p/b.md', null),
      ch('w1', '2026-10-01', 'A', null, 'p/b.md'),
    ];
    const blobs = new Map<string, string | null>([
      ['w7:p/c.md', fm('A 的标题', "tags: ['t']", 'slug: replacement\n')],
      ['w6:p/b.md', fm('C 的标题', "tags: ['t']", 'slug: c-slug\n')],
      ['w5^:p/b.md', fm('A 的标题', "tags: ['t']", 'slug: a-slug\n')],
      ['w4^:p/a.md', fm('A 的标题', "tags: ['t']", 'slug: a-slug\n')],
      ['w4:p/b.md', fm('A 的标题', "tags: ['t']", 'slug: a-slug\n')],
      ['w3:p/a.md', fm('A 的标题', "tags: ['t']", 'slug: a-slug\n')],
      ['w2^:p/b.md', fm('B 的标题', "tags: ['t']", 'slug: b-slug\n')],
      ['w1:p/b.md', fm('B 的标题', "tags: ['t']", 'slug: b-slug\n')],
    ]);
    const history = mergeHistory(deriveHistory(changes, blobs));
    const rules = buildRedirects({
      posts: [
        { slug: 'c-slug', fileStem: 'b', title: 'C 的标题' },
        { slug: 'replacement', fileStem: 'c', title: 'A 的标题' },
      ],
      tags: ['t'],
      history,
    });
    const to = (from: string): string | undefined => rules.find((r) => r.from === from)?.to;
    expect(to('/posts/a-slug/')).toBe('/posts/replacement/');
    expect(to('/posts/b-slug/')).toBeUndefined();
  });

  it('找不到去向的历史文章会被列出（构建日志提醒）', () => {
    const history = { posts: { gone: '删掉的', 'old-name': '改过名的' }, renames: { 'old-name': 'kept' }, tags: [], tagRenames: {} };
    expect(unresolvedPosts([{ slug: 'kept', fileStem: 'kept', title: '新标题' }], history)).toEqual(['gone']);
  });
});

describe('原型链上的名字也是普通文件名 / 标签', () => {
  it('constructor、toString、__proto__ 作为文件名与标签不会出错', () => {
    const changes: FileChange[] = [
      { hash: 'p1', date: at('2026-07-01'), subject: 'x', status: 'A', oldPath: null, newPath: 'p/constructor.md' },
      { hash: 'p0', date: at('2026-06-30'), subject: 'x', status: 'A', oldPath: null, newPath: 'p/__proto__.md' },
    ];
    const blobs = new Map<string, string | null>([
      ['p1:p/constructor.md', fm('构造', "tags: ['toString']")],
      ['p0:p/__proto__.md', fm('原型', "tags: ['constructor']")],
    ]);
    const derived = deriveHistory(changes, blobs);
    expect(derived.slugs?.constructor).toEqual(['constructor']);
    expect(Object.keys(derived.posts).sort()).toEqual(['__proto__', 'constructor']);
    const merged = mergeHistory(derived, { posts: {}, renames: {}, tags: [], tagRenames: {}, slugs: { toString: ['to-string'] } });
    expect(merged.slugs?.toString).toEqual(['to-string']);
    // 没有这些文件的现行文章：查不到原型上的属性，不会误判出「改名」
    const rules = buildRedirects({ posts: [{ slug: 'guide', fileStem: 'guide', title: 'x' }], tags: ['valueOf'], history: merged });
    expect(rules.some((r) => r.to.includes('function'))).toBe(false);
  });

  it('标签导语对原型属性名返回自动生成的字符串', () => {
    expect(tagDescription('constructor', [])).toMatch(/^跨环博客中标记为「constructor」/);
    expect(tagDescription('__proto__', [])).toMatch(/^跨环博客中标记为「__proto__」/);
  });
});

describe('自定义 slug', () => {
  it('首尾空白、空串、斜杠被拒绝；规范写法通过', () => {
    expect(slugProblem({ slug: ' test ' })).not.toBeNull();
    expect(slugProblem({ slug: '' })).not.toBeNull();
    expect(slugProblem({ slug: 'a/b' })).not.toBeNull();
    for (const bad of ['.', '..', 'a?b', 'a#b', '50%', 'a\\b']) expect(slugProblem({ slug: bad })).not.toBeNull();
    expect(slugProblem({ slug: 'blood test' })).toBeNull();
    expect(slugProblem({})).toBeNull();
  });

  it('含空格 / 中文的现行 slug，历史 PDF 等目标同样百分号编码', () => {
    const rules = buildRedirects({
      posts: [{ slug: 'blood test', fileStem: 'guide', title: 'x' }],
      tags: [],
      history: { posts: {}, renames: {}, tags: [], tagRenames: {} },
    });
    expect(rules.every((r) => !/\s/.test(r.from) && !/\s/.test(r.to))).toBe(true);
    expect(rules.find((r) => r.from === '/print/guide.pdf')?.to).toBe('/print/blood%20test.pdf');
  });
  it('标签里的 : 与 * 不会变成占位符 / 通配符', () => {
    const rules = buildRedirects({
      posts: [{ slug: 'x', fileStem: 'x', title: 'x' }],
      tags: ['QA:testing', 'HRT*'],
      history: { posts: {}, renames: {}, tags: ['QA:testing', 'HRT*', 'old:tag'], tagRenames: {} },
    });
    expect(countRedirects(rules).dynamic).toBe(0);
    expect(rules.every((r) => !/[:*]/.test(r.from))).toBe(true);
    expect(rules.find((r) => r.from === '/tag/QA%3Atesting/')?.to).toBe(tagPath('QA:testing'));
    expect(rules.find((r) => r.from === '/tag/HRT%2A/')?.to).toBe(tagPath('HRT*'));
    expect(matchRedirect(rules, '/tag/QAnever-existed/')).toBeNull();
    // 页面实际使用的链接（tagPath）就是规则的来源写法
    const legacy = buildRedirects({ posts: [], tags: ['GAHT'], history: { posts: {}, renames: {}, tags: ['HRT*'], tagRenames: { 'HRT*': 'GAHT' } } });
    expect(matchRedirect(legacy, tagPath('HRT*'))?.to).toBe(tagPath('GAHT'));
  });

  it('构建集成同款 exists：含空格 slug 的 PDF 目标视为存在', () => {
    const rules = buildRedirects({
      posts: [{ slug: 'blood test', fileStem: 'guide', title: 'x' }],
      tags: [],
      history: { posts: {}, renames: {}, tags: [], tagRenames: {} },
    });
    const exists = buildExists(new Set(['/posts/blood test/index.html', '/posts/blood test/index.html.md']), ['blood test']);
    // 只看这篇文章的规则（站点级别名的目标不在这个假的文件列表里）
    const own = rules.filter((r) => r.from.includes('guide'));
    expect(own.some((r) => r.to === '/print/blood%20test.pdf')).toBe(true);
    expect(validateRedirects(own, exists, ['/print/'])).toEqual([]);
  });
});

describe('本仓库真实 git 历史', () => {
  const history = readGitHistory(process.cwd());

  it.runIf(history !== null)('能识别出历次改名与删除的标签', () => {
    expect(history?.renames['反扭转媒体错用小言代词争议']).toBe('Xiaoyan-misgendering-business');
    expect(history?.tags).toEqual(expect.arrayContaining(['HRT', 'astro', 'design-system']));
    expect(history?.tagRenames.HRT).toBe('GAHT');
  });

  it.runIf(history !== null)('合并提交里的正文修改也被读到（PR #1 修过 mtf-wiki-word-class）', () => {
    const merge = readPostChanges(process.cwd()).find((c) => c.hash.startsWith('682efc70'));
    expect(merge?.newPath).toBe('src/content/posts/mtf-wiki-word-class.md');
  });
});

describe('清单', () => {
  it('清单序列化稳定（键排序）', () => {
    const a = serializeHistory(mergeHistory({ posts: { b: 'B', a: 'A' }, renames: {}, tags: ['y', 'x'], tagRenames: {} }));
    const b = serializeHistory(mergeHistory({ posts: { a: 'A', b: 'B' }, renames: {}, tags: ['x', 'y'], tagRenames: {} }));
    expect(a).toBe(b);
  });
});
