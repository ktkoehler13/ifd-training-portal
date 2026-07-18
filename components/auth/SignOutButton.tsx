"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { signOutClientSession } from "@/lib/auth/client";

interface SignOutButtonProps {
  className?: string;
  variant?: "primary" | "secondary";
}

export function SignOutButton({
  className,
  variant = "secondary",
}: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOutClientSession();
    router.replace("/");
    router.refresh();
  }

  return (
    <Button variant={variant} onClick={handleSignOut} className={className}>
      Sign Out
    </Button>
  );
}
