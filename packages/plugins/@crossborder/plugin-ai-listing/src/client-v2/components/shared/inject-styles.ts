/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CREATIVE_CONSOLE_CSS, CREATIVE_CONSOLE_STYLE_ID } from './creative-console';
import { AIC_FONTS_CSS } from './creative-console-fonts';

/**
 * 幂等地把 Creative Console 设计系统注入 document.head 的一个 <style id="ai-listing-creative-console"> 里。
 *
 * MediaStudio（React）与预览编辑 jsBlock 都只引用这一份注入的 class，保证成套一致、单一真源。
 * 因为绝大多数规则作用域在 .aic-scope 下（仅 :root 令牌与 @keyframes 全局，且都是惰性的），
 * 在任何容器挂上 aic-scope 之前，注入本身对页面「零视觉影响」。
 *
 * 重复调用安全：同一个 id 已存在则只在内容变化时刷新 textContent，不会产生第二个 style 节点。
 */
export function injectCreativeConsole(): void {
  if (typeof document === 'undefined' || !document.head) return;
  let el = document.getElementById(CREATIVE_CONSOLE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = CREATIVE_CONSOLE_STYLE_ID;
    el.setAttribute('type', 'text/css');
    document.head.appendChild(el);
  }
  // 字体在前（@font-face 需先于引用它的规则解析），皮肤规则在后。
  const css = AIC_FONTS_CSS + CREATIVE_CONSOLE_CSS;
  if (el.textContent !== css) {
    el.textContent = css;
  }
}
