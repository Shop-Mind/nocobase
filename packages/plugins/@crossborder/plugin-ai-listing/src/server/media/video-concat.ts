/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 多图 AI 成片(拼接层):把 N 段同规格 mp4 无重编码拼成一条。段间同源(同模型同参数出片,编码一致),
// ffmpeg concat 流拷贝即可,秒级完成不损画质。依赖系统 ffmpeg:env AI_LISTING_FFMPEG 可指定二进制路径,
// 缺省用 PATH 里的 ffmpeg;不可用时抛清晰错误(生产镜像需 apt-get install -y ffmpeg)。

import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function ffmpegBin(): string {
  return (process.env.AI_LISTING_FFMPEG || 'ffmpeg').trim();
}

// concat 清单里的路径按 ffmpeg 单引号转义规则处理(路径来自我们自己的 tmpdir 命名,转义只是防御)
function escapeForConcatList(p: string): string {
  return p.replace(/'/g, "'\\''");
}

export async function concatMp4(segmentPaths: string[], outPath: string): Promise<void> {
  if (segmentPaths.length < 2) throw new Error('拼接至少需要 2 段视频');
  const listPath = path.join(
    os.tmpdir(),
    `ai-listing-concat-${process.pid}-${segmentPaths.length}-${path.basename(outPath)}.txt`,
  );
  await writeFile(listPath, segmentPaths.map((p) => `file '${escapeForConcatList(p)}'`).join('\n'));
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegBin(), ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', (e) =>
        reject(new Error(`ffmpeg 不可用(${e.message}):请安装 ffmpeg 或设置 AI_LISTING_FFMPEG 指向二进制`)),
      );
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg 拼接失败(exit ${code}):${stderr.slice(-300)}`)),
      );
    });
  } finally {
    rm(listPath, { force: true }).catch(() => undefined);
  }
}
