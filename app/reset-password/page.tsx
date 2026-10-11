import { Suspense } from "react";
import { PasswordRecoveryResetView } from "@/components/auth/PasswordRecoveryResetView";
import {
  hasPasswordRecoverySession,
} from "@/lib/auth/password-recovery-server";

async function ResetPasswordPageContent() {
  const initialHasRecoverySession = await hasPasswordRecoverySession();

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
          <p className="text-sm text-zinc-500" role="status">
            Loading reset form…
          </p>
        </div>
      }
    >
      <PasswordRecoveryResetView
        initialHasRecoverySession={initialHasRecoverySession}
      />
    </Suspense>
  );
}

export default function ResetPasswordPage() {
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
      <ResetPasswordPageContent />
    </Suspense>
  );
}
