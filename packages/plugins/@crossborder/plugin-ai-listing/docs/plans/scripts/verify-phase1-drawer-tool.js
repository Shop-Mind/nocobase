// 图片编辑闭环 Phase 1 会话工具 E2E(真实 Key + 真实员工对话,等价于抽屉侧交互):
//   创建会话 → 对员工说「把这张图换成白底」+ 图片 URL → LLM 调用 aiListingEditImage(ASK 中断)
//   → 模拟用户批准(updateUserDecision + resumeToolCall)→ 工具产出候选 → 最终气泡含 markdown 图片。
// 用法:node verify-phase1-drawer-tool.js [imageUrl]
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync(process.env.HOME + '/.nocobase/config.json', 'utf8'));
const token = cfg.envs.dev.auth.accessToken;
const BASE = cfg.envs.dev.apiBaseUrl;
const H = {
  Authorization: 'Bearer ' + token,
  'Content-Type': 'application/json',
  'X-Role': 'root',
  'X-Timezone': '+08:00',
  'X-Locale': 'zh-CN',
  'X-Hostname': 'localhost',
  'X-Authenticator': 'basic',
};

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};

async function api(pathname, body) {
  const resp = await fetch(BASE + pathname, {
    headers: H,
    signal: AbortSignal.timeout(300000),
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// SSE 动作:读完整个流(容忍 JSON 行),返回拼接文本
async function sse(pathname, body) {
  const resp = await fetch(BASE + pathname, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${pathname} HTTP ${resp.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const imageUrl = process.argv[2] || 'https://sc04.alicdn.com/kf/Ha97af733735e414781cd2ffb4eced076F.jpg';

  // 1. 选员工(第一位启用的)
  const employees = (await api('/aiEmployees:list?pageSize=20')).data || [];
  const employee = employees.find((e) => e.enabled !== false) || employees[0];
  if (!employee?.username) throw new Error('没有可用的 AI 员工');
  console.log('employee:', employee.username, (employee.nickname || '').slice(0, 20));

  // 2. 建会话
  const conv = (await api('/aiConversations:create', { aiEmployee: { username: employee.username } })).data;
  const sessionId = conv?.sessionId;
  if (!sessionId) throw new Error('会话创建失败');
  console.log('session:', sessionId);

  // 3. 发消息(与抽屉输入等价)
  await sse('/aiConversations:sendMessages', {
    sessionId,
    aiEmployee: employee.username,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          content: `把这张图换成白底:${imageUrl}`,
        },
      },
    ],
  });

  // 4. 找到被 ASK 中断的工具调用(中断态记录在 aiToolMessages,不在 getMessages 的行上)
  const toolFilter = encodeURIComponent(JSON.stringify({ sessionId, toolName: 'aiListingEditImage' }));
  const toolRows = (await api(`/aiToolMessages:list?filter=${toolFilter}&sort=-id&pageSize=3`)).data || [];
  const interrupted = toolRows.find((r) => r.invokeStatus === 'interrupted');
  check(
    'LLM 选择调用 aiListingEditImage(ASK 中断待批准)',
    Boolean(interrupted),
    interrupted ? `toolCallId=${interrupted.toolCallId}` : '无中断记录',
  );
  if (!interrupted) throw new Error('工具未被调用');
  const messageId = interrupted.messageId;
  const msgFilter = encodeURIComponent(JSON.stringify({ messageId }));
  const aiMsg = ((await api(`/aiMessages:list?filter=${msgFilter}&pageSize=1`)).data || [])[0];
  const toolCall = (aiMsg?.toolCalls || []).find((t) => t.id === interrupted.toolCallId);
  const args = toolCall?.args || {};
  check(
    '工具入参选择 white_bg 场景且带源图',
    args.scene === 'white_bg' && Boolean(args.sourceImageUrl),
    JSON.stringify(args).slice(0, 160),
  );

  // 5. 批准(等价于抽屉里点「允许」)并恢复执行
  await api('/aiConversations:updateUserDecision', {
    sessionId,
    messageId,
    toolCallId: interrupted.toolCallId,
    userDecision: { type: 'approve' },
  });
  const t0 = Date.now();
  await sse('/aiConversations:resumeToolCall', { sessionId, messageId, aiEmployee: employee.username });
  console.log('resume 耗时', Math.round((Date.now() - t0) / 1000) + 's');

  // 6. 校验:工具成功 + 最终气泡 markdown 图片(本地 /storage 候选)
  const toolRow2 = ((await api(`/aiToolMessages:list?filter=${toolFilter}&sort=-id&pageSize=3`)).data || []).find(
    (r) => r.toolCallId === interrupted.toolCallId,
  );
  check(
    '工具执行成功且返回候选',
    toolRow2?.status === 'success' &&
      /candidates/.test(String(toolRow2?.content)) &&
      /\/storage\/uploads\//.test(String(toolRow2?.content)),
    `status=${toolRow2?.status} ${String(toolRow2?.content || '').slice(0, 120)}`,
  );
  const msgs2 = (await api(`/aiConversations:getMessages?sessionId=${sessionId}&paginate=false`)).data || [];
  const flat = JSON.stringify(msgs2);
  // getMessages 返回新→旧,首条非 user 文本即最终气泡
  const lastAssistant = msgs2.find((m) => m.role !== 'user' && m.content?.type === 'text' && m.content?.content);
  const bubble = String(lastAssistant?.content?.content || '');
  check(
    '最终气泡含 markdown 候选图',
    /!\[[^\]]*\]\((\/storage\/uploads\/|https?:)[^)]+\)/.test(bubble),
    bubble.slice(0, 200).replace(/\n/g, ' '),
  );
  check('会话全程不含凭证', !/sk-[a-zA-Z0-9]{8}/.test(flat), '');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-PHASE1-DRAWER-FAILED(${failed})` : 'E2E-PHASE1-DRAWER-OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E-ERROR:', e.message);
  process.exit(1);
});
