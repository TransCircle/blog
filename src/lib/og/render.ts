// 构建期生成文章页 OG 社交卡片（1200×630 PNG）。
//
// 思路：用 satori 把一棵「类 HTML」节点树排版成 SVG（中文由内嵌的 Noto Sans SC
// 子集字体矢量化为 <path>，因此 resvg 无需任何系统字体即可栅格化），再用 resvg
// 渲染为 PNG。版式借鉴 GitHub 仓库社交卡：品牌页眉 + 标题 + 简介 + 元信息行
// （日期 / 更新 / 作者 / 阅读时长）+ 标签胶囊，配色与圆角遵循 DESIGN.md 的粉色系。
//
// satori 仅支持 flexbox，且任何含子节点的元素都需显式 display:flex —— 下面的
// div/col/row/text 辅助函数已统一处理，新增节点时请沿用。

import fs from 'node:fs';
import path from 'node:path';
import satori, { type Font } from 'satori';
import { Resvg } from '@resvg/resvg-js';

export interface OgCardData {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  pubDate: Date;
  updatedDate?: Date;
  authors?: string[];
  editors?: string[];
  wordCount?: number;
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// 取自 DESIGN.md 的浅色主题 token（粉色系）。
const C = {
  textMain: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#8a8a8a',
  primary: '#ff85a2',
  soft: '#ffccd5',
  accent: '#f06292',
  accentDeep: '#d6447a',
  divider: '#ffccd5',
  pillBg: '#ffedf1', // --hover-bg
  panel: '#ffffff',
};

// ── 资源加载（字体 + Logo + 子集覆盖表），按进程缓存，避免逐张卡片重复读盘 ──
let assets: { fonts: Font[]; logo: string; coverage: Set<string> } | null = null;

function loadAssets() {
  if (assets) return assets;
  const fontDir = path.join(process.cwd(), 'src/assets/og/fonts');
  const regular = fs.readFileSync(path.join(fontDir, 'NotoSansSC-Regular.subset.woff'));
  const bold = fs.readFileSync(path.join(fontDir, 'NotoSansSC-Bold.subset.woff'));
  const logoPng = fs.readFileSync(path.join(process.cwd(), 'public/icon-512.png'));
  // coverage.txt 由 scripts/generate-og-fonts.mjs 写出，记录子集实际包含的字符，
  // 供 findUncovered() 在构建期校验文章是否用到了未覆盖的字形。缺失则跳过校验。
  let coverage = new Set<string>();
  try {
    coverage = new Set(Array.from(fs.readFileSync(path.join(fontDir, 'coverage.txt'), 'utf-8')));
  } catch {
    /* 没有 coverage.txt 时不做校验 */
  }
  assets = {
    fonts: [
      { name: 'Noto Sans SC', data: regular, weight: 400, style: 'normal' },
      { name: 'Noto Sans SC', data: bold, weight: 700, style: 'normal' },
    ],
    logo: `data:image/png;base64,${logoPng.toString('base64')}`,
    coverage,
  };
  return assets;
}

/** 返回 text 中未被已提交字体子集覆盖的字符（去重，忽略空白）。用于构建期告警。 */
export function findUncovered(text: string): string[] {
  const { coverage } = loadAssets();
  if (coverage.size === 0) return [];
  const missing = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (!coverage.has(ch)) missing.add(ch);
  }
  return Array.from(missing);
}

// ── 轻量 VDOM 辅助：satori 接受 { type, props } 的 React-like 节点 ──────────
type Node = { type: string; props: Record<string, unknown> };
type Style = Record<string, unknown>;

const el = (type: string, style: Style, children?: unknown): Node => ({
  type,
  props: children === undefined ? { style } : { style, children },
});
const col = (style: Style, children?: unknown) =>
  el('div', { display: 'flex', flexDirection: 'column', ...style }, children);
const row = (style: Style, children?: unknown) =>
  el('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const text = (style: Style, value: string) => el('div', { display: 'flex', ...style }, value);
const image = (src: string, style: Style): Node => ({ type: 'img', props: { src, style } });

// ── 描边图标 → data URI（颜色烘焙进 SVG，satori 以 <img> 渲染）──────────────
function icon(paths: string, color: string, size = 26): Node {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return image(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, {
    width: size,
    height: size,
  });
}
const ICONS = {
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>',
  update: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 9.5 15.5 9.5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-3.8 3.4-5.8 7.5-5.8s7.5 2 7.5 5.8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
};

// ── 文本工具：按「字素簇」遍历（避免截断组合字符 / emoji 序列），
//    宽度用东亚宽度近似估算（CJK / 假名 / 谚文 / 全角 / emoji ≈ 1，其余 ≈ 0.55）。
const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // 谚文字母
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首 / 符号标点
    (cp >= 0x3041 && cp <= 0x33ff) || // 假名 .. CJK 兼容
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 基本
    (cp >= 0xa000 && cp <= 0xa4cf) || // 彝文
    (cp >= 0xac00 && cp <= 0xd7a3) || // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 兼容形式
    (cp >= 0xff00 && cp <= 0xff60) || // 全角 ASCII
    (cp >= 0xffe0 && cp <= 0xffe6) || // 全角符号
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji / 符号
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK 扩展 B 及以上
  );
}

