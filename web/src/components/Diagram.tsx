import { formatMargin } from "../format";
import type { Step, StepMargin, StepType, Totals } from "../types";

const WIDTH = 660;
const TOP = 28;
const TRACK = 460;
const LEFT_X = 24;
const LEFT_W = 112;
const RIGHT_X = 524;
const RIGHT_W = 112;
const GUTTER_X = (LEFT_X + LEFT_W + RIGHT_X) / 2;

const TYPE_COLORS: Record<StepType, string> = {
  "1:1": "#2e7d32",
  "1:2": "#1565c0",
  "2:1": "#6a1b9a",
  "1:0": "#616161",
  "0:1": "#8d6e63",
};

const TYPE_NAMES: Record<StepType, string> = {
  "1:1": "1:1 单层对单层",
  "1:2": "1:2 单层对两层",
  "2:1": "2:1 两层对单层",
  "1:0": "1:0 右孔缺失",
  "0:1": "0:1 左孔缺失",
};

interface DiagramProps {
  steps: Step[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** 逐步替代裕量（仅原图展示）；缺省时按旧行为只画连带图。 */
  margins?: StepMargin[];
  mostFragile?: number;
  alternative?: { steps: Step[]; totals: Totals };
  showAlternative: boolean;
  onToggleAlternative: () => void;
}

interface Segment {
  y0: number;
  y1: number;
}

/** 连带图：左、右两列层块与每一步的连接带，带颜色区分步骤类型，红边表示岩性罚分。
 *  原图模式下逐步标注替代裕量，并以红色标记突出最脆弱步；点击最脆弱标记
 *  切换到该步的完整替代图，再次点击工具条按钮返回原图。 */
export function Diagram({
  steps,
  selected,
  onSelect,
  margins,
  mostFragile,
  alternative,
  showAlternative,
  onToggleAlternative,
}: DiagramProps) {
  const marginByIndex = new Map((margins ?? []).map((margin) => [margin.index, margin]));
  const displaySteps = showAlternative && alternative ? alternative.steps : steps;

  const leftColumn = displaySteps.flatMap((step) => step.left);
  const rightColumn = displaySteps.flatMap((step) => step.right);
  const leftTotal = leftColumn.reduce((sum, layer) => sum + layer.thickness, 0);
  const rightTotal = rightColumn.reduce((sum, layer) => sum + layer.thickness, 0);
  const scale = TRACK / Math.max(leftTotal, rightTotal, 1);

  function offsets(column: typeof leftColumn): Map<number, Segment> {
    const map = new Map<number, Segment>();
    let acc = 0;
    for (const layer of column) {
      map.set(layer.layer, { y0: TOP + acc * scale, y1: TOP + (acc + layer.thickness) * scale });
      acc += layer.thickness;
    }
    return map;
  }

  const leftOffsets = offsets(leftColumn);
  const rightOffsets = offsets(rightColumn);
  const svgHeight = TOP * 2 + TRACK + 56;

  function segmentOf(layers: Step["left"], map: Map<number, Segment>): Segment | null {
    if (layers.length === 0) return null;
    const first = map.get(layers[0].layer);
    const last = map.get(layers[layers.length - 1].layer);
    if (!first || !last) return null;
    return { y0: first.y0, y1: last.y1 };
  }

  const hasAnalysis = margins !== undefined && mostFragile !== undefined && alternative;

  return (
    <figure className="diagram" data-testid="diagram">
      {hasAnalysis && (
        <figcaption className="diagram-toolbar">
          <span data-testid="diagram-mode">
            {showAlternative
              ? `替代图：第 ${mostFragile} 步的最近替代（总代价 ${alternative.totals.cost} · 缺失 ${alternative.totals.missing_steps} · 分组 ${alternative.totals.group_steps}）`
              : "原图"}
          </span>
          <button type="button" data-testid="toggle-alternative" onClick={onToggleAlternative}>
            {showAlternative ? "返回原图" : `查看第 ${mostFragile} 步替代图`}
          </button>
        </figcaption>
      )}
      <svg
        viewBox={`0 0 ${WIDTH} ${svgHeight}`}
        role="img"
        aria-label="层序对应连带图"
        width="100%"
      >
        <text x={LEFT_X + LEFT_W / 2} y={16} textAnchor="middle" className="column-title">
          左孔
        </text>
        <text x={RIGHT_X + RIGHT_W / 2} y={16} textAnchor="middle" className="column-title">
          右孔
        </text>

        {displaySteps.map((step) => {
          const leftSeg = segmentOf(step.left, leftOffsets);
          const rightSeg = segmentOf(step.right, rightOffsets);
          const color = TYPE_COLORS[step.type];
          const isSelected = selected === step.index;
          const penalized = (step.lithology_penalty ?? 0) > 0;
          const margin = showAlternative ? undefined : marginByIndex.get(step.index);
          const isFragile = !showAlternative && step.index === mostFragile;

          let badge: { x: number; y: number } | null = null;
          let band = null;
          if (leftSeg && rightSeg) {
            badge = {
              x: GUTTER_X,
              y: (leftSeg.y0 + leftSeg.y1 + rightSeg.y0 + rightSeg.y1) / 4,
            };
            band = (
              <polygon
                points={`${LEFT_X + LEFT_W},${leftSeg.y0} ${RIGHT_X},${rightSeg.y0} ${RIGHT_X},${rightSeg.y1} ${LEFT_X + LEFT_W},${leftSeg.y1}`}
                fill={color}
                fillOpacity={isSelected ? 0.55 : 0.28}
                stroke={penalized ? "#c62828" : color}
                strokeWidth={isSelected || penalized ? 2 : 1}
              />
            );
          } else {
            const seg = leftSeg ?? rightSeg;
            if (!seg) return null;
            const fromX = leftSeg ? LEFT_X + LEFT_W : RIGHT_X;
            const midY = (seg.y0 + seg.y1) / 2;
            badge = { x: GUTTER_X, y: midY };
            band = (
              <>
                <line
                  x1={fromX}
                  y1={midY}
                  x2={GUTTER_X}
                  y2={midY}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray="6 4"
                />
                <text
                  x={GUTTER_X + (leftSeg ? 16 : -16)}
                  y={midY + 4}
                  textAnchor={leftSeg ? "start" : "end"}
                  className="missing-label"
                >
                  ∅ 缺失
                </text>
              </>
            );
          }

          return (
            <g
              key={step.index}
              data-testid={`band-${step.index}`}
              className="band"
              onMouseEnter={() => onSelect(step.index)}
              onClick={() => onSelect(step.index)}
            >
              {band}
              <circle
                cx={badge.x}
                cy={badge.y}
                r={11}
                fill="#fff"
                stroke={isFragile ? "#c62828" : color}
                strokeWidth={isFragile ? 2.5 : 1.5}
              />
              <text x={badge.x} y={badge.y + 4} textAnchor="middle" className="badge">
                {step.index}
              </text>
              {margin && (
                <text
                  x={badge.x}
                  y={badge.y + 26}
                  textAnchor="middle"
                  className="margin-label"
                  data-testid={`margin-${step.index}`}
                >
                  {formatMargin(margin)}
                </text>
              )}
              {isFragile && (
                <g
                  data-testid="fragile-marker"
                  className="fragile-marker"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleAlternative();
                  }}
                >
                  <title>最脆弱步：点击查看替代图</title>
                  <rect
                    x={badge.x - 34}
                    y={badge.y - 40}
                    width={68}
                    height={30}
                    fill="transparent"
                  />
                  <polygon
                    points={`${badge.x},${badge.y - 26} ${badge.x - 7},${badge.y - 14} ${badge.x + 7},${badge.y - 14}`}
                    fill="#c62828"
                  />
                  <text x={badge.x} y={badge.y - 32} textAnchor="middle" className="fragile-label">
                    最脆弱
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {leftColumn.map((layer) => {
          const seg = leftOffsets.get(layer.layer);
          if (!seg) return null;
          return (
            <g key={`L${layer.layer}`}>
              <rect x={LEFT_X} y={seg.y0} width={LEFT_W} height={Math.max(seg.y1 - seg.y0, 1)} className="layer-box" />
              {seg.y1 - seg.y0 >= 14 && (
                <text x={LEFT_X + LEFT_W / 2} y={(seg.y0 + seg.y1) / 2 + 4} textAnchor="middle" className="layer-label">
                  {layer.layer}·{layer.code}·{layer.thickness}mm
                </text>
              )}
            </g>
          );
        })}
        {rightColumn.map((layer) => {
          const seg = rightOffsets.get(layer.layer);
          if (!seg) return null;
          return (
            <g key={`R${layer.layer}`}>
              <rect x={RIGHT_X} y={seg.y0} width={RIGHT_W} height={Math.max(seg.y1 - seg.y0, 1)} className="layer-box" />
              {seg.y1 - seg.y0 >= 14 && (
                <text x={RIGHT_X + RIGHT_W / 2} y={(seg.y0 + seg.y1) / 2 + 4} textAnchor="middle" className="layer-label">
                  {layer.layer}·{layer.code}·{layer.thickness}mm
                </text>
              )}
            </g>
          );
        })}

        {(Object.keys(TYPE_NAMES) as StepType[]).map((type, i) => (
          <g key={type} transform={`translate(${LEFT_X + i * 128}, ${svgHeight - 40})`}>
            <rect width={12} height={12} fill={TYPE_COLORS[type]} fillOpacity={0.5} stroke={TYPE_COLORS[type]} />
            <text x={18} y={11} className="legend-label">
              {TYPE_NAMES[type]}
            </text>
          </g>
        ))}
        <text x={LEFT_X} y={svgHeight - 8} className="legend-label">
          红边 = 代表岩性不同罚 +300；虚线 = 缺失步；徽标下数字 = 替代裕量（代价/缺失/分组）
        </text>
      </svg>
    </figure>
  );
}
