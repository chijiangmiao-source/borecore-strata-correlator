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

export interface CorrelateResponse {
  steps: Step[];
  totals: Totals;
}

export interface ApiErrorItem {
  loc: string;
  message: string;
}
