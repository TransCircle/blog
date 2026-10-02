/**
 * 正文 HTML 的安全兜底（AGENTS.md「内容安全」：禁止 script、iframe、onerror、onclick、javascript: URL）。
 *
 * Astro 的 Markdown 管线允许内联原始 HTML（文章里的 <img>、注释等都依赖它）。文章虽然由团队经仓库提交，
 * 但渲染结果还会进入全文 RSS / Atom / JSON Feed，被第三方阅读器与聚合器原样展示——
 * 这里在 HTML 树上剥掉可执行的部分，页面与 Feed 走的是同一份渲染结果，因此一处生效、处处生效。
 *
 * 只删危险内容，不做白名单重写：Callout、脚注、表格、代码高亮等正常结构原样保留。
 * 放在 rehype 插件链的第一位，后续插件看到的已经是清洗过的树。
 */

/** 整个删除的元素（连同子节点）。 */
const BLOCKED_ELEMENTS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'link',
  'style',
  'form',
  // <noscript> 的内容在「启用脚本」时按原始文本解析：属性文字里的 `</noscript>` 会提前结束它，
  // 后面的文字在浏览器里重新变成真正的标签（清洗时看到的只是属性值），可绕过下面的事件属性清理
  'noscript',
  // 同属「内容按原始文本解析」的废弃元素：正文用不到，一并删除，免得解析器与浏览器的理解不一致
  'noembed',
  'noframes',
  'xmp',
  'plaintext',
  // 作者手写的 SVG / MathML 整体删除：SVG 的 <set> / <animate> 能在浏览器里把安全链接的 href
  // 动态改成 javascript:，属性黑名单拦不住。正文配图请用 <img> / Markdown 图片语法；
  // Callout 图标等由后续插件生成的可信 SVG 不受影响（本插件在它们之前执行）
  'svg',
  'math',
  'set',
  'animate',
  'animateMotion',
  'animatemotion',
  'animateTransform',
  'animatetransform',
  'foreignObject',
  'foreignobject',
  // <template> 的内容存放在 HAST 的独立 content 字段里，而且声明式 Shadow DOM（shadowrootmode）
  // 会在解析时把它装进真实的 Shadow Root 并执行其中的事件处理器。正文用不到模板，整体删除
  'template',
]);

/** 可能携带 URL 的属性（hast 属性名为 camelCase）。 */
const URL_PROPERTIES = new Set(['href', 'src', 'action', 'formAction', 'poster', 'cite', 'background', 'xLinkHref', 'srcSet']);

/** 可执行的 URL 协议；data: 只允许用于图片。 */
function isUnsafeUrl(value, tagName, prop) {
  const text = String(value).replace(/[\u0000-\u001f\u007f\s]+/g, '').toLowerCase();
  if (/^(javascript|vbscript):/.test(text)) return true;
  if (text.startsWith('data:')) return !(tagName === 'img' && prop === 'src' && /^data:image\/(png|jpe?g|gif|webp|avif);/.test(text));
  return false;
}

export default function rehypeStripUnsafe() {
  return (tree, file) => {
    const removed = new Set();
    const visit = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.filter((child) => {
        if (child.type === 'element' && BLOCKED_ELEMENTS.has(child.tagName)) {
          removed.add(`<${child.tagName}>`);
          return false;
        }
        return true;
      });
      for (const child of node.children) {
        if (child.type === 'element' && child.properties) {
          for (const [prop, value] of Object.entries(child.properties)) {
            // 事件处理器（onClick、onError…）与 srcdoc 一律删除
            if (/^on/i.test(prop) || prop === 'srcDoc') {
              delete child.properties[prop];
              removed.add(prop);
            } else if (URL_PROPERTIES.has(prop) && value != null) {
              const values = Array.isArray(value) ? value : [value];
              if (values.some((v) => isUnsafeUrl(v, child.tagName, prop))) {
                delete child.properties[prop];
                removed.add(`${prop}=unsafe-url`);
              }
            }
          }
        }
        visit(child);
        // 防御性：任何带 content 子树的节点（template 已整体删除，这里兜底）也要清洗
        if (child.content) visit(child.content);
      }
    };
    visit(tree);
    if (removed.size > 0) {
      const where = file?.path ?? '正文';
      console.warn(`[rehype-strip-unsafe] ${where}：已移除不安全的 HTML（${[...removed].join('、')}）`);
    }
  };
}
