/**
 * 正文外链统一补 rel="nofollow noopener noreferrer"（AGENTS.md「内容安全」：所有外链必须加）。
 *
 * - 外链：http(s)（含协议相对的 `//host/…`）且主机不属于 transcircle.org（本站与主站、姊妹站互链保持 follow，维持实体关联）；
 * - 保留作者写的其他 rel 值（例如 license），只补缺失的三项；
 * - 站内相对链接、锚点（#…）、mailto: 不处理。
 *
 * 页面与全文 Feed 共用同一份渲染结果，因此两处都会带上。
 */

const REQUIRED = ['nofollow', 'noopener', 'noreferrer'];
const OWN_HOST = /(^|\.)transcircle\.org$/i;
// 以本站为基准解析：`//example.org/` 这类协议相对链接按浏览器的方式落到 https://example.org/，
// 站内相对链接与锚点落回本站主机
const BASE = 'https://blog.transcircle.org/';

export function isExternalHref(href) {
  if (typeof href !== 'string') return false;
  try {
    const url = new URL(href.trim(), BASE);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !OWN_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export default function rehypeExternalLinks() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'element' && node.tagName === 'a' && node.properties && isExternalHref(node.properties.href)) {
        const current = Array.isArray(node.properties.rel)
          ? node.properties.rel
          : typeof node.properties.rel === 'string'
            ? node.properties.rel.split(/\s+/)
            : [];
        node.properties.rel = [...new Set([...current.filter(Boolean), ...REQUIRED])];
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(tree);
  };
}
