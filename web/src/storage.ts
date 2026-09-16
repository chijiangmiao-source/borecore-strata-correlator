/**
 * 编辑历史的浏览器内置存储适配：双槽检查点。
 *
 * 每次保存交替写入两个槽位并附带递增代次与 FNV-1a 校验值：
 * 即使某次写入中断（尾项 JSON 不完整）、校验值不符或版本不识别，
 * 另一个槽仍保留上一完整代次，恢复时选取“最近的完整代次”。
 * 两个槽都不可用时由调用方保留初始数据并禁用本次恢复。
 *
 * 存储被浏览器禁止（隐私模式、权限关闭）时所有操作降级为不可用，
 * 编辑历史仍可在当前会话内存中往返。
 */

import { fingerprint } from "./fingerprint";
import {
  MAX_HISTORY,
  cloneDrafts,
  type Drafts,
  type FocusTarget,
  type HistoryEntry,
  type HistoryState,
} from "./history";
import type { LayerDraft } from "./types";

const FORMAT_VERSION = 1;
/** 代次安全上限：超过后停留在该值（实际编辑量不可能触及，主要防御损坏槽伪造超大整数）。 */
const MAX_GENERATION = Number.MAX_SAFE_INTEGER;
const KEY_PREFIX = "strata-correlation:cp:";
const SLOTS = ["a", "b"] as const;
type Slot = (typeof SLOTS)[number];

/** 机器可读的槽位检查结论，便于界面说明与自动化验收。 */
export type SlotReason =
  | "ok"
  | "empty"
  | "invalid-json"
  | "checksum-mismatch"
  | "version-unknown"
  | "shape-invalid"
  | "unavailable";

export type LoadStatus = "empty" | "restored" | "recovered" | "corrupt";

export interface SlotInspection {
  slot: Slot;
  ok: boolean;
  reason: SlotReason;
  /** 能解析出的代次（即使校验失败也尽量读取，用于维持代次递增）。 */
  generation: number | null;
  /** 写入时间戳；同代次并列时取更新者。 */
  timestamp: number | null;
  history?: HistoryState;
}

export interface LoadResult {
  status: LoadStatus;
  /** restored / recovered 时为反序列化后的历史；否则为 null。 */
  history: HistoryState | null;
  generation: number | null;
  /** 每个槽的检查结论（界面说明原因用）。 */
  slots: SlotInspection[];
}

export interface SaveOutcome {
  generation: number;
  slot: Slot;
}

interface RawEnvelope {
  v: unknown;
  g: unknown;
  t: unknown;
  baseline: unknown;
  past: unknown;
  present: unknown;
  future: unknown;
  sum: unknown;
}

function isLayerDraft(value: unknown): value is LayerDraft {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    /^[A-Z]$/.test(record.code) &&
    typeof record.thickness === "string" &&
    /^\d{0,3}$/.test(record.thickness)
  );
}

function isDrafts(value: unknown): value is Drafts {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.left) &&
    Array.isArray(record.right) &&
    record.left.length >= 1 &&
    record.right.length >= 1 &&
    record.left.length <= 80 &&
    record.right.length <= 80 &&
    record.left.every(isLayerDraft) &&
    record.right.every(isLayerDraft)
  );
}

function isFocus(value: unknown): value is FocusTarget {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.side === "left" || record.side === "right") &&
    (record.field === "code" || record.field === "thickness") &&
    typeof record.index === "number" &&
    Number.isInteger(record.index) &&
    record.index >= 0
  );
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!isDrafts(record.state)) return false;
  if (record.focus !== null && !isFocus(record.focus)) return false;
  if (record.mergeKey !== undefined && typeof record.mergeKey !== "string") return false;
  return true;
}

function isEntryList(value: unknown): value is HistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_HISTORY &&
    value.every(isEntry)
  );
}

