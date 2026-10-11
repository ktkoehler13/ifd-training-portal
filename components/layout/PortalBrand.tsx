import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PortalLogo({ large = false }: { large?: boolean }) {
  return (
    <Image
      src="/ifd-logo.png"
      alt="Ithaca Fire Department crest"
      width={612}
      height={792}
      sizes={large ? "75px" : "(min-width: 640px) 50px, 44px"}
      loading="eager"
      className={cn(
        "w-auto shrink-0 object-contain",
        large ? "mx-auto mb-4 h-24" : "h-14 sm:h-16",
      )}
    />
  );
}

export function PortalHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 sm:gap-4", className)}>
      <PortalLogo />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
