import { Suspense } from "react";
import { LandingGate } from "@/components/layout/LandingGate";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
          <p className="text-sm text-zinc-500" role="status">
            Loading…
          </p>
        </div>
      }
    >
      <LandingGate />
    </Suspense>
  );
}
