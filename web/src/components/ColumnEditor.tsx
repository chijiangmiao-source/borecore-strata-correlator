import { useEffect, useRef } from "react";

import { addLayer, MAX_LAYERS, MIN_LAYERS, removeLayer, setCode, setThickness } from "../columns";
import type { CommitMeta, FocusTarget, Side } from "../history";
import type { LayerDraft } from "../types";

const CODES = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/** 一次焦点恢复请求：nonce 变化即重新聚焦，即使连续两次目标相同。 */
export interface FocusRequest {
  target: FocusTarget;
  nonce: number;
}

interface ColumnEditorProps {
  title: string;
  side: Side;
  layers: LayerDraft[];
  onChange: (layers: LayerDraft[], meta: CommitMeta) => void;
  focusRequest: FocusRequest | null;
}

export function ColumnEditor({ title, side, layers, onChange, focusRequest }: ColumnEditorProps) {
  // 每个 nonce 只消费一次：后续因其他编辑引发的重渲染不应重复抢焦点。
  const consumedNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || focusRequest.target.side !== side) return;
    if (consumedNonce.current === focusRequest.nonce) return;
    consumedNonce.current = focusRequest.nonce;
    const { field, index } = focusRequest.target;
    // 结构操作后索引可能越界（如撤销“添加层”）：聚焦邻近的最后一个存活行。
    const nearest = Math.min(index, layers.length - 1);
    if (nearest < 0) return;
    const element = document.querySelector<HTMLElement>(
      `[data-testid="layer-${field}-${side}-${nearest}"]`,
    );
    element?.focus();
    if (element instanceof HTMLInputElement) {
      // 厚度框：光标移到输入内容末尾，便于继续键入。
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [focusRequest, side, layers.length]);

  return (
    <section className="column-editor" data-testid={`editor-${side}`}>
      <h2>
        {title}
        <span className="layer-count">{layers.length} 层</span>
      </h2>
      <table>
        <thead>
          <tr>
            <th>层号</th>
            <th>岩性</th>
            <th>厚度（毫米）</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {layers.map((layer, index) => (
            <tr key={index}>
              <td className="layer-no">{index + 1}</td>
              <td>
                <select
                  aria-label={`${title}第${index + 1}层岩性`}
                  data-testid={`layer-code-${side}-${index}`}
                  value={layer.code}
                  onChange={(event) =>
                    // 岩性切换是离散选择，单独成为一个历史项。
                    onChange(setCode(layers, index, event.target.value), {
                      focus: { side, field: "code", index },
                    })
                  }
                >
                  {CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  aria-label={`${title}第${index + 1}层厚度`}
                  data-testid={`layer-thickness-${side}-${index}`}
                  inputMode="numeric"
                  value={layer.thickness}
                  onChange={(event) =>
                    // 同一厚度框的连续键入由历史层合并为一项。
                    onChange(setThickness(layers, index, event.target.value), {
                      focus: { side, field: "thickness", index },
                      typing: { side, index },
                    })
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="link"
                  aria-label={`删除${title}第${index + 1}层`}
                  data-testid={`remove-${side}-${index}`}
                  disabled={layers.length <= MIN_LAYERS}
                  onClick={() =>
                    // 结构操作各自成项；焦点即被删行，回退/重做后越界由聚焦逻辑取邻近层。
                    onChange(removeLayer(layers, index), {
                      focus: { side, field: "thickness", index },
                    })
                  }
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        data-testid={`add-${side}`}
        disabled={layers.length >= MAX_LAYERS}
        onClick={() =>
          // 结构操作各自成项；焦点落在新增行的厚度框。
          onChange(addLayer(layers), {
            focus: { side, field: "thickness", index: layers.length },
          })
        }
      >
        添加层
      </button>
    </section>
  );
}
