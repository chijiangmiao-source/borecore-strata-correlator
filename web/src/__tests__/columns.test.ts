import { describe, expect, it } from "vitest";

import { addLayer, MAX_LAYERS, removeLayer, setCode, setThickness } from "../columns";
import type { LayerDraft } from "../types";

const base: LayerDraft[] = [
  { code: "A", thickness: "100" },
  { code: "B", thickness: "80" },
];

describe("addLayer", () => {
  it("追加默认层且不修改原数组", () => {
    const next = addLayer(base);
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ code: "A", thickness: "100" });
    expect(base).toHaveLength(2);
  });

  it("达到 80 层后不再增长", () => {
    const full: LayerDraft[] = Array.from({ length: MAX_LAYERS }, () => ({
      code: "A",
      thickness: "10",
    }));
    expect(addLayer(full)).toBe(full);
  });
});

describe("removeLayer", () => {
  it("删除指定层", () => {
    expect(removeLayer(base, 0)).toEqual([{ code: "B", thickness: "80" }]);
  });

  it("仅剩一层时不可再删", () => {
    const single: LayerDraft[] = [{ code: "A", thickness: "100" }];
    expect(removeLayer(single, 0)).toBe(single);
  });
});

describe("setCode", () => {
  it("更新指定层岩性", () => {
    expect(setCode(base, 1, "Z")).toEqual([
      { code: "A", thickness: "100" },
      { code: "Z", thickness: "80" },
    ]);
  });

  it("拒绝非 A–Z 的输入", () => {
    expect(setCode(base, 0, "a")).toBe(base);
    expect(setCode(base, 0, "AB")).toBe(base);
  });
});

describe("setThickness", () => {
  it("接受至多三位数字，允许清空", () => {
    expect(setThickness(base, 0, "999")[0].thickness).toBe("999");
    expect(setThickness(base, 0, "")[0].thickness).toBe("");
  });

  it("拒绝非数字与超长输入", () => {
    expect(setThickness(base, 0, "12a")).toBe(base);
    expect(setThickness(base, 0, "1000")).toBe(base);
    expect(setThickness(base, 0, "-1")).toBe(base);
  });
});
