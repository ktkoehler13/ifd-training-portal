import { Suspense } from "react";
import { ChangePasswordView } from "@/components/settings/ChangePasswordView";

export default function ChangePasswordSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
          <p className="text-sm text-zinc-500" role="status">
            Loading password settings...
          </p>
        </div>
      }
    >
      <ChangePasswordView />
    </Suspense>
  );
}
