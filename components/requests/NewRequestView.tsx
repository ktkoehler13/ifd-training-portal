"use client";

import Link from "next/link";
import { TrainingRequestWizard } from "@/components/requests/TrainingRequestWizard";
import { PrototypeGate } from "@/components/layout/PrototypeGate";

export function NewRequestView() {
  return (
    <PrototypeGate>
      <div className="flex flex-1 flex-col bg-zinc-100">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                New Training Request
              </h1>
              <p className="mt-1 text-sm text-zinc-600">
                Complete each step to submit a request to the Training Bureau.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 sm:w-auto"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Prototype environment — submitted requests are stored in this
            browser only.
          </div>
          <TrainingRequestWizard />
        </div>
      </div>
    </PrototypeGate>
  );
}
