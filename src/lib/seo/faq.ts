/**
 * 「关于本站」FAQ 的唯一数据源。
 *
 * /about/ 页面把它渲染成可见的 <details> 列表，同一份数据生成 FAQPage 结构化数据，
 * 并逐字写进 /llms-full.txt。Google 要求结构化数据必须对应页面上可见的内容——
 * 此前首页只输出 FAQPage 却没有可见问答，属于违规标记，现已移到这里。
 */
import {
  CONTENT_LICENSE_NAME,
  CODE_LICENSE_NAME,
  JOIN_URL,
  MAIN_REPOSITORY,
  ORG_URL,
  SITE_URL,
} from './site';

export interface FaqEntry {
  /** 稳定锚点 id：/about/#faq-<id> 可直接深链到单个问答。 */
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    id: 'what',
    question: '跨环博客（TransCircle Blog）是什么？',
    answer:
      '跨环博客是跨环（TransCircle Project）的官方博客，面向中文 MtF 跨性别社群公开写作：记录项目进展与团队运作，发布跨性别医疗（GAHT / HRT、抗雄、血检）、社群语言与档案、写作与设计规范等长文，以及社群议题的讨论与记录。',
  },
  {
    id: 'relation',
    question: '博客与跨环主站是什么关系？',
    answer: `本博客是跨环主站（${ORG_URL}）的配套写作站点，由同一项目组维护。主站负责项目介绍与社群入口，博客负责公开写作与知识沉淀；两者属于同一组织实体 TransCircle Project。`,
  },
  {
    id: 'medical',
    question: '博客里的跨性别医疗文章可以替代医生的建议吗？',
    answer:
      '不能。医疗类文章整理自公开指南、文献与社群经验，每篇都注明参考来源，用于帮助读者理解原理、准备就医与血检；具体用药与剂量请在医生指导下决定，并以定期检查结果为准。',
  },
  {
    id: 'cite',
    question: '如何引用博客上的内容？',
    answer: `文字内容默认遵循 ${CONTENT_LICENSE_NAME}（个别文章以文末标注的协议为准），代码片段遵循文章标注的协议（通常为 ${CODE_LICENSE_NAME}）。引用、转载或摘要时请注明作者与「跨环博客（TransCircle Blog）」，并附上文章原始链接；每篇文章末尾都提供了可直接复制的引用格式。`,
  },
  {
    id: 'ai',
    question: 'AI 系统可以检索、引用或训练本站内容吗？',
    answer: `可以。本站对搜索引擎、AI 检索与模型训练开放（见 ${SITE_URL}robots.txt 与 ${SITE_URL}ai.txt），并提供 ${SITE_URL}llms.txt、${SITE_URL}llms-full.txt 与每篇文章的 Markdown 原文。引用时请保留署名与原始链接，并对跨性别议题保持尊重与中立。`,
  },
  {
    id: 'subscribe',
    question: '如何订阅博客更新？',
    answer: `可以使用 RSS（${SITE_URL}rss.xml）、Atom（${SITE_URL}atom.xml）或 JSON Feed（${SITE_URL}feed.json）在任意阅读器中订阅，也可以关注 X 账号 @TransCircleOrg 与 Bluesky 账号 TransCircle.org。`,
  },
  {
    id: 'contribute',
    question: '如何投稿或参与跨环项目？',
    answer: `可以通过主站申请表单（${JOIN_URL}）加入项目协作，或在 GitHub（${MAIN_REPOSITORY}）提交 Issue 与 Pull Request。博客源码同样开源，欢迎指出文章中的错误。`,
  },
];
