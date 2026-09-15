/** 提交前的客户端校验：规则与文案同服务端保持一致，错误定位到层号。 */

import { MAX_LAYERS, MIN_LAYERS } from "./columns";
import type { ApiErrorItem, LayerDraft, LayerPayload } from "./types";

export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 999;

const SIDES: Array<{ key: string; label: string }> = [
  { key: "left", label: "左列" },
  { key: "right", label: "右列" },
];

export function validateColumns(left: LayerDraft[], right: LayerDraft[]): ApiErrorItem[] {
  const errors: ApiErrorItem[] = [];
  const columns: Record<string, LayerDraft[]> = { left, right };
  for (const { key, label } of SIDES) {
    const column = columns[key];
    if (column.length < MIN_LAYERS || column.length > MAX_LAYERS) {
      errors.push({
        loc: key,
        message: `${label}层数须为 ${MIN_LAYERS}–${MAX_LAYERS}，当前为 ${column.length} 层`,
      });
    }
    column.forEach((layer, index) => {
      const number = index + 1;
      if (!/^[A-Z]$/.test(layer.code)) {
        errors.push({
          loc: `${key}[${index}].code`,
          message: `${label}第${number}层：岩性代码须为 A–Z 单个大写字母`,
        });
      }
      const thickness = /^\d+$/.test(layer.thickness) ? Number(layer.thickness) : NaN;
      if (!Number.isInteger(thickness) || thickness < MIN_THICKNESS || thickness > MAX_THICKNESS) {
        errors.push({
          loc: `${key}[${index}].thickness`,
          message: `${label}第${number}层：厚度须为 ${MIN_THICKNESS}–${MAX_THICKNESS} 毫米的整数`,
        });
      }
    });
  }
  return errors;
}

/** 校验通过后才可调用：把编辑态转换为接口载荷。 */
export function toPayload(column: LayerDraft[]): LayerPayload[] {
  return column.map((layer) => ({ code: layer.code, thickness: Number(layer.thickness) }));
}