function graphemeWidth(g: string): number {
  return isWideCodePoint(g.codePointAt(0) ?? 0) ? 1 : 0.55;
}

function visualLen(s: string): number {
  let n = 0;
  for (const { segment } of segmenter.segment(s)) n += graphemeWidth(segment);
  return n;
}
function clampVisual(s: string, max: number): string {
  let n = 0;
  let out = '';
  for (const { segment } of segmenter.segment(s)) {
    n += graphemeWidth(segment);
    if (n > max) return out.replace(/\s+$/, '') + '…';
    out += segment;
  }
  return out;
}
function titleFontSize(s: string): number {
  const v = visualLen(s);
  if (v <= 13) return 62;
  if (v <= 19) return 54;
  if (v <= 27) return 46;
  if (v <= 36) return 40;
  return 36;
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

// ── 构建卡片节点树 ────────────────────────────────────────────────────────
function buildCard(data: OgCardData, logo: string): Node {
  const title = clampVisual(data.title, 52);
  const description = data.description ? clampVisual(data.description, 66) : '';
  const showCategory = !!data.category && data.category !== 'general';
  const tags = (data.tags ?? []).slice(0, 4);
  const extraTags = (data.tags?.length ?? 0) - tags.length;

  // 元信息条目（图标 + 文本），仅在有值时加入
  const metaItems: Node[] = [
    row({ gap: 9 }, [
      icon(ICONS.calendar, C.accent),
      text({ color: C.textSecondary }, formatDate(data.pubDate)),
    ]),
  ];
  if (data.updatedDate) {
    metaItems.push(
      row({ gap: 9 }, [
        icon(ICONS.update, C.accent),
        text({ color: C.textSecondary }, `更新于 ${formatDate(data.updatedDate)}`),
      ])
    );
  }
  if (data.wordCount && data.wordCount > 0) {
    const mins = Math.max(1, Math.round(data.wordCount / 400));
    metaItems.push(
      row({ gap: 9 }, [
        icon(ICONS.clock, C.accent),
        text({ color: C.textSecondary }, `约 ${mins} 分钟`),
      ])
    );
  }
  // 用「·」分隔的元信息行
  const metaRow: Node[] = [];
  metaItems.forEach((item, i) => {
    if (i > 0) metaRow.push(text({ color: C.divider, fontSize: 22, margin: '0 4px' }, '·'));
    metaRow.push(item);
  });

  // 署名行：作者 + 编辑。先 trim 并各自去重，再剔除与作者重名的编辑，
  // 避免「作者 X · 编辑 X」「编辑 X、X」之类的冗余。
  const norm = (list?: string[]) =>
    Array.from(new Set((list ?? []).map((n) => n.trim()).filter(Boolean)));
  const authors = norm(data.authors);
  const authorSet = new Set(authors);
  const editors = norm(data.editors).filter((n) => !authorSet.has(n));
  const peopleSegment = (label: string, names: string[]) =>
    row({ gap: 8 }, [
      text({ color: C.textMuted }, label),
      text({ color: C.textSecondary }, clampVisual(names.join('、'), 18)),
    ]);
  const bylineParts: Node[] = [];
  if (authors.length > 0) bylineParts.push(peopleSegment('作者', authors));
  if (editors.length > 0) {
    if (bylineParts.length > 0) bylineParts.push(text({ color: C.divider, fontSize: 22 }, '·'));
    bylineParts.push(peopleSegment('编辑', editors));
  }
  const bylineRow =
    bylineParts.length > 0
      ? row({ fontSize: 23, fontWeight: 400, gap: 14 }, [
          icon(ICONS.user, C.accent, 24),
          ...bylineParts,
        ])
      : el('div', { display: 'none' });

  const tagPills: Node[] = tags.map((t) =>
    text(
      {
        fontSize: 22,
        color: C.accentDeep,
        backgroundColor: C.pillBg,
        padding: '8px 20px',
        borderRadius: 50,
        border: `1px solid ${C.soft}`,
      },
      `#${clampVisual(t, 12)}`
    )
  );
  if (extraTags > 0) {
    tagPills.push(
      text(
        { fontSize: 22, color: C.textMuted, padding: '8px 8px', borderRadius: 50 },
        `+${extraTags}`
      )
    );
  }

  return col(
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      position: 'relative',
      fontFamily: 'Noto Sans SC',
      backgroundColor: '#fff9fb',
      backgroundImage:
        'radial-gradient(1100px 520px at 88% -8%, rgba(255,133,162,0.20), rgba(255,133,162,0) 60%),' +
        'radial-gradient(820px 480px at 0% 112%, rgba(240,98,146,0.14), rgba(240,98,146,0) 60%),' +
        'linear-gradient(160deg, #fffafc 0%, #fff3f7 100%)',
      padding: '62px 72px',
      justifyContent: 'space-between',
    },
    [
      // 细描边框，让卡片在浅色背景下也有清晰边界
      el('div', {
        position: 'absolute',
        top: 22,
        left: 22,
        right: 22,
        bottom: 22,
        border: `1px solid ${C.divider}`,
        borderRadius: 28,
      }),

      // ── 页眉：Logo + 字标 ↔ 分类徽标 ──────────────────────────────────
      row({ justifyContent: 'space-between' }, [
        row({ gap: 20 }, [
          el(
            'div',
            {
              display: 'flex',
              width: 78,
              height: 78,
              borderRadius: 20,
              backgroundImage: 'linear-gradient(135deg, #ffd9e2, #ff9bb3)',
              border: '1px solid rgba(214,68,122,0.25)',
              boxShadow: '0 6px 18px rgba(240,98,146,0.28)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            },
            [image(logo, { width: 78, height: 78, borderRadius: 20 })]
          ),
          col({ gap: 4 }, [
            text(
              { fontSize: 30, fontWeight: 700, color: C.textMain, letterSpacing: '0.01em' },
              '跨环开发博客'
            ),
            text(
              { fontSize: 18, fontWeight: 400, color: C.textMuted, letterSpacing: '0.04em' },
              'TransCircle Dev Blog'
            ),
          ]),
        ]),
        showCategory
          ? text(
              {
                fontSize: 22,
                fontWeight: 700,
                color: '#ffffff',
                backgroundImage: 'linear-gradient(135deg, #ff85a2, #f06292)',
                padding: '10px 24px',
                borderRadius: 50,
                boxShadow: '0 4px 12px rgba(240,98,146,0.30)',
              },
              clampVisual(data.category!, 12)
            )
          : el('div', { display: 'flex' }),
      ]),

      // ── 主体：跨性别旗强调竖条 + 标题 + 简介 ───────────────────────────
      row({ flexGrow: 1, alignItems: 'center', padding: '24px 0' }, [
        el('div', {
          display: 'flex',
          width: 8,
          alignSelf: 'stretch',
          marginRight: 28,
          borderRadius: 8,
          maxHeight: 232,
          backgroundImage:
            'linear-gradient(180deg, #55cdfc 0%, #55cdfc 22%, #f7a8b8 22%, #f7a8b8 40%, #ffffff 40%, #ffffff 60%, #f7a8b8 60%, #f7a8b8 78%, #55cdfc 78%, #55cdfc 100%)',
          boxShadow: '0 4px 16px rgba(85,205,252,0.25)',
        }),
        col({ flexGrow: 1, gap: 22 }, [
          text(
            {
              fontSize: titleFontSize(data.title),
              fontWeight: 700,
              color: C.textMain,
              lineHeight: 1.22,
              letterSpacing: '-0.01em',
            },
            title
          ),
          description
            ? text(
                { fontSize: 27, fontWeight: 400, color: C.textSecondary, lineHeight: 1.5 },
                description
              )
            : el('div', { display: 'none' }),
        ]),
      ]),

      // ── 页脚：署名行（作者/编辑）+ 日期/阅读行 + 标签胶囊 ──────────────
      col({ gap: 18 }, [
        bylineRow,
        row({ fontSize: 23, fontWeight: 400 }, metaRow),
        tagPills.length > 0
          ? row({ gap: 12, flexWrap: 'wrap' }, tagPills)
          : el('div', { display: 'none' }),
      ]),
    ]
  );
}

// ── 对外入口：数据 → PNG Buffer ───────────────────────────────────────────
export async function renderOgImage(data: OgCardData): Promise<Buffer> {
  const { fonts, logo } = loadAssets();
  const svg = await satori(buildCard(data, logo) as unknown as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
