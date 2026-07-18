import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 shadow-sm",
        "transition-[border-color,box-shadow] focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20",
        "aria-invalid:border-red-600 aria-invalid:focus:border-red-600 aria-invalid:focus:ring-red-600/20",
        "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
