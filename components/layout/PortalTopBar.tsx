"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PortalLogo } from "@/components/layout/PortalBrand";
import { signOutClientSession } from "@/lib/auth/client";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { accountNavLinks, adminNavLinks, isActiveNavLink, personnelInitials, primaryNavLinks } from "@/lib/navigation";
import { formatPersonnelFullName } from "@/lib/personnel";
import { countPendingApprovalsForRole } from "@/lib/training-request-workflow";
import { cn } from "@/lib/utils";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";

function useCloseOnOutsideClick(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

const menuItemClass = "block rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700";

/** Shared header for every signed-in page: crest, sections, admin menu and account menu. */
export function PortalTopBar({ personnel, minimal = false }: { personnel: AuthenticatedPersonnel; minimal?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const adminRef = useCloseOnOutsideClick(adminOpen, () => setAdminOpen(false));
  const accountRef = useCloseOnOutsideClick(accountOpen, () => setAccountOpen(false));
  const links = primaryNavLinks(personnel.role);
  const adminLinks = adminNavLinks(personnel.role);
  const name = formatPersonnelFullName(personnel) || `Badge ${personnel.badgeNumber}`;

  useEffect(() => {
    if (minimal || (personnel.role !== "mto" && personnel.role !== "deputy_chief")) return;
    let cancelled = false;
    countPendingApprovalsForRole(personnel.role)
      .then((count) => { if (!cancelled) setPendingApprovals(count); })
      .catch(() => { if (!cancelled) setPendingApprovals(null); });
    return () => { cancelled = true; };
  }, [minimal, pathname, personnel.role]);

  async function signOut() {
    await signOutClientSession();
    router.replace("/");
    router.refresh();
  }

  return <header className="border-b border-zinc-200 bg-white">
    <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
      <Link href={minimal ? "/settings/password" : "/dashboard"} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">
        <PortalLogo />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">IFD Training Portal</span>
          <span className="block truncate text-xs text-zinc-500 sm:text-sm">Ithaca Fire Department</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {minimal ? <button type="button" onClick={() => void signOut()} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Sign out</button> :
        <div ref={accountRef} className="relative">
          <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen(!accountOpen); setAdminOpen(false); }}
            className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-sm font-semibold text-red-800">{personnelInitials(personnel.firstName, personnel.lastName, personnel.badgeNumber)}</span>
            <span className="hidden text-left sm:block"><span className="block text-sm font-medium text-zinc-900">{name}</span><span className="block text-xs text-zinc-500">{PERSONNEL_ROLE_LABELS[personnel.role]} · Badge {personnel.badgeNumber}</span></span>
            <span aria-hidden="true" className="text-xs text-zinc-500">▾</span>
            <span className="sr-only">Account menu</span>
          </button>
          {accountOpen ? <div role="menu" className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
            <div className="px-3 py-2 sm:hidden"><p className="text-sm font-medium text-zinc-900">{name}</p><p className="text-xs text-zinc-500">{PERSONNEL_ROLE_LABELS[personnel.role]} · Badge {personnel.badgeNumber}</p></div>
            {accountNavLinks(personnel.role).map((link) => <Link key={link.href} role="menuitem" href={link.href} onClick={() => setAccountOpen(false)} className={menuItemClass}>{link.label}</Link>)}
            <div className="my-1 border-t border-zinc-100" />
            <button type="button" role="menuitem" onClick={() => void signOut()} className={cn(menuItemClass, "w-full text-left")}>Sign out</button>
          </div> : null}
        </div>}
      </div>
    </div>
    {minimal ? null : <nav aria-label="Main" className="mx-auto w-full max-w-6xl px-2 sm:px-4">
      <ul className="-mb-px flex flex-wrap items-center gap-x-1">
        {links.map((link) => {
          const active = isActiveNavLink(link.href, pathname);
          return <li key={link.href} className="shrink-0">
            <Link href={link.href} aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700",
                active ? "border-red-700 text-zinc-900" : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")}>
              {link.label}
              {link.href === "/approvals" && pendingApprovals ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`${pendingApprovals} waiting`}>{pendingApprovals}</span> : null}
            </Link>
          </li>;
        })}
        {adminLinks.length ? <li className="shrink-0">
          <div ref={adminRef} className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={adminOpen} onClick={() => { setAdminOpen(!adminOpen); setAccountOpen(false); }}
              className={cn("flex items-center gap-1 border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700",
                adminLinks.some((link) => isActiveNavLink(link.href, pathname)) ? "border-red-700 text-zinc-900" : "border-transparent text-zinc-600 hover:text-zinc-900")}>
              Admin <span aria-hidden="true" className="text-xs">▾</span>
            </button>
            {adminOpen ? <div role="menu" aria-label="Admin" className="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
              {adminLinks.map((link) => <Link key={link.href} role="menuitem" href={link.href} onClick={() => setAdminOpen(false)} className={menuItemClass}>{link.label}</Link>)}
            </div> : null}
          </div>
        </li> : null}
      </ul>
    </nav>}
  </header>;
}
