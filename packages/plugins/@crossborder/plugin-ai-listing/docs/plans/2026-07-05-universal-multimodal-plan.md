# AI 员工全模态通用化 · 分阶段实施计划(v1)

> 日期:2026-07-05 · 状态:**Phase 0–8 全部完成**(2026-07-06)· 前置调研已完成(百炼/OpenAI/Gemini/火山协议矩阵 + 能力元数据目录 + 语音 UI 范式,要点内嵌各节)
> 目标:抽屉支持**文本 / 视觉 / 生图 / 改图 / 视频 / 语音(TTS·ASR·音频理解)/ 全模态 Omni**,**换模型即切能力,不为单个模型写代码**。

## 调研核心结论(架构依据)

1. **全部模态只有 5 种协议形状**:① OpenAI chat/completions(文本/VL/Omni/qwen3-asr,含 `modalities+audio` 语音输出);② OpenAI images/speech/transcriptions 三端点(OpenAI 原生与火山 Ark 生图);③ DashScope 原生 multimodal-generation 同步(qwen-image/qwen-tts/qwen-audio);④ DashScope 原生异步任务+轮询(万相图/视频、paraformer);⑤ Gemini generateContent。写完这 5 个适配器,新模型只是"归类"问题。
2. **模型能力必须由"能力注册中心"声明,而非硬编码**:内部统一 `ModelCapability = { input:[text|image|audio|video|file], output:[text|image|audio|video], task: chat|image_gen|video_gen|tts|asr, supportsTools, supportsStreaming }`;查找链 = 名称归一化 → **本地 override 表(最高优先,自维护)** → LiteLLM json(2900+ 模型,含 dashscope 34 条,`mode` 字段判任务类型最准)→ models.dev / OpenRouter 兜底。百炼非 chat 模型(tts/audio/万相)是公开目录盲区,override 表必须内置。
3. **产物必须落库**:百炼图/视频/TTS 音频 URL 全部 **24h 过期**,dall-e 60 分钟,gpt-image/Gemini 只回 base64——拿到即转存 File Manager 是硬规则。
4. **语音 UI 业界范式定死了**:麦克风=听写(录音→ASR→文字进输入框可编辑),喇叭=回复气泡操作栏朗读,生成音频用原生 `<audio controls>` 气泡;**没有任何一家做微信式语音消息**;实时语音(WebSocket)是独立入口,后置。
5. **流式三形状**:纯文本 SSE / 文本+音频 SSE(`delta.audio.data` base64,OpenAI 与 Omni 同形)/ 异步任务轮询(伪流式进度)。

## 已完成基线(本计划的起点,2026-07-05 已验收)

- 通用生成通道:`LLMProvider.getChatModel()` 统一入口 + `MediaGenChatModel`(消息折叠/结果转 markdown/单块流)+ 能力正则启发式(将被 Phase 0 注册中心取代)
- DashScope 生成调用:原生协议、同步优先/异步回退、显式超时、网络重试 → **文生图已端到端跑通**
- 非视觉模型收图守卫(友好提示不 400)、气泡图片/视频 ChatGPT 式渲染、输入框贴图上传
- 工具式生成(对话模型经工具出图/视频,产物入库+审计+日限额)

---

## Phase 0 — 模型能力注册中心(地基,替换正则启发式) ✅ 已完成并验收(2026-07-05)

> 落地:`plugin-ai/src/server/llm-providers/common/model-capability.ts`;查找链为 env `AI_MODEL_CAPABILITY_OVERRIDES` →
> 旧版 `AI_EMPLOYEE_*_GEN_MODELS` 正则(兼容保留)→ 内置家族规则 → LiteLLM 目录(首查懒拉取 + 每日刷新,失败静默)→ 默认 chat。
> 验收记录:41 条单测全绿(家族分类/归一化/env 注入/目录优先级/dashscope 守卫回归);dist 冒烟 10 项 PASS;
> 真实 Key 文生图直连回归 HAS_IMAGE_MD=true。
> 加固(2026-07-05 事故复盘):LiteLLM 目录可能按国际站能力把 qwen*-max 标成视觉,导致历史图片被重放给
> 文本模型 → 百炼整轮 400。内置钉子规则把百炼文本对话家族(qwen-max/plus/turbo/flash/long/coder/math、
> qwq、deepseek)固定为纯文本 chat,公开目录不得翻转;dashscope 同时把该 400 映射为可行动的中文提示。

