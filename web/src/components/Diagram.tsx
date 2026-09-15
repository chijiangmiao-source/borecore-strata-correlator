import type { Step, StepType } from "../types";

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
  "1:0": "1:0 左列缺失",
  "0:1": "0:1 右列缺失",
};

interface DiagramProps {
  steps: Step[];
  selected: number | null;
  onSelect: (index: number) => void;
}

interface Segment {
  y0: number;
  y1: number;
}

/** 连带图：左、右两列层块与每一步的连接带，带颜色区分步骤类型，红边表示岩性罚分。 */
export function Diagram({ steps, selected, onSelect }: DiagramProps) {
  const leftColumn = steps.flatMap((step) => step.left);
  const rightColumn = steps.flatMap((step) => step.right);
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

  return (
    <figure className="diagram" data-testid="diagram">
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

        {steps.map((step) => {
          const leftSeg = segmentOf(step.left, leftOffsets);
          const rightSeg = segmentOf(step.right, rightOffsets);
          const color = TYPE_COLORS[step.type];
          const isSelected = selected === step.index;
          const penalized = (step.lithology_penalty ?? 0) > 0;

          if (leftSeg && rightSeg) {
            const badgeX = GUTTER_X;
            const badgeY = (leftSeg.y0 + leftSeg.y1 + rightSeg.y0 + rightSeg.y1) / 4;
            return (
              <g
                key={step.index}
                data-testid={`band-${step.index}`}
                className="band"
                onMouseEnter={() => onSelect(step.index)}
                onClick={() => onSelect(step.index)}
              >
                <polygon
                  points={`${LEFT_X + LEFT_W},${leftSeg.y0} ${RIGHT_X},${rightSeg.y0} ${RIGHT_X},${rightSeg.y1} ${LEFT_X + LEFT_W},${leftSeg.y1}`}
                  fill={color}
                  fillOpacity={isSelected ? 0.55 : 0.28}
                  stroke={penalized ? "#c62828" : color}
                  strokeWidth={isSelected || penalized ? 2 : 1}
                />
                <circle cx={badgeX} cy={badgeY} r={11} fill="#fff" stroke={color} strokeWidth={1.5} />
                <text x={badgeX} y={badgeY + 4} textAnchor="middle" className="badge">
                  {step.index}
                </text>
              </g>
            );
          }

          const seg = leftSeg ?? rightSeg;
          if (!seg) return null;
          const fromX = leftSeg ? LEFT_X + LEFT_W : RIGHT_X;
          const midY = (seg.y0 + seg.y1) / 2;
          return (
            <g
              key={step.index}
              data-testid={`band-${step.index}`}
              className="band"
              onMouseEnter={() => onSelect(step.index)}
              onClick={() => onSelect(step.index)}
            >
              <line
                x1={fromX}
                y1={midY}
                x2={GUTTER_X}
                y2={midY}
                stroke={color}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeDasharray="6 4"
              />
              <circle cx={GUTTER_X} cy={midY} r={11} fill="#fff" stroke={color} strokeWidth={1.5} />
              <text x={GUTTER_X} y={midY + 4} textAnchor="middle" className="badge">
                {step.index}
              </text>
              <text
                x={GUTTER_X + (leftSeg ? 16 : -16)}
                y={midY + 4}
                textAnchor={leftSeg ? "start" : "end"}
                className="missing-label"
              >
                ∅ 缺失
              </text>
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
          红边 = 代表岩性不同罚 +300；虚线 = 缺失步
        </text>
      </svg>
    </figure>
  );
}
