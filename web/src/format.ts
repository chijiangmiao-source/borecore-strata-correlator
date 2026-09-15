/** 把接口返回的步骤格式化为编录员可复算的中文证据文本。 */

import type { Step, StepLayer, StepType } from "./types";

export const STEP_LABELS: Record<StepType, string> = {
  "1:1": "单层对单层",
  "1:2": "单层对两层",
  "2:1": "两层对单层",
  // 1:0 消耗的是左孔的层：该层在右孔无对应，即右孔缺失
  "1:0": "右孔缺失",
  "0:1": "左孔缺失",
};

function sideText(layers: StepLayer[], sideName: string): string {
  if (layers.length === 0) return `${sideName}缺失`;
  const first = layers[0].layer;
  const last = layers[layers.length - 1].layer;
  return first === last ? `${sideName}第${first}层` : `${sideName}第${first}–${last}层`;
}

/** 例如 “左孔第3–4层 ↔ 右孔第2层”、“左孔第2层 ↔ 右孔缺失”。 */
export function stepLayersText(step: Step): string {
  return `${sideText(step.left, "左孔")} ↔ ${sideText(step.right, "右孔")}`;
}

/** 分项代价，逐行可复算。 */
export function costLines(step: Step): string[] {
  if (step.type === "1:0" || step.type === "0:1") {
    const thickness = (step.left[0] ?? step.right[0]).thickness;
    return [
      `缺失基准 ${step.missing_base} + 厚度×2（2×${thickness}=${step.missing_thickness_double}）`,
      `步代价 = ${step.cost}`,
    ];
  }
  const lines = [`厚度差 |${step.left_sum}−${step.right_sum}| = ${step.thickness_diff}`];
  if (step.lithology_penalty && step.lithology_penalty > 0) {
    lines.push(`代表岩性 ${step.rep_left} ≠ ${step.rep_right}，罚 +${step.lithology_penalty}`);
  } else {
    lines.push(`代表岩性相同（${step.rep_left}），罚 +0`);
  }
  lines.push(`步代价 = ${step.cost}`);
  return lines;
}
