import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { correlate } from "../api";
import { EXAMPLE_RESPONSE } from "../test/fixtures";

vi.mock("../api", () => ({
  correlate: vi.fn(),
  ApiValidationError: class ApiValidationError extends Error {
    constructor(public readonly errors: { loc: string; message: string }[]) {
      super(errors.map((e) => e.message).join("；"));
    }
  },
}));

const mockedCorrelate = vi.mocked(correlate);

describe("App", () => {
  beforeEach(() => {
    mockedCorrelate.mockReset();
    mockedCorrelate.mockResolvedValue(EXAMPLE_RESPONSE);
  });

  it("载入示例并提交后展示连带图与逐步证据", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));

    await waitFor(() => expect(screen.getByTestId("totals")).toHaveTextContent("总代价 725"));
    expect(screen.getByTestId("totals")).toHaveTextContent("缺失步 2");
    expect(screen.getByTestId("totals")).toHaveTextContent("分组步 2");
    expect(screen.getByTestId("totals")).toHaveTextContent("共 7 步");

    expect(screen.getByTestId("diagram")).toBeInTheDocument();
    expect(screen.getAllByTestId("step-type").map((el) => el.textContent)).toEqual([
      "1:1",
      "1:0",
      "2:1",
      "1:1",
      "1:2",
      "1:1",
      "0:1",
    ]);
    expect(screen.getByTestId("step-2")).toHaveTextContent("左孔第2层 ↔ 缺失");
    expect(screen.getByTestId("step-5")).toHaveTextContent("左孔第6层 ↔ 右孔第4–5层");
    expect(screen.getByTestId("step-7")).toHaveTextContent("累计：代价 725");
    expect(screen.getByTestId("fingerprint")).toHaveTextContent(/^[0-9a-f]{8}$/);

    expect(mockedCorrelate).toHaveBeenCalledTimes(1);
    const [left, right] = mockedCorrelate.mock.calls[0];
    expect(left).toHaveLength(7);
    expect(right).toHaveLength(7);
    expect(left[1]).toEqual({ code: "C", thickness: 25 });
  });

  it("客户端校验失败时不调用接口，并定位到层号", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.change(screen.getByTestId("layer-thickness-right-1"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));

    expect(screen.getByTestId("errors")).toHaveTextContent("右列第2层");
    expect(mockedCorrelate).not.toHaveBeenCalled();
  });

  it("服务端 422 错误同样展示到层号", async () => {
    const { ApiValidationError } = await import("../api");
    mockedCorrelate.mockRejectedValueOnce(
      new ApiValidationError([{ loc: "left[2].thickness", message: "左列第3层：厚度须为 1–999 毫米的整数" }]),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));

    await waitFor(() =>
      expect(screen.getByTestId("errors")).toHaveTextContent("左列第3层"),
    );
  });
});
