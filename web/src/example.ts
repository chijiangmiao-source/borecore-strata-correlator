/** README 固化的示例：与接口、测试共用同一份数据。 */

import type { LayerDraft } from "./types";

export const EXAMPLE_LEFT: LayerDraft[] = [
  { code: "A", thickness: "20" },
  { code: "C", thickness: "25" },
  { code: "B", thickness: "60" },
  { code: "B", thickness: "40" },
  { code: "D", thickness: "30" },
  { code: "E", thickness: "200" },
  { code: "G", thickness: "100" },
];

export const EXAMPLE_RIGHT: LayerDraft[] = [
  { code: "A", thickness: "100" },
  { code: "B", thickness: "95" },
  { code: "D", thickness: "90" },
  { code: "E", thickness: "50" },
  { code: "E", thickness: "150" },
  { code: "G", thickness: "20" },
  { code: "H", thickness: "25" },
];

export const INITIAL_LEFT: LayerDraft[] = [
  { code: "A", thickness: "120" },
  { code: "B", thickness: "80" },
  { code: "C", thickness: "60" },
];

export const INITIAL_RIGHT: LayerDraft[] = [
  { code: "A", thickness: "110" },
  { code: "B", thickness: "90" },
  { code: "C", thickness: "55" },
];
