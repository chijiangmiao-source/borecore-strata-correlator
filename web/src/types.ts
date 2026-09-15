/** 与 FastAPI 接口契约一致的类型定义。 */

export type StepType = "1:1" | "1:2" | "2:1" | "1:0" | "0:1";

/** 编辑态的层：厚度以字符串保存，提交前再解析校验。 */
export interface LayerDraft {
  code: string;
  thickness: string;
}

/** 提交给接口的层。 */
export interface LayerPayload {
  code: string;
  thickness: number;
}

export interface StepLayer {
  layer: number;
  code: string;
  thickness: number;
}

export interface Step {
  index: number;
  type: StepType;
  left: StepLayer[];
  right: StepLayer[];
  left_sum: number | null;
  right_sum: number | null;
  rep_left: string | null;
  rep_right: string | null;
  thickness_diff: number | null;
  lithology_penalty: number | null;
  missing_base: number | null;
  missing_thickness_double: number | null;
  cost: number;
  cumulative_cost: number;
  cumulative_missing: number;
  cumulative_groups: number;
}

export interface Totals {
  cost: number;
  missing_steps: number;
  group_steps: number;
  step_count: number;
}

/** 一步的替代裕量：合法替代与原结果的 (总代价, 缺失步数, 分组步数) 之差。 */
export interface StepMargin {
  index: number;
  cost: number;
  missing: number;
  groups: number;
}

/** 逐步替代裕量分析：每步裕量、最脆弱步，以及仅为该步重建的完整替代证据。 */
export interface MarginAnalysis {
  steps: StepMargin[];
  most_fragile: number;
  alternative: {
    steps: Step[];
    totals: Totals;
  };
}

export interface CorrelateResponse {
  steps: Step[];
  totals: Totals;
  margins?: MarginAnalysis;
}

export interface ApiErrorItem {
  loc: string;
  message: string;
}
