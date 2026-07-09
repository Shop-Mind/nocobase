/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W6 计价 E2E:estimateCost 档位/张数/源图数敏感 + breakdown 算式;t2i 生成 1 张 → genParams.estimatedBeans
// 落库且历史可见 → 清理(净零)。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx node verify-w6-pricing.js

const BASE = process.env.SHOT_BASE || 'http://localhost:13000';

async function main() {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };
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
  const call = async (action, values) => {
    const res = await fetch(`${BASE}/api/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(values || {}),
    });
    const body = await res.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === 'object' && 'ok' in body.data ? body.data : body;
    return { status: res.status, ok: payload?.ok === true, data: payload?.data, errors: payload?.errors };
  };

  // 1) 档位敏感 + 算式
  const basic = await call('aiListingMedia:estimateCost', { scene: 'scene_gen', tier: 'basic', count: 2, sources: 1 });
  const adv = await call('aiListingMedia:estimateCost', { scene: 'scene_gen', tier: 'advanced', count: 2, sources: 1 });
  check(
    '基础/进阶档位价不同',
    basic.data?.beans === 20 && adv.data?.beans === 34,
    `${basic.data?.beans} vs ${adv.data?.beans}`,
  );
  const multi = await call('aiListingMedia:estimateCost', { scene: 'white_bg', tier: 'basic', count: 1, sources: 3 });
  check(
    '源图数进入算式(白底×3源图)',
    multi.data?.beans === 12 && multi.data?.breakdown?.images === 3,
    JSON.stringify(multi.data?.breakdown),
  );

  // 2) 生成记账:genParams.estimatedBeans 落库 + 历史可见
  const gen = await call('aiListingMedia:generate', {
    textToImage: true,
    instruction: 'W6验收:纯色背景一只白色陶瓷杯,棚拍',
    n: 1,
    llmService: 'v_53m413wbw9r',
    model: 'grok-imagine-image',
  });
  const a = gen.data?.assets?.[0];
  check('生成成功', Boolean(gen.ok && a?.assetId), `id=${a?.assetId}`);
  if (!a?.assetId) process.exit(1);
  const panel = await call('aiListingMedia:candidates', {});
  const cand = (panel.data?.candidates || []).find((c) => c.id === a.assetId);
  check(
    '候选 genParams.estimatedBeans 落库',
    Number(cand?.genParams?.estimatedBeans) > 0,
    `${cand?.genParams?.estimatedBeans} 豆`,
  );
  const hist = await call('aiListingMedia:history', { productId: 0, page: 1, pageSize: 10 });
  const hit = (hist.data?.items || []).find((it) => it.kind === 'asset' && it.id === a.assetId);
  check('历史条目可见消耗', Number(hit?.genParams?.estimatedBeans) > 0);
  const d = await call('aiListingMedia:discard', { assetId: a.assetId });
  check('清理', d.ok);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? `❌ ${failed.length} 项失败` : `✅ 全部 ${results.length} 项通过`}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
