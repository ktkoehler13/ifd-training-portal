import { ApprovedTrainingScheduleView } from "@/components/admin/ApprovedTrainingScheduleView";
import { APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE } from "@/lib/approved-training-schedule";
import { loadApprovedTrainingSchedulePageData } from "@/lib/approved-training-schedule-server";

interface ApprovedTrainingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApprovedTrainingPage({
  searchParams,
}: ApprovedTrainingPageProps) {
  const params = await searchParams;
  const timeFilter =
    typeof params.timeFilter === "string" ? params.timeFilter : undefined;
  const year = typeof params.year === "string" ? params.year : undefined;
  const search = typeof params.search === "string" ? params.search : undefined;

  let viewModel = null;
  let loadError: string | null = null;

  try {
    viewModel = await loadApprovedTrainingSchedulePageData({
      timeFilter,
      year,
      search,
    });
  } catch {
    loadError = APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE;
  }

  return (
    <ApprovedTrainingScheduleView
      viewModel={viewModel}
      loadError={loadError}
      initialTimeFilter={timeFilter}
      initialYear={year}
      initialSearch={search ?? ""}
    />
  );
}
