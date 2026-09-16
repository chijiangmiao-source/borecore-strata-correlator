import { useEffect, useRef, useState } from "react";

import { ApiValidationError, correlate } from "./api";
import { ColumnEditor, type FocusRequest } from "./components/ColumnEditor";
import { Diagram } from "./components/Diagram";
import { StepList } from "./components/StepList";
import { EXAMPLE_LEFT, EXAMPLE_RIGHT, INITIAL_LEFT, INITIAL_RIGHT } from "./example";
import { resultFingerprint } from "./fingerprint";
import { formatMarginLong } from "./format";
import {
  canRedo,
  canUndo,
  commit,
  draftsEqual,
  initialHistory,
  redo,
  undo,
  type CommitMeta,
  type Drafts,
  type FocusTarget,
  type HistoryState,
  type Side,
} from "./history";
import { historyStore, type LoadResult, type SlotReason } from "./storage";
import type { ApiErrorItem, CorrelateResponse, LayerDraft } from "./types";
import { toPayload, validateColumns } from "./validation";

const INITIAL_DRAFTS: Drafts = {
  left: INITIAL_LEFT.map((layer) => ({ ...layer })),
  right: INITIAL_RIGHT.map((layer) => ({ ...layer })),
};

const SLOT_NAMES: Record<string, string> = { a: "A", b: "B" };

const DAMAGE_REASON: Record<SlotReason, string> = {
  ok: "完整",
  empty: "空",
  unavailable: "存储不可用",
  "invalid-json": "尾项写入中断（数据不完整）",
  "checksum-mismatch": "校验值不符",
  "version-unknown": "版本不识别",
  "shape-invalid": "结构无法识别",
};

/** 两槽都不可用时在操作区说明原因；恢复到最近完整代次时说明忽略了损坏尾项。 */
function describeRestore(loaded: LoadResult): string | null {
  if (loaded.status === "restored") return null;
  if (loaded.status === "recovered") {
    return `已从最近完整检查点恢复（第 ${loaded.generation} 代）；更新的损坏检查点已忽略。`;
  }
  if (loaded.status === "corrupt") {
    const details = loaded.slots
      .filter((slot) => slot.reason !== "empty")
      .map((slot) => `槽${SLOT_NAMES[slot.slot] ?? slot.slot}：${DAMAGE_REASON[slot.reason]}`)
      .join("；");
    return `未能恢复上次草稿：检查点不可用（${details}），已保留当前初始数据。`;
  }
  return null;
}

