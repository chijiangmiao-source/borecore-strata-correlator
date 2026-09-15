import { costLines, STEP_LABELS, stepLayersText } from "../format";
import type { Step } from "../types";

interface StepListProps {
  steps: Step[];
  selected: number | null;
  onSelect: (index: number) => void;
}

/** 逐步证据：输入层、分项代价、累计值，与连带图联动高亮。 */
export function StepList({ steps, selected, onSelect }: StepListProps) {
  return (
    <ol className="step-list" data-testid="step-list">
      {steps.map((step) => (
        <li
          key={step.index}
          data-testid={`step-${step.index}`}
          data-step-type={step.type}
          className={`step-card${selected === step.index ? " selected" : ""}`}
          onMouseEnter={() => onSelect(step.index)}
        >
          <header>
            <strong>步骤 {step.index}</strong>
            <span className="step-type" data-testid="step-type">
              {step.type}
            </span>
            <span className="step-kind">{STEP_LABELS[step.type]}</span>
          </header>
          <p className="step-layers">{stepLayersText(step)}</p>
          <ul className="cost-lines">
            {costLines(step).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <footer>
            累计：代价 {step.cumulative_cost} · 缺失 {step.cumulative_missing} · 分组{" "}
            {step.cumulative_groups}
          </footer>
        </li>
      ))}
    </ol>
  );
}
