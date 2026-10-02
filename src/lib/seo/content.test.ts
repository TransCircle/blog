import { describe, expect, it } from 'vitest';
import {
  absolutizeHtml,
  extractCitations,
  extractImages,
  firstParagraph,
  isolateForBundle,
  isoDuration,
  lastModified,
  metaDescription,
  normalizeHeadings,
  readingMinutes,
  resolveImageUrls,
  selectRelated,
  truncate,
} from './content';

describe('extractCitations', () => {
  it('只从脚注定义里提取外链，并去重', () => {
    const body = [
      '正文里的 [链接](https://example.com/inline) 不算参考文献。[^1]',
      '',
      '[^1]: Hembree WC et al. Endocrine Treatment. JCEM, 2017. [PubMed](https://pubmed.ncbi.nlm.nih.gov/28945902/)',
      '[^2]: 同上 https://pubmed.ncbi.nlm.nih.gov/28945902/',
      '[^3]: 没有链接的脚注',
    ].join('\n');
    const citations = extractCitations(body);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe('https://pubmed.ncbi.nlm.nih.gov/28945902/');
    expect(citations[0]?.name).toContain('Hembree');
  });

  it('只取正文引用过的脚注（未引用的定义不会渲染，结构化数据也不能声称）；代码块不算', () => {
    const body = [
      '正文引用 [^a] 与 [^c]。',
      '',
      '```',
      '代码里的 [^b] 不算引用',
      '```',
      '',
      '[^a]: 文献 A https://example.org/a',
      '[^b]: 文献 B https://example.org/b',
      '[^c]: 见 [^d]',
      '[^d]: 文献 D https://example.org/d',
    ].join('\n');
    expect(extractCitations(body).map((c) => c.url)).toEqual(['https://example.org/a', 'https://example.org/d']);
  });

  it('行内代码里的写法、未被引用的脚注之间的引用都不算', () => {
    const inlineCode = '脚注写法为 `[^ref]`。\n\n[^ref]: [参考](https://example.com/paper)';
    expect(extractCitations(inlineCode)).toEqual([]);
    const orphanChain = '正文没有脚注。\n\n[^x]: 见 [^y]\n[^y]: https://example.com/y';
    expect(extractCitations(orphanChain)).toEqual([]);
  });
});

describe('metaDescription', () => {
  const body = '## 标题\n\n> 引用块跳过\n\n这是正文的第一段，足够长，用来补足过短的描述文字，让摘要有实质内容。\n';

  it('足够长的 description 原样使用', () => {
    const long = '从为什么要查、怎么开单、何时抽血，到如何解读各项核心指标并排查异常，帮助你用数据驱动、安全推进用药。这里再补一些字数，确保超过六十个字的阈值。';
    expect(metaDescription(long, '标题', body)).toBe(long);
  });

  it('过短的 description 补上正文首段', () => {
    const result = metaDescription('「Pass」是形容词吗？', '标题', body);
    expect(result.startsWith('「Pass」是形容词吗？这是正文的第一段')).toBe(true);
  });

  it('去掉副标题式的破折号前缀', () => {
    expect(metaDescription('——前置阅读', '标题', '')).toBe('前置阅读');
  });

  it('没有 description 时用标题 + 首段', () => {
    expect(metaDescription(undefined, '标题', body).startsWith('标题。这是正文')).toBe(true);
  });
});

describe('firstParagraph / truncate', () => {
  it('跳过标题、引用、列表、脚注与注释', () => {
    const body = '<!-- 注释 -->\n\n# H\n\n- 列表\n\n[^1]: 脚注\n\n真正的正文段落在这里，长度超过二十个字符。[^1]';
    expect(firstParagraph(body)).toBe('真正的正文段落在这里，长度超过二十个字符。');
  });

  it('按字符截断并加省略号', () => {
    expect(truncate('一二三四五六七八九十', 5)).toBe('一二三四…');
    expect(truncate('短', 5)).toBe('短');
  });
});

describe('阅读时长与日期', () => {
  it('至少 1 分钟', () => {
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(4000)).toBe(10);
    expect(isoDuration(10)).toBe('PT10M');
  });

  it('lastModified 取较晚者', () => {
    const pub = new Date('2026-06-12');
    const upd = new Date('2026-07-15');
    expect(lastModified({ pubDate: pub, updatedDate: upd })).toBe(upd);
    expect(lastModified({ pubDate: pub })).toBe(pub);
  });
});

