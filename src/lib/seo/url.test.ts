import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  normalizePagePath,
  postMarkdownPath,
  postPath,
  postPdfPath,
  searchPath,
  tagPath,
} from './url';

describe('站内 URL 构造', () => {
  it('HTML 页面路径恒带尾斜杠', () => {
    expect(postPath('project-kickoff')).toBe('/posts/project-kickoff/');
    expect(tagPath('GAHT')).toBe('/tags/GAHT/');
    expect(searchPath()).toBe('/search/');
  });

  it('文件端点不带尾斜杠', () => {
    // llms.txt 约定：以 / 结尾的页面，Markdown 版本在 <URL>index.html.md
    expect(postMarkdownPath('x')).toBe('/posts/x/index.html.md');
    expect(postPdfPath('x')).toBe('/print/x.pdf');
  });

  it('中文标签按段编码', () => {
    expect(tagPath('血检')).toBe(`/tags/${encodeURIComponent('血检')}/`);
    expect(searchPath('抗雄 药物')).toBe('/search/?q=%E6%8A%97%E9%9B%84%20%E8%8D%AF%E7%89%A9');
  });

  it('absoluteUrl 拼出正式域名', () => {
    expect(absoluteUrl('/')).toBe('https://blog.transcircle.org/');
    expect(absoluteUrl('/tags/')).toBe('https://blog.transcircle.org/tags/');
    expect(absoluteUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it('normalizePagePath 补尾斜杠并统一编码', () => {
    expect(normalizePagePath('/tags')).toBe('/tags/');
    expect(normalizePagePath('/tags/血检')).toBe(tagPath('血检'));
    expect(normalizePagePath(tagPath('血检'))).toBe(tagPath('血检'));
    expect(normalizePagePath('/posts/x/index.html.md')).toBe('/posts/x/index.html.md');
    expect(normalizePagePath('/')).toBe('/');
  });
});

describe('normalizePagePath 与 sitemap 地址统一编码', () => {
  it('*、:、+ 等字符与 tagPath 逐字一致', () => {
    for (const tag of ['HRT*', 'QA:testing', 'C++', '血检']) {
      expect(normalizePagePath(`/tags/${tag}/`)).toBe(tagPath(tag));
      expect(normalizePagePath(tagPath(tag))).toBe(tagPath(tag));
    }
  });
});
