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
    expect(screen.getByTestId("step-2")).toHaveTextContent("左孔第2层 ↔ 右孔缺失");
    expect(screen.getByTestId("step-2")).toHaveTextContent("右孔缺失");
    expect(screen.getByTestId("step-7")).toHaveTextContent("左孔缺失 ↔ 右孔第7层");
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

  it("计算后修改任一孔任一层，旧连带图与旧代价立即失效", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());

    // 修改左孔一层：证据失效
    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "55" },
    });
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-list")).not.toBeInTheDocument();

    // 重新计算后修改右孔一层：同样失效
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("layer-thickness-right-6"), {
      target: { value: "30" },
    });
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();
  });

  it("校验错误在编辑输入后同样失效", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.change(screen.getByTestId("layer-thickness-right-1"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    expect(screen.getByTestId("errors")).toHaveTextContent("右列第2层");

    fireEvent.change(screen.getByTestId("layer-thickness-right-1"), {
      target: { value: "95" },
    });
    expect(screen.queryByTestId("errors")).not.toBeInTheDocument();
  });

  it("在途响应返回前输入已变化时丢弃旧证据", async () => {
    let resolveRequest: (value: typeof EXAMPLE_RESPONSE) => void = () => {};
    mockedCorrelate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    // 响应尚未返回时修改输入
    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "55" },
    });
    resolveRequest(EXAMPLE_RESPONSE);
    await waitFor(() => expect(screen.getByRole("button", { name: "开始对应" })).toBeEnabled());
    // 旧输入对应的响应不得展示
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();
  });

  it("连带图逐步展示替代裕量并标记最脆弱步", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());

    // 逐步裕量：与原结果的三项差值
    expect(screen.getByTestId("margin-1")).toHaveTextContent("+25/−1/+1");
    expect(screen.getByTestId("margin-2")).toHaveTextContent("+15/−1/+1");
    expect(screen.getByTestId("margin-5")).toHaveTextContent("+100/0/0");
    expect(screen.getByTestId("margin-7")).toHaveTextContent("+25/−1/+1");

    // 最脆弱步汇总与标记
    expect(screen.getByTestId("fragile-summary")).toHaveTextContent("最脆弱步 第2步");
    expect(screen.getByTestId("fragile-summary")).toHaveTextContent(
      "替代裕量：代价 +15 · 缺失 −1 · 分组 +1",
    );
    expect(screen.getByTestId("fragile-marker")).toBeInTheDocument();
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent("原图");
  });

  it("点击最脆弱标记切换原图与替代图", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("fragile-marker")).toBeInTheDocument());

    // 切换到替代图：展示替代证据，原图裕量隐去
    fireEvent.click(screen.getByTestId("fragile-marker"));
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent(
      "替代图：第 2 步的最近替代（总代价 740 · 缺失 1 · 分组 3）",
    );
    expect(screen.queryByTestId("margin-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fragile-marker")).not.toBeInTheDocument();
    // 替代路径共 6 步，末步为 0:1
    expect(screen.getByTestId("band-6")).toBeInTheDocument();
    expect(screen.queryByTestId("band-7")).not.toBeInTheDocument();

    // 返回原图：裕量与最脆弱标记恢复
    fireEvent.click(screen.getByTestId("toggle-alternative"));
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent("原图");
    expect(screen.getByTestId("margin-1")).toHaveTextContent("+25/−1/+1");
    expect(screen.getByTestId("fragile-marker")).toBeInTheDocument();
    expect(screen.getByTestId("band-7")).toBeInTheDocument();
  });

  it("输入修改清除比较态", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("fragile-marker")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("fragile-marker"));
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent("替代图");

    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "55" },
    });
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toggle-alternative")).not.toBeInTheDocument();

    // 重新提交后回到原图，而不是停留在替代图
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent("原图");
  });

  it("新提交清除比较态", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("fragile-marker")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("fragile-marker"));
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent("替代图");

    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram-mode")).toHaveTextContent("原图"));
    expect(screen.getByTestId("fragile-marker")).toBeInTheDocument();
  });

  it("迟到响应不会复活比较态", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("fragile-marker")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("fragile-marker"));
    expect(screen.getByTestId("diagram-mode")).toHaveTextContent("替代图");

    // 修改输入后再次提交，旧响应迟到返回也不得展示任何比较态
    let resolveRequest: (value: typeof EXAMPLE_RESPONSE) => void = () => {};
    mockedCorrelate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "55" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "66" },
    });
    resolveRequest(EXAMPLE_RESPONSE);
    await waitFor(() => expect(screen.getByRole("button", { name: "开始对应" })).toBeEnabled());
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toggle-alternative")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fragile-marker")).not.toBeInTheDocument();
  });

  it("初始时撤销/重做均不可用", () => {
    render(<App />);
    expect(screen.getByTestId("undo")).toBeDisabled();
    expect(screen.getByTestId("redo")).toBeDisabled();
  });

  it("跨列增删与合并键入按实际发生顺序往返，结构操作各自成项", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    expect(screen.getByTestId("editor-left")).toHaveTextContent("7 层");

    // 左孔添加层（结构项），新层厚度连续键入合并为一项
    fireEvent.click(screen.getByTestId("add-left"));
    expect(screen.getByTestId("editor-left")).toHaveTextContent("8 层");
    const addedThickness = screen.getByTestId("layer-thickness-left-7");
    fireEvent.change(addedThickness, { target: { value: "" } });
    fireEvent.change(addedThickness, { target: { value: "1" } });
    fireEvent.change(addedThickness, { target: { value: "15" } });
    expect(addedThickness).toHaveValue("15");

    // 右孔删除一层（结构项）
    fireEvent.click(screen.getByTestId("remove-right-6"));
    expect(screen.getByTestId("editor-right")).toHaveTextContent("6 层");

    const undoButton = screen.getByTestId("undo");
    const redoButton = screen.getByTestId("redo");

    // 依次撤销：删右孔层 → 左孔厚度合并键入 → 左孔加层 → 载入示例
    fireEvent.click(undoButton);
    expect(screen.getByTestId("editor-right")).toHaveTextContent("7 层");
    fireEvent.click(undoButton);
    expect(screen.getByTestId("layer-thickness-left-7")).toHaveValue("100");
    fireEvent.click(undoButton);
    expect(screen.getByTestId("editor-left")).toHaveTextContent("7 层");
    fireEvent.click(undoButton);
    expect(screen.getByTestId("editor-left")).toHaveTextContent("3 层");
    expect(screen.getByTestId("editor-right")).toHaveTextContent("3 层");
    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeEnabled();

    // 按原顺序重做回放，连续键入仍只是一项
    fireEvent.click(redoButton);
    expect(screen.getByTestId("editor-left")).toHaveTextContent("7 层");
    fireEvent.click(redoButton);
    expect(screen.getByTestId("editor-left")).toHaveTextContent("8 层");
    expect(screen.getByTestId("layer-thickness-left-7")).toHaveValue("100");
    fireEvent.click(redoButton);
    expect(screen.getByTestId("layer-thickness-left-7")).toHaveValue("15");
    fireEvent.click(redoButton);
    expect(screen.getByTestId("editor-right")).toHaveTextContent("6 层");
    expect(redoButton).toBeDisabled();
  });

  it("回退后的任何新编辑都会截断重做分支", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "55" },
    });
    fireEvent.click(screen.getByTestId("undo"));
    expect(screen.getByTestId("layer-thickness-left-0")).toHaveValue("20");
    expect(screen.getByTestId("redo")).toBeEnabled();

    // 在另一列键入：重做分支被截断
    fireEvent.change(screen.getByTestId("layer-thickness-right-0"), {
      target: { value: "77" },
    });
    expect(screen.getByTestId("redo")).toBeDisabled();
    expect(screen.getByTestId("undo")).toBeEnabled();

    // 撤销新编辑后回到的是回退点（示例），被截断的旧分支不会复活
    fireEvent.click(screen.getByTestId("undo"));
    expect(screen.getByTestId("layer-thickness-right-0")).toHaveValue("100");
    expect(screen.getByTestId("layer-thickness-left-0")).toHaveValue("20");
    expect(screen.getByTestId("redo")).toBeEnabled();
  });

  it("撤销与重做使既有结果失效，重新计算仍得到原有证据（指纹一致）", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());
    const fingerprint = screen.getByTestId("fingerprint").textContent;

    fireEvent.change(screen.getByTestId("layer-thickness-left-0"), {
      target: { value: "55" },
    });
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();

    // 撤销回示例输入：证据仍需重新提交才出现
    fireEvent.click(screen.getByTestId("undo"));
    expect(screen.getByTestId("layer-thickness-left-0")).toHaveValue("20");
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());
    expect(screen.getByTestId("fingerprint")).toHaveTextContent(fingerprint!);
  });

  it("回退期间迟到的响应不再显示，重做后重新计算仍得到原有证据", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());
    const fingerprint = screen.getByTestId("fingerprint").textContent;

    // 第二次提交挂起；在途期间撤销到初始数据
    let resolveRequest: (value: typeof EXAMPLE_RESPONSE) => void = () => {};
    mockedCorrelate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    fireEvent.click(screen.getByTestId("undo"));
    expect(screen.getByTestId("editor-left")).toHaveTextContent("3 层");
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();

    // 迟到响应对应已被撤销的输入，不得显示
    resolveRequest(EXAMPLE_RESPONSE);
    await waitFor(() => expect(screen.getByRole("button", { name: "开始对应" })).toBeEnabled());
    expect(screen.queryByTestId("totals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("diagram")).not.toBeInTheDocument();

    // 重做回示例输入后重新计算，证据指纹与原来一致
    fireEvent.click(screen.getByTestId("redo"));
    expect(screen.getByTestId("editor-left")).toHaveTextContent("7 层");
    fireEvent.click(screen.getByRole("button", { name: "开始对应" }));
    await waitFor(() => expect(screen.getByTestId("diagram")).toBeInTheDocument());
    expect(screen.getByTestId("fingerprint")).toHaveTextContent(fingerprint!);
  });

  it("撤销后焦点恢复到原操作控件的邻近位置", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "载入示例" }));
    fireEvent.click(screen.getByTestId("add-left"));
    const added = screen.getByTestId("layer-thickness-left-7");
    fireEvent.change(added, { target: { value: "15" } });

    fireEvent.click(screen.getByTestId("undo"));
    expect(document.activeElement).toBe(screen.getByTestId("layer-thickness-left-7"));

    // 再撤销“添加层”：该输入框已不存在，焦点落到邻近的存活行
    fireEvent.click(screen.getByTestId("undo"));
    expect(document.activeElement).toBe(screen.getByTestId("layer-thickness-left-6"));
  });
});
