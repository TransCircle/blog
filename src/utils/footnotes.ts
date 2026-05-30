/**
 * 脚注处理工具函数
 * 用于从 Markdown 元数据提取和解析脚注
 */

export interface FootnoteItem {
  id: string;
  type: 'annotation' | 'reference';
  content: string;
  url?: string;
}

/**
 * 识别脚注类型
 * fn-1, fn-2 等为注释
 * i, ii, iii, iv 等罗马数字或数字为引用资料
 */
export function identifyFootnoteType(id: string): 'annotation' | 'reference' {
  if (id.startsWith('fn-')) {
    return 'annotation';
  }
  return 'reference';
}

/**
 * 从脚注ID中提取可读的标号
 * fn-1 -> 1, i -> i
 */
export function formatFootnoteId(id: string): string {
  if (id.startsWith('fn-')) {
    return id.replace('fn-', '');
  }
  return id;
}

/**
 * 解析脚注文本中的 URL
 * 提取 <https://example.com> 或 [text](url) 格式的 URL
 */
export function extractUrlFromFootnote(content: string): { text: string; url?: string } {
  // 匹配 <URL> 格式
  const angleMatch = content.match(/<(https?:\/\/[^>]+)>/);
  if (angleMatch) {
    return {
      text: content.replace(angleMatch[0], '').trim(),
      url: angleMatch[1],
    };
  }

  // 匹配 [text](url) 格式
  const markdownMatch = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (markdownMatch) {
    return {
      text: content.replace(markdownMatch[0], '').trim(),
      url: markdownMatch[2],
    };
  }

  return { text: content };
}

/**
 * 将脚注数据转换为组件可用的格式
 */
export function processFootnoteData(
  footnotes: Record<string, string>
): FootnoteItem[] {
  return Object.entries(footnotes).map(([id, content]) => {
    const type = identifyFootnoteType(id);
    const { text, url } = extractUrlFromFootnote(content);

    return {
      id,
      type,
      content: text,
      url,
    };
  });
}
