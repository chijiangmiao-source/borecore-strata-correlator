import { describe, expect, it } from "vitest";

import { costLines, stepLayersText } from "../format";
import { EXAMPLE_RESPONSE } from "../test/fixtures";

const steps = EXAMPLE_RESPONSE.steps;
const byType = (type: string) => steps.find((step) => step.type === type)!;

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

  it("缺失步展示缺失侧", () => {
    expect(stepLayersText(byType("1:0"))).toBe("左孔第2层 ↔ 缺失");
    expect(stepLayersText(byType("0:1"))).toBe("缺失 ↔ 右孔第7层");
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
