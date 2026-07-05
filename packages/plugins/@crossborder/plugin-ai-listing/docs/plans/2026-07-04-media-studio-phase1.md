# Media Studio 一期(改图闭环)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 预览编辑页支持对主图/详情图批量生成 AI 差异化变体(去水印/换标/白底/换背景/规格裁剪),原图与变体并列对比,人工采纳后发布使用采纳集,附 pHash 查重自检与成本护栏。

**Architecture:** 复用现有 `aiListingMediaAssets`/`aiListingMediaJobs` 表扩展"变体树 + 采纳"模型;服务端新增媒体生成管线(Provider 适配器读 plugin-ai `llmServices` 的 Dashscope Key → 任务执行器并发 2 → 产物经 `downloadToStorage` 入库 → jimp dHash 自检);受控 resource `aiListingMedia` 供页面按钮与(二期)AI 工具共用;发布链路改为"采纳集优先,回退原图"。

**Tech Stack:** NocoBase 2.x 插件(@crossborder/plugin-ai-listing)· TypeScript · jimp(纯 JS 图像处理,不引入 sharp 原生依赖)· DashScope 百炼异步图像 API · antd v5(client-v2)

**设计依据:** [docs/media-studio-design.md](../media-studio-design.md)(2026-07-04 已评审,决策见其第 11 节)

## Global Constraints

- 禁止 `any`;禁止 `void 异步调用()`;事件处理器不用 async IIFE(AGENTS.md)
- 用户可见文案走 i18n,`en-US` 与 `zh-CN` 双语(src/locale)
- 新表/新列靠 `yarn nocobase upgrade` 自动同步,**不写迁移文件**
- 服务端测试串行跑:`yarn test <file>`(不并行)
- API Key 绝不出现在日志、审计、接口响应、前端(读 `llmServices.options.apiKey` 仅在服务端内存中使用)
- 成本护栏默认值:日上限 200 张、单批上限 50 张(已拍板);相似度告警阈值默认汉明距离 12
- 提交格式:`feat(plugin-ai-listing): ...` / `fix(plugin-ai-listing): ...`;每任务结束 `yarn eslint --fix` 触碰过的文件
- 新依赖仅 `jimp`(加入插件 package.json dependencies);slim 镜像已验证纯 JS 依赖可用
- 注释不窄折行(printWidth 120)

---

### Task 1: 数据模型扩展(资产变体树 + 任务字段 + 品牌素材 + 配置)

**Files:**
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/server/collections/media-assets.ts`
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/server/collections/media-jobs.ts`
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/collections/brand-assets.ts`
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/server/collections/config.ts`
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/collections/__tests__/media-model.test.ts`

**Interfaces:**
- Consumes: 现有 `defineCollection` / `selectField`(`../shared/tracing-fields`)
- Produces: `aiListingMediaAssets` 新字段 `parentAssetId`(bigInt) `origin`(select) `finalSelected`(boolean) `genParams`(jsonb) `similarity`(jsonb);`aiListingMediaJobs` 新字段 `provider` `model`(string) `prompt`(text) `costEstimate`(decimal) `batchId`(string),jobType 新增枚举 `replace_logo` `style_variation`;新表 `aiListingBrandAssets`;`aiListingConfig` 新字段 `mediaImageServiceName` `mediaImageModel`(string) `mediaDailyLimit`(integer, 默认 200) `mediaBatchLimit`(integer, 默认 50) `mediaSimilarityThreshold`(integer, 默认 12) `platformImagePresets`(jsonb)

- [ ] **Step 1: 写失败测试**(读取集合定义,断言新字段存在)

```ts
// src/server/collections/__tests__/media-model.test.ts
import mediaAssets from '../media-assets';
import mediaJobs from '../media-jobs';
import brandAssets from '../brand-assets';
import config from '../config';

const fieldNames = (c: { fields: { name: string }[] }) => c.fields.map((f) => f.name);

