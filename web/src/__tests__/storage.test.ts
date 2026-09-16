import { beforeEach, describe, expect, it } from "vitest";

import { commit, initialHistory, undo, type Drafts } from "../history";
import { fingerprint } from "../fingerprint";
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

  it("损坏槽代次为超大整数时，新代次只按完好槽递增，连续保存不丢最新修改", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    const first = editedHistory();
    store.save(first); // gen1 a
    store.save(first); // gen2 b

    // 损坏 a：g 伪造成 1e16（整数但超过安全上限，1e16+1 === 1e16），结构不合法
    const forged = JSON.parse(window.localStorage.getItem(KEY_A)!) as Record<string, unknown>;
    forged.g = 1e16;
    forged.present = null;
    window.localStorage.setItem(KEY_A, JSON.stringify(forged));

    // 第 3 次保存：旧实现会以 1e308 为编号导致代次原地不动；修复后应为 3，落入损坏槽 a
    const second: Drafts = {
      left: [
        ...first.present.left,
        { code: "E", thickness: "55" },
      ],
      right: first.present.right,
    };
    let history = commit(first, second, { focus: { side: "left", field: "thickness", index: 3 } });
    expect(store.save(history)).toEqual({ generation: 3, slot: "a" });

    // 第 4 次保存：代次继续严格递增到 4，落入对侧槽 b
    const third: Drafts = {
      left: [...second.left, { code: "F", thickness: "66" }],
      right: second.right,
    };
    history = commit(history, third, { focus: { side: "left", field: "thickness", index: 4 } });
    expect(store.save(history)).toEqual({ generation: 4, slot: "b" });

    // 刷新恢复必须拿到最新一次修改（旧实现会因同代次并列而恢复旧草稿）
    const loaded = new DualSlotHistoryStore(window.localStorage).load();
    expect(loaded.status).toBe("restored"); // 损坏槽已被 gen3/gen4 覆盖
    expect(loaded.generation).toBe(4);
    expect(loaded.history?.present.left).toHaveLength(5);
    expect(loaded.history?.present.left[4]).toEqual({ code: "F", thickness: "66" });
  });

  it("代次封顶 MAX_SAFE_INTEGER 后不再溢出，同代次以时间戳更新者为准", () => {
    // 直接构造两个同代次但时间戳不同的完好槽，验证 load 的兜底决胜
    const history = editedHistory();
    const store = new DualSlotHistoryStore(window.localStorage);
    const writeEnvelope = (slot: "a" | "b", generation: number, timestamp: number) => {
      const parts = {
        v: 1,
        g: generation,
        t: timestamp,
        baseline: history.baseline,
        past: history.past,
        present: history.present,
        future: history.future,
      };
      // 校验算法与 storage.checksumFor 相同：固定键序的 FNV-1a
      const sum = fingerprint(JSON.stringify(parts));
      window.localStorage.setItem(
        slot === "a" ? KEY_A : KEY_B,
        JSON.stringify({ ...parts, sum }),
      );
    };
    const capped = Number.MAX_SAFE_INTEGER;
    writeEnvelope("a", capped, 1000);
    writeEnvelope("b", capped, 2000);

    const loaded = store.load();
    expect(loaded.generation).toBe(capped);
    expect(loaded.slots.find((slot) => slot.slot === "b")?.timestamp).toBe(2000);
    expect(loaded.history).toEqual(history);
  });

  it("损坏槽代次为非法或负数时同样不参与编号", () => {
    const store = new DualSlotHistoryStore(window.localStorage);
    store.save(editedHistory()); // gen1 a

    // b 中放置可解析但代次非法的信封
    window.localStorage.setItem(
      KEY_B,
      JSON.stringify({ v: 1, g: -5, t: 1, baseline: null, past: [], present: null, future: [], sum: "x" }),
    );
    // 下一次保存必须以完好槽 a(gen1) 为准递增到 gen2
    expect(store.save(editedHistory())).toEqual({ generation: 2, slot: "b" });
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
