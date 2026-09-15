/** 结果指纹：FNV-1a 32 位散列，用于快速核对两次提交的对应证据是否完全一致。 */

import type { CorrelateResponse } from "./types";

export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function resultFingerprint(result: CorrelateResponse): string {
  return fingerprint(JSON.stringify(result));
}
