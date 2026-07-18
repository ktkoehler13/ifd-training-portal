import { Suspense } from "react";
import { NewRequestView } from "@/components/requests/NewRequestView";

export default function NewRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
          <p className="text-sm text-zinc-500" role="status">
            Loading request form...
          </p>
        </div>
      }
    >
      <NewRequestView />
    </Suspense>
  );
}
