import { Fragment } from "react";

interface StepperProps {
  currentStep: number;
}

const STEPS = [
  "工作目录",
  "AI Provider",
  "技能预设",
  "首个项目",
  "完成",
];

export function OnboardingStepper({ currentStep }: StepperProps): JSX.Element {
  return (
    <div className="flex items-center justify-between w-full px-4 mb-4">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <Fragment key={step}>
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  isCompleted
                    ? "bg-accent-500 text-ink-900"
                    : isCurrent
                    ? "bg-accent-500/20 text-accent-300 ring-2 ring-accent-500/40"
                    : "bg-ink-700 text-ink-400"
                }`}
              >
                {isCompleted ? "✓" : index + 1}
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  isCurrent ? "text-accent-300" : isCompleted ? "text-ink-200" : "text-ink-500"
                }`}
              >
                {step}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`h-[2px] flex-1 mx-4 transition-colors ${
                  isCompleted ? "bg-accent-500" : "bg-ink-700"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
