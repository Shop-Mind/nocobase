// Phase 1 验收脚本:DashScope 原生协议适配器真实冒烟(TTS / ASR / 万相 t2i / qwen-image 回归)
// 用法(Key 不落盘不打印):
//   DASHSCOPE_KEY=sk-xxx node docs/plans/scripts/verify-phase1-media-adapters.js [tts|asr|t2i|image|all]
// 或从运行中的应用安全读取:
//   DASHSCOPE_KEY=$(nb api resource list --resource llmServices -j | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=(JSON.parse(s).data||[]).find(x=>x.provider==='dashscope');process.stdout.write(r?r.options.apiKey:'')})") \
//   node docs/plans/scripts/verify-phase1-media-adapters.js all

const base = '/Users/wuzhixuan/code/project/nocobase/packages/plugins/@nocobase/plugin-ai/dist/server/llm-providers';
const { DashscopeProvider } = require(`${base}/dashscope.js`);

const SAMPLE_AUDIO = 'https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3'; // 官方样例:「欢迎使用阿里云」

function makeInvoker() {
  const apiKey = process.env.DASHSCOPE_KEY;
  if (!apiKey) {
    console.error('缺少 DASHSCOPE_KEY 环境变量');
    process.exit(2);
  }
  const provider = new DashscopeProvider({
    app: { environment: { renderJsonTemplate: (v) => v } },
    serviceOptions: { apiKey },
  });
  return provider.createMediaTaskInvoker();
}

const input = (partial) => ({ prompt: '', images: [], audios: [], ...partial });

async function head(url) {
  const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1' }, signal: AbortSignal.timeout(20000) });
  return { status: resp.status, type: resp.headers.get('content-type') };
}

const CHECKS = {
  async tts(invoke) {
    const r = await invoke(
      input({ task: 'tts', model: 'qwen3-tts-flash', prompt: '欢迎使用懂店智能助手,祝您生意兴隆。' }),
    );
    const probe = await head(r.urls[0]);
    console.log(`TTS PASS url=${r.urls[0].split('?')[0]} http=${probe.status} content-type=${probe.type}`);
  },
  async asr(invoke) {
    const r = await invoke(input({ task: 'asr', model: 'qwen3-asr-flash', audios: [SAMPLE_AUDIO] }));
    const ok = /欢迎|阿里云/.test(r.text || '');
    console.log(`ASR ${ok ? 'PASS' : 'FAIL'} text=${r.text}`);
    if (!ok) throw new Error('转写内容与样例不符');
  },
  async t2i(invoke) {
    const r = await invoke(
      input({ task: 'image_gen', model: 'wan2.2-t2i-flash', prompt: '一只极简线条风格的小狗,白底' }),
    );
    console.log(`WAN-T2I PASS url=${r.urls[0].split('?')[0]}`);
  },
  async image(invoke) {
    const r = await invoke(
      input({ task: 'image_gen', model: 'qwen-image-2.0', prompt: '一只极简线条风格的小猫,白底' }),
    );
    console.log(`QWEN-IMAGE PASS url=${r.urls[0].split('?')[0]}`);
  },
};

async function main() {
  const which = process.argv[2] || 'all';
  const invoke = makeInvoker();
  const names = which === 'all' ? Object.keys(CHECKS) : [which];
  let failed = 0;
  for (const name of names) {
    try {
      await CHECKS[name](invoke);
    } catch (e) {
      failed++;
      console.log(`${name.toUpperCase()} FAIL: ${e.message}`);
    }
  }
  console.log(failed ? `SMOKE-FAILED(${failed})` : 'SMOKE-OK');
  process.exit(failed ? 1 : 0);
}

main();
