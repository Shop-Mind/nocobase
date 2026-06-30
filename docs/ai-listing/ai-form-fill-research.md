# 调研：AI 能否在本项目修改表单数据（为什么原生可以、当前页面不行）

> 日期：2026-06-30 · 范围：`@crossborder/plugin-ai-listing` 商品抓取等业务页 · 结论：**能做，但当前 jsBlock 页面天然不可填，需二选一改造**

---

## 1. 一句话结论

**能。** 但「AI 填表单」依赖一个**原生表单模型**作为写入目标；我们现在的业务页是 **jsBlock（自渲染 React + 本地 `useState`）**，没有这个模型，所以 AI 没有可写的对象——这正是截图里 Kai 说「这个页面目前是一个空的 JS Block，没有 URL 输入框可以填写」的根因。要让 AI 能填，必须二选一改造（见 §4）。

## 2. 原生「填表单」到底怎么工作的（已读源码确认）

链路（plugin-ai 内置工具 `formFiller`）：

1. LLM 决定调用工具 `formFiller`，参数 `{ form: <UI Schema ID>, data: {...} }`。
   - 服务端定义：`src/ai/tools/formFiller.ts` —— `execution: 'frontend'`，服务端 `invoke` 是**空操作**（只是让 LLM 知道有这个工具 + schema）。
2. 前端聊天框拿到工具调用后执行真正的 invoke：
   - `src/client/ai-employees/chatbox/hooks/useToolCallActions.ts:28-64`
     ```ts
     const { toolsManager } = app.aiManager;      // 共享的工具表
     const t = toolsMap.get(toolCall.name);       // 按名字取工具
     if (t?.invoke) await t.invoke(app, toolCall.args);  // 真正执行
     ```
3. `formFiller` 的客户端真实 invoke：
   - `src/client/ai-employees/form-filler/tools/index.ts:179`
     ```ts
     const model = app.flowEngine.getModel(uid, true);          // 按 UI Schema ID 取 FlowModel
     await model.context.setFormValues(patches, { source: 'system' }); // 或
     model.setFieldsValue(normalizedData);                       // 写入表单值
     ```

**关键前提**：目标必须是一个**原生 FlowModel 表单**（FormV2），它同时具备 ① 一个 UI Schema ID ② `setFieldsValue` / `context.setFormValues`。原生页面的输入框都是这种表单模型，所以「原生的就可以」。

## 3. 为什么当前页面不行（jsBlock 的本质）

| 维度 | 原生 FormV2 块 | 我们的 jsBlock（商品抓取等 8 页） |
|---|---|---|
| 渲染方式 | FlowModel 驱动 | 自渲染 React，沙箱内 `<Input>` + 本地 `useState` |
| 有无 UI Schema ID | 有（formFiller 的 `form` 参数） | 无 |
| 有无 `setFieldsValue` | 有 | 无 |
| AI 看到的 workContext | 可填字段列表 | 只有 `JSBlockModel`，**无任何可填字段** |

所以 `formFiller` 在 jsBlock 上**没有可写入的对象**，AI 只能如实告知「这里没有表单可填」。这与 plugin 是否装好、模型是否配好、员工权限都无关——是**页面承载形态**决定的。

## 4. 可行方案（二选一）

### 方案 A（推荐）：把需要 AI 填的输入区做成原生 FormV2 块
- 做法：用 `nb api flow-surfaces add-block` 在该页放一个原生表单块（URL/来源平台/抓取项），替换当前 jsBlock 里的自定义输入面板；提交按钮用原生 action 触发抓取接口。
- 收益：**`formFiller` 零改造即可用**，行为与官方 demo 完全一致；不碰跨插件导入墙、不依赖自定义工具。
- 成本：该输入面板要从 jsBlock 迁成原生块（其余展示性内容可保留 jsBlock）。
- 适用：商品抓取「URL 抓取 / 店铺抓取 / 关键词抓取」这种**字段明确的入口表单**最划算。

### 方案 B：保留 jsBlock，自建一个前端工具 + window 钩子
- 做法：
  1. 服务端再定义一个 `execution:'frontend'` 工具（如 `aiListingFillField`），空 invoke，让 LLM 知道；
  2. 客户端在我们插件的 `client` / `client-v2` plugin 里 `this.app.aiManager.toolsManager.registerTools(...)` 注册真实 invoke——**走实例属性 `app.aiManager`，不 import plugin-ai 的客户端模块**，从而绕开之前撞到的「跨插件客户端导入墙」；
  3. jsBlock 暴露 `window.aiListingFillField(payload)`，内部调用各 `useState` 的 setter；工具 invoke 调这个钩子；
  4. 把该工具绑到 Kai 等员工的 `skillSettings.tools`。
- 收益：**不重建页面**，jsBlock 保持现状。
- 成本/风险：① 多一层自定义工具与 window 桥接，较脆；② 依赖运行时聊天框确实在客户端执行 frontend 工具的 invoke（v1 聊天框 `useToolCallActions` 确认会执行；client-v2 目前未见等价 invoke 循环，需以实际运行的聊天框为准做一次联调验证）。

## 5. 建议

优先 **方案 A**：它就是「原生的就可以」的同一条路，最稳、最省、与 demo 对齐，且彻底避开导入墙与 app 实例归属的不确定性。仅当某页坚持保留 jsBlock 自定义布局、又想要 AI 填字段时，再上 **方案 B**。

> 安全边界不变：AI 仅「填入草稿值」，用户点提交才落库；不写终值、不删除、不触发真实发布（沿用 Phase 7 受控保存 + 审计）。
