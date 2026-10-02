/**
 * 博客站点身份的唯一信息源（SSOT）。
 *
 * <head>、JSON-LD、RSS / Atom / JSON Feed、llms.txt、_headers / _redirects、IndexNow
 * 与 SEO 测试都从这里取值；public/ 下的静态文本（robots.txt、humans.txt、security.txt、
 * site.webmanifest）里的同名字面量由 src/lib/seo/static-files.test.ts 校验一致。
 *
 * 组织实体（Organization）的名称、别名、sameAs 与主站仓库 TransCircle/TransCircle 的
 * src/seo/site.ts 保持一致：两站共用同一个 @id，搜索引擎与 AI 才会把它们归并为同一实体。
 *
 * 纯数据模块：不得引入 astro:content 等运行时，vitest 与构建脚本都要直接 import 它。
 */

export const SITE_ORIGIN = 'https://blog.transcircle.org';
export const SITE_URL = `${SITE_ORIGIN}/`;
export const SITE_HOST = 'blog.transcircle.org';

/** 站点名：og:site_name、application-name、WebSite.name 共用。 */
export const SITE_NAME = '跨环博客';
export const SITE_NAME_EN = 'TransCircle Blog';
/** <title> 后缀与分享卡片使用的双语站名。 */
export const SITE_TITLE = `${SITE_NAME} ${SITE_NAME_EN}`;
export const SITE_TAGLINE = '记录项目进展、社群知识与跨性别议题';
export const SITE_DESCRIPTION =
  '跨环（TransCircle Project）官方博客：记录项目进展、社群知识与跨性别议题，涵盖跨性别医疗（GAHT / HRT、抗雄、血检）、社群语言与档案、写作与设计规范，服务于中文 MtF 跨性别社群。';
export const SITE_LANGUAGE = 'zh-CN';
export const OG_LOCALE = 'zh_CN';
/** 博客首个提交日期（2026-05-20），作为 WebSite / Blog 的创立时间。 */
export const SITE_FOUNDING_DATE = '2026-05-20';

/* ── 组织实体：与主站共用 @id ───────────────────────────── */

export const ORG_ORIGIN = 'https://transcircle.org';
export const ORG_URL = `${ORG_ORIGIN}/`;
export const ORG_ID = `${ORG_URL}#organization`;
export const ORG_NAME = 'TransCircle Project';
/** 真实使用过的项目名写法；只收录本项目自己的名字，不认领通用词（与主站一致）。 */
export const ORG_ALTERNATE_NAMES = ['跨环', 'TransCircle', 'TransCircleProject', '跨性别圈工程'] as const;
export const ORG_FOUNDING_DATE = '2026-05-09';
export const ORG_DESCRIPTION =
  '跨环（TransCircle Project）是一个面向中文 MtF 跨性别社群的史官档案工程，致力于归档社群故事、记录抗争历史、团结同伴、争取跨性别权利。';

/** 官方社交主页：JSON-LD sameAs 与 <link rel="me">。 */
export const SOCIAL_PROFILES = [
  'https://github.com/TransCircle',
  'https://x.com/TransCircleOrg',
  'https://bsky.app/profile/TransCircle.org',
] as const;
export const TWITTER_HANDLE = '@TransCircleOrg';
export const SOURCE_REPOSITORY = 'https://github.com/TransCircle/blog';
export const MAIN_REPOSITORY = 'https://github.com/TransCircle/TransCircle';
export const BRAND_REPOSITORY = 'https://github.com/TransCircle/logo';
export const CONTACT_EMAIL = 'team@transcircle.org';
export const SECURITY_CONTACT = 'https://github.com/TransCircle/TransCircle/security/advisories/new';
export const JOIN_URL = `${ORG_ORIGIN}/s/join`;

/** 姊妹站点（与主站 PROJECTS 保持一致；只列已上线的官方站点）。 */
export const SISTER_SITES = [
  { url: 'https://transcircle.org/', name: '跨环 TransCircle' },
  { url: 'https://story.transcircle.org/', name: '跨环故事分享' },
  { url: 'https://community.transcircle.org/', name: 'TransCircle 社区论坛' },
] as const;

/* ── 许可证 ────────────────────────────────────────────── */

export const CONTENT_LICENSE_NAME = 'CC BY-SA 4.0';
export const CONTENT_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const CODE_LICENSE_NAME = 'AGPL-3.0';
export const CODE_LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

/** frontmatter 代码协议枚举（codeLicense）→ 显示名与协议 URL；Proprietary 没有公开协议页。 */
export const CODE_LICENSES: Readonly<Record<string, { name: string; url: string | null }>> = {
  'AGPL-3.0': { name: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
  MIT: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  'Apache-2.0': { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  'BSD-3-Clause': { name: 'BSD-3-Clause', url: 'https://opensource.org/licenses/BSD-3-Clause' },
  Proprietary: { name: '保留所有权利', url: null },
};

/** frontmatter 内容协议枚举 → 显示名。 */
export const CONTENT_LICENSE_NAMES: Readonly<Record<string, string>> = {
  'CC-BY-SA-4.0': 'CC BY-SA 4.0',
  'CC-BY-4.0': 'CC BY 4.0',
  'CC0-1.0': 'CC0 1.0',
  Proprietary: '保留所有权利',
};

/** frontmatter 内容协议枚举 → 规范 URL；Proprietary 没有公开协议页，不输出。 */
export const CONTENT_LICENSE_URLS: Readonly<Record<string, string>> = {
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/* ── 图像 ──────────────────────────────────────────────── */

export interface ImageAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export const LOGO: ImageAsset = { url: `${SITE_ORIGIN}/icon-512.png`, width: 512, height: 512 };

/**
 * 分享图版本号：**OG 卡片的版式或字体改动后 +1**。Telegram / X 等按图片 URL 缓存预览，
 * 同一 URL 换了内容也不会重抓；换版本号等于换 URL。
 */
export const OG_IMAGE_VERSION = 2;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const DEFAULT_OG_IMAGE_PATH = '/og-cover.png';

/* ── 页面外观（浏览器不解析 CSS 变量，须与 src/styles/theme.css 的 --bg 逐字一致） ── */

export const THEME_COLOR_LIGHT = '#fdf9fb';
export const THEME_COLOR_DARK = '#0c0a13';
/** 磁贴 / manifest 强调色：主行动色 --pink-600。 */
export const TILE_COLOR = '#efa8c0';

/* ── 推送 ──────────────────────────────────────────────── */

/** IndexNow key：public/<key>.txt 的文件名与内容都必须等于它。 */
export const INDEXNOW_KEY = 'b1ba2832c93fda19d24eb2a7b7e91ca3';

/* ── 描述长度约束（校验脚本与测试共用） ─────────────────── */

/** 中文 meta description 的建议上限（字符数）：搜索结果摘要约 80–120 个汉字后截断。 */
export const DESCRIPTION_MAX_LENGTH = 160;
export const DESCRIPTION_MIN_LENGTH = 16;
/** <title> 的建议上限（字符数，含站名后缀）。 */
export const TITLE_MAX_LENGTH = 64;