describe('selectRelated', () => {
  const make = (slug: string, tags: string[], category: string, date: string) => ({
    slug,
    tags,
    category,
    pubDate: new Date(date),
  });
  const current = make('a', ['GAHT', '血检'], '医疗', '2026-06-01');
  const candidates = [
    current,
    make('b', ['GAHT', '血检'], '医疗', '2026-05-01'),
    make('c', ['GAHT'], '医疗', '2026-07-01'),
    make('d', [], '医疗', '2026-07-02'),
    make('e', ['前端'], '技术', '2026-07-03'),
  ];

  it('按共享标签与分类打分，排除自身与无关文章', () => {
    expect(selectRelated(current, candidates).map((p) => p.slug)).toEqual(['b', 'c', 'd']);
  });
});

describe('正文图片与引用式链接（语法树）', () => {
  it('代码里的图片写法不算，引用式图片按定义解析，坏地址不阻断', () => {
    const body = ['```md', '![示例](http://)', '```', '', '行内 `![x](/images/x.png)`', '', '![正常配图][photo]', '', '[photo]: /images/a.png'].join('\n');
    const images = extractImages(body);
    expect(images.map((i) => i.src)).toEqual(['/images/a.png']);
    expect(resolveImageUrls([{ src: 'http://', alt: '' }, ...images], 'https://blog.transcircle.org/posts/x/')).toEqual([
      { url: 'https://blog.transcircle.org/images/a.png', alt: '正常配图' },
    ]);
  });

  it('拼接全文时引用式链接按文章隔离', () => {
    const a = isolateForBundle('[来源][ref]、[ref][] 与 [ref]\n\n[ref]: https://a.example/paper', 'a', 'https://blog.transcircle.org/posts/a/');
    const b = isolateForBundle('[来源][ref]\n\n[ref]: https://b.example/paper\n\n`[x][ref]` 与 [未定义]', 'b', 'https://blog.transcircle.org/posts/b/');
    const urlsOf = (md: string): string[] => {
      const out: string[] = [];
      for (const m of md.matchAll(/\[([^\]]+)\]:\s*(\S+)/g)) out.push(`${m[1]}=${m[2]}`);
      return out;
    };
    const defsA = urlsOf(a);
    const defsB = urlsOf(b);
    expect(defsA).toHaveLength(1);
    expect(defsB).toHaveLength(1);
    expect(defsA[0]?.split('=')[0]).not.toBe(defsB[0]?.split('=')[0]);
    const labelA = defsA[0]?.split('=')[0] ?? '';
    expect(a).toContain(`[来源][${labelA}]`);
    expect(a).toContain(`[ref][${labelA}]`);
    expect(a.split(`[${labelA}]`).length - 1).toBe(4); // 三处引用 + 定义
    expect(b).toContain('`[x][ref]`');
    expect(b).toContain('[未定义]');
  });
});

describe('第 8 轮回归', () => {
  it('含空格的图片地址完整保留', () => {
    const images = extractImages('![截图](</images/blood test.png>)\n\n<img src="/images/a b.png" alt="x">');
    expect(images.map((i) => i.src)).toEqual(['/images/blood test.png', '/images/a b.png']);
    expect(resolveImageUrls(images, 'https://blog.transcircle.org/posts/x/')[0]?.url).toBe(
      'https://blog.transcircle.org/images/blood%20test.png'
    );
  });

  it('引用式页内锚点在全文快照里指向本文', () => {
    const md = '参见[常见问题][faq]\n\n## 常见问题\n\n[faq]: #常见问题';
    const out = isolateForBundle(md, 'p', 'https://blog.transcircle.org/posts/p/');
    expect(out).toMatch(/\]: https:\/\/blog\.transcircle\.org\/posts\/p\/#常见问题$/);
  });

  it('脚注里的引用式文献链接也计入 citation', () => {
    const md = '正文[^1]\n\n[^1]: [临床指南][guide]\n\n[guide]: https://example.org/clinical-guideline';
    expect(extractCitations(md).map((c) => c.url)).toEqual(['https://example.org/clinical-guideline']);
  });
});

