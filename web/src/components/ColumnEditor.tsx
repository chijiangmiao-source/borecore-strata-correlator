import { addLayer, MAX_LAYERS, MIN_LAYERS, removeLayer, setCode, setThickness } from "../columns";
import type { LayerDraft } from "../types";

const CODES = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

interface ColumnEditorProps {
  title: string;
  side: "left" | "right";
  layers: LayerDraft[];
  onChange: (layers: LayerDraft[]) => void;
}

export function ColumnEditor({ title, side, layers, onChange }: ColumnEditorProps) {
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
                  onChange={(event) => onChange(setCode(layers, index, event.target.value))}
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
                  onChange={(event) => onChange(setThickness(layers, index, event.target.value))}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="link"
                  aria-label={`删除${title}第${index + 1}层`}
                  data-testid={`remove-${side}-${index}`}
                  disabled={layers.length <= MIN_LAYERS}
                  onClick={() => onChange(removeLayer(layers, index))}
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
        onClick={() => onChange(addLayer(layers))}
      >
        添加层
      </button>
    </section>
  );
}
