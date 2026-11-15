import { AdminRequestsView } from "@/components/admin/AdminRequestsView";
import { Suspense } from "react";

export default function AdminRequestsPage() {
  return <Suspense fallback={<p className="p-8 text-sm text-zinc-500" role="status">Loading requests…</p>}><AdminRequestsView /></Suspense>;
}
