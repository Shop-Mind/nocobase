# jsBlock 原生 AI 能力 · 接入配方（Integration Recipe）

> 目标：让任意一个 jsBlock 在 **5 分钟内** 获得「点原生 AI 员工头像 → 原生抽屉对话 → AI 改本区块**暂存**数据 → 点『提交』才入库」的能力。
>
> 这是原生表单 `formFiller` 的 jsBlock 版。**铁律**：AI 只改暂存（内存 React state），绝不写库；入库只发生在用户点「提交」时，走**受控服务端 action**（带锁/权限/逐字段审计 `actorType=user`）。
>
> 完整可运行样板见 AI 员工 Demo 页（区块 `demo-review-toby`）；能力件源码见：
> - `src/ai/tools/jsBlockApplyPatch.ts`（服务端工具声明，让 LLM 知道有此工具）
> - `src/client-v2/ai/jsblock-ai.ts`（`window.__aiListingBlockKit` + 前端工具 invoke）
> - `src/client-v2/components/assistant-bridge.ts`（打开原生 plugin-ai 抽屉）
> - `src/client/plugin.tsx` / `src/client-v2/plugin.tsx`（在 client `load()` 里 `setupJsBlockAI(app)` 装配）

---

## 前置（已由插件完成，接入方无需再做）

装配已在插件 client `load()` 中完成，安装了两样全局件：

- `window.__aiListingBlockKit`：区块能力注册表（下面用它）。
- 前端工具 `jsBlockApplyPatch`：注册进 `app.aiManager.toolsManager`。LLM 发出的 `jsBlockApplyPatch({ block, patch })` 调用在此执行，**只按白名单写目标区块的暂存**，未知字段忽略。

> ⚠️ 运行中的 `/admin` 桌面应用加载的是每个插件的 **v1 入口**（`src/client/index.tsx`）。任何要在 app 加载时生效的装配都必须能从 v1 入口触达；v1 可单向 import v2，所以 `src/client/plugin.tsx` 的 `load()` 调 `src/client-v2/…` 的 `setupJsBlockAI` 是允许的（且必须 `try/catch`）。

---

## 三步接入

### 步骤 1 — 声明可编辑字段 + 向 kit 注册本块

在你的 jsBlock 里定义一个全局唯一的 `BLOCK_KEY`，声明**可编辑字段**（同时用于渲染、喂 AI、以及 `applyPatch` 的**写白名单**），并在**每次渲染**都 `register`（刷新闭包），卸载时 `unregister`。

```js
const { useState, useEffect, useRef } = ctx.libs.React;

const BLOCK_KEY = 'my-block-key'; // 全局唯一
// 声明可编辑字段：name 是 patch 的键；label/type/hint 会喂给 AI 帮助它理解语境。
const FIELDS = [
  { name: 'title', label: '标题', type: 'string', hint: '面向目标平台的商品标题' },
  { name: 'stock', label: '库存', type: 'number', hint: '目标平台库存数量' },
];

// staged = 暂存值（含 AI 已改、未提交的部分）。用 ref 让 getData 读到最新值，避免闭包过期。
const [staged, setStaged] = useState({ title: '', stock: 0 });
const stagedRef = useRef(staged);
stagedRef.current = staged;

const kit = (typeof window !== 'undefined' && window.__aiListingBlockKit) || null;

useEffect(() => {
  if (!kit) return undefined;
  kit.register(BLOCK_KEY, {
    title: '我的区块',                    // 进 system prompt，帮 AI 理解语境
    getData: () => stagedRef.current,     // 当前暂存值
    getSchema: () => FIELDS,              // 可编辑字段（= 写白名单）
    applyPatch: (patch) => setStaged((s) => ({ ...s, ...patch })), // AI 只改暂存
  });
  return () => kit.unregister(BLOCK_KEY);
}); // 无依赖数组：每次渲染刷新闭包
```

### 步骤 2 — 放原生头像（转头动画）+ 点击打开抽屉

用 `kit.getAvatar(username, options)` 取原生 dicebear 头像的**两态**，复刻原生 `AIEmployeeShortcut` 的 hover 转头（常态明亮、hover flip 转头）。点击调 `kit.openAI(BLOCK_KEY, { username, prompt })` 打开真·plugin-ai 抽屉——kit 会自动把本块当前数据 + 可编辑字段 schema 注入 system 上下文，并指示员工调用 `jsBlockApplyPatch`。

