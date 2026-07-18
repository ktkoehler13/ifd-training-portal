import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AppLayout({ children, className }: AppLayoutProps) {
  return (
    <div className={cn("flex min-h-full flex-1 flex-col", className)}>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
