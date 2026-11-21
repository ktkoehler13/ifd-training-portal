"use client";

import { PageHeader } from "@/components/layout/PageHeader";

import { useSearchParams } from "next/navigation";
import { TrainingRequestWizard } from "@/components/requests/TrainingRequestWizard";
import { AuthGate } from "@/components/layout/AuthGate";

interface NewRequestViewProps {
  currentGsaMileageRate: number | null;
}

export function NewRequestView({ currentGsaMileageRate }: NewRequestViewProps) {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draft");

  return (
    <AuthGate>
      {(personnel) => (
        <div className="flex flex-1 flex-col bg-zinc-100">
          <PageHeader title="New Training Request" description="Complete each step to submit a request to the Training Bureau." />

          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
            <TrainingRequestWizard
              key={`${personnel.id}:${draftId ?? "new"}`}
              personnel={personnel}
              draftId={draftId}
              currentGsaMileageRate={currentGsaMileageRate}
            />
          </div>
        </div>
      )}
    </AuthGate>
  );
}
