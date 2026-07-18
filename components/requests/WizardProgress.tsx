import { cn } from "@/lib/utils";

const STEPS = ["Requester", "Course", "Expenses", "Review"] as const;

interface WizardProgressProps {
  currentStep: number;
}

export function WizardProgress({ currentStep }: WizardProgressProps) {
  return (
    <nav aria-label="Request progress" className="mb-8">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <li key={label} className="min-w-0">
              <div
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl px-1 py-2 text-center",
                  isCurrent && "bg-red-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                    isComplete && "bg-red-700 text-white",
                    isCurrent && "bg-red-700 text-white ring-4 ring-red-100",
                    !isComplete && !isCurrent && "bg-zinc-200 text-zinc-600",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {stepNumber}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-xs font-medium sm:block",
                    isCurrent ? "text-red-800" : "text-zinc-500",
                  )}
                >
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-center text-sm text-zinc-600 sm:hidden">
        Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1]}
      </p>
    </nav>
  );
}
