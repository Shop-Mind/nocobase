/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W2 一次性脚本:给没有缩略图的内置风格模版批量产小图。
// 流程:对一张标准商品图逐条模版跑 aiListingMedia:generate(落 File Manager)→ 回写模版 thumbUrl →
// 随手 discard 生成的候选(缩略图 URL 已留存,候选区保持干净)。可断点续跑:已有 thumbUrl 的模版自动跳过。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx SRC_IMAGE_URL=<标准商品图URL> [LIMIT=5] node gen-template-thumbs.js
// 可选 LLM_SERVICE=v_xxx MODEL=qwen-image-... 显式指定生图线路(缺省走服务端自动解析);
// 注意:单张 1-3 分钟,37 条全量约 1-2h,建议分批(LIMIT);生图线路不可用时直接报错退出。

const BASE = process.env.SHOT_BASE || 'http://localhost:13000';
const SRC = process.env.SRC_IMAGE_URL;
const LIMIT = Number(process.env.LIMIT) || Infinity;
const LLM_SERVICE = process.env.LLM_SERVICE || undefined;
const MODEL = process.env.MODEL || undefined;

async function main() {
  if (!SRC) {
    console.error('缺 SRC_IMAGE_URL(一张标准商品图的可回源 URL)');
    process.exit(1);
  }
  const signIn = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
    body: JSON.stringify({ account: process.env.SHOT_ACCOUNT, password: process.env.SHOT_PASSWORD }),
  });
  const token = (await signIn.json())?.data?.token;
  if (!token) {
    console.error('登录失败:请传 SHOT_ACCOUNT/SHOT_PASSWORD');
    process.exit(1);
  }
  const call = async (action, values, qs = '') => {
    const res = await fetch(`${BASE}/api/${action}${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(values || {}),
    });
    const body = await res.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === 'object' && 'ok' in body.data ? body.data : body;
    return { status: res.status, ok: payload?.ok === true || res.status === 200, data: payload?.data ?? body?.data };
  };

  const list = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen' });
  const pending = (list.data?.templates || []).filter((tpl) => !tpl.thumbUrl).slice(0, LIMIT);
  console.log(`待产缩略图:${pending.length} 条(已有跳过)`);

  let done = 0;
  for (const tpl of pending) {
    const started = Date.now();
    process.stdout.write(`[${done + 1}/${pending.length}] #${tpl.id} ${tpl.title} … `);
    const gen = await call('aiListingMedia:generate', {
      sourceImageUrl: SRC,
      scene: 'scene_gen',
      instruction: tpl.prompt,
      n: 1,
      llmService: LLM_SERVICE,
      model: MODEL,
    });
    const asset = gen.data?.assets?.[0];
    if (!gen.ok || !asset?.url) {
      console.log(`失败(${gen.status}),中断续跑即可`);
      process.exit(1);
    }
    const upd = await call('aiListingStyleTemplates:update', { thumbUrl: asset.url }, `?filterByTk=${tpl.id}`);
    if (asset.assetId) await call('aiListingMedia:discard', { assetId: asset.assetId });
    console.log(
      `${upd.status === 200 ? 'OK' : `回写失败 ${upd.status}`} (${Math.round((Date.now() - started) / 1000)}s)`,
    );
    done += 1;
  }
  console.log(`完成:${done} 条`);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
