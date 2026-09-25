import { Suspense } from "react";
import { NewRequestView } from "@/components/requests/NewRequestView";
import { getCurrentGsaMileageRate } from "@/lib/system-settings-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRequestPage() {
  const currentGsaMileageRate = await getCurrentGsaMileageRate();

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
          <p className="text-sm text-zinc-500" role="status">
            Loading request form...
          </p>
        </div>
      }
    >
      <NewRequestView currentGsaMileageRate={currentGsaMileageRate} />
    </Suspense>
  );
}
