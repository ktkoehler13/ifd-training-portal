import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title area below the shared top bar. */
export function PageHeader({ title, description, actions, className }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:px-6", className)}>
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">{description}</p> : null}
    </div>
    {actions ? <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">{actions}</div> : null}
  </div>;
}