**实施**
1. `plugin-ai/src/server/llm-providers/common/model-capability.ts`:`ModelCapability` 类型 + 名称归一化(小写/去 provider 前缀/去日期后缀/别名映射)+ 查找链实现;
2. **内置 override 表**(自维护,含调研确认的全部家族):qwen-max/plus/flash、deepseek(chat)、qwen-vl*/qwen3-vl*(chat+image 输入)、qwen3-asr*(asr)、qwen-audio*(chat+audio 输入)、qwen*-omni*(chat+全输入,text|audio 输出,仅流式)、qwen-image*(image_gen,edit 支持 image 输入)、wan*t2i(image_gen 异步)、wan*i2v/t2v(video_gen)、qwen*-tts/cosyvoice(tts)、paraformer/fun-asr(asr 异步)、gpt-image/dall-e(image_gen)、tts-1/gpt-4o*tts(tts)、whisper/gpt-4o*transcribe(asr)、gemini*image(image_gen)等;
3. LiteLLM json 拉取缓存(启动异步拉一次 + 每日刷新,失败用内置表,不阻塞启动);env `AI_MODEL_CAPABILITY_OVERRIDES`(JSON)支持零发版补条目;
4. 现有 `detectMediaGenCapability`/守卫正则全部改读注册中心;provider 可覆盖 `getModelCapability()`。

**验收**
- 单测:上述每族至少一个真实模型名断言分类正确;`qwen-image-2.0-pro-2026-04-22` 归一化后命中;未知模型默认 `chat(text→text)`;
- env 注入一个虚构模型名 → 生效为指定能力;
- 现有已验收功能(文生图直连/守卫)回归不破。

## Phase 1 — 协议适配器矩阵补全 ✅ 已完成并验收(2026-07-05)

> 落地:统一接口 `MediaTaskInvoker`(`common/media-task.ts`,{task, model, prompt, images, audios, options} →
> {urls, text, binaries});OpenAI 三端点组(images/generations 收 b64_json+url、audio/speech 二进制、
> audio/transcriptions multipart)为基类默认实现,video 回落 chat/completions 形状;dashscope 按 task 路由:
> TTS/ASR/qwen-image 原生同步,老一代万相 t2i(wan2.x-t2i/wanx → image-synthesis)/视频/paraformer 异步任务+轮询;
> 新一代 wan*-image(wan2.7-image,兼容端点 /models 可见)与 qwen-image 同挂 multimodal-generation(实测修正)。Gemini 留待 Phase 7。
> 验收记录:16 条 mock 单测覆盖 5 协议形状;真实 Key 冒烟 4/4 PASS(qwen3-tts-flash 出 wav、
> qwen3-asr-flash 转写「欢迎使用阿里云。」、wan2.2-t2i-flash 异步出图、qwen-image-2.0 全链路回归);
> 验收脚本固化于 docs/plans/scripts/verify-phase1-media-adapters.js。

**实施**(基于现有 dashscope invoker 扩展,统一接口升级为 `invokeMediaTask({task, model, prompt, images, audios, options})`)
1. **DashScope 原生同步**补 `tts`(`input.{text,voice}` → `output.audio.url`,wav 24kHz)与 `asr`(content `{audio}` → 文本)、音频理解(`{audio}+{text}`);
2. **DashScope 异步任务**补万相 t2i(image-synthesis)与 paraformer 转写(transcription,`file_urls` 需公网 URL——转写走"先传文件管理器拿公网地址");
3. **OpenAI 三端点组**:images/generations(先取 `b64_json` 再回落 `url`)、audio/speech(响应为二进制流)、audio/transcriptions(multipart);作为基类默认实现,供 OpenAI/Ark 系服务直接用;
4. Gemini generateContent 适配器(后置到 Phase 7 实装,本阶段仅留接口位)。

**验收**
- mock 单测覆盖 5 形状请求/响应(含 gpt-image 无 url、TTS 二进制、异步轮询);
- 真实 Key 冒烟:qwen3-tts-flash 出可播 wav;qwen3-asr-flash 对样例音频转写正确;wan t2i 出图。

## Phase 2 — 产物统一转存(先行,消灭临时链接) ✅ 已完成并验收(2026-07-05)

> 落地:`common/media-persist.ts`——`withMediaPersistence(app, invoker)` 装饰所有媒体任务调用,
> 产物 URL 下载/base64 落盘 → `fileManager.createFileRecord`(attachments)→ `getFileURL` 计算本地地址
> (记录本身无 url 字段,须经存储引擎计算,这是一次实测踩坑);任一产物失败回退原 URL 且 persisted=false,
> 气泡仅在此时显示时效提示。TTS/ASR 二进制产物同路径,Phase 3 上 UI 后自然生效。
> 验收记录:7 条单测(下载/回退/二进制/无文件管理器降级/气泡提示切换);真实服务器 SSE 全管线 E2E:
> 气泡内容为 `![AI 生成图片](/storage/uploads/ai-media-….png)`、无时效提示、文件落盘 5.4MB。

