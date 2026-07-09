/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W2 一次性脚本:给没有缩略图的内置风格模版批量产示例小图(对齐阿里模版卡「图+文」,用户反馈 #64)。
// 默认纯文生图(t2i,grok-imagine-image 等):模版 prompt + 该类目的代表性主体物 → aiListingMedia:generate
// {textToImage:true}(产物已转存 File Manager)→ 回写模版 thumbUrl → discard 生成的候选(URL 已留存,
// 候选区保持干净)。可断点续跑:已有 thumbUrl 的模版自动跳过。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx [LLM_SERVICE=v_xxx MODEL=grok-imagine-image] [LIMIT=5]
//       [SRC_IMAGE_URL=<公网商品图>] node gen-template-thumbs.js
// 传 SRC_IMAGE_URL 时改走图生图编辑(需线路支持 images/edits);缺省 t2i。

const BASE = process.env.SHOT_BASE || 'http://localhost:13000';
const SRC = process.env.SRC_IMAGE_URL || '';
const LIMIT = Number(process.env.LIMIT) || Infinity;
const LLM_SERVICE = process.env.LLM_SERVICE || undefined;
const MODEL = process.env.MODEL || undefined;

// 每类目的代表性主体物(t2i 没有商品图,靠它让示例图贴近该类目商品)
const SUBJECTS = {
  bags: '一只米色帆布托特包',
  home: '一组竹木收纳盒',
  festive: '一个系着缎带的红色礼品盒',
  food: '一罐透明玻璃瓶装的坚果零食',
  apparel: '一顶米白色针织毛线帽',
  industrial: '一把黑黄配色的电动工具',
  general: '一只白色哑光陶瓷杯',
};

async function main() {
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
    return {
      status: res.status,
      ok: payload?.ok === true || res.status === 200,
      data: payload?.data ?? body?.data,
      errors: payload?.errors,
    };
  };

  const list = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen' });
  const pending = (list.data?.templates || []).filter((tpl) => !tpl.thumbUrl).slice(0, LIMIT);
  console.log(`待产缩略图:${pending.length} 条(已有跳过)${SRC ? ' · 图生图模式' : ' · 纯文生图模式'}`);

  let done = 0;
  let failed = 0;
  for (const tpl of pending) {
    const started = Date.now();
    process.stdout.write(`[${done + failed + 1}/${pending.length}] #${tpl.id} ${tpl.title} … `);
    const subject = SUBJECTS[tpl.category] || SUBJECTS.general;
    const gen = await call('aiListingMedia:generate', {
      ...(SRC
        ? { sourceImageUrl: SRC, scene: 'scene_gen', instruction: tpl.prompt }
        : {
            textToImage: true,
            instruction: `电商商品场景摄影:${subject},${tpl.prompt}。真实光影,商业摄影质感,画面简洁主体突出。`,
          }),
      n: 1,
      llmService: LLM_SERVICE,
      model: MODEL,
    });
    const asset = gen.data?.assets?.[0];
    if (!gen.ok || !asset?.url) {
      failed += 1;
      console.log(`失败(${gen.errors?.[0]?.message || gen.status})`);
      // 连续 3 次失败视为线路故障,中断(续跑即可)
      if (failed >= 3 && done === 0) {
        console.error('连续失败,疑似生图线路不可用,中断。');
        process.exit(1);
      }
      continue;
    }
    const upd = await call('aiListingStyleTemplates:update', { thumbUrl: asset.url }, `?filterByTk=${tpl.id}`);
    if (asset.assetId) await call('aiListingMedia:discard', { assetId: asset.assetId });
    console.log(
      `${upd.status === 200 ? 'OK' : `回写失败 ${upd.status}`} (${Math.round((Date.now() - started) / 1000)}s)`,
    );
    done += 1;
  }
  console.log(`完成:${done} 条,失败 ${failed} 条`);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