function checksumFor(parts: {
  v: number;
  g: number;
  t: number;
  baseline: Drafts;
  past: HistoryEntry[];
  present: Drafts;
  future: HistoryEntry[];
}): string {
  // 键顺序固定：写入与复算必须逐字符一致。
  return fingerprint(
    JSON.stringify({
      v: parts.v,
      g: parts.g,
      t: parts.t,
      baseline: parts.baseline,
      past: parts.past,
      present: parts.present,
      future: parts.future,
    }),
  );
}

function toHistory(envelope: {
  baseline: Drafts;
  past: HistoryEntry[];
  present: Drafts;
  future: HistoryEntry[];
}): HistoryState {
  const cloneEntry = (entry: HistoryEntry): HistoryEntry => ({
    state: cloneDrafts(entry.state),
    focus: entry.focus,
    ...(entry.mergeKey === undefined ? {} : { mergeKey: entry.mergeKey }),
  });
  return {
    baseline: cloneDrafts(envelope.baseline),
    past: envelope.past.map(cloneEntry),
    present: cloneDrafts(envelope.present),
    future: envelope.future.map(cloneEntry),
  };
}

/**
 * 双槽检查点存储。storage 传 null 表示环境不提供（或禁止）内置存储：
 * 此时 isAvailable() 为 false，save() 返回 null，调用方按“仅当前会话”降级。
 */
export class DualSlotHistoryStore {
  private available: boolean;

  constructor(private readonly storage: Storage | null) {
    this.available = storage !== null;
  }

  /** 探测浏览器内置存储：隐私模式或权限关闭时读写会抛异常，统一降级。 */
  static create(): DualSlotHistoryStore {
    try {
      const storage = window.localStorage;
      const probe = `${KEY_PREFIX}probe`;
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return new DualSlotHistoryStore(storage);
    } catch {
      return new DualSlotHistoryStore(null);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  private key(slot: Slot): string {
    return `${KEY_PREFIX}${slot}`;
  }

  private inspectSlot(slot: Slot): SlotInspection {
    const empty: SlotInspection = {
      slot,
      ok: false,
      reason: "empty",
      generation: null,
      timestamp: null,
    };
    if (!this.storage) return { ...empty, reason: "unavailable" };
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key(slot));
    } catch {
      this.available = false;
      return { ...empty, reason: "unavailable" };
    }
    if (raw === null || raw === "") return empty;

    let parsed: RawEnvelope;
    try {
      parsed = JSON.parse(raw) as RawEnvelope;
    } catch {
      // 尾项写入中断最常见：JSON 被截断，无法解析。
      return { ...empty, reason: "invalid-json" };
    }
    const generation =
      typeof parsed.g === "number" && Number.isInteger(parsed.g) && parsed.g >= 1
        ? parsed.g
        : null;
    const timestamp = typeof parsed.t === "number" && Number.isFinite(parsed.t) ? parsed.t : null;
    const damaged = (reason: SlotReason): SlotInspection => ({
      slot,
      ok: false,
      reason,
      generation,
      timestamp,
    });
    if (parsed.v !== FORMAT_VERSION) return damaged("version-unknown");
    if (
      generation === null ||
      timestamp === null ||
      typeof parsed.sum !== "string" ||
      !isDrafts(parsed.baseline) ||
      !isEntryList(parsed.past) ||
      !isEntryList(parsed.future) ||
      !isDrafts(parsed.present)
    ) {
      return damaged("shape-invalid");
    }
    const expected = checksumFor({
      v: FORMAT_VERSION,
      g: generation,
      t: timestamp,
      baseline: parsed.baseline as Drafts,
      past: parsed.past as HistoryEntry[],
      present: parsed.present as Drafts,
      future: parsed.future as HistoryEntry[],
    });
    if (parsed.sum !== expected) return damaged("checksum-mismatch");

    return {
      slot,
      ok: true,
      reason: "ok",
      generation,
      timestamp,
      history: toHistory({
        baseline: parsed.baseline as Drafts,
        past: parsed.past as HistoryEntry[],
        present: parsed.present as Drafts,
        future: parsed.future as HistoryEntry[],
      }),
    };
  }

