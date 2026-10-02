/**
 * 标签导语：渲染在标签页页首，并作为该页的 meta description。
 *
 * 只有文章列表的标签页内容很薄，是 Search Console「已发现 / 已抓取 - 尚未编入索引」的常见原因。
 * 一两句说明「这个主题是什么、这里收录什么」，让每个标签页都有独立、可被引用的文字内容。
 *
 * 新增标签不必马上补这里：没有人工导语的标签会用该标签下的文章自动生成描述（见 tagDescription），
 * pnpm check:seo 会给出提示，方便之后补一句更好的人工导语。
 * 这些文字需要编辑组审阅，尤其是医疗相关条目。
 */
import { own } from '../lib/seo/dict';

export const TAG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  GAHT:
    '性别肯定激素治疗（Gender-Affirming Hormone Therapy，GAHT，社群中也常称 HRT）相关文章：方案选择、个体差异、用药安全与监测，内容整理自临床指南、文献与社群经验，不构成医疗建议。',
  血检:
    '性激素血检相关文章：为什么要查、怎么在医院开单、何时抽血，以及雌二醇、睾酮、泌乳素、肝肾功能等指标的解读与异常排查。',
  抗雄:
    '抗雄激素方案相关文章：色普龙（醋酸环丙孕酮）、比卡鲁胺、螺内酯、GnRH 类似物等药物的机制、副作用、禁忌与适用人群比较。',
  扭转机构:
    '关于「扭转治疗」机构与相关事件的记录与讨论：受害者的经历、社群救援，以及围绕报道与发声方式的争议。',
  争议:
    '社群内部与公共舆论中的争议事件记录：事件经过、各方观点与原始出处，尽量保留一手资料，供读者自行判断。',
  文章规范:
    '跨环项目的中文写作规范：标点符号、用语与排版约定，供投稿者、编辑与校对参考。',
  标点符号:
    '中文标点符号的用法规范：逗号、分号、引号、书名号等的使用场景与 Unicode 码位，按跨环项目的写作约定整理。',
  前端:
    '跨环博客与相关站点的前端开发记录：组件设计、无障碍访问、主题与样式实现等技术实践。',
  a11y:
    '无障碍访问（Accessibility，a11y）相关文章：键盘导航、屏幕阅读器、对比度与减少动效等实践，本站默认遵循 WCAG 2.1。',
  设计规范:
    '跨环项目的设计规范与设计系统：色彩与字体令牌、组件规格、交互状态与无障碍要求。',
  语言学:
    '从语言学角度讨论跨性别社群用语：词性、构词与用法辨析，以及社群术语在中文语境中的定义问题。',
  词性:
    '社群常用词的词性辨析：例如「Pass」「深柜」等词在中文里究竟作形容词、名词还是动词使用。',
  Astro:
    '与 Astro 静态站点框架相关的开发记录：本博客的架构、内容集合、构建与部署实践。',
  架构:
    '跨环博客与相关项目的技术架构设计：技术选型、目录结构、构建流程与部署方式的决策记录。',
  路线图:
    '跨环项目的开发路线图与阶段计划：已完成、进行中与规划中的工作。',
  问答:
    '对社群提问与 GitHub Issue 的公开答复：关于项目定位、方向与做法的问答记录。',
  项目定位:
    '关于跨环项目定位的说明与讨论：项目希望成为什么、服务谁、与其他社群资源的关系。',
};

export interface TaggedPost {
  readonly title: string;
  readonly category: string;
}

/**
 * 标签页导语。有人工导语就用人工的；新标签还没写导语时，用该标签下的文章自动生成一句
 * 实打实的描述（篇数、分类、文章标题），不会退化成只有一句「共 N 篇」的薄页面。
 */
export function tagDescription(tag: string, posts: readonly TaggedPost[]): string {
  const curated = own(TAG_DESCRIPTIONS, tag);
  if (curated) return curated;

  const categories = [...new Set(posts.map((p) => p.category))];
  const titles = posts.slice(0, 3).map((p) => `《${p.title}》`);
  const more = posts.length > titles.length ? '等' : '';
  const scope = categories.length > 0 ? `，分类涉及${categories.join('、')}` : '';
  return `跨环博客中标记为「${tag}」的 ${posts.length} 篇文章${scope}：${titles.join('、')}${more}。`;
}