export default function App() {
  const store = historyStore.get();
  const [restore] = useState<LoadResult>(() => store.load());
  const [history, setHistory] = useState<HistoryState>(
    () => restore.history ?? initialHistory(INITIAL_DRAFTS),
  );
  const [storageAvailable, setStorageAvailable] = useState(store.isAvailable());
  const [errors, setErrors] = useState<ApiErrorItem[]>([]);
  const [result, setResult] = useState<CorrelateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // 比较态：是否正在查看最脆弱步的替代图
  const [showAlternative, setShowAlternative] = useState(false);
  // 撤销/重做后的焦点恢复请求（nonce 保证连续同目标也会重新聚焦）
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  // 请求序号：输入一旦变化即递增，使在途响应与既有证据一并失效
  const requestSeq = useRef(0);

  const left = history.present.left;
  const right = history.present.right;

  // 历史变化即写入下一代双槽检查点；存储被拒绝时降级为仅当前会话。
  useEffect(() => {
    const outcome = store.save(history);
    if (outcome === null && store.isAvailable() === false) {
      setStorageAvailable(false);
    }
  }, [history, store]);

  function invalidate() {
    requestSeq.current += 1;
    setResult(null);
    setErrors([]);
    setSelected(null);
    setShowAlternative(false);
  }

  function requestFocus(target: FocusTarget | null) {
    if (!target) return;
    setFocusRequest((previous) => ({ target, nonce: (previous?.nonce ?? 0) + 1 }));
  }

  function handleChange(side: Side, layers: LayerDraft[], meta: CommitMeta) {
    // 列纯函数在输入被规则拒绝或触及上下限时原样返回同一引用：不产生历史项、不失效。
    if (layers === (side === "left" ? left : right)) return;
    setHistory((previous) =>
      commit(previous, { ...previous.present, [side]: layers }, meta),
    );
    invalidate();
  }

  function loadExample() {
    const example: Drafts = {
      left: EXAMPLE_LEFT.map((layer) => ({ ...layer })),
      right: EXAMPLE_RIGHT.map((layer) => ({ ...layer })),
    };
    // 已在示例状态（如重复点击）时不产生空历史项，也不触发失效。
    if (draftsEqual(history.present, example)) return;
    setHistory((previous) => commit(previous, example, { focus: null }));
    invalidate();
  }

  function handleUndo() {
    // 事件处理器中闭包里的 history 即当前已提交状态，可直接据此推演下一步。
    if (!canUndo(history)) return;
    const stepped = undo(history);
    setHistory(stepped.history);
    requestFocus(stepped.focus);
    // 回退同样使在途响应、既有结果、错误与选中步骤失效
    invalidate();
  }

  function handleRedo() {
    if (!canRedo(history)) return;
    const stepped = redo(history);
    setHistory(stepped.history);
    requestFocus(stepped.focus);
    invalidate();
  }

  async function submit() {
    const clientErrors = validateColumns(left, right);
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      setResult(null);
      setShowAlternative(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setErrors([]);
    setShowAlternative(false);
    try {
      const response = await correlate(toPayload(left), toPayload(right));
      // 若在途期间输入被修改（含撤销/重做/恢复后的编辑），响应已对应旧输入，直接丢弃
      if (seq === requestSeq.current) {
        setResult(response);
        setSelected(null);
        setShowAlternative(false);
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setResult(null);
        setShowAlternative(false);
        if (error instanceof ApiValidationError) {
          setErrors(error.errors);
        } else {
          setErrors([
            { loc: "network", message: error instanceof Error ? error.message : String(error) },
          ]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const restoreNote = describeRestore(restore);

  return (
    <div className="app">
      <header>
        <h1>相邻勘探孔层序对应</h1>
        <p>
          每列 1–80 层 · 岩性代码 A–Z · 厚度 1–999 毫米 · 步骤 1:1 / 1:2 / 2:1 / 1:0 / 0:1 ·
          先最小化总代价，再依次最小化缺失步数、分组步数，最后取字典序最小路径
        </p>
      </header>

      <div className="editors">
        <ColumnEditor
          title="左孔"
          side="left"
          layers={left}
          onChange={(layers, meta) => handleChange("left", layers, meta)}
          focusRequest={focusRequest}
        />
        <ColumnEditor
          title="右孔"
          side="right"
          layers={right}
          onChange={(layers, meta) => handleChange("right", layers, meta)}
          focusRequest={focusRequest}
        />
      </div>

      <div className="actions">
        <button type="button" onClick={loadExample}>
          载入示例
        </button>
        <button
          type="button"
          data-testid="undo"
          disabled={!canUndo(history)}
          onClick={handleUndo}
          title="撤销上一项编辑（连续键入合并为一项）"
        >
          撤销
        </button>
        <button
          type="button"
          data-testid="redo"
          disabled={!canRedo(history)}
          onClick={handleRedo}
          title="重做"
        >
          重做
        </button>
        <button type="button" className="primary" disabled={loading} onClick={submit}>
          {loading ? "计算中…" : "开始对应"}
        </button>
      </div>

      {(restoreNote || !storageAvailable) && (
        <p className="history-note" data-testid="history-note" role="note">
          {restoreNote}
          {restoreNote && !storageAvailable && <br />}
          {!storageAvailable &&
            "浏览器已关闭本地存储权限，撤销/重做仅在当前会话内有效，刷新后不保留草稿。"}
        </p>
      )}

      {errors.length > 0 && (
        <ul className="errors" data-testid="errors">
          {errors.map((error, index) => (
            <li key={`${error.loc}-${index}`}>{error.message}</li>
          ))}
        </ul>
      )}

      {result && (
        <section className="result">
          <div className="totals" data-testid="totals">
            <span>总代价 {result.totals.cost}</span>
            <span>缺失步 {result.totals.missing_steps}</span>
            <span>分组步 {result.totals.group_steps}</span>
            <span>共 {result.totals.step_count} 步</span>
            {result.margins && (
              <span data-testid="fragile-summary">
                最脆弱步 第{result.margins.most_fragile}步 ·{" "}
                {formatMarginLong(
                  result.margins.steps[result.margins.most_fragile - 1],
                )}
              </span>
            )}
            <span>
              结果指纹 <code data-testid="fingerprint">{resultFingerprint(result)}</code>
            </span>
          </div>
          <div className="result-grid">
            <Diagram
              steps={result.steps}
              selected={selected}
              onSelect={setSelected}
              margins={result.margins?.steps}
              mostFragile={result.margins?.most_fragile}
              alternative={result.margins?.alternative}
              showAlternative={showAlternative}
              onToggleAlternative={() => setShowAlternative((value) => !value)}
            />
            <StepList steps={result.steps} selected={selected} onSelect={setSelected} />
          </div>
        </section>
      )}
    </div>
  );
}
