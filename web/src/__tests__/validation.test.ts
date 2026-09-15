import { describe, expect, it } from "vitest";

import type { LayerDraft } from "../types";
import { toPayload, validateColumns } from "../validation";

function drafts(spec: string): LayerDraft[] {
  return spec.split(" ").map((token) => ({ code: token[0], thickness: token.slice(1) }));
}

describe("validateColumns", () => {
  it("合法输入无错误", () => {
    expect(validateColumns(drafts("A20 C25"), drafts("A100"))).toEqual([]);
  });

  it("厚度越界时定位到层号", () => {
    const errors = validateColumns(drafts("A20 C0 D5"), drafts("A100"));
    expect(errors).toHaveLength(1);
    expect(errors[0].loc).toBe("left[1].thickness");
    expect(errors[0].message).toContain("左列第2层");
    expect(errors[0].message).toContain("1–999");
  });

  it("厚度超过 999 与空输入都被拦截", () => {
    const left: LayerDraft[] = [{ code: "A", thickness: "1000" }];
    const right: LayerDraft[] = [{ code: "A", thickness: "" }];
    const errors = validateColumns(left, right);
    expect(errors.map((e) => e.message)).toEqual([
      expect.stringContaining("左列第1层"),
      expect.stringContaining("右列第1层"),
    ]);
  });

  it("非纯数字厚度被拦截", () => {
    const errors = validateColumns([{ code: "A", thickness: "1.5" }], drafts("A10"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("左列第1层");
  });

  it("非法岩性代码定位到层号", () => {
    const left: LayerDraft[] = [
      { code: "A", thickness: "10" },
      { code: "a", thickness: "10" },
    ];
    const errors = validateColumns(left, drafts("B10"));
    expect(errors).toHaveLength(1);
    expect(errors[0].loc).toBe("left[1].code");
    expect(errors[0].message).toContain("左列第2层");
    expect(errors[0].message).toContain("A–Z");
  });

  it("层数限制为 1–80", () => {
    const empty = validateColumns([], drafts("A10"));
    expect(empty[0].message).toContain("左列层数须为 1–80");

    const eightyOne: LayerDraft[] = Array.from({ length: 81 }, () => ({
      code: "A",
      thickness: "10",
    }));
    const tooMany = validateColumns(eightyOne, drafts("A10"));
    expect(tooMany[0].message).toContain("当前为 81 层");

    const eighty: LayerDraft[] = Array.from({ length: 80 }, () => ({
      code: "A",
      thickness: "10",
    }));
    expect(validateColumns(eighty, drafts("A10"))).toEqual([]);
  });

  it("一次性报告两侧全部错误", () => {
    const errors = validateColumns(
      [
        { code: "a", thickness: "0" },
        { code: "B", thickness: "10" },
      ],
      [{ code: "C", thickness: "5000" }],
    );
    expect(errors.map((e) => e.loc)).toEqual([
      "left[0].code",
      "left[0].thickness",
      "right[0].thickness",
    ]);
  });
});

describe("toPayload", () => {
  it("把编辑态转换为数值载荷", () => {
    expect(toPayload(drafts("A20 C25"))).toEqual([
      { code: "A", thickness: 20 },
      { code: "C", thickness: 25 },
    ]);
  });
});
