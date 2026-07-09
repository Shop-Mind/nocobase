/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W4 创作历史 E2E(自由模式):t2i 生成 1 张 → history 见 candidate → 弃用 → history 状态变 discarded
// (弃用记录仍在流里,这正是历史的特性)→ 用死线路(gpt-image-2)制造失败 job → history 出现 failed 条目
// (含错误信息与可重试参数)→ 分页正确。生成的候选测后弃用;失败 job 与弃用记录留档即历史语义,非污染。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx node verify-w4-history.js

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
  const history = async (extra) => call('aiListingMedia:history', { productId: 0, ...extra });
  const findIn = async (pred, extra) => {
    // 逐页找目标条目(避免依赖固定页容量)
    for (let page = 1; page <= 5; page++) {
      const res = await history({ page, pageSize: 50, ...extra });
      const hit = (res.data?.items || []).find(pred);
      if (hit) return hit;
      if (page * 50 >= (res.data?.total || 0)) return null;
    }
    return null;
  };

  // 1) t2i 生成 → history 见 candidate
  const INSTR = 'W4验收:浅木桌面上一只白色陶瓷杯,窗边柔光';
  const gen = await call('aiListingMedia:generate', {
    textToImage: true,
    instruction: INSTR,
    n: 1,
    llmService: 'v_53m413wbw9r',
    model: 'grok-imagine-image',
  });
  const a = gen.data?.assets?.[0];
  check('t2i 生成候选', Boolean(gen.ok && a?.assetId), `id=${a?.assetId}`);
  if (!a?.assetId) process.exit(1);
  let item = await findIn((it) => it.kind === 'asset' && it.id === a.assetId);
  check('history 出现 candidate', item?.status === 'candidate' && item?.genParams?.instruction === INSTR);

  // 2) 弃用 → 状态变 discarded 但仍在流
  await call('aiListingMedia:discard', { assetId: a.assetId });
  item = await findIn((it) => it.kind === 'asset' && it.id === a.assetId);
  check('弃用后仍留档且状态 discarded', item?.status === 'discarded');

  // 3) 制造失败 job(gpt-image-2 线路当前 401)→ failed 条目 + 错误信息 + 可重试参数
  const fail = await call('aiListingMedia:generate', {
    sourceImageUrl: 'https://sc04.alicdn.com/kf/Ha05c7977a21a4ce481b42648040984f14.jpg',
    instruction: 'W4验收:注定失败的请求',
    scene: 'scene_gen',
    n: 1,
    llmService: 'v_o0thcar5dcs',
    model: 'gpt-image-2',
  });
  check('死线路请求确实失败', !fail.ok, fail.errors?.[0]?.message?.slice(0, 40));
  const failedItem = await findIn(
    (it) => it.kind === 'failed' && it.genParams?.instruction === 'W4验收:注定失败的请求',
  );
  check(
    'history 出现 failed 条目(含错误+重试参数)',
    Boolean(failedItem && failedItem.errorMessage && failedItem.genParams?.model === 'gpt-image-2'),
    failedItem?.errorMessage?.slice(0, 40),
  );

  // 4) 分页:pageSize=1 两页无重复,total 一致
  const p1 = await history({ page: 1, pageSize: 1 });
  const p2 = await history({ page: 2, pageSize: 1 });
  const k1 = p1.data?.items?.[0] && `${p1.data.items[0].kind}${p1.data.items[0].id}`;
  const k2 = p2.data?.items?.[0] && `${p2.data.items[0].kind}${p2.data.items[0].id}`;
  check('分页游标工作', Boolean(k1 && k2 && k1 !== k2 && p1.data.total === p2.data.total), `${k1} / ${k2}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? `❌ ${failed.length} 项失败` : `✅ 全部 ${results.length} 项通过`}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
