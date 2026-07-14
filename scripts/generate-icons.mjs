// 由品牌矢量标志生成站点全套图标（favicon / PWA / Apple Touch）。
//
// 唯一的图标源文件是 src/assets/brand/transcircle-mark.svg（纯图标环形标）。
// 本脚本用 resvg 把它栅格化成各平台需要的 PNG，并写入 public/。产物随仓库提交，
// 因此只有在品牌标志变更后才需要重新运行：
//
//   pnpm run icons
//
// 各产物的差异只在「底色」与「留白」：
//   - favicon / icon-192 / icon-512：透明底、满幅，浏览器与 PWA 通用；
//   - icon-maskable：Android 会把图标裁成圆形/方圆形，内容必须落在中心 80% 的
//     安全区内，所以缩到 78% 并补白底；
//   - apple-touch-icon：iOS 不支持透明（会填黑），因此补白底并留出一圈边距。
// 标志的白色弧段靠自带投影与背景区分，所以底色统一用纯白而非粉色。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = fileURLToPath(new URL('..', import.meta.url));
const markPath = path.join(root, 'src/assets/brand/transcircle-mark.svg');
const outDir = path.join(root, 'public');

const BG = '#ffffff'; // 不透明底色（仅 maskable / apple-touch 使用）

const markSvg = fs.readFileSync(markPath, 'utf-8');
const markUri = `data:image/svg+xml;base64,${Buffer.from(markSvg).toString('base64')}`;

/**
 * 把图标源以 scale 比例居中放进 size×size 画布并栅格化。
 * bg 为 null 时保持透明底。
 */
function render(size, { scale = 1, bg = null } = {}) {
  const inner = Math.round(size * scale);
  const offset = (size - inner) / 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '',
    `<image x="${offset}" y="${offset}" width="${inner}" height="${inner}" href="${markUri}"/>`,
    `</svg>`,
  ].join('');
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false }, // 标志已全部转为路径，无需系统字体
  })
    .render()
    .asPng();
}

/** 把若干 PNG 打包成 ICO 容器（PNG-in-ICO，现代浏览器均支持）。 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width（256 记为 0）
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // 调色板色数（PNG 恒为 0）
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const OUTPUTS = [
  { file: 'favicon.png', size: 32 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable.png', size: 512, scale: 0.78, bg: BG },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.86, bg: BG },
];

fs.mkdirSync(outDir, { recursive: true });

// 矢量图标：现代浏览器优先使用，同时供页头/页脚以 <img> 引用
fs.writeFileSync(path.join(outDir, 'logo-mark.svg'), markSvg);
console.log(`✓ logo-mark.svg（矢量源）`);

for (const { file, size, scale, bg } of OUTPUTS) {
  const png = render(size, { scale, bg });
  fs.writeFileSync(path.join(outDir, file), png);
  console.log(`✓ ${file}（${size}×${size}${bg ? '，白底' : '，透明底'}）`);
}

const ico = buildIco([16, 32, 48].map((size) => ({ size, png: render(size) })));
fs.writeFileSync(path.join(outDir, 'favicon.ico'), ico);
console.log(`✓ favicon.ico（16/32/48 三尺寸）`);

console.log('\n图标已全部写入 public/，请一并提交。');
