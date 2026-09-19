import { Suspense } from "react";
import { PasswordRecoveryRequestView } from "@/components/auth/PasswordRecoveryRequestView";

export default function ForgotPasswordPage() {
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
      <PasswordRecoveryRequestView />
    </Suspense>
  );
}