```js
const [avatarNormal, setAvatarNormal] = useState(null);
const [avatarHover, setAvatarHover] = useState(null);
const [avatarFocus, setAvatarFocus] = useState(false);
const USERNAME = 'lst-toby'; // 选一个 AI 员工

useEffect(() => {
  if (!kit || !kit.getAvatar) return;
  // 常态：明亮（不要用 mask:['dark']，普通表格/卡片语境会发黑）
  kit.getAvatar(USERNAME, { mouth: undefined, mask: undefined }).then((u) => u && setAvatarNormal(u)).catch(() => {});
  // hover：flip 镜像头部 → 转头
  kit.getAvatar(USERNAME, { mask: undefined, flip: true }).then((u) => u && setAvatarHover(u)).catch(() => {});
}, [kit]);

const openAI = async () => {
  if (!kit) return;
  await kit.openAI(BLOCK_KEY, { username: USERNAME, prompt: '把标题优化得更适合目标平台。' });
};

// 渲染（antd Avatar）：
// <span onMouseEnter={() => setAvatarFocus(true)} onMouseLeave={() => setAvatarFocus(false)} onClick={openAI}
//       style={{ cursor: 'pointer' }}>
//   <Avatar size={40} shape="circle" src={(avatarFocus ? avatarHover : avatarNormal) || undefined}>AI</Avatar>
// </span>
```

### 步骤 3 — 「提交」按钮走受控服务端 action（唯一写库口）

暂存与入库彻底分离：AI 只动 `staged`；只有用户点「提交」才调**受控 action**写库。该 action 必须自己做锁定/权限校验 + 逐字段审计 `actorType='user'`（因为是**用户**触发的入库，不是 AI）。

```js
const submit = async () => {
  const res = await ctx.request({
    url: 'aiListingReview:saveFinal',       // ← 你这一页的受控写库 action
    method: 'post',
    data: { id: pid, values: { titleFinal: staged.title, stock: Number(staged.stock) || 0 } },
    skipNotify: true,
  });
  // 成功后把 baseline 更新为 staged，用于「待提交」黄标对比
};
```

> **对比 baseline 标「待提交」**：载入/提交后把当前值存一份 `baseline`，渲染时 `JSON.stringify(staged[f]) !== JSON.stringify(baseline[f])` 即为 dirty，显示黄标。提交成功后 `setBaseline(staged)`。

---

## 换用别的员工 / 只读型

- **换员工**：把 `USERNAME` 换成 `lst-mira`（选品）、`lst-rena`（合规）、`lst-lena`（发布）、`lst-kai`（主管）之一即可。可在同一块放多个头像切换。
- **只读型**（不需要改数据的页，如工作台/发布记录）：**不注册 `applyPatch`、不声明可写 `FIELDS`**，只调 `kit.openAI(key, { username, prompt })` 注入只读上下文，让员工纯问答/解释。AI 拿不到写工具 → 不可能写库。

---

## 安全检查清单（每次接入自查）

- [ ] `applyPatch` 只 `setState`，绝不发写库请求。
- [ ] `getSchema()` 声明的字段就是写白名单；AI patch 里的未知字段被 `jsBlockApplyPatch` 忽略。
- [ ] 「提交」action 是**受控服务端 action**：校验锁定/权限、逐字段审计 `actorType='user'`、绝不信任前端传的字段名（服务端二次白名单）。
- [ ] 锁定/已审核记录提交返回明确错误（如 409），前端友好提示。
- [ ] 不把敏感字段（credentialRef、模型 Key 等）放进喂给 AI 的上下文。
- [ ] 卸载 `unregister(key)`，避免泄漏与串块。

---

## 常见坑

- **`window.__aiListingBlockKit` 是 undefined**：确认装配挂在运行中的 **v1 入口**（`src/client/plugin.tsx` 的 `load()`），不是只挂在 v2。
- **对话一开口就崩 `Cannot read properties of undefined (reading '_zod')`**：某个 **GENERAL scope** 工具的 zod schema 非法（最常见 `z.record(z.any())` 少了第一个参数——zod v4 需 `z.record(z.string(), z.any())`）。它在**绑定阶段**就抛，会毒化**每一个**员工的对话。优先给工具 schema 用**纯 JSON Schema** 规避 zod 互操作。详见 `AGENTS.md` 的「AI Employees, Tools & jsBlock Conversational Editing」。
- **新建工具文件不生效**：工具目录只在服务端启动时扫描一次；新文件是动态 import，`tsx watch` 不会为它重启——改一下已被 import 的服务端文件（如 `src/server/index.ts`）强制重启，再确认工具出现在 `aiTools` 资源里。