  load(): LoadResult {
    if (!this.storage) {
      return { status: "empty", history: null, generation: null, slots: [] };
    }
    const slots = SLOTS.map((slot) => this.inspectSlot(slot));
    const valid = slots
      .filter((inspection): inspection is SlotInspection & { history: HistoryState } => inspection.ok)
      // 先按代次、再按写入时间戳选取最新完整检查点（封顶后同代次的兜底决胜）。
      .sort((a, b) => {
        if ((b.generation ?? 0) !== (a.generation ?? 0)) {
          return (b.generation ?? 0) - (a.generation ?? 0);
        }
        return (b.timestamp ?? 0) - (a.timestamp ?? 0);
      });

    if (valid.length === 0) {
      const anyWritten = slots.some(
        (inspection) => !inspection.ok && inspection.reason !== "empty" && inspection.reason !== "unavailable",
      );
      return {
        status: anyWritten ? "corrupt" : "empty",
        history: null,
        generation: null,
        slots,
      };
    }

    const newest = valid[0];
    const hasDamagedTail = slots.some(
      (inspection) => !inspection.ok && inspection.reason !== "empty" && inspection.reason !== "unavailable",
    );
    return {
      status: hasDamagedTail ? "recovered" : "restored",
      history: newest.history,
      generation: newest.generation,
      slots,
    };
  }

  /**
   * 写入下一代检查点，返回代次与落入的槽位。
   * 始终写在“最新完整代次所在槽”的对侧：正常情况下两槽自然交替；
   * 若最新槽损坏，则覆盖损坏槽而保留完好的回退副本。
   *
   * 代次只从完好槽递增：损坏槽里读出的 g 可能是超过安全整数范围的大整数，
   * 若计入编号会让 g+1 因浮点精度原地不动，造成两槽同代次、刷新时误取旧槽
   * 而丢掉最新修改。代次封顶在 MAX_SAFE_INTEGER；同代次时以时间戳更新者为准。
   */
  save(history: HistoryState): SaveOutcome | null {
    if (!this.storage) return null;
    try {
      const inspections = SLOTS.map((slot) => this.inspectSlot(slot));
      const valid = inspections
        .filter((inspection) => inspection.ok)
        .sort((a, b) => {
          if ((b.generation ?? 0) !== (a.generation ?? 0)) {
            return (b.generation ?? 0) - (a.generation ?? 0);
          }
          return (b.timestamp ?? 0) - (a.timestamp ?? 0);
        });
      const newestValid = valid[0];
      const target: Slot = newestValid ? (newestValid.slot === "a" ? "b" : "a") : "a";
      // 编号来源仅限完好槽；两者皆坏时从 1 重新开始（内容以时间戳与校验值为准）。
      const validMax = newestValid?.generation ?? 0;
      const generation = validMax >= MAX_GENERATION ? MAX_GENERATION : validMax + 1;
      const parts = {
        v: FORMAT_VERSION,
        g: generation,
        t: Date.now(),
        baseline: history.baseline,
        past: history.past,
        present: history.present,
        future: history.future,
      };
      const envelope = { ...parts, sum: checksumFor(parts) };
      this.storage.setItem(this.key(target), JSON.stringify(envelope));
      return { generation, slot: target };
    } catch {
      // 写入被拒绝或配额不足：降级为仅会话，内存中的撤销/重做不受影响。
      this.available = false;
      return null;
    }
  }
}

/** 单例在首次使用时探测，测试可通过 resetHistoryStore() 重新探测。 */
let instance: DualSlotHistoryStore | null = null;

export const historyStore = {
  get(): DualSlotHistoryStore {
    if (!instance) instance = DualSlotHistoryStore.create();
    return instance;
  },
};

export function resetHistoryStore(): void {
  instance = null;
}