**实施**:`MediaGenChatModel` 输出与所有适配器产物,统一经 `downloadToStorage`/`createFileRecord` 落 File Manager(base64 产物直接写文件),消息里只引用本地 URL;转存失败降级用原 URL 并保留提示。删除"链接有效期有限"文案(仅降级时显示)。

**验收**:直连生成一张图/一段音频,气泡内 URL 为本地 `/storage/...`;数小时后刷新会话仍可显示/播放;File Manager 出现对应文件。

## Phase 3 — TTS 上线(文本→语音) ✅ 已完成并验收(2026-07-05)

> 落地:①对话通道——`maybeCreateMediaGenModel` 放行 tts,`MediaGenChatModel` 渲染 `<audio controls>` 气泡
> (sanitize 白名单加 audio,空文本不调用直接友好提示);②朗读——`aiConversations:ttsMessage` 动作
> (消息文本经 `extractSpeechText` 清洗、截 1000 字,默认 TTS 模型 = env `AI_DEFAULT_TTS_MODEL` 或扫描启用模型中
> 能力=tts 的第一个,产物转存后缓存于消息 `metadata.tts`)+ `ttsAvailable` 探测;③前端——气泡操作栏喇叭按钮
> (加载/播放/停止三态,未配置 TTS 模型自动隐藏),`LLMProvider.invokeMediaTask()` 公共入口供消息级任务复用。
> 验收记录:单测 86 条全绿(tts 分支/文本清洗/默认模型解析);真实服务器 E2E 8 项 PASS:
> qwen3-tts-flash 气泡 `<audio src="/storage/uploads/….wav">` 落盘、ttsMessage 首次 1.8s 合成,
> 二次 93ms 命中缓存同 URL 不重复计费。

**实施**
1. 能力注册中心标注 tts 模型 → `MediaGenChatModel` 增加 `tts` 分支:用户文本 → 适配器 → 音频 → `<audio controls src>` 气泡(sanitize 白名单加 `audio`,渲染样式与图片同规格);
2. **回复朗读按钮**:助手气泡操作栏(复制/重试旁)加喇叭图标——点击取该消息文本,用"默认 TTS 模型"(插件设置:从能力=tts 的已启用模型中选,未配置则隐藏按钮)生成并内联播放,结果缓存于消息 metadata 避免重复计费。

**验收**:模型切 `qwen3-tts-flash` 发一段文案 → 出音频气泡可播、可拖进度;任意文本回复点喇叭 → 2~5s 后播放,再点停止;二次点击不重新计费(命中缓存);产物在 File Manager。

## Phase 4 — ASR 听写 + 音频理解(语音→文本) ✅ 已完成并验收(2026-07-05)

> 落地:①听写——Sender 工具栏麦克风按钮(MediaRecorder 录音≤60s → base64 → `aiConversations:asrTranscribe`
> → 文字回填输入框可编辑;无 ASR 模型/浏览器不支持则不渲染;录音为临时输入不落库);默认 ASR 模型解析同 TTS
> (env `AI_DEFAULT_ASR_MODEL` 或能力扫描);②dashscope ASR base64 走 OpenAI 兼容 input_audio——实测两坑:
> data 必须是 data URI 形式(裸 base64 报"URL 无效"),qwen3-asr 回复夹杂"User query"模板残留需清洗;
> ③音频附件理解——基类 convertToContent 音频→input_audio 块(dashscope 覆盖补 data URI 前缀),
> 守卫按能力放行(omni/audio/asr 收,文本模型走友好提示);paraformer 长音频 UI 占位后置(file_urls 需公网,
> 本地 dev 不可达,生产可用,适配器 Phase 1 已就绪)。
> 验收记录:单测 85+8 全绿;真实 E2E:asrAvailable=true、TTS wav 回灌转写 906ms 文本正确无残留、
> qwen3-omni-flash input_audio 音频理解复述正确。麦克风真实录音(webm)与抽屉音频附件问答留浏览器侧验证。

