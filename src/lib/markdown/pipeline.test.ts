import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { describe, expect, it } from 'vitest';
import { rehypePlugins } from './pipeline.mjs';

/**
 * 用 Astro 自己的 Markdown 处理器（与构建完全相同的执行顺序）渲染真实的 Markdown 字符串，
 * 验证插件链对「正文里手写的原始 HTML」同样生效——只构造语法树的单元测试覆盖不到这一点。
 */
async function render(markdown: string, title = '标题'): Promise<string> {
  const processor = await createMarkdownProcessor({ rehypePlugins, syntaxHighlight: false });
  const result = await processor.render(markdown, { frontmatter: { title } });
  return result.code;
}

describe('真实 Markdown 管线', () => {
  it('原始 HTML 中的 script、事件属性、javascript: 链接被清除', async () => {
    const html = await render(
      [
        '正文',
        '',
        '<script>alert(1)</script>',
        '',
        '<img src="/images/none.png" alt="图" onerror="alert(2)">',
        '',
        '<a href="javascript:alert(3)">坏链接</a>',
        '',
        '<iframe src="https://example.com"></iframe>',
      ].join('\n')
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).toContain('坏链接');
  });

  it('作者手写的 SVG（含 <set> 篡改链接）整体删除', async () => {
    const html = await render(
      '<a href="https://example.org/"><svg><set attributeName="href" to="javascript:alert(1)"></set></svg>链接</a>\n\n<math><mi>x</mi></math>'
    );
    expect(html).not.toMatch(/<svg|<set|<math/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('链接');
  });

  it('<noscript> 整体删除：属性里的 </noscript> 不能在浏览器重新解析时造出事件属性', async () => {
    const html = await render(
      '<div><noscript><img title="</noscript><img src=x onerror=alert(1)>" src="https://example.org/x.png" alt="x"></noscript>可见</div>'
    );
    expect(html).not.toMatch(/<noscript|onerror/i);
    expect(html).toContain('可见');
  });

  it('<template>（含声明式 Shadow DOM）整体删除，其中的事件处理器不会留下', async () => {
    const html = await render(
      '<div><template shadowrootmode="open"><img src="/missing.png" onerror="alert(document.domain)"></template>可见</div>'
    );
    expect(html).not.toMatch(/<template|shadowrootmode|onerror/i);
    expect(html).toContain('可见');
  });

  it('原始 HTML 外链与 Markdown 外链都补 rel，自家站点不补', async () => {
    const html = await render(
      '[文献](https://pubmed.ncbi.nlm.nih.gov/1/)\n\n<a href="https://example.org/x">外链</a>\n\n[主站](https://transcircle.org/)'
    );
    expect(html).toContain('<a href="https://pubmed.ncbi.nlm.nih.gov/1/" rel="nofollow noopener noreferrer">');
    expect(html).toContain('<a href="https://example.org/x" rel="nofollow noopener noreferrer">');
    expect(html).toContain('<a href="https://transcircle.org/">');
  });

  it('协议相对外链（//host/…）同样补 rel，自家域名不补', async () => {
    const html = await render(
      '[外链](//example.org/p)\n\n<a href="//example.org/q" target="_blank">原始</a>\n\n[主站](//transcircle.org/)'
    );
    expect(html).toContain('<a href="//example.org/p" rel="nofollow noopener noreferrer">');
    expect(html).toMatch(/<a href="\/\/example\.org\/q"[^>]*rel="nofollow noopener noreferrer"/);
    expect(html).toContain('<a href="//transcircle.org/">');
  });

  it('原始 HTML 的 h1 同样被去重 / 降级，图片补懒加载', async () => {
    const html = await render('<h1>标题</h1>\n\n<h1>别的</h1>\n\n<img src="/images/none.png" alt="图">');
    expect(html).not.toMatch(/<h1/i);
    expect(html).toMatch(/<h2[^>]*>别的<\/h2>/);
    expect(html).toMatch(/<img[^>]*loading="lazy"/);
  });
});
