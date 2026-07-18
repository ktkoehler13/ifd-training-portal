import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 shadow-sm",
        "placeholder:text-zinc-400",
        "transition-[border-color,box-shadow] focus:border-red-700 focus:outline-none focus:ring-2 focus:ring-red-700/20",
        className,
      )}
      {...props}
    />
  );
}
