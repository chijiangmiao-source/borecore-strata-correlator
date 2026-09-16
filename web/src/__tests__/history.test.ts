import { describe, expect, it } from "vitest";

import {
  canRedo,
  canUndo,
  commit,
  draftsEqual,
  initialHistory,
  MAX_HISTORY,
  redo,
  undo,
  type Drafts,
} from "../history";

const initial: Drafts = {
  left: [
    { code: "A", thickness: "10" },
    { code: "B", thickness: "20" },
  ],
  right: [{ code: "C", thickness: "30" }],
};

function thickness(side: "left" | "right", index: number) {
  return {
    focus: { side, field: "thickness" as const, index },
    typing: { side, index },
  };
}

function state(left: Drafts["left"], right: Drafts["right"]): Drafts {
  return { left, right };
}

describe("draftsEqual", () => {
  it("按结构比较两列草稿，与引用无关", () => {
    const other = {
      left: initial.left.map((layer) => ({ ...layer })),
      right: initial.right.map((layer) => ({ ...layer })),
    };
    expect(draftsEqual(initial, other)).toBe(true);
    expect(
      draftsEqual(initial, { ...other, left: other.left.slice(0, -1) }),
    ).toBe(false);
    expect(
      draftsEqual(initial, {
        ...other,
        left: other.left.map((layer, i) => (i === 0 ? { ...layer, code: "Z" } : layer)),
      }),
    ).toBe(false);
    expect(
      draftsEqual(initial, {
        ...other,
        right: other.right.map((layer) => ({ ...layer, thickness: "31" })),
      }),
    ).toBe(false);
  });
});

