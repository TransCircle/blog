// 站点默认社交封面：构建期生成 /og-cover.png。
//
// 非文章页面（首页、标签页、搜索页、404）以及 JSON-LD 里的 Organization.image
// 都指向这张卡片，见 src/layouts/Layout.astro 的 ogImage 默认值。
// 它与文章卡共用 src/lib/og/render.ts 的画布与品牌横幅，因此品牌一改两处同步更新。

import type { APIRoute } from 'astro';
import { renderOgCover } from '@/lib/og/render';

export const GET: APIRoute = async () => {
  const png = await renderOgCover();

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
