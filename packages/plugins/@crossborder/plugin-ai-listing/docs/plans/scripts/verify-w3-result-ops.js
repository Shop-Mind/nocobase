/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W3 结果操作闭环 E2E(API 层,净零变更):t2i 生成 1 张 → 下载 URL 可 200 → 「重新生成」原参数再产 1 张
// (genParams 快照一致)→ 「保存为模版」(prompt=该次 instruction,缩略图=结果图)→ mine +1 且 thumbUrl 生效
// → 清理(删模版 + 弃用两张候选)。编辑类(带源图)链路待 gpt-image-2/grok edit 恢复后另行回归。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx [LLM_SERVICE=v_xxx MODEL=grok-imagine-image] node verify-w3-result-ops.js

const BASE = process.env.SHOT_BASE || 'http://localhost:13000';
const LLM_SERVICE = process.env.LLM_SERVICE || 'v_53m413wbw9r';
const MODEL = process.env.MODEL || 'grok-imagine-image';

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

  const INSTR = 'W3验收:浅灰渐变背景上一只白色陶瓷杯,柔光棚拍,居中构图';
  // 1) 生成第一张(自由模式 t2i)
  const gen1 = await call('aiListingMedia:generate', {
    textToImage: true,
    instruction: INSTR,
    n: 1,
    llmService: LLM_SERVICE,
    model: MODEL,
  });
  const a = gen1.data?.assets?.[0];
  check('t2i 生成候选 A', Boolean(gen1.ok && a?.assetId && a?.url), `id=${a?.assetId}`);
  if (!a?.assetId) process.exit(1);

  // 2) 下载 URL 可 200(本地落库原图直链)
  const dl = await fetch(`${BASE}${a.url.startsWith('http') ? '' : ''}${a.url.startsWith('/') ? a.url : `/${a.url}`}`);
  check('下载 URL 200', dl.status === 200, `${a.url} → ${dl.status}`);

  // 3) 候选 A 的 genParams 快照完整(重新生成/再次编辑的依据)
  const panel1 = await call('aiListingMedia:candidates', {});
  const candA = (panel1.data?.candidates || []).find((c) => c.id === a.assetId);
  check('genParams.instruction 快照', candA?.genParams?.instruction === INSTR);

  // 4) 重新生成:原参数再跑一次(前端「重新生成」按钮等价请求)
  const gp = candA?.genParams || {};
  const gen2 = await call('aiListingMedia:generate', {
    textToImage: true,
    instruction: gp.instruction,
    n: 1,
    llmService: gp.llmService || LLM_SERVICE,
    model: gp.model || MODEL,
    aspect: gp.aspect || undefined,
    tier: gp.tier || undefined,
  });
  const b = gen2.data?.assets?.[0];
  check('重新生成产出候选 B', Boolean(gen2.ok && b?.assetId), `id=${b?.assetId}`);
  const panel2 = await call('aiListingMedia:candidates', {});
  const candB = (panel2.data?.candidates || []).find((c) => c.id === b?.assetId);
  check(
    'B 与 A 参数一致',
    candB?.genParams?.instruction === INSTR && candB?.genParams?.model === candA?.genParams?.model,
  );

  // 5) 保存为模版:prompt=instruction、缩略图=结果图 → mine 可见且 thumbUrl 生效
  const saved = await call('aiListingMedia:saveStyleTemplate', {
    title: 'W3验收-临时模版',
    category: 'general',
    scene: 'scene_gen',
    prompt: INSTR,
    thumbUrl: a.url,
  });
  const mine = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen', source: 'mine' });
  const mineTpl = (mine.data?.templates || []).find((tpl) => tpl.id === saved.data?.id);
  check('保存为模版 → mine +1 且带缩略图', Boolean(mineTpl && mineTpl.thumbUrl === a.url));

  // 6) 清理(净零):删模版、弃用两张候选
  const del = await call('aiListingMedia:deleteStyleTemplate', { id: saved.data?.id });
  const d1 = await call('aiListingMedia:discard', { assetId: a.assetId });
  const d2 = b?.assetId ? await call('aiListingMedia:discard', { assetId: b.assetId }) : { ok: true };
  check('清理(删模版+弃用候选)', del.ok && d1.ok && d2.ok);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? `❌ ${failed.length} 项失败` : `✅ 全部 ${results.length} 项通过`}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