describe("commit：离散操作各自成项", () => {
  it("岩性切换、增删层、载入示例等无 mergeKey 的提交各自成项", () => {
    let history = initialHistory(initial);
    history = commit(
      history,
      state([{ code: "Z", thickness: "10" }, { code: "B", thickness: "20" }], initial.right),
      { focus: { side: "left", field: "code", index: 0 } },
    );
    history = commit(
      history,
      state(
        history.present.left,
        [...history.present.right, { code: "A", thickness: "100" }],
      ),
      { focus: { side: "right", field: "thickness", index: 1 } },
    );
    expect(history.past).toHaveLength(2);
    expect(history.past.every((entry) => entry.mergeKey === undefined)).toBe(true);
  });

  it("同一厚度框的连续键入合并为一项，不同控件不合并", () => {
    let history = initialHistory(initial);
    history = commit(
      history,
      state([{ code: "A", thickness: "1" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    history = commit(
      history,
      state([{ code: "A", thickness: "12" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    history = commit(
      history,
      state([{ code: "A", thickness: "12" }, { code: "B", thickness: "2" }], initial.right),
      thickness("left", 1),
    );
    expect(history.past).toHaveLength(2);
    expect(history.past[0].state.left[0].thickness).toBe("12");
    expect(history.future).toHaveLength(0);
  });

  it("同一控件被结构操作打断后再次键入不再合并", () => {
    let history = initialHistory(initial);
    history = commit(
      history,
      state([{ code: "A", thickness: "9" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    history = commit(
      history,
      state(history.present.left, [...initial.right, { code: "A", thickness: "100" }]),
      { focus: { side: "right", field: "thickness", index: 1 } },
    );
    history = commit(
      history,
      state([{ code: "A", thickness: "99" }, { code: "B", thickness: "20" }], history.present.right),
      thickness("left", 0),
    );
    expect(history.past).toHaveLength(3);
  });
});

describe("undo / redo：按实际发生顺序跨两列往返", () => {
  it("跨列增删与键入严格按发生顺序回退与重做", () => {
    let history = initialHistory(initial);

    // 1. 左孔追加一层
    history = commit(
      history,
      state([...initial.left, { code: "A", thickness: "100" }], initial.right),
      { focus: { side: "left", field: "thickness", index: 2 } },
    );
    // 2. 右孔厚度连续键入（合并为一项）
    history = commit(history, state(history.present.left, [{ code: "C", thickness: "3" }]), thickness("right", 0));
    history = commit(history, state(history.present.left, [{ code: "C", thickness: "35" }]), thickness("right", 0));
    // 3. 左孔再删一层
    history = commit(
      history,
      state(
        [
          { code: "A", thickness: "10" },
          { code: "B", thickness: "20" },
        ],
        history.present.right,
      ),
      { focus: { side: "left", field: "thickness", index: 1 } },
    );

    expect(history.present.left).toHaveLength(2);
    expect(history.present.right[0].thickness).toBe("35");

    // 撤销第 3 项：左孔恢复 3 层
    let step = undo(history);
    history = step.history;
    expect(history.present.left).toHaveLength(3);
    expect(history.present.right[0].thickness).toBe("35");
    expect(step.focus).toEqual({ side: "left", field: "thickness", index: 1 });

    // 撤销第 2 项（合并键入）：右孔厚度整体回到键入前
    step = undo(history);
    history = step.history;
    expect(history.present.right[0].thickness).toBe("30");

    // 撤销第 1 项：左孔恢复 2 层
    step = undo(history);
    history = step.history;
    expect(history.present.left).toHaveLength(2);
    expect(history.present).toEqual(initial);
    expect(canUndo(history)).toBe(false);

    // 重做按原顺序回放
    step = redo(history);
    history = step.history;
    expect(history.present.left).toHaveLength(3);
    step = redo(history);
    history = step.history;
    expect(history.present.right[0].thickness).toBe("35");
    step = redo(history);
    history = step.history;
    expect(history.present.left).toHaveLength(2);
    expect(canRedo(history)).toBe(false);
  });

  it("全部撤销后回到初始草稿，初始引用不被修改", () => {
    let history = initialHistory(initial);
    history = commit(
      history,
      state([{ code: "A", thickness: "99" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    const stepped = undo(history);
    expect(stepped.history.present).toEqual(initial);
    expect(initial.left[0].thickness).toBe("10");
  });

  it("到头时撤销/重做原样返回且焦点为 null", () => {
    const history = initialHistory(initial);
    expect(undo(history).history).toBe(history);
    expect(undo(history).focus).toBeNull();
    expect(redo(history).history).toBe(history);
    expect(redo(history).focus).toBeNull();
  });
});

describe("重做分支截断", () => {
  it("回退后任何新编辑都会清空重做分支", () => {
    let history = initialHistory(initial);
    history = commit(
      history,
      state([{ code: "A", thickness: "11" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    history = commit(
      history,
      state(history.present.left, [{ code: "C", thickness: "31" }]),
      thickness("right", 0),
    );
    history = undo(history).history;
    expect(canRedo(history)).toBe(true);

    // 在回退状态下改另一个控件：重做分支必须截断
    history = commit(
      history,
      state(
        [{ code: "A", thickness: "11" }, { code: "B", thickness: "22" }],
        initial.right,
      ),
      thickness("left", 1),
    );
    expect(history.future).toHaveLength(0);
    expect(canRedo(history)).toBe(false);
    // 被截断的是“右孔键入”那一项；左孔的第 1 项仍可撤销
    expect(canUndo(history)).toBe(true);
    const stepped = undo(history);
    expect(stepped.history.present.left[0].thickness).toBe("11");
    expect(canRedo(stepped.history)).toBe(true);
  });

  it("撤销结构操作后在同一厚度框继续键入，另起新项，撤销先停在分支点", () => {
    let history = initialHistory(initial);

    // 1. 右孔第 0 层厚度连续键入（合并为一项）：30 → 31
    history = commit(history, state(initial.left, [{ code: "C", thickness: "3" }]), thickness("right", 0));
    history = commit(history, state(initial.left, [{ code: "C", thickness: "31" }]), thickness("right", 0));
    // 2. 右孔追加一层（结构操作，独立成项）
    history = commit(
      history,
      state(initial.left, [
        { code: "C", thickness: "31" },
        { code: "A", thickness: "100" },
      ]),
      { focus: { side: "right", field: "thickness", index: 1 } },
    );

    // 撤销结构操作：分支点停在第 1 项之后（右孔 1 层、厚度 31），future 非空
    history = undo(history).history;
    expect(history.present.right).toEqual([{ code: "C", thickness: "31" }]);
    expect(canRedo(history)).toBe(true);

    // 在同一厚度框（right:0）继续键入 35：旧实现会跨过分支点并入第 1 项
    history = commit(history, state(initial.left, [{ code: "C", thickness: "35" }]), thickness("right", 0));
    expect(history.future).toHaveLength(0);
    expect(history.past).toHaveLength(2);

    // 第一次撤销必须停在分支点 31，而不是跳过它退回更早的 30
    history = undo(history).history;
    expect(history.present.right[0].thickness).toBe("31");
    expect(canUndo(history)).toBe(true);

    // 再撤销一次才回到键入前的 30
    history = undo(history).history;
    expect(history.present.right[0].thickness).toBe("30");
    expect(canUndo(history)).toBe(false);
  });

  it("撤销右孔厚度后再改左孔同位置厚度框，撤销不跳过分支点、不丢更早值", () => {
    let history = initialHistory(initial);

    // 1. 左孔第 0 层厚度键入：10 → 12（合并为一项 E1，mergeKey = thickness:left:0）
    history = commit(
      history,
      state([{ code: "A", thickness: "1" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    history = commit(
      history,
      state([{ code: "A", thickness: "12" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    // 2. 右孔第 0 层厚度键入：30 → 31（E2，mergeKey = thickness:right:0）
    history = commit(
      history,
      state(history.present.left, [{ code: "C", thickness: "31" }]),
      thickness("right", 0),
    );

    // 撤销右孔厚度：分支点为左 12 / 右 30，future 非空；此时 past 栈顶恰是左孔键入项 E1
    history = undo(history).history;
    expect(history.present.left[0].thickness).toBe("12");
    expect(history.present.right[0].thickness).toBe("30");
    expect(history.past[history.past.length - 1].mergeKey).toBe("thickness:left:0");
    expect(canRedo(history)).toBe(true);

    // 再改左孔同一厚度框（同 mergeKey）：旧实现会跨过分支点并入 E1，覆盖分支点快照
    history = commit(
      history,
      state([{ code: "A", thickness: "15" }, { code: "B", thickness: "20" }], initial.right),
      thickness("left", 0),
    );
    expect(history.future).toHaveLength(0);

    // 第一次撤销必须停在分支点（左 12 / 右 30），而不是跳过它退回左 10
    history = undo(history).history;
    expect(history.present.left[0].thickness).toBe("12");
    expect(history.present.right[0].thickness).toBe("30");
    expect(canUndo(history)).toBe(true);

    // 再撤销一次才回到左孔键入前（左 10 / 右 30）
    history = undo(history).history;
    expect(history.present.left[0].thickness).toBe("10");
    expect(history.present.right[0].thickness).toBe("30");
    expect(canUndo(history)).toBe(false);
  });

  it("超过历史上限后基线推进，撤销到尽头落到最早可达状态而非初始数据", () => {
    let history = initialHistory(initial);
    // 产生 MAX_HISTORY+2 个离散编辑（岩性在 A/B 间切换，避免连续键入合并）
    for (let i = 0; i < MAX_HISTORY + 2; i += 1) {
      const drafts = {
        left: history.present.left.map((layer, j) =>
          j === 0 ? { ...layer, code: i % 2 === 0 ? "Z" : "Y" } : layer,
        ),
        right: history.present.right,
      };
      history = commit(history, drafts, { focus: { side: "left", field: "code", index: 0 } });
    }
    expect(history.past).toHaveLength(MAX_HISTORY);
    expect(history.baseline.left[0].code).toBe("Y"); // 第 1 次编辑后的状态

    // 一路撤销到尽头
    while (canUndo(history)) {
      history = undo(history).history;
    }
    expect(canUndo(history)).toBe(false);
    expect(history.present).toEqual(history.baseline);
    expect(history.present.left[0].code).toBe("Y");
    expect(history.present).not.toEqual(initial);

    // 回退后的连续重做可回到最新
    while (canRedo(history)) {
      history = redo(history).history;
    }
    expect(history.present.left[0].code).toBe(
      MAX_HISTORY % 2 === 0 ? "Y" : "Z",
    );
  });
});
