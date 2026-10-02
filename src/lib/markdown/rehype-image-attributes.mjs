/**
 * 正文图片补全属性：
 *  - width / height：从 public/ 下的原图读取像素尺寸，浏览器在图片加载前就能预留空间，
 *    消除累计布局偏移（CLS 是 Core Web Vitals 的排名信号之一）；
 *  - loading="lazy" + decoding="async"：正文图片都在首屏以下，延迟加载不影响 LCP；
 *  - 缺 alt 时构建期告警（alt 同时服务屏幕阅读器与图片搜索）。
 *
 * 只处理站内绝对路径（/images/…）；外链图片无法在构建期读取尺寸，保持原样。
 */
import fs from 'node:fs';
import path from 'node:path';

const publicDir = path.join(process.cwd(), 'public');
const cache = new Map();

/** 读取 PNG / JPEG / GIF / WebP 的像素尺寸；无法识别时返回 null。 */
function readSize(file) {
  if (cache.has(file)) return cache.get(file);
  let size = null;
  try {
    const buf = fs.readFileSync(file);
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      size = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } else if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
      size = { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    } else if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') {
        size = { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      } else if (chunk === 'VP8 ') {
        size = { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      } else if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        size = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    } else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        const length = buf.readUInt16BE(offset + 2);
        // SOF0–SOF15（排除 DHT / JPG / DAC）
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          size = { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
          break;
        }
        offset += 2 + length;
      }
    }
  } catch {
    size = null;
  }
  cache.set(file, size);
  return size;
}

const textOf = (node) =>
  node.type === 'text' ? node.value : Array.isArray(node.children) ? node.children.map(textOf).join('') : '';

/**
 * 正文里的一级标题：页面的 <h1> 已由文章标题占用，一页只能有一个 h1。
 * 与 frontmatter 标题相同的 h1 是重复内容，直接删除；其余降为 h2。作者无需关心这条规则。
 */
export function rehypeDemoteH1() {
  return (tree, file) => {
    const title = String(file?.data?.astro?.frontmatter?.title ?? '').trim();
    const visit = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.filter((child) => {
        if (child.type === 'element' && child.tagName === 'h1') {
          if (title && textOf(child).trim() === title) return false;
          child.tagName = 'h2';
        }
        return true;
      });
      node.children.forEach(visit);
    };
    visit(tree);
  };
}

export default function rehypeImageAttributes() {
  return (tree, file) => {
    const visit = (node) => {
      if (node.type === 'element' && node.tagName === 'img' && node.properties) {
        const props = node.properties;
        const src = typeof props.src === 'string' ? props.src : '';

        if (!props.alt) {
          const where = file?.path ? path.relative(process.cwd(), file.path) : '正文';
          console.warn(`[rehype-image-attributes] ${where}：图片 ${src} 缺少 alt 文本`);
        }
        if (props.loading === undefined) props.loading = 'lazy';
        if (props.decoding === undefined) props.decoding = 'async';

        if (src.startsWith('/') && !src.startsWith('//') && props.width === undefined && props.height === undefined) {
          let decoded = src.split(/[?#]/)[0];
          try {
            decoded = decodeURIComponent(decoded);
          } catch {
            /* 保持原样 */
          }
          const size = readSize(path.join(publicDir, decoded));
          if (size && size.width > 0 && size.height > 0) {
            props.width = size.width;
            props.height = size.height;
          }
        }
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(tree);
  };
}