**实施**
1. **输入框麦克风**(业界范式):浏览器 MediaRecorder 录音(上限 60s)→ 上传 File Manager → 调"默认 ASR 模型"(设置项,推荐 qwen3-asr-flash 同步)→ **文字填入输入框供编辑后发送**;无 ASR 模型或无麦克风权限时按钮隐藏/给提示;
2. **音频附件理解**:能力含 `input.audio` 的模型(qwen-audio/omni),上传/粘贴音频附件转 `input_audio` 内容块(OpenAI 形),Provider 附件守卫按注册中心放行;
3. 长音频(>5min)走 paraformer 异步转写,进度以气泡占位呈现。

**验收**:点麦克风说一句话 → 文字出现在输入框,可修改后发送;上传 30s mp3 + qwen-audio 模型问"这段说了什么" → 正确概括;文本模型收到音频附件 → 友好提示切换模型(不报错)。

## Phase 5 — Omni 全模态会话(语音回复) ✅ 已完成并验收(2026-07-05)

> 落地:①`ReasoningChatOpenAI`——delta.audio.transcript 映射为正文复用文字流,PCM 帧经 __nb_audio_frames
> 暂存、沿途剥离,流末拼 WAV(24kHz mono 16bit)经 audioReplySink 转存,以追加文本 chunk 挂 `<audio>` 气泡,
> 上层流管线零改动;②dashscope createModel 按 builtIn.voiceReply+能力(output 含 audio)注入
> modalities+audio{voice:Cherry,format:wav},语音回复与工具互斥(resolveTools 退让);③voiceReply 全链路
> (客户端开关仅 omni 模型可见 → sendMessages/resend/toolCall 载荷 → AIEmployee → getLLMService → builtIn)。
> 两个实测大坑:LangChain 基类把 delta.audio 原样塞进 additional_kwargs.audio——不删除则消息 metadata
> 膨胀 430KB,且历史重放被序列化成非法请求(400 "content: got an object"),已在转换器中提取后删除;
> provider.test.ts 恢复 env 时把 undefined 串化污染同进程白名单(既有 bug,已修)。
> 验收记录:单测 91 条全绿;真实 E2E 5 项 PASS:开=transcript+音频气泡(300KB wav 落盘)+metadata 干净,
> 关=纯文本;后续轮次不受历史影响。

**实施**:注册中心标注 omni(仅流式、输出 text|audio)→ chat 通道请求追加 `modalities:["text","audio"]` + `audio:{voice,format:'wav'}`(设置项开关"语音回复");流式解析扩展:`delta.audio.data` base64 逐帧聚合 → 结束后拼 wav 落 File Manager → 消息渲染为 文字(transcript)+ 音频气泡;`delta.audio.transcript` 作为文字流实时上屏。

**验收**:选 `qwen3-omni-flash`,发一张图 + "用语音描述这张图" → 文字流式出现,结束后气泡内音频可播且内容与文字一致;关闭"语音回复"开关则纯文本。

## Phase 6 — 能力驱动 UI(体验收口) ✅ 已完成并验收(2026-07-06)

> 落地:①服务端——enabledModels 每项随 `ai:listAllEnabledModels` 下发 capability(注册中心判定);
> AbortSignal 贯通媒体生成全链路(MediaGenChatModel→invoker→提交/轮询,taskSignal 组合超时与用户取消,
> 点"停止"即中断服务端轮询不再空转);②客户端——模型选择器能力徽标(👁🎤🎨🎬🔊),
> Sender 占位文案按任务切换(生图/视频/合成语音),附件与能力不匹配内联 Alert(贴图给文本模型不再静默降级),
> VoiceReplySwitch 改读真实能力(名称启发式仅作兜底),生成类模型加载气泡显示"生成中(已用时 Ns)"。
> 说明:麦克风听写按默认 ASR 模型可用性显隐(与当前对话模型无关,设计如此);
> "取消"复用既有停止按钮(现在真正中断服务端任务)。
> 验收记录:92 条单测(含 abort 中断轮询);API 验收 7/7 模型能力正确下发
> (image_gen/chat/tts/asr/omni 全类型);徽标/占位/提示/耗时为浏览器侧验证。

**实施**
1. 模型选择器每项显示**能力徽标**(👁 视觉 / 🎨 生图 / 🎬 视频 / 🔊 语音出 / 🎤 语音入,读注册中心);
2. 控件显隐联动:当前模型无 `input.image` → 贴图/传图时输入框内联提示"当前模型不支持看图,建议切换 xx"(替代静默降级);无 `input.audio` → 麦克风置灰;`task=image_gen/video_gen` → 输入框占位文案变"描述你想生成的画面",发送后显示任务进度条(视频轮询进度);
3. 生成中气泡:骨架屏 + 已耗时 + 取消按钮(中止轮询,任务标记 canceled)。

