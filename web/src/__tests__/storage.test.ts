import { beforeEach, describe, expect, it } from "vitest";

import { commit, initialHistory, undo, type Drafts } from "../history";
import { DualSlotHistoryStore } from "../storage";

const KEY_A = "strata-correlation:cp:a";
const KEY_B = "strata-correlation:cp:b";

const initial: Drafts = {
  left: [
    { code: "A", thickness: "10" },
    { code: "B", thickness: "20" },
  ],
  right: [{ code: "C", thickness: "30" }],
};

function editedHistory() {
  let history = initialHistory(initial);
  history = commit(
    history,
    {
      left: [
        { code: "A", thickness: "11" },
        { code: "B", thickness: "20" },
      ],
      right: initial.right,
    },
    { focus: { side: "left", field: "thickness", index: 0 }, typing: { side: "left", index: 0 } },
  );
  history = commit(
    history,
    {
      left: [
        { code: "A", thickness: "11" },
        { code: "B", thickness: "20" },
        { code: "D", thickness: "40" },
      ],
      right: initial.right,
    },
    { focus: { side: "left", field: "thickness", index: 2 } },
  );
  return history;
}

describe("DualSlotHistoryStore：双槽交替与递增代次", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("首次为空；保存时代次递增且两槽交替", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    expect(store.load().status).toBe("empty");

    const history = editedHistory();
    expect(store.save(history)).toEqual({ generation: 1, slot: "a" });
    expect(store.save(history)).toEqual({ generation: 2, slot: "b" });
    expect(store.save(history)).toEqual({ generation: 3, slot: "a" });
    expect(window.localStorage.getItem(KEY_A)).not.toBeNull();
    expect(window.localStorage.getItem(KEY_B)).not.toBeNull();
  });

  it("恢复最近代次的完整历史，含两列草稿、焦点、合并键与重做栈", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    let history = editedHistory();
    store.save(history); // gen1 a
    store.save(history); // gen2 b
    history = undo(history).history;
    store.save(history); // gen3 a（已撤销一项，带重做栈）

    const reloaded = new DualSlotHistoryStore(window.localStorage);
    const loaded = reloaded.load();
    expect(loaded.status).toBe("restored");
    expect(loaded.generation).toBe(3);
    expect(loaded.history).toEqual(history);
    // 焦点与连续键入合并键完整保留
    expect(loaded.history?.past[0].focus).toEqual({
      side: "left",
      field: "thickness",
      index: 0,
    });
    expect(loaded.history?.past[0].mergeKey).toBe("thickness:left:0");
    expect(loaded.history?.future).toHaveLength(1);
  });
});

describe("DualSlotHistoryStore：尾项损坏时回到最近完整代次", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("最新槽写入中断（JSON 截断）时从对侧槽恢复上一完整代次", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    const history = editedHistory();
    store.save(history); // gen1 a
    store.save(history); // gen2 b
    store.save(history); // gen3 a（最新）

    // 模拟第 3 代写入中断：最新槽尾项被截断
    const raw = window.localStorage.getItem(KEY_A)!;
    window.localStorage.setItem(KEY_A, raw.slice(0, Math.floor(raw.length / 2)));

    const loaded = new DualSlotHistoryStore(window.localStorage).load();
    expect(loaded.status).toBe("recovered");
    expect(loaded.generation).toBe(2);
    expect(loaded.history?.present).toEqual(history.present);
    expect(loaded.slots.find((slot) => slot.slot === "a")?.reason).toBe("invalid-json");
    expect(loaded.slots.find((slot) => slot.slot === "b")?.reason).toBe("ok");
  });

  it("最新槽校验值不符时不使用其内容，回退到上一完整代次", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    const history = editedHistory();
    store.save(history);
    store.save(history);

    // 篡改最新槽（b）的草稿但保留旧校验值
    const envelope = JSON.parse(window.localStorage.getItem(KEY_B)!) as {
      g: number;
      sum: string;
      present: Drafts;
    };
    envelope.present.left[0].thickness = "99";
    window.localStorage.setItem(KEY_B, JSON.stringify(envelope));

    const loaded = new DualSlotHistoryStore(window.localStorage).load();
    expect(loaded.status).toBe("recovered");
    expect(loaded.generation).toBe(1);
    expect(loaded.slots.find((slot) => slot.slot === "b")?.reason).toBe("checksum-mismatch");

    // 恢复后继续保存：覆盖损坏槽，对侧完整副本保留
    const outcome = store.save(history);
    expect(outcome?.slot).toBe("b");
    expect(new DualSlotHistoryStore(window.localStorage).load().status).toBe("restored");
  });

  it("版本不识别的槽位被忽略", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    const history = editedHistory();
    store.save(history); // gen1 a
    const envelope = JSON.parse(window.localStorage.getItem(KEY_A)!);
    envelope.v = 999;
    window.localStorage.setItem(KEY_B, JSON.stringify(envelope));

    const loaded = new DualSlotHistoryStore(window.localStorage).load();
    expect(loaded.status).toBe("recovered");
    expect(loaded.generation).toBe(1);
    expect(loaded.slots.find((slot) => slot.slot === "b")?.reason).toBe("version-unknown");
  });

  it("两个槽都不可用时禁用恢复并保留当前数据", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    store.save(editedHistory());
    window.localStorage.setItem(KEY_A, "{ 不是完整 JSON");
    window.localStorage.setItem(KEY_B, "{%bad%");

    const loaded = new DualSlotHistoryStore(window.localStorage).load();
    expect(loaded.status).toBe("corrupt");
    expect(loaded.history).toBeNull();
    expect(loaded.slots.map((slot) => slot.reason).sort()).toEqual([
      "invalid-json",
      "invalid-json",
    ]);
  });
});

describe("DualSlotHistoryStore：存储权限关闭时降级", () => {
  it("storage 为 null 时不可用、保存为空操作、加载为 empty，内存历史不受影响", () => {
    const store = new DualSlotHistoryStore(null);
    expect(store.isAvailable()).toBe(false);
    expect(store.save(editedHistory())).toBeNull();
    const loaded = store.load();
    expect(loaded.status).toBe("empty");
    expect(loaded.history).toBeNull();
  });
});
