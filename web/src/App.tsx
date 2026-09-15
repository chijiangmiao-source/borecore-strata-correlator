import { useState } from "react";

import { ApiValidationError, correlate } from "./api";
import { ColumnEditor } from "./components/ColumnEditor";
import { Diagram } from "./components/Diagram";
import { StepList } from "./components/StepList";
import { EXAMPLE_LEFT, EXAMPLE_RIGHT, INITIAL_LEFT, INITIAL_RIGHT } from "./example";
import { resultFingerprint } from "./fingerprint";
import type { ApiErrorItem, CorrelateResponse, LayerDraft } from "./types";
import { toPayload, validateColumns } from "./validation";

export default function App() {
  const [left, setLeft] = useState<LayerDraft[]>(INITIAL_LEFT);
  const [right, setRight] = useState<LayerDraft[]>(INITIAL_RIGHT);
  const [errors, setErrors] = useState<ApiErrorItem[]>([]);
  const [result, setResult] = useState<CorrelateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  function loadExample() {
    setLeft(EXAMPLE_LEFT);
    setRight(EXAMPLE_RIGHT);
    setErrors([]);
    setResult(null);
    setSelected(null);
  }

  async function submit() {
    const clientErrors = validateColumns(left, right);
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      setResult(null);
      return;
    }
    setLoading(true);
    setErrors([]);
    try {
      const response = await correlate(toPayload(left), toPayload(right));
      setResult(response);
      setSelected(null);
    } catch (error) {
      setResult(null);
      if (error instanceof ApiValidationError) {
        setErrors(error.errors);
      } else {
        setErrors([{ loc: "network", message: error instanceof Error ? error.message : String(error) }]);
      }
    } finally {
      setLoading(false);
    }
  }

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
        <ColumnEditor title="左孔" side="left" layers={left} onChange={setLeft} />
        <ColumnEditor title="右孔" side="right" layers={right} onChange={setRight} />
      </div>

      <div className="actions">
        <button type="button" onClick={loadExample}>
          载入示例
        </button>
        <button type="button" className="primary" disabled={loading} onClick={submit}>
          {loading ? "计算中…" : "开始对应"}
        </button>
      </div>

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
            <span>
              结果指纹 <code data-testid="fingerprint">{resultFingerprint(result)}</code>
            </span>
          </div>
          <div className="result-grid">
            <Diagram steps={result.steps} selected={selected} onSelect={setSelected} />
            <StepList steps={result.steps} selected={selected} onSelect={setSelected} />
          </div>
        </section>
      )}
    </div>
  );
}
