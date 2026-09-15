/** 列编辑的纯函数操作：不修改原数组，便于测试与 React 状态更新。 */

import type { LayerDraft } from "./types";

export const MIN_LAYERS = 1;
export const MAX_LAYERS = 80;

export const DEFAULT_LAYER: LayerDraft = { code: "A", thickness: "100" };

export function addLayer(column: LayerDraft[]): LayerDraft[] {
  if (column.length >= MAX_LAYERS) return column;
  return [...column, { ...DEFAULT_LAYER }];
}

export function removeLayer(column: LayerDraft[], index: number): LayerDraft[] {
  if (column.length <= MIN_LAYERS) return column;
  return column.filter((_, i) => i !== index);
}

export function setCode(column: LayerDraft[], index: number, code: string): LayerDraft[] {
  if (!/^[A-Z]$/.test(code)) return column;
  return column.map((layer, i) => (i === index ? { ...layer, code } : layer));
}

/** 厚度输入仅接受至多三位数字（可为空串，表示尚未输入，由校验拦截）。 */
export function setThickness(column: LayerDraft[], index: number, raw: string): LayerDraft[] {
  if (!/^\d{0,3}$/.test(raw)) return column;
  return column.map((layer, i) => (i === index ? { ...layer, thickness: raw } : layer));
}