describe('media model extensions', () => {
  it('media assets has variant-tree fields', () => {
    for (const n of ['parentAssetId', 'origin', 'finalSelected', 'genParams', 'similarity']) {
      expect(fieldNames(mediaAssets as never)).toContain(n);
    }
  });
  it('media jobs has generation fields and new job types', () => {
    for (const n of ['provider', 'model', 'prompt', 'costEstimate', 'batchId']) {
      expect(fieldNames(mediaJobs as never)).toContain(n);
    }
    const jobType = (mediaJobs as never as { fields: { name: string; uiSchema?: { enum?: { value: string }[] } }[] }).fields.find(
      (f) => f.name === 'jobType',
    );
    const values = (jobType?.uiSchema?.enum ?? []).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['replace_logo', 'style_variation']));
  });
  it('brand assets collection exists with logo kind', () => {
    expect((brandAssets as never as { name: string }).name).toBe('aiListingBrandAssets');
    expect(fieldNames(brandAssets as never)).toEqual(expect.arrayContaining(['name', 'kind', 'fileId', 'isDefault', 'enabled']));
  });
  it('config carries media generation settings', () => {
    for (const n of [
      'mediaImageServiceName',
      'mediaImageModel',
      'mediaDailyLimit',
      'mediaBatchLimit',
      'mediaSimilarityThreshold',
      'platformImagePresets',
    ]) {
      expect(fieldNames(config as never)).toContain(n);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败** — `yarn test packages/plugins/@crossborder/plugin-ai-listing/src/server/collections/__tests__/media-model.test.ts`,预期 FAIL(字段缺失 / brand-assets 模块不存在)

- [ ] **Step 3: 实现字段扩展**

`media-assets.ts` 在 fields 数组追加(注释说明语义):

```ts
    // ===== 变体树(Media Studio 一期):一张原图可挂多个 AI 生成变体,原图 parentAssetId 为空 =====
    { type: 'bigInt', name: 'parentAssetId', interface: 'integer', title: 'Parent asset' },
    selectField('origin', 'Origin', [
      { value: 'captured', label: 'Captured', color: 'default' },
      { value: 'ai_generated', label: 'AI generated', color: 'blue' },
      { value: 'manual_upload', label: 'Manual upload', color: 'cyan' },
    ], { defaultValue: 'captured' }),
    // 采纳为最终发布图;同 role 下按 sort 组成发布图集,未采纳的 role 发布时回退原图
    { type: 'boolean', name: 'finalSelected', interface: 'checkbox', title: 'Final selected', defaultValue: false },
    // 生成参数快照 {jobType, prompt, provider, model, sourceAssetId};相似度 {dhash, distanceToSource, verdict}
    { type: 'jsonb', name: 'genParams', interface: 'json', title: 'Generation params' },
    { type: 'jsonb', name: 'similarity', interface: 'json', title: 'Similarity check' },
```

`media-jobs.ts`:jobType 枚举追加 `{ value: 'replace_logo', label: 'Replace logo', color: 'orange' }` 与 `{ value: 'style_variation', label: 'Style variation', color: 'geekblue' }`;fields 追加:

```ts
    { type: 'string', name: 'provider', interface: 'input', title: 'Provider' },
    { type: 'string', name: 'model', interface: 'input', title: 'Model' },
    { type: 'text', name: 'prompt', interface: 'textarea', title: 'Prompt' },
    { type: 'decimal', name: 'costEstimate', interface: 'number', title: 'Cost estimate' },
    // 同一次批量操作共享 batchId,用于进度聚合与失败重试分组
    { type: 'string', name: 'batchId', interface: 'input', title: 'Batch ID' },
```

`brand-assets.ts` 新建(仿 media-assets 头部版权注释):

```ts
import { defineCollection } from '@nocobase/database';
import { selectField } from '../shared/tracing-fields';

// 品牌素材库(Media Studio):商家自有 logo/角标,"换标"时本地合成贴标使用。fileId 指向 File Manager。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingBrandAssets',
  title: 'Brand assets',
  fields: [
    { type: 'string', name: 'name', interface: 'input', title: 'Name' },
    selectField('kind', 'Kind', [
      { value: 'logo', label: 'Logo', color: 'blue' },
      { value: 'watermark_corner', label: 'Corner watermark', color: 'cyan' },
    ]),
    { type: 'bigInt', name: 'fileId', interface: 'integer', title: 'File' },
    { type: 'boolean', name: 'isDefault', interface: 'checkbox', title: 'Default', defaultValue: false },
    { type: 'boolean', name: 'enabled', interface: 'checkbox', title: 'Enabled', defaultValue: true },
  ],
});
```

`config.ts` fields 追加(注释:非敏感,Key 仍在 llmServices):

```ts
    // ===== 媒体生成(Media Studio):服务商引用 + 护栏。只存 llmServices 的 name 引用,绝不存 Key =====
    { type: 'string', name: 'mediaImageServiceName', interface: 'input', title: 'Media image service' },
    { type: 'string', name: 'mediaImageModel', interface: 'input', title: 'Media image model', defaultValue: 'qwen-image-edit' },
    { type: 'integer', name: 'mediaDailyLimit', interface: 'integer', title: 'Media daily limit', defaultValue: 200 },
    { type: 'integer', name: 'mediaBatchLimit', interface: 'integer', title: 'Media batch limit', defaultValue: 50 },
    { type: 'integer', name: 'mediaSimilarityThreshold', interface: 'integer', title: 'Similarity threshold', defaultValue: 12 },
    // 平台图片规格预设:{ "1688": { mainSize: 800, mainMin: 750, whiteBg: {...}, detailWidth: 750 } }
    { type: 'jsonb', name: 'platformImagePresets', interface: 'json', title: 'Platform image presets' },
```

- [ ] **Step 4: 运行测试确认通过**,同一命令,预期 PASS
- [ ] **Step 5: 本地库同步验证** — `yarn nocobase upgrade` 后 `nb api resource list --resource aiListingBrandAssets -j` 返回空列表(表已建);`eslint --fix` 触碰文件
- [ ] **Step 6: Commit** — `feat(plugin-ai-listing): media studio phase1 data model (variant tree, brand assets, media settings)`

---

### Task 2: 相似度自检模块(jimp dHash)

**Files:**
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/similarity.ts`
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/package.json`(dependencies 加 `"jimp": "^1.6.0"`)
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/__tests__/similarity.test.ts`

**Interfaces:**
- Produces: `dhash(buf: Buffer): Promise<string>`(16 位十六进制,64bit 差值哈希)· `hammingDistance(a: string, b: string): number` · `similarityVerdict(distance: number, threshold: number): 'ok' | 'too_similar'`

- [ ] **Step 1: 安装依赖** — 插件目录 package.json 加 jimp 后根目录 `yarn install`
- [ ] **Step 2: 写失败测试**(用 jimp 造纯色/渐变图,不依赖外部文件)

```ts
// src/server/media/__tests__/similarity.test.ts
import { Jimp } from 'jimp';
import { dhash, hammingDistance, similarityVerdict } from '../similarity';

async function solid(color: number): Promise<Buffer> {
  const img = new Jimp({ width: 64, height: 64, color });
  return img.getBuffer('image/png');
}

describe('similarity dhash', () => {
  it('identical images have distance 0 and verdict too_similar', async () => {
    const a = await dhash(await solid(0xffffffff));
    const b = await dhash(await solid(0xffffffff));
    expect(a).toHaveLength(16);
    expect(hammingDistance(a, b)).toBe(0);
    expect(similarityVerdict(0, 12)).toBe('too_similar');
  });
  it('different images exceed threshold', async () => {
    const img = new Jimp({ width: 64, height: 64, color: 0x000000ff });
    for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) if ((x + y) % 2) img.setPixelColor(0xffffffff, x, y);
    const a = await dhash(await solid(0xffffffff));
    const b = await dhash(await img.getBuffer('image/png'));
    expect(hammingDistance(a, b)).toBeGreaterThan(12);
    expect(similarityVerdict(20, 12)).toBe('ok');
  });
});
```

- [ ] **Step 3: 运行确认失败**(模块不存在)
- [ ] **Step 4: 实现**

```ts
// src/server/media/similarity.ts
// 感知哈希查重自检:9×8 灰度差值哈希(dHash)。对平台查重是"近似预估",阈值可在设置页调整。
import { Jimp } from 'jimp';

export async function dhash(buf: Buffer): Promise<string> {
  const img = await Jimp.fromBuffer(buf);
  img.resize({ w: 9, h: 8 }).greyscale();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = img.getPixelColor(x, y) >>> 24;
      const right = img.getPixelColor(x + 1, y) >>> 24;
      bits = (bits << 1n) | (left > right ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function similarityVerdict(distance: number, threshold: number): 'ok' | 'too_similar' {
  return distance >= threshold ? 'ok' : 'too_similar';
}
```

- [ ] **Step 5: 运行测试通过 → Commit** — `feat(plugin-ai-listing): dhash similarity self-check for generated images`

---

### Task 3: Provider 适配层(DashScope,Key 读 llmServices)

**Files:**
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/providers/types.ts`
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/providers/dashscope.ts`
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/providers/index.ts`
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/__tests__/providers.test.ts`

**Interfaces:**
- Consumes: `plugin.app.db.getRepository('llmServices' | 'aiListingConfig')`
- Produces:

```ts
export type MediaJobType = 'remove_watermark' | 'replace_logo' | 'white_bg' | 'scene' | 'crop' | 'style_variation';
export interface MediaGenInput { imageUrl: string; jobType: MediaJobType; prompt?: string }
export interface MediaProvider {
  readonly name: string;
  readonly model: string;
  submitImageEdit(input: MediaGenInput): Promise<{ providerTaskId: string }>;
  pollImageTask(providerTaskId: string): Promise<{ status: 'running' | 'success' | 'failed'; resultUrl?: string; errorMessage?: string }>;
}
export function buildEditPrompt(jobType: MediaJobType, userPrompt?: string): string;
export function createDashScopeProvider(opts: { apiKey: string; baseURL?: string; model: string }): MediaProvider;
export async function resolveMediaProvider(plugin: Plugin): Promise<MediaProvider>; // 抛 MEDIA_SERVICE_NOT_CONFIGURED
```

- [ ] **Step 1: 写失败测试**(prompt 模板 + mock fetch 的 submit/poll + resolve 未配置报错)

```ts
// src/server/media/__tests__/providers.test.ts
import { buildEditPrompt } from '../providers/types';
import { createDashScopeProvider } from '../providers/dashscope';

describe('media providers', () => {
  it('builds job-type prompts and appends user intent', () => {
    expect(buildEditPrompt('remove_watermark')).toContain('水印');
    expect(buildEditPrompt('scene', '换成厨房场景')).toContain('厨房');
  });
  it('dashscope submit/poll uses async task protocol', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/services/aigc/')) {
        return new Response(JSON.stringify({ output: { task_id: 't-1', task_status: 'PENDING' } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ output: { task_id: 't-1', task_status: 'SUCCEEDED', results: [{ url: 'https://x/y.png' }] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = createDashScopeProvider({ apiKey: 'sk-test', model: 'qwen-image-edit', fetchImpl: fetchMock });
    const { providerTaskId } = await provider.submitImageEdit({ imageUrl: 'https://a/b.jpg', jobType: 'white_bg' });
    expect(providerTaskId).toBe('t-1');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer sk-test', 'X-DashScope-Async': 'enable' });
    const polled = await provider.pollImageTask('t-1');
    expect(polled).toEqual({ status: 'success', resultUrl: 'https://x/y.png' });
  });
});
```

(注:`createDashScopeProvider` 增加可选 `fetchImpl` 注入以便测试,默认 `globalThis.fetch`。)

- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**

`types.ts`:上述类型 + prompt 模板表(与设计 8.5 预设联动;模板正文来自技能方法论,首版内置):

```ts
const PROMPT_BY_JOB: Record<MediaJobType, string> = {
  remove_watermark: '去除图片中的所有水印、他人商标、文字标识,保持商品主体与背景自然完整,不改变商品外观。',
  replace_logo: '去除图片中原有的品牌 logo 与水印,保持该区域背景自然,不改变商品外观。',
  white_bg: '将背景替换为纯白色(#FFFFFF),商品主体完整居中,边缘干净无阴影残留,不得添加任何文字或水印。',
  scene: '将商品置于一个自然真实的使用场景中,光影协调,商品主体保持原样不变形。',
  crop: '',
  style_variation: '在不改变商品本体的前提下,微调构图与色调,使画面与原图有可感知的差异。',
};
export function buildEditPrompt(jobType: MediaJobType, userPrompt?: string): string {
  const base = PROMPT_BY_JOB[jobType];
  return userPrompt ? `${base}${base ? ' ' : ''}${userPrompt}` : base;
}
```

`dashscope.ts`:按模型名分两条协议分支(设置页换模型名即自动切换,`MediaProvider` 接口不变),默认 `baseURL = 'https://dashscope.aliyuncs.com/api/v1'`,统一请求头 `Authorization: Bearer <key>`、`X-DashScope-Async: enable`,统一轮询 `GET {baseURL}/tasks/{task_id}`(`task_status` PENDING/RUNNING→running、SUCCEEDED→success 取结果 URL、FAILED→failed 取 `output.message`):
  - **千问分支(模型名以 `qwen-image-edit` 开头,默认)**:提交 `POST {baseURL}/services/aigc/multimodal-generation/generation`,body `{ model, input: { messages: [{ role: 'user', content: [{ image: base_image_url }, { text: prompt }] }] } }`,结果取 `output.choices[0].message.content` 中的 image 项;指令式改图,全部 jobType 走同一 prompt 通道(`buildEditPrompt`)。
  - **万相分支(模型名以 `wan` 开头,备选)**:提交 `POST {baseURL}/services/aigc/image2image/image-synthesis`,body `{ model, input: { function, prompt, base_image_url }, parameters: { n: 1 } }`;`function` 按 jobType 映射(remove_watermark→`remove_watermark`,其余→`description_edit`),结果取 `output.results[0].url`。
  实现落地时以百炼当日文档核对两分支的字段名(页面:「千问-图像编辑」与「万相-通用图像编辑」API 参考),协议形状与测试不变。

`index.ts`:

```ts
export async function resolveMediaProvider(plugin: Plugin): Promise<MediaProvider> {
  const Config = plugin.app.db.getRepository('aiListingConfig');
  const row = await Config.findOne({ filter: { scope: 'global' } });
  const serviceName = row?.get('mediaImageServiceName') as string | undefined;
  if (!serviceName) throw Object.assign(new Error('未配置图像生成服务,请到设置页「媒体生成」选择 LLM 服务'), { code: 'MEDIA_SERVICE_NOT_CONFIGURED' });
  const Services = plugin.app.db.getRepository('llmServices');
  const svc = await Services.findOne({ filter: { name: serviceName, enabled: true } });
  if (!svc) throw Object.assign(new Error('所选图像生成服务不存在或已停用'), { code: 'MEDIA_SERVICE_NOT_CONFIGURED' });
  const options = (svc.get('options') as { apiKey?: string; baseURL?: string }) || {};
  if (!options.apiKey) throw Object.assign(new Error('所选服务未配置 API Key'), { code: 'MEDIA_SERVICE_NOT_CONFIGURED' });
  return createDashScopeProvider({ apiKey: options.apiKey, baseURL: options.baseURL, model: (row?.get('mediaImageModel') as string) || 'qwen-image-edit' });
}
```

- [ ] **Step 4: 运行测试通过 → eslint → Commit** — `feat(plugin-ai-listing): media provider adapter (dashscope via llmServices key)`

---

### Task 4: 任务执行器(队列/变体入库/自检/本地操作)

**Files:**
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/executor.ts`
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/local-ops.ts`(crop 裁剪 + replace_logo 贴标的 jimp 本地合成)
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/__tests__/executor.test.ts`

**Interfaces:**
- Consumes: `resolveMediaProvider`(Task 3)· `downloadToStorage(plugin, url)`(`../media/download`,现有)· `dhash/hammingDistance/similarityVerdict`(Task 2)
- Produces:

```ts
export interface EnqueueItem { productId: number; assetId: number; jobType: MediaJobType; prompt?: string }
export async function enqueueMediaJobs(plugin: Plugin, items: EnqueueItem[], opts: { batchId: string; traceId: string; userId?: number }): Promise<number[]>; // 返回 jobIds
export function kickMediaQueue(plugin: Plugin): void; // 非阻塞启动处理循环,并发 2,幂等(已在跑则跳过)
export async function runMediaJob(plugin: Plugin, jobId: number): Promise<void>;
```

- [ ] **Step 1: 写失败测试**(注入 mock provider:enqueue 2 个 job → kick → 轮询到 success → 断言生成了 origin=ai_generated 的变体资产、parentAssetId 正确、similarity 已写、job outputFileId/durationMs 已填;再测 provider 抛错 → job failed 且 errorMessage 落库、原图资产不受影响)。测试基座仿 `src/server/platforms/__tests__` 现有 mockServer 用法。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现要点**(完整逻辑,非伪码)
  - `runMediaJob`:置 running → 读 job + 源资产(源图 URL 优先 `meta.storedUrl`,回退 `sourceUrl`)→ 分派:`crop` 走 `local-ops.cropToPreset`(jimp cover 到平台预设尺寸,零成本);其余走 provider `submitImageEdit` 后 3s 间隔轮询、上限 40 次(120s)超时置 failed(retryable=true);`replace_logo` 在 AI 去标结果上再叠加默认品牌素材(`local-ops.stampLogo`,jimp composite 右下角 8% 边距)→ 结果 URL/Buffer 经 `downloadToStorage` 或临时文件 `createFileRecord` 入库 → 建变体行(`origin:'ai_generated'`, `parentAssetId`, `role` 继承, `genParams:{jobType,prompt,provider:provider.name,model:provider.model,sourceAssetId}`)→ 下载源图与新图各算 `dhash`,距离与 verdict 写变体 `similarity` → job success(outputFileId、durationMs、costEstimate 按模型单价常量表估算)
  - `kickMediaQueue`:模块级 `runningCount`/`started` 标记;循环取 `status='pending'` 最早的 job,受 `CONCURRENCY = 2` 限制并行 `runMediaJob`,队列空即退出;`plugin.load` 末尾调用一次以恢复重启前的 pending(设计 §3)
  - 所有 catch 只记 `errorMessage`/logger,**不记 Key、不记完整响应体**
- [ ] **Step 4: 运行测试通过 → Commit** — `feat(plugin-ai-listing): media job executor with queue, variants, similarity check`

---

### Task 5: 受控 actions(aiListingMedia)+ 护栏 + 审计 + ACL

**Files:**
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/actions.ts`
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/server/plugin.ts`(load 里调用 `setupMediaActions(this)` 与 `kickMediaQueue(this)`)
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/media/__tests__/actions.test.ts`

**Interfaces:**
- Produces(resource `aiListingMedia`,全部 `loggedIn`,响应统一 `{ok,data,warnings,errors,traceId}` 现有惯例):
  - `listMedia` `{productId}` → `{groups: [{role, original: AssetView, variants: AssetView[]}], finalPreview: {main: string[], detail: string[]}}`
  - `generate` `{productId, items: [{assetId, jobType, prompt?}]}` → 护栏检查(单批 ≤ `mediaBatchLimit`;当日 jobs 计数 + 本批 ≤ `mediaDailyLimit`,超限 `MEDIA_LIMIT_EXCEEDED`)→ `enqueueMediaJobs` + `kickMediaQueue` → 审计行(`actorType:'user'`, `action:'ai.image_generate'`, `reason:批量类型摘要`, traceId, **不含 prompt 外的任何模型信息以外内容,绝不含 Key**)→ `{batchId, jobIds}`
  - `jobStatus` `{batchId}` → `{jobs:[{id,assetId,jobType,status,errorMessage?,variantAssetId?}], done, failed}`
  - `adopt` `{assetId, selected: boolean}` → 校验目标是 `origin='ai_generated'` 变体(原图不可"采纳",默认就是回退项)→ 更新 `finalSelected` + 审计 `ai.image_adopt`
- Consumes: Task 4 全部导出

- [ ] **Step 1: 写失败测试**(mockServer + mock provider:generate 超批量上限报 MEDIA_LIMIT_EXCEEDED;正常 generate → jobStatus 轮询到 done → listMedia 里变体出现在对应原图组 → adopt 后 finalPreview 用变体 URL;审计表新增两类 action)
- [ ] **Step 2: 确认失败 → Step 3: 实现**(仿 `setupAssistant` 的 resource 定义与 `app.acl.allow('aiListingMedia', '*', 'loggedIn')`)
- [ ] **Step 4: 测试通过 → Commit** — `feat(plugin-ai-listing): aiListingMedia controlled actions with guardrails and audit`

---

### Task 6: 发布链路"采纳集优先"

**Files:**
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/server/publish/index.ts:78`(取图逻辑抽函数)
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/server/publish/images.ts`
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/publish/__tests__/images.test.ts`

**Interfaces:**
- Produces: `buildPublishImages(mediaRows: { get(k: string): unknown }[]): { images: string[]; usedVariants: number; fallbackOriginals: number }`
- 规则:按 role(main 先、detail 后)、sort 升序遍历**原图**(parentAssetId 空 && assetType='image');每张原图若存在 `finalSelected=true` 的变体(多个取 sort 最小)则取变体 URL(`meta.storedUrl` 优先,无则跳过并计 fallback),否则取原图 URL(现行为)。视频资产保持现行为不动。
- Consumes: `publish/index.ts:78` 处的 `ctx.media` 行集合(查询需改为包含变体行:去掉隐含的"仅原图"过滤,或补一次变体查询——以现查询实现为准,在测试中锁定)

- [ ] **Step 1: 写失败测试**(构造 get() 桩:原图 A 有采纳变体 A1 → images 含 A1.storedUrl 不含 A.sourceUrl;原图 B 无变体 → 含 B.sourceUrl;A 的未采纳变体 A2 不出现)
- [ ] **Step 2: 确认失败 → Step 3: 实现 + 在 index.ts:78 替换为 `const { images } = buildPublishImages(ctx.media)` 并把 usedVariants/fallbackOriginals 记入现有 imageCount 相邻的日志字段**
- [ ] **Step 4: 相关既有发布测试回归** — `yarn test packages/plugins/@crossborder/plugin-ai-listing/src/server/publish/__tests__/`,全部 PASS
- [ ] **Step 5: Commit** — `feat(plugin-ai-listing): publish uses adopted image variants with original fallback`

---

### Task 7: 前端媒体区(变体条 + 批量 + 对比 + 采纳)

**Files:**
- Create: `packages/plugins/@crossborder/plugin-ai-listing/src/client-v2/components/MediaStudio/MediaStudio.tsx`(区块主组件:分组卡片流 + 多选 + 批量工具栏 + 3s 轮询 jobStatus)
- Create: `.../MediaStudio/VariantStrip.tsx`(变体条:操作标签/相似度徽标/生成中态/采纳按钮)
- Create: `.../MediaStudio/CompareModal.tsx`(原图/变体并排 + 滑杆对比,键盘左右键切换,ARIA 标签)
- Create: `.../MediaStudio/media-kit.ts`(`window.__aiListingMediaKit = { mount(el, {productId}), unmount(el) }`,与 assistant-bridge 同模式供 jsBlock 调用)
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/client-v2/index.ts`(导出)与 `src/client/plugin.tsx` load()(try/catch 安装 kit,v1→v2 合法方向)
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/locale/zh-CN.json`、`en-US.json`(新增 key:媒体工场/生成变体/采纳为最终图/仍可能判重/发布图集/批量操作各项等,双语)

**Interfaces:**
- Consumes: `aiListingMedia:listMedia/generate/jobStatus/adopt`(Task 5 响应结构)
- Produces: `window.__aiListingMediaKit.mount(el: HTMLElement, opts: { productId: number }): void`

- [ ] **Step 1: 组件实现**(antd v5:Checkbox 多选卡片、Dropdown 批量操作、Progress、Image.PreviewGroup、Badge;所有交互元素可键盘操作;文案全部 `t()`)
- [ ] **Step 2: 构建验证** — `yarn build plugins/@crossborder/plugin-ai-listing` 通过,`yarn eslint --fix` 干净
- [ ] **Step 3: 预览编辑 jsBlock 挂载**(配置操作,非代码):在预览编辑页 jsBlock 中加 `window.__aiListingMediaKit?.mount(container, { productId })`;经 nb/UI 完成并记录改动摘要
- [ ] **Step 4: 浏览器走查**(agent-browser/Playwright):选 2 张主图 → 批量"白底化" → 变体出现并带相似度徽标 → 对比弹层 → 采纳 → 发布图集预览更新
- [ ] **Step 5: Commit** — `feat(plugin-ai-listing): media studio ui (variant strip, batch generate, compare, adopt)`

---

### Task 8: 设置页「媒体生成」区

**Files:**
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/server/settings/index.ts`(settings get/update 响应与写入新增媒体字段;沿用现有 loadConfig 单例行,**只读写 Task 1 的新字段**,继续绝不返回任何 Key)
- Modify: `packages/plugins/@crossborder/plugin-ai-listing/src/client-v2/pages/SettingsPage.tsx`(新增分区:服务下拉 = `llmServices:list` 过滤 provider='dashscope' 仅取 name/title;模型输入框;日/批上限;相似度阈值;平台预设 JSON 编辑器带 1688 默认值一键填充)
- Modify: locale 双语 key
- Test: `packages/plugins/@crossborder/plugin-ai-listing/src/server/settings/__tests__/media-settings.test.ts`(update→get 回读一致;响应不含 apiKey 字样)

- [ ] **Step 1: 失败测试 → Step 2: 实现 → Step 3: 通过 → Step 4: Commit** — `feat(plugin-ai-listing): media generation settings section`

---

### Task 9: 一期验收(设计 §9 交付判定)

- [ ] **Step 1: 环境准备**:LLM 服务添加 Dashscope(百炼 Key,用户操作);设置页选中该服务;`yarn nocobase upgrade`
- [ ] **Step 2: 端到端**:选 1 个真实商品 10 张主图 → 批量「去水印 + 换背景」→ 全部生成成功,相似度徽标显示,≥1 张 too_similar 时二次"换背景"后转 ok → 采纳 → 发布该商品 → 发布记录中的 images 为采纳变体 URL → 审计表含 ai.image_generate / ai.image_adopt 行且无任何 Key 痕迹
- [ ] **Step 3: 护栏验证**:单批 51 张被拒(MEDIA_LIMIT_EXCEEDED);把日上限临时改为 1 再触发第二张被拒后改回
- [ ] **Step 4: 回归**:`yarn test packages/plugins/@crossborder/plugin-ai-listing/src/server/`(串行)全绿
- [ ] **Step 5: 收尾 Commit + 更新设计文档状态行**(设计稿标注"一期已交付")

---

## Self-Review 记录

- **Spec 覆盖**:设计 §4 模型(Task 1)、§5 服务商(Task 3/8)、§3 双轨中的按钮轨(Task 5/7;员工轨属二期不在本计划)、§7 UI(Task 7)、§8 自检(Task 2/4)、§8.5 预设(Task 1/8,crop 用预设尺寸)、发布采纳集(Task 6)、护栏(Task 5/8)、审计(Task 5)。二期项(Ivy 员工/技能/视频)明确不在本计划。
- **类型一致性**:`MediaJobType`/`MediaProvider`/`EnqueueItem` 在 Task 3 定义、Task 4/5 消费,签名一致;`buildPublishImages` 仅 Task 6 定义与消费。
- **无占位符**:DashScope `function` 参数取值标注了"落地时按当日百炼文档核对"——这是外部 API 的事实核对步骤,接口协议(异步提交/轮询/取结果 URL)已完整给出,不属于设计空缺。
