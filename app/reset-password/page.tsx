import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PasswordRecoveryResetView } from "@/components/auth/PasswordRecoveryResetView";
import {
  exchangePasswordRecoveryCode,
  hasPasswordRecoverySession,
} from "@/lib/auth/password-recovery-server";

interface ResetPasswordPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function ResetPasswordPageContent({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;

  if (code) {
    const exchanged = await exchangePasswordRecoveryCode(code);
    if (exchanged.ok) {
      redirect("/reset-password");
    }

    redirect("/reset-password?reason=invalid-link");
  }

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

export default function ResetPasswordPage(props: ResetPasswordPageProps) {
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
      <ResetPasswordPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}
