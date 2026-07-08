// Prepend an idempotent .aic-scope CSS injector to the preview-edit jsBlock mirror, so the block
// self-styles even on prod's old client (which does not run injectCreativeConsole()). Re-runnable:
// strips any prior injected block (between sentinels) before re-inserting the current CSS, so the
// CSS stays single-sourced from creative-console.ts.
const fs = require('fs');

const ROOT = '/Users/wuzhixuan/code/project/nocobase/packages/plugins/@crossborder/plugin-ai-listing';
const CC = ROOT + '/src/client-v2/components/shared/creative-console.ts';
const MIRROR = ROOT + '/docs/jsblocks/preview-edit.js';

const ccSrc = fs.readFileSync(CC, 'utf8');
// Extract the CREATIVE_CONSOLE_CSS template literal body.
const m = ccSrc.match(/export const CREATIVE_CONSOLE_CSS = `([\s\S]*?)`;/);
if (!m) throw new Error('CREATIVE_CONSOLE_CSS not found');
const css = m[1];

const START = '/* __AIC_CSS_INJECT_START__ (mirrored from creative-console.ts — do not hand-edit; run embed-css.js) */';
const END = '/* __AIC_CSS_INJECT_END__ */';

const injector =
  START +
  '\n' +
  '(function () {\n' +
  '  try {\n' +
  "    if (typeof document === 'undefined' || !document.head) return;\n" +
  "    if (document.getElementById('ai-listing-creative-console')) return;\n" +
  "    var s = document.createElement('style');\n" +
  "    s.id = 'ai-listing-creative-console';\n" +
  "    s.setAttribute('type', 'text/css');\n" +
  '    s.appendChild(document.createTextNode(' +
  JSON.stringify(css) +
  '));\n' +
  '    document.head.appendChild(s);\n' +
  '  } catch (e) {}\n' +
  '})();\n' +
  END +
  '\n';

let mirror = fs.readFileSync(MIRROR, 'utf8');
// Strip any previous injected block (with trailing newline) so re-runs don't stack.
const between = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?',
);
mirror = mirror.replace(between, '');
const out = injector + mirror;
fs.writeFileSync(MIRROR, out);
console.log('css chars:', css.length, '| injector chars:', injector.length, '| mirror bytes:', Buffer.byteLength(out));