**验收**:逐一切换 5 类模型,徽标/控件/占位/提示全部按能力变化;视频生成中可取消;文本模型贴图有提示不再瞎猜。

## Phase 7 — 多服务商横向打通 ✅ 已完成(2026-07-06,真实 Key 验证待用户配置)

> 落地:①OpenAI——零代码,gpt-image-1/dall-e/tts-1/whisper-1 直接走 Phase 1 基类三端点组;
> ②Gemini——GoogleGenAIProvider 覆盖 image_gen:原生 generateContent(x-goog-api-key,
> 参考图 inline_data,产物 inlineData base64 经统一转存);③火山方舟——新 provider `volcengine-ark`
> (chat/视觉/深度思考走 OpenAI 兼容 + reasoning_content;Seedream 生图 = 基类 images/generations;
> Seedance 视频 = /contents/generations/tasks 任务式提交+轮询,支持取消);④豆包语音(openspeech)
> **明确不做**:独立鉴权体系(app token 而非 API Key)+ WebSocket 二进制协议,与 LLM 服务的
> Key 配置模型不兼容,收益不抵复杂度——TTS/ASR 需求由百炼(qwen3-tts/asr)与 OpenAI(tts-1/whisper)覆盖。
> 验收记录:104 条单测(Gemini 请求形状/inlineData、Ark 生图路由/视频轮询/失败与取消、
> doubao 家族能力分类);ai:listLLMProviders 含 volcengine-ark。
> 真实 Key 冒烟待用户在 LLM 服务里配置任一家后按抽屉流程验证(设计即零代码)。

**实施**:OpenAI 服务(gpt-image-1 生图、tts-1、whisper-1)走 Phase 1 的三端点默认实现;Gemini 兼容层 chat/生图 + 原生 generateContent 适配器;火山 Ark(chat 兼容、Seedream 生图 OpenAI 形、Seedance 视频任务式变体);豆包语音(openspeech,独立鉴权+WS)**明确不做**,记录原因。

**验收**:配任一家 Key 后,同一抽屉切该家的 chat/vl/生图模型即用,零代码改动;能力徽标正确。

## Phase 8 — 实时语音通话 ✅ 已完成并验收(2026-07-06)

> 落地:「票据换连接 + 服务端 WS 中继」架构,Key 绝不出服务端——
> ①`aiConversations:realtimeSession` 发 60s 一次性票据(crypto.randomUUID,单次消费即删);
> ②`Gateway.registerWsHandler` 注册 `/ws/ai-realtime`:验票 → 持 Key 直连
> `wss://dashscope.aliyuncs.com/api-ws/v1/realtime`(OpenAI Realtime 兼容协议)→ 双向原样透传
> (中继协议无关,未来接其他 Realtime 服务商零改动);③客户端独立"通话"入口(电话图标,
> 与听写分离):麦克风 ScriptProcessor 采集 → 线性重采样 16k PCM16 上行,response.audio.delta
> (24k PCM16)排队播放,助手字幕实时上屏,speech_started 打断清空播放队列;
> ④模型解析:env `AI_REALTIME_MODEL=<llmService>:<model>`(已配 qwen3-omni-flash-realtime)
> 或启用模型含 realtime;未配置则入口隐藏。注意:.env 变更需整个 dev 进程重启(child 只继承父 env)。
> 验收记录:单测 4 条(模型解析/票据一次性);真实 E2E 6/6 PASS——node 客户端经中继流入 TTS wav
> (重采样 16k),复读机指令下模型逐字复述「欢迎使用懂电智能助手,祝您生意兴隆。」,
> 语音回复 142KB 音频帧,response.done 正常;票据复用与伪造均被 401 拒绝。
> 浏览器侧(麦克风/播放/打断体验)留用户实测。CosyVoice 流式 TTS / 实时 ASR 独立协议,不在本期。

---

## 依赖与排期建议

```
Phase 0(地基,1 周)→ Phase 1+2(并行,1 周)→ Phase 3+4(并行,1 周)→ Phase 5(3 天)→ Phase 6(1 周)→ Phase 7(按需)
```

- 全程遵守既有铁律:Key 只在服务端、逐次审计、日限额(音频类新增独立限额:TTS 按字符、ASR 按分钟);
- 每个 Phase 结束:`yarn build plugins/@nocobase/plugin-ai` + 验证进程换代(dev 加载 dist,已记忆);
- 上游改动集中在 plugin-ai(本仓库副本),建议每 Phase 完成后单独 commit,便于未来向官方提 PR 或合并新版本。