describe('第 9 轮回归', () => {
  it('citation 地址按 URL 规范化（中文百分号编码），保留目标里的末尾句点', () => {
    const md = '正文[^1][^2]\n\n[^1]: [百科](https://zh.wikipedia.org/wiki/跨性别)\n[^2]: [资料](https://example.org/path.)';
    expect(extractCitations(md).map((c) => c.url)).toEqual([
      'https://zh.wikipedia.org/wiki/%E8%B7%A8%E6%80%A7%E5%88%AB',
      'https://example.org/path.',
    ]);
  });

  it('全文快照里的行内相对链接、图片、HTML 地址都按本文 URL 解析；代码不变', () => {
    const page = 'https://blog.transcircle.org/posts/x/';
    const md = [
      '[血检指南](../hrt-hormone-blood-test-guide/) 与 [目录](#目录)',
      '',
      '![图](<./a b.png> "标题")',
      '',
      '<a href="../other/">其他</a>',
      '',
      '`[代码](../no/)`',
    ].join('\n');
    const out = isolateForBundle(md, 'x', page);
    expect(out).toContain('[血检指南](https://blog.transcircle.org/posts/hrt-hormone-blood-test-guide/)');
    expect(out).toContain(`[目录](${page}#目录)`);
    expect(out).toContain('![图](<https://blog.transcircle.org/posts/x/a%20b.png> "标题")');
    expect(out).toContain('<a href="https://blog.transcircle.org/posts/other/">');
    expect(out).toContain('`[代码](../no/)`');
  });
});

describe('第 10 轮回归', () => {
  it('全文快照：单引号 / 无引号的 HTML 地址同样改写；代码里的脚注写法不变', () => {
    const page = 'https://blog.transcircle.org/posts/x/';
    const md = [
      "<a href='../other/'>相关</a> <img alt='图' src=photo.png>",
      '',
      '正文[^1]，写法示例：`[^1]`。',
      '',
      '    [^1]: 缩进代码示例',
      '',
      '[^1]: 真正的脚注',
    ].join('\n');
    const out = isolateForBundle(md, 'x', page);
    expect(out).toContain('href="https://blog.transcircle.org/posts/other/"');
    expect(out).toContain('src="https://blog.transcircle.org/posts/x/photo.png"');
    expect(out).toContain('`[^1]`');
    expect(out).toContain('    [^1]: 缩进代码示例');
    expect(out).toMatch(/正文\[\^x-[0-9a-f]+-1\]/);
    expect(out).toMatch(/\n\[\^x-[0-9a-f]+-1\]: 真正的脚注$/);
  });
});

describe('第 11 轮回归', () => {
  it('链接地址按语法位置定位：括号内空白、标题里出现同样的地址', () => {
    const page = 'https://blog.transcircle.org/posts/x/';
    const out = isolateForBundle(
      '[相关文章]( ../other/ ) 与 [章节]( #one )\n\n[文章](../other/ "see (../other/)")',
      'x',
      page
    );
    expect(out).toContain('[相关文章]( https://blog.transcircle.org/posts/other/ )');
    expect(out).toContain(`[章节]( ${page}#one )`);
    expect(out).toContain('[文章](https://blog.transcircle.org/posts/other/ "see (../other/)")');
  });
});

describe('第 12 轮回归', () => {
  const page = 'https://blog.transcircle.org/posts/x/';

  it('转义括号、实体的目标整段替换；引用定义的标题里出现同样地址也不误改', () => {
    const out = isolateForBundle(
      '[链接](../guide/a\\(b\\).pdf)\n\n[参考][ref]\n\n[ref]: ../guide/?a=1&amp;b=2 "../guide/?a=1&b=2"',
      'x',
      page
    );
    expect(out).toContain('[链接](<https://blog.transcircle.org/posts/guide/a(b).pdf>)');
    expect(out).toMatch(/\]: https:\/\/blog\.transcircle\.org\/posts\/guide\/\?a=1&b=2 "\.\.\/guide\/\?a=1&b=2"$/);
  });

  it('Feed HTML：只改写真正标签的属性，代码示例里的 href 文字不变', () => {
    const html = '<p><a href="./guide/">真链接</a> <code>&lt;a href="./guide/"&gt;</code></p>';
    expect(absolutizeHtml(html, page)).toBe(
      '<p><a href="https://blog.transcircle.org/posts/x/guide/">真链接</a> <code>&#x3C;a href="./guide/"></code></p>'
    );
  });
});

describe('第 13 轮回归', () => {
  it('属性值里的 src= / href= 文字不会被当成属性改写（不能在清洗后造出事件属性）', () => {
    const page = 'https://blog.transcircle.org/posts/x/';
    const html = '<a href="https://example.org/" title="示例 src=./demo.png onmouseover=alert(1) x=1">链接</a>';
    expect(absolutizeHtml(html, page)).toBe(html);
    const rel = '<a title="见 href=../x/" href="../y/?a=1&amp;b=2">y</a>';
    expect(absolutizeHtml(rel, page)).toBe('<a title="见 href=../x/" href="https://blog.transcircle.org/posts/y/?a=1&#x26;b=2">y</a>');
  });
});

