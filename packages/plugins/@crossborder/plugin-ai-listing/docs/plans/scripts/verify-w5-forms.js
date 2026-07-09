/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W5 表单深化 E2E(API 层,净零):换色批量的关键链路 = parameters.targetColor 随生成落库进 genParams
// (历史/色标签/再次编辑的依据)。真实换色出图(2 色出 2 张、只变目标区域)需带源图编辑线路,恢复后回归。
// prompt 组合的注入正确性由单测 prompt-compose.test.ts 覆盖(11 例),此处不重复。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx node verify-w5-forms.js

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

  // parameters.targetColor 随生成落库(t2i 链路验证透传;换色本体等编辑线路)
  const gen = await call('aiListingMedia:generate', {
    textToImage: true,
    instruction: 'W5验收:纯色背景上一只藏青色帆布包,棚拍',
    n: 1,
    llmService: 'v_53m413wbw9r',
    model: 'grok-imagine-image',
    parameters: { targetColor: '藏青色' },
  });
  const a = gen.data?.assets?.[0];
  check('生成成功', Boolean(gen.ok && a?.assetId), `id=${a?.assetId}`);
  if (!a?.assetId) process.exit(1);
  const panel = await call('aiListingMedia:candidates', {});
  const cand = (panel.data?.candidates || []).find((c) => c.id === a.assetId);
  check('genParams.parameters.targetColor 落库', cand?.genParams?.parameters?.targetColor === '藏青色');
  // 历史也能读到(色标签/再次编辑依据)
  const hist = await call('aiListingMedia:history', { productId: 0, page: 1, pageSize: 10 });
  const hit = (hist.data?.items || []).find((it) => it.kind === 'asset' && it.id === a.assetId);
  check('history 条目携带 targetColor', hit?.genParams?.parameters?.targetColor === '藏青色');
  // 清理
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
