import { describe, expect, it } from "vitest";

import { fingerprint, resultFingerprint } from "../fingerprint";
import { EXAMPLE_RESPONSE } from "../test/fixtures";

describe("fingerprint", () => {
  it("相同输入得到相同指纹", () => {
    expect(resultFingerprint(EXAMPLE_RESPONSE)).toBe(resultFingerprint(EXAMPLE_RESPONSE));
    expect(fingerprint("层序对应")).toBe(fingerprint("层序对应"));
  });

  it("指纹为 8 位十六进制", () => {
    expect(resultFingerprint(EXAMPLE_RESPONSE)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("任何差异都会改变指纹", () => {
    const modified = {
      ...EXAMPLE_RESPONSE,
      totals: { ...EXAMPLE_RESPONSE.totals, cost: EXAMPLE_RESPONSE.totals.cost + 1 },
    };
    expect(resultFingerprint(modified)).not.toBe(resultFingerprint(EXAMPLE_RESPONSE));
  });

  it("指纹仅覆盖原结果：替代裕量分析不参与", () => {
    const withoutMargins = { steps: EXAMPLE_RESPONSE.steps, totals: EXAMPLE_RESPONSE.totals };
    expect(resultFingerprint(withoutMargins)).toBe(resultFingerprint(EXAMPLE_RESPONSE));

    const modifiedMargins = {
      ...EXAMPLE_RESPONSE,
      margins: {
        ...EXAMPLE_RESPONSE.margins!,
        most_fragile: EXAMPLE_RESPONSE.margins!.most_fragile + 1,
      },
    };
    expect(resultFingerprint(modifiedMargins)).toBe(resultFingerprint(EXAMPLE_RESPONSE));
  });
});