describe('第 14 轮回归', () => {
  it('Astro 输出的数字实体（&#x26;）先解码再解析，查询参数不丢', () => {
    const page = 'https://blog.transcircle.org/posts/x/';
    expect(absolutizeHtml('<a href="../other/?a=1&#x26;b=2">查看</a>', page)).toBe(
      '<a href="https://blog.transcircle.org/posts/other/?a=1&#x26;b=2">查看</a>'
    );
  });

  it('手写 <img>：alt 里的 > 不截断标签，属性实体按页面实际请求解码', () => {
    const images = extractImages(
      '<img alt="对比 > 示例" src="/images/a.png">\n\n<img src="https://example.com/img.png?a=1&amp;b=2" alt="示例图">'
    );
    expect(images).toEqual([
      { src: '/images/a.png', alt: '对比 > 示例' },
      { src: 'https://example.com/img.png?a=1&b=2', alt: '示例图' },
    ]);
  });
});

describe('第 15 轮回归', () => {
  it('标题降级按语法树：代码块里的 # 不动，真正的一级标题降级，Setext 写法同样处理', () => {
    const body = ['# 文章标题', '', '``` bad`info', '# 这不是代码', '', '```', '# 代码注释', '```', '', '小节', '===', ''].join('\n');
    const out = normalizeHeadings(body, '文章标题');
    expect(out.startsWith('``` bad`info')).toBe(true);
    expect(out).toContain('## 这不是代码');
    expect(out).toContain('```\n# 代码注释\n```');
    expect(out).toContain('## 小节');
    const bundled = isolateForBundle('## 二级\n\n```\n## 代码\n```', 'x', 'https://blog.transcircle.org/posts/x/');
    expect(bundled).toContain('### 二级');
    expect(bundled).toContain('```\n## 代码\n```');
  });

  it('Feed 中 srcset 的候选地址逐个绝对化', () => {
    const html = '<img src="/images/a.png" srcset="/images/a.png 1x, /images/a-2x.png 2x" alt="配图">';
    expect(absolutizeHtml(html, 'https://blog.transcircle.org/posts/x/')).toBe(
      '<img src="https://blog.transcircle.org/images/a.png" srcset="https://blog.transcircle.org/images/a.png 1x, https://blog.transcircle.org/images/a-2x.png 2x" alt="配图">'
    );
  });
});

describe('第 16 轮回归', () => {
  it('多行 Setext 与引用块里的标题同样降级', () => {
    const out = normalizeHeadings(['导语', '', '第一行', '第二行', '===', '', '> # 小节'].join('\n'), '标题');
    expect(out).toContain('## 第一行 第二行');
    expect(out).toContain('> ## 小节');
    expect(isolateForBundle('> ## 引用里的二级', 'x', 'https://blog.transcircle.org/posts/x/')).toContain('> ### 引用里的二级');
  });

  it('摘要首段：代码块内部的空行之后的文字不算正文', () => {
    const body = ['```js', 'const a = 1;', '', '这一行在代码块里面，很长很长很长很长很长很长很长', '```', '', '这才是作者写的导语，足够长足够长足够长。'].join('\n');
    expect(firstParagraph(body)).toBe('这才是作者写的导语，足够长足够长足够长。');
  });
});

describe('第 18 轮回归', () => {
  it('注释里的伪标签不被改写，不能在 Feed 里重新造出可执行元素', () => {
    const page = 'https://blog.transcircle.org/posts/x/';
    const html = '<p>正文</p><!-- <img srcset="x 1x --&gt; <img src=x onerror=alert(1)>"> -->';
    const out = absolutizeHtml(html, page);
    expect(out).toContain('<!-- <img srcset="x 1x --&gt; <img src=x onerror=alert(1)>"> -->');
    // 重新解析后只有一个真实元素 <p>，注释仍是注释
    expect(out.replace(/<!--[\s\S]*?-->/g, '')).toBe('<p>正文</p>');
  });

  it('全文快照的原始 HTML 片段：注释原样保留，真实标签照常改写', () => {
    const out = isolateForBundle('<!-- <a href="../x/"> --> <a href="../y/">y</a>', 'x', 'https://blog.transcircle.org/posts/x/');
    expect(out).toContain('<!-- <a href="../x/"> -->');
    expect(out).toContain('href="https://blog.transcircle.org/posts/y/"');
  });
});
