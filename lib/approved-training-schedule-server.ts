import { isAdministrativeRole } from "@/lib/auth/roles";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE,
  buildApprovedTrainingCsv,
  buildApprovedTrainingScheduleViewModel,
  FINAL_APPROVED_TRAINING_REQUEST_STATUS,
  getAvailableApprovedTrainingYears,
  parseApprovedTrainingTimeFilter,
  parseApprovedTrainingYearFilter,
  type ApprovedTrainingScheduleFilters,
  type ApprovedTrainingScheduleRecord,
  type ApprovedTrainingScheduleViewModel,
} from "@/lib/approved-training-schedule";
import { mapTrainingRequestRow } from "@/lib/training-requests";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { PersonnelTitle } from "@/types/personnel";
import type { TrainingRequestRow } from "@/types/training-request";

interface ApprovedTrainingScheduleQueryParams {
  timeFilter?: string | null;
  year?: string | null;
  search?: string | null;
}

interface ApprovedTrainingRow extends TrainingRequestRow {
  requester_title_snapshot: PersonnelTitle | null;
}

function roundCurrency(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100) / 100;
    }
  }

  return 0;
}

async function loadApprovedTrainingRecords(): Promise<
  ApprovedTrainingScheduleRecord[]
> {
  const service = createServiceRoleClient();

  const { data: requestRows, error: requestError } = await service
    .from("training_requests")
    .select("*")
    .eq("status", FINAL_APPROVED_TRAINING_REQUEST_STATUS)
    .order("start_date", { ascending: true });

  if (requestError) {
    console.error("Failed to load approved training schedule", {
      code: requestError.code,
    });
    throw new Error(APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE);
  }

  const approvedRows = (requestRows ?? []) as ApprovedTrainingRow[];
  if (approvedRows.length === 0) {
    return [];
  }

  const requestIds = approvedRows.map((row) => row.id);
  const requesterIds = [
    ...new Set(approvedRows.map((row) => row.requester_personnel_id)),
  ];

  const [{ data: personnelRows, error: personnelError }, { data: actionRows, error: actionError }] =
    await Promise.all([
      service.from("personnel").select("id, title").in("id", requesterIds),
      service
        .from("training_request_actions")
        .select("training_request_id, created_at, signed_at, action")
        .in("training_request_id", requestIds)
        .eq("action", "deputy_chief_approved")
        .order("created_at", { ascending: false }),
    ]);

  if (personnelError || actionError) {
    console.error("Failed to enrich approved training schedule", {
      personnelCode: personnelError?.code,
      actionCode: actionError?.code,
    });
    throw new Error(APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE);
  }

  const currentTitleByPersonnelId = new Map<string, PersonnelTitle>();
  for (const row of personnelRows ?? []) {
    currentTitleByPersonnelId.set(row.id, row.title as PersonnelTitle);
  }

  const approvedAtByRequestId = new Map<string, string>();
  for (const row of actionRows ?? []) {
    if (approvedAtByRequestId.has(row.training_request_id)) {
      continue;
    }

    approvedAtByRequestId.set(
      row.training_request_id,
      row.signed_at ?? row.created_at,
    );
  }

  return approvedRows.map((row) => {
    const mapped = mapTrainingRequestRow(row);

    return {
      id: mapped.id,
      requestNumber:
        mapped.requestNumber?.trim() ||
        mapped.id.slice(0, 8).toUpperCase(),
      requesterPersonnelId: mapped.requesterPersonnelId,
      requesterName: mapped.requesterName,
      requesterBadgeNumber: mapped.requesterBadgeNumber,
      requesterTitleSnapshot: mapped.requesterTitleSnapshot,
      requesterCurrentTitle:
        currentTitleByPersonnelId.get(mapped.requesterPersonnelId) ?? null,
      courseName: mapped.courseName,
      courseNumber: mapped.courseNumber,
      location: mapped.location,
      courseStartDate: mapped.courseStartDate,
      courseEndDate: mapped.courseEndDate,
      totalDaysIncludingTravel: mapped.totalDaysIncludingTravel,
      numberOfDaysOnDuty: mapped.numberOfDaysOnDuty,
      onDutyDates: mapped.onDutyDates,
      totalEstimatedExpenses: roundCurrency(mapped.totalEstimatedExpenses),
      approvedAt: approvedAtByRequestId.get(mapped.id) ?? null,
    };
  });
}

function buildFilters(
  params: ApprovedTrainingScheduleQueryParams,
  availableYears: number[],
): ApprovedTrainingScheduleFilters {
  return {
    timeFilter: parseApprovedTrainingTimeFilter(params.timeFilter),
    year: parseApprovedTrainingYearFilter(params.year, availableYears),
    search: params.search?.trim() ?? "",
  };
}

export async function loadApprovedTrainingSchedulePageData(
  params: ApprovedTrainingScheduleQueryParams,
): Promise<ApprovedTrainingScheduleViewModel | null> {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel || !isAdministrativeRole(personnel.role)) {
    return null;
  }

  const allApprovedRecords = await loadApprovedTrainingRecords();
  const availableYears = getAvailableApprovedTrainingYears(allApprovedRecords);
  const filters = buildFilters(params, availableYears);

  return buildApprovedTrainingScheduleViewModel(allApprovedRecords, filters);
}

export async function loadApprovedTrainingScheduleExport(
  params: ApprovedTrainingScheduleQueryParams,
): Promise<{
  csv: string;
  filename: string;
} | null> {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel || !isAdministrativeRole(personnel.role)) {
    return null;
  }

  const allApprovedRecords = await loadApprovedTrainingRecords();
  const availableYears = getAvailableApprovedTrainingYears(allApprovedRecords);
  const filters = buildFilters(params, availableYears);
  const viewModel = buildApprovedTrainingScheduleViewModel(
    allApprovedRecords,
    filters,
  );

  const timestamp = new Date().toISOString().slice(0, 10);
  return {
    csv: buildApprovedTrainingCsv(viewModel.records),
    filename: `approved-training-${filters.timeFilter}-${timestamp}.csv`,
  };
}

export async function requireApprovedTrainingScheduleAccess(): Promise<boolean> {
  const personnel = await getAuthenticatedPersonnel();
  return Boolean(personnel && isAdministrativeRole(personnel.role));
}
