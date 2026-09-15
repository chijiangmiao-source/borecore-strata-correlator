import { describe, expect, it } from "vitest";

import { costLines, formatMargin, formatMarginLong, STEP_LABELS, stepLayersText } from "../format";
import { EXAMPLE_RESPONSE } from "../test/fixtures";

const steps = EXAMPLE_RESPONSE.steps;
const byType = (type: string) => steps.find((step) => step.type === type)!;

describe("STEP_LABELS 缺失方向", () => {
  it("1:0 消耗左孔的层，表示该层在右孔缺失", () => {
    expect(STEP_LABELS["1:0"]).toBe("右孔缺失");
  });

  it("0:1 消耗右孔的层，表示该层在左孔缺失", () => {
    expect(STEP_LABELS["0:1"]).toBe("左孔缺失");
  });
});

describe("stepLayersText", () => {
  it("单层对单层", () => {
    expect(stepLayersText(byType("1:1"))).toBe("左孔第1层 ↔ 右孔第1层");
  });

  it("两层对单层展示层号区间", () => {
    expect(stepLayersText(byType("2:1"))).toBe("左孔第3–4层 ↔ 右孔第2层");
  });

  it("单层对两层展示层号区间", () => {
    expect(stepLayersText(byType("1:2"))).toBe("左孔第6层 ↔ 右孔第4–5层");
  });

  it("缺失步显式标注缺失的一侧", () => {
    // 左孔第2层（C 25mm）在右孔无对应层
    expect(stepLayersText(byType("1:0"))).toBe("左孔第2层 ↔ 右孔缺失");
    // 右孔第7层（H 25mm）在左孔无对应层
    expect(stepLayersText(byType("0:1"))).toBe("左孔缺失 ↔ 右孔第7层");
  });
});

describe("costLines", () => {
  it("匹配步列出厚度差与岩性罚分", () => {
    expect(costLines(steps[0])).toEqual([
      "厚度差 |20−100| = 80",
      "代表岩性相同（A），罚 +0",
      "步代价 = 80",
    ]);
  });

  it("代表岩性不同时展示罚分", () => {
    const penalized = {
      ...steps[0],
      left_sum: 100,
      right_sum: 100,
      thickness_diff: 0,
      rep_left: "A",
      rep_right: "B",
      lithology_penalty: 300,
      cost: 300,
    };
    expect(costLines(penalized)).toContain("代表岩性 A ≠ B，罚 +300");
  });

  it("缺失步列出基准与厚度双倍", () => {
    expect(costLines(byType("1:0"))).toEqual([
      "缺失基准 200 + 厚度×2（2×25=50）",
      "步代价 = 250",
    ]);
  });
});

describe("formatMargin", () => {
  it("三项差值以斜杠分隔，正数加正号，负数用 U+2212", () => {
    expect(formatMargin({ index: 2, cost: 15, missing: -1, groups: 1 })).toBe("+15/−1/+1");
    expect(formatMargin({ index: 1, cost: 0, missing: 0, groups: 0 })).toBe("0/0/0");
    expect(formatMargin({ index: 5, cost: 100, missing: 0, groups: 0 })).toBe("+100/0/0");
  });
});

describe("formatMarginLong", () => {
  it("逐项标注代价、缺失与分组", () => {
    expect(formatMarginLong({ index: 2, cost: 15, missing: -1, groups: 1 })).toBe(
      "替代裕量：代价 +15 · 缺失 −1 · 分组 +1",
    );
  });
});
