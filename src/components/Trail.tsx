import type { Progress } from "@/lib/types";

export function Trail({ steps }: { steps: Progress[] }) {
  return <div className="trail" aria-label="Progresso do fluxo">
    {steps.map(step => {
      const stateClass = step.status === 3 ? "failed" : step.status === 2 ? "done" : step.status === 1 ? "current" : "";
      const title = step.status === 3 ? `${step.name} - falha` : step.name;

      return <div key={step.id} title={title} className={`trail-item ${stateClass}`}>
        <span>{step.name.length > 19 ? `${step.name.slice(0, 17)}...` : step.name}</span>
      </div>;
    })}
  </div>;
}
