/**
 * Apply the repo mirror (docs/jsblocks/preview-edit.js) to the live preview-edit jsBlock.
 *
 * Usage (run yourself from the repo root):
 *   ! node packages/plugins/@crossborder/plugin-ai-listing/docs/plans/scripts/apply-jsblock-to-db.js
 *
 * It connects to the DB using .env (no hardcoded credentials), reads the flowModels row's
 * `options` JSON, swaps only options.stepParams.jsSettings.runJs.code with the mirror, writes
 * it back, and verifies. Re-runnable: generic integrity gate (length / injector / entrypoint),
 * not tied to any specific edit. NOTE: this DB is shared with production — running it updates
 * the live shell. After it succeeds, hard-refresh the 预览编辑 page (Cmd+Shift+R).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../../..'); // -> repo root (nocobase)
const { Client } = require(path.join(ROOT, 'node_modules/pg'));
const MIRROR = path.join(__dirname, '../../jsblocks/preview-edit.js');
const UID = 'um6v8ddxrz8';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const code = fs.readFileSync(MIRROR, 'utf8');
const gateOk =
  code.length > 100000 &&
  code.includes('__AIC_CSS_INJECT_START__') &&
  code.trimEnd().endsWith('ctx.render(<ReviewApp />);');
if (!gateOk) {
  console.error('ABORT: mirror failed integrity gate (length / injector / entrypoint).');
  process.exit(1);
}

(async () => {
  const c = new Client({
    host: env.DB_HOST,
    port: +(env.DB_PORT || 5432),
    database: env.DB_DATABASE,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
  await c.connect();
  const row = await c.query('select options from "flowModels" where uid=$1', [UID]);
  if (!row.rows[0]) {
    console.error('ABORT: flowModel not found');
    process.exit(1);
  }
  const opt = row.rows[0].options;
  if (!opt || !opt.stepParams || !opt.stepParams.jsSettings || !opt.stepParams.jsSettings.runJs) {
    console.error('ABORT: unexpected options shape');
    process.exit(1);
  }
  const oldLen = (opt.stepParams.jsSettings.runJs.code || '').length;
  opt.stepParams.jsSettings.runJs.code = code;
  await c.query('update "flowModels" set options=$1 where uid=$2', [opt, UID]);
  const v = await c.query('select options from "flowModels" where uid=$1', [UID]);
  const nc = v.rows[0].options.stepParams.jsSettings.runJs.code;
  console.log(`✅ applied. oldLen=${oldLen} newLen=${code.length} dbLen=${nc.length} identical=${nc === code}`);
  console.log('   Now hard-refresh the 预览编辑 page (Cmd+Shift+R).');
  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
