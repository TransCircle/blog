// 重新生成构建期 OG 卡片渲染所用的 CJK 子集字体。
//
// 文章页的 OG 社交卡片（见 src/lib/og/）会用中文绘制标题、简介、标签与日期，
// 因此 satori 需要一份 CJK 字体。完整的 Noto Sans SC 每个字重约 8MB，直接随仓库
// 携带会让体积膨胀；这里把它裁剪到「文章 frontmatter 出现过的字形 + 卡片固定文案
// （标签、数字、标点）」这一最小集合。生成的 .woff 子集体积很小并随仓库提交，
// 只有当新文章引入了尚未覆盖的字符时，才需要重新运行本脚本：
//
//   node scripts/generate-og-fonts.mjs
//
// 字体来源：Noto Sans SC（SIL Open Font License 1.1），notofonts/noto-cjk。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = fileURLToPath(new URL('..', import.meta.url));
const postsDir = path.join(root, 'src/content/posts');
const cacheDir = path.join(root, '.cache/og-fonts-src');
const outDir = path.join(root, 'src/assets/og/fonts');

const SRC_BASE = 'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/';
const WEIGHTS = [
  { file: 'NotoSansSC-Regular.otf', out: 'NotoSansSC-Regular.subset.woff' },
  { file: 'NotoSansSC-Bold.otf', out: 'NotoSansSC-Bold.subset.woff' },
];

// 无论文章内容如何，卡片都会绘制的字符：品牌字标、元信息标签、
// 数字日期骨架、分隔符与标签前缀。确保「页面外壳」永远不缺字。
const CHROME =
  'TransCircle Development Blog 跨环开发博客' +
  '作者编辑更新于发布字阅读约分钟标签分类暂无简介等' +
  '记录项目进度、团队报告与技术分享' + // 站点默认封面卡（/og-cover.png）的标语
  '年月日时分·•#／/、，。：；！？（）【】「」《》〈〉—–…“”‘’·.,:;!?()[]{}@&%+-' +
  '0123456789' +
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function ensureSource(file) {
  const cached = path.join(cacheDir, file);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  console.log(`· 本地无缓存，下载 ${file} …`);
  const res = await fetch(SRC_BASE + file);
  if (!res.ok) throw new Error(`下载 ${file} 失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

// 收集所有文章 frontmatter 里的字符（含标题 / 简介 / 标签 / 作者 / 分类）。
// 直接取整段 frontmatter，过度包含的只是全 ASCII 的字段名与 YAML 符号，无害。
function collectPostChars() {
  let chars = '';
  for (const f of fs.readdirSync(postsDir)) {
    if (!f.toLowerCase().endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(postsDir, f), 'utf-8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) chars += fm[1];
  }
  return chars;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const text = Array.from(new Set((CHROME + collectPostChars()).split(''))).join('');
  console.log(`· 子集字符数：${text.length}`);
  for (const w of WEIGHTS) {
    const src = await ensureSource(w.file);
    const subset = await subsetFont(src, text, { targetFormat: 'woff' });
    fs.writeFileSync(path.join(outDir, w.out), subset);
    console.log(`✓ ${w.out}  ${(subset.length / 1024).toFixed(0)} KB`);
  }
  // 覆盖表：记录子集实际包含的字符，供构建期 findUncovered() 校验新文章是否缺字。
  fs.writeFileSync(path.join(outDir, 'coverage.txt'), text);
  console.log(`✓ coverage.txt  ${text.length} 字`);
  console.log('完成。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
