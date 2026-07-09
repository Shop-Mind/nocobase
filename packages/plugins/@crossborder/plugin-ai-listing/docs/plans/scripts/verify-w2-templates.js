/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W2 风格模版 E2E 验收(API 层,净零变更):
//  1) styleTemplates 返回 ≥36 内置模版 + 类目聚合;
//  2) saveStyleTemplate → mine 可见 → deleteStyleTemplate → 消失(临时行即建即删);
//  3) 删 builtin 模版被 403 拒绝;
//  4) productId 推荐类目:搜「圣诞」商品应命中 festive。
// 用法:SHOT_ACCOUNT=xxx SHOT_PASSWORD=xxx node verify-w2-templates.js
// 凭证只走环境变量,不落盘;BASE 可用 SHOT_BASE 覆盖(默认本地)。

const BASE = process.env.SHOT_BASE || 'http://localhost:13000';

async function main() {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
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

  // 1) 内置模版 ≥36 + 类目聚合
  const list = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen' });
  const templates = list.data?.templates || [];
  const categories = list.data?.categories || [];
  check('内置模版 ≥36', templates.length >= 36, `${templates.length} 条`);
  check(
    '类目聚合 ≥6 且计数=总数',
    categories.length >= 6 && categories.reduce((n, c) => n + c.count, 0) === templates.length,
    categories.map((c) => `${c.key}:${c.count}`).join(' '),
  );
  check(
    '按 category 过滤',
    (await call('aiListingMedia:styleTemplates', { scene: 'scene_gen', category: 'festive' })).data?.templates?.every(
      (tpl) => tpl.category === 'festive',
    ) === true,
  );

  // 2) save → mine 可见 → delete → 消失(净零)
  const saved = await call('aiListingMedia:saveStyleTemplate', {
    title: 'W2验收-临时模版',
    category: 'bags',
    scene: 'scene_gen',
    prompt: '仅用于 W2 自动验收的临时提示词,脚本会立即删除',
  });
  check('saveStyleTemplate 成功', saved.ok && saved.data?.source === 'user', `id=${saved.data?.id}`);
  const mine = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen', source: 'mine' });
  check(
    'mine 列表可见',
    (mine.data?.templates || []).some((tpl) => tpl.id === saved.data?.id),
  );
  const del = await call('aiListingMedia:deleteStyleTemplate', { id: saved.data?.id });
  const mineAfter = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen', source: 'mine' });
  check('delete 后消失', del.ok && !(mineAfter.data?.templates || []).some((tpl) => tpl.id === saved.data?.id));

  // 3) builtin 模版不可删(403)
  const builtinId = templates[0]?.id;
  const delBuiltin = await call('aiListingMedia:deleteStyleTemplate', { id: builtinId });
  check('删 builtin 被拒', !delBuiltin.ok && delBuiltin.status === 403, `status=${delBuiltin.status}`);

  // 4) 圣诞商品推荐 festive(找不到圣诞商品则跳过)
  const prod = await call('aiListingReview:list', { page: 1, pageSize: 1, keyword: '圣诞' });
  const pid = prod.data?.products?.[0]?.id;
  if (pid) {
    const rec = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen', productId: pid });
    check('圣诞商品推荐 festive', rec.data?.recommended === 'festive', `productId=${pid} → ${rec.data?.recommended}`);
  } else {
    console.log('SKIP  圣诞商品推荐(库里没有「圣诞」商品)');
  }
  // 无商品(自由模式)→ 通用
  const free = await call('aiListingMedia:styleTemplates', { scene: 'scene_gen' });
  check('无商品落「通用」', free.data?.recommended === 'general');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? `❌ ${failed.length} 项失败` : `✅ 全部 ${results.length} 项通过`}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
