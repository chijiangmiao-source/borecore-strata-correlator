/**
 * 跨两孔的统一编辑历史（纯函数模型）。
 *
 * - 每次提交记录的是两列完整草稿快照，因此撤销/重做总能同时恢复左右两孔；
 * - 同一输入控件（某列某层厚度框）的连续键入携带相同 mergeKey，合并为一项；
 *   撤销一旦发生（future 非空，即停在回退分支点），随后的键入必须另起新项，
 *   否则会跨过分支点合并、使下一次撤销跳回更早的状态；
 * - 岩性下拉切换、增删层、载入示例等离散操作不携带 mergeKey，各自成项；
 * - 任何新提交都会清空 future（截断重做分支）。
 */

import type { LayerDraft } from "./types";

export type Side = "left" | "right";

export interface Drafts {
  left: LayerDraft[];
  right: LayerDraft[];
}

/** 焦点定位：回退后尽量把焦点放回触发该操作的控件附近。 */
export interface FocusTarget {
  side: Side;
  field: "code" | "thickness";
  index: number;
}

export interface HistoryEntry {
  /** 该操作完成后的两列完整草稿。 */
  state: Drafts;
  /** 触发该操作时的控件；结构操作取邻近层位。 */
  focus: FocusTarget | null;
  /** 连续键入合并键；缺省表示离散操作，不可与相邻项合并。 */
  mergeKey?: string;
}

export interface HistoryState {
  /** past 为空时撤销到达的状态；老记录被上限淘汰时随之推进，保证撤销不跳变。 */
  baseline: Drafts;
  past: HistoryEntry[];
  present: Drafts;
  future: HistoryEntry[];
}

export interface CommitMeta {
  focus: FocusTarget | null;
  /** 存在时表示一次可合并的连续键入（厚度输入框）。 */
  typing?: { side: Side; index: number };
}

/** 历史项上限：两列各至多 80 层，200 个快照的体量对 localStorage 仍然很小。 */
export const MAX_HISTORY = 200;

export function initialHistory(initial: Drafts): HistoryState {
  return {
    baseline: cloneDrafts(initial),
    past: [],
    present: cloneDrafts(initial),
    future: [],
  };
}

export function cloneDrafts(drafts: Drafts): Drafts {
  return {
    left: drafts.left.map((layer) => ({ ...layer })),
    right: drafts.right.map((layer) => ({ ...layer })),
  };
}

/** 结构相等：层数、每层岩性与厚度字符串逐项相同（不依赖引用）。 */
export function draftsEqual(a: Drafts, b: Drafts): boolean {
  if (a.left.length !== b.left.length || a.right.length !== b.right.length) return false;
  const same = (x: LayerDraft, y: LayerDraft) => x.code === y.code && x.thickness === y.thickness;
  return a.left.every((layer, i) => same(layer, b.left[i]))
    && a.right.every((layer, i) => same(layer, b.right[i]));
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

/** 记录一次编辑；同一控件的连续键入并入栈顶项。 */
export function commit(
  history: HistoryState,
  next: Drafts,
  meta: CommitMeta,
): HistoryState {
  const mergeKey = meta.typing
    ? typingMergeKey(meta.typing.side, meta.typing.index)
    : undefined;
  const last = history.past[history.past.length - 1];
  let past: HistoryEntry[];
  let baseline = history.baseline;
  // 仅当当前处于历史“末端”（future 为空）时才允许并入栈顶；
  // 停在回退分支点时即便 mergeKey 相同也必须另起一项，避免下一次撤销跳过分支点。
  if (mergeKey && history.future.length === 0 && last && last.mergeKey === mergeKey) {
    // 连续键入：更新该项快照为最新草稿，焦点仍是同一控件，历史项不增加。
    const merged = { ...last, state: cloneDrafts(next) };
    past = [...history.past.slice(0, -1), merged];
  } else {
    past = [...history.past, { state: cloneDrafts(next), focus: meta.focus, mergeKey }];
    if (past.length > MAX_HISTORY) {
      // 淘汰最老项：基线推进到被淘汰的最后一项，撤销到尽头时落到那里而不跳变。
      const excess = past.length - MAX_HISTORY;
      const evicted = past.slice(0, excess);
      baseline = cloneDrafts(evicted[evicted.length - 1].state);
      past = past.slice(excess);
    }
  }
  return { baseline, past, present: cloneDrafts(next), future: [] };
}

export interface StepResult {
  history: HistoryState;
  /** 回退/重做后应当恢复焦点的控件；无可用项时为 null。 */
  focus: FocusTarget | null;
}

/** 撤销一项；已到最早状态时原样返回（同一引用，便于调用方判空）。 */
export function undo(history: HistoryState): StepResult {
  if (history.past.length === 0) return { history, focus: null };
  const entry = history.past[history.past.length - 1];
  const rest = history.past.slice(0, -1);
  // 当前状态整体移入重做栈，连同操作焦点一起携带回去。
  const moved: HistoryEntry = {
    state: cloneDrafts(history.present),
    focus: entry.focus,
    mergeKey: entry.mergeKey,
  };
  const restored = rest.length > 0 ? rest[rest.length - 1].state : history.baseline;
  return {
    history: {
      baseline: history.baseline,
      past: rest,
      present: cloneDrafts(restored),
      future: [...history.future, moved],
    },
    focus: entry.focus,
  };
}

/** 重做一项；重做分支为空时原样返回。 */
export function redo(history: HistoryState): StepResult {
  if (history.future.length === 0) return { history, focus: null };
  const entry = history.future[history.future.length - 1];
  const rest = history.future.slice(0, -1);
  const moved: HistoryEntry = {
    state: cloneDrafts(entry.state),
    focus: entry.focus,
    mergeKey: entry.mergeKey,
  };
  return {
    history: {
      baseline: history.baseline,
      past: [...history.past, moved],
      present: cloneDrafts(entry.state),
      future: rest,
    },
    focus: entry.focus,
  };
}

export function typingMergeKey(side: Side, index: number): string {
  return `thickness:${side}:${index}`;
}
