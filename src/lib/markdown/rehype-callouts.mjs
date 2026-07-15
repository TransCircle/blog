/**
 * rehype 插件：把 GitHub 风格的「提示 / 警告框」（Callout / Alert）语法
 * 渲染成带图标与标题的强调块。
 *
 * ── 为什么放在 rehype 而不是 remark ──────────────────────────────
 * 本站文章是纯 Markdown（无 MDX），作者不写组件、只写 Markdown。GitHub 的
 * 告示语法 `> [!WARNING]` 借用了「首行是 [!类型] 的引用块」这一形式：在标准
 * Markdown 里 `[!WARNING]` 不是合法链接（后面没有 `()`），会原样留作文本，
 * 因此**不会破坏任何已有的普通引用块**——只有首段以 `[!类型]` 开头的引用块
 * 才会被本插件接管。与 astro.config.mjs 里既有的两个 rehype 插件同源，无需
 * 引入 remark 依赖。
 *
 * ── 支持的语法 ───────────────────────────────────────────────────
 *   > [!WARNING]
 *   > 正文可以有多段、可含 **加粗**、列表、链接、脚注等。
 *
 *   > [!NOTE] 自定义标题        ← 类型标记后同一行可写自定义标题，覆盖默认字样
 *   > 正文……
 *
 * 五种类型（大小写不敏感）及默认标题 / 配色语义：
 *   note      备注   蓝（信息）
 *   tip       提示   绿（成功）
 *   important 重要   粉（品牌）
 *   warning   警告   琥珀（警示）
 *   caution   危险   红（危险）
 *
 * 产出结构（配色与排版见 src/styles/global.css 的 .callout 段）：
 *   <div class="callout callout-warning" role="note">
 *     <p class="callout-title"><span class="callout-icon"><svg…/></span><span class="callout-label">警告</span></p>
 *     …原引用块的正文（已剥去 [!类型] 标记）…
 *   </div>
 */

// 首段起始文本的匹配：允许前导空白 → [!类型] → 同行余下作为自定义标题 → 换行 → 正文
const CALLOUT_RE =
  /^\s*\[!(note|tip|important|warning|caution)\][^\S\r\n]*([^\r\n]*)(?:\r?\n)?([\s\S]*)$/i;

const DEFAULT_LABELS = {
  note: '备注',
  tip: '提示',
  important: '重要',
  warning: '警告',
  caution: '危险',
};

// 图标用 feather 风格描边路径（viewBox 0 0 24 24），颜色继承标题的 currentColor。
// 每种类型的图标互相可辨：信息圈 / 灯泡 / 对话框 / 三角 / 八边形。
const ICON_PATHS = {
  note: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['line', { x1: '12', y1: '16', x2: '12', y2: '12' }],
    ['line', { x1: '12', y1: '8', x2: '12.01', y2: '8' }],
  ],
  tip: [
    ['path', { d: 'M9 18h6' }],
    ['path', { d: 'M10 22h4' }],
    ['path', { d: 'M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z' }],
  ],
  important: [
    ['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
    ['line', { x1: '8', y1: '9', x2: '16', y2: '9' }],
    ['line', { x1: '8', y1: '13', x2: '13', y2: '13' }],
  ],
  warning: [
    ['path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }],
    ['line', { x1: '12', y1: '9', x2: '12', y2: '13' }],
    ['line', { x1: '12', y1: '17', x2: '12.01', y2: '17' }],
  ],
  caution: [
    ['path', { d: 'M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z' }],
    ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }],
    ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }],
  ],
};

// 迷你 hast 构造器（避免引入 hastscript 依赖）
const h = (tagName, properties, children = []) => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = (value) => ({ type: 'text', value });

// 用 camelCase 的 hast 属性名（viewBox / strokeWidth …），hast-util-to-html 会
// 在 svg 命名空间下正确序列化成 view-box 之外的连字符属性。
function buildIcon(type) {
  const children = ICON_PATHS[type].map(([tagName, props]) => h(tagName, props));
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ariaHidden: 'true',
      focusable: 'false',
    },
    children,
  );
}

// 段落里若只剩空白文本节点，视为空段（剥掉标记后的首段常常如此）
function isBlankParagraph(node) {
  return (
    node.type === 'element' &&
    node.tagName === 'p' &&
    node.children.every(
      (child) => child.type === 'text' && child.value.trim() === '',
    )
  );
}

function transformBlockquote(node) {
  const pIndex = node.children.findIndex(
    (child) => child.type === 'element' && child.tagName === 'p',
  );
  if (pIndex === -1) return false;

  const para = node.children[pIndex];
  const firstChild = para.children[0];
  // 标记必须是段首的裸文本（`[!WARNING]`）；若首个子节点是 <strong>/<a> 等则不是告示块
  if (!firstChild || firstChild.type !== 'text') return false;

  const match = firstChild.value.match(CALLOUT_RE);
  if (!match) return false;

  const type = match[1].toLowerCase();
  const inlineTitle = match[2].trim();
  // 剥去 [!类型] 标记（及同行自定义标题），把该行之后的正文留在原段
  firstChild.value = match[3];

  // 剥完若首段已空（标记后紧跟空行、正文另起段落的写法），删掉这个空段
  if (isBlankParagraph(para)) node.children.splice(pIndex, 1);

  const label = inlineTitle || DEFAULT_LABELS[type];
  const titleParagraph = h('p', { className: ['callout-title'] }, [
    h('span', { className: ['callout-icon'] }, [buildIcon(type)]),
    h('span', { className: ['callout-label'] }, [text(label)]),
  ]);

  // 原地把 <blockquote> 改成 <div class="callout …">，标题段插到最前
  node.tagName = 'div';
  node.properties = {
    className: ['callout', `callout-${type}`],
    role: 'note',
  };
  node.children.unshift(titleParagraph);
  return true;
}

export default function rehypeCallouts() {
  return (tree) => {
    // 手写遍历，沿用 astro.config.mjs 既有插件的风格，不引入 unist-util-visit
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child.type === 'element' && child.tagName === 'blockquote') {
          transformBlockquote(child);
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
