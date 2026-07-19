import { Suspense } from "react";
import { PasswordSetupRequestView } from "@/components/auth/PasswordSetupRequestView";

export default function SetupPasswordPage() {
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
      <PasswordSetupRequestView />
    </Suspense>
  );
}
