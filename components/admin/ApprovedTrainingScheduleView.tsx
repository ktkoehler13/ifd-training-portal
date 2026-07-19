"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { AdminGate } from "@/components/layout/AuthGate";
import { Button } from "@/components/ui/Button";
import {
  formatApprovedTrainingDateRange,
  formatApprovedTrainingRequesterRank,
  getTodayInAmericaNewYork,
  type ApprovedTrainingScheduleViewModel,
  type ApprovedTrainingTimeFilter,
} from "@/lib/approved-training-schedule";
import {
  formatDaysOnDutyDisplay,
  formatTotalDaysIncludingTravelDisplay,
} from "@/lib/training-day-details";
import { cn } from "@/lib/utils";

interface ApprovedTrainingScheduleViewProps {
  viewModel: ApprovedTrainingScheduleViewModel | null;
  loadError: string | null;
  initialTimeFilter?: string;
  initialYear?: string;
  initialSearch: string;
}

const TIME_FILTER_OPTIONS: Array<{
  value: ApprovedTrainingTimeFilter;
  label: string;
}> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All Approved" },
];

function buildFilterQuery(input: {
  timeFilter: ApprovedTrainingTimeFilter;
  year: string;
  search: string;
}): string {
  const params = new URLSearchParams();
  params.set("timeFilter", input.timeFilter);

  if (input.year && input.year !== "all") {
    params.set("year", input.year);
  }

  const trimmedSearch = input.search.trim();
  if (trimmedSearch) {
    params.set("search", trimmedSearch);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function ApprovedTrainingScheduleContent({
  viewModel,
  loadError,
  initialTimeFilter,
  initialYear,
  initialSearch,
}: ApprovedTrainingScheduleViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timeFilter: ApprovedTrainingTimeFilter =
    initialTimeFilter === "past" || initialTimeFilter === "all"
      ? initialTimeFilter
      : "upcoming";
  const yearFilter = initialYear ?? "all";

  const currentYear = useMemo(
    () => parseIsoYear(getTodayInAmericaNewYork()),
    [],
  );

  const exportUrl = useMemo(
    () =>
      `/api/admin/approved-training/export${buildFilterQuery({
        timeFilter,
        year: yearFilter,
        search: initialSearch,
      })}`,
    [initialSearch, timeFilter, yearFilter],
  );

  function applyFilters(next: {
    timeFilter?: ApprovedTrainingTimeFilter;
    year?: string;
    search?: string;
  }) {
    const nextTimeFilter = next.timeFilter ?? timeFilter;
    const nextYear = next.year ?? yearFilter;
    const nextSearch = next.search ?? initialSearch;

    startTransition(() => {
      router.push(
        `/admin/approved-training${buildFilterQuery({
          timeFilter: nextTimeFilter,
          year: nextYear,
          search: nextSearch,
        })}`,
      );
    });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const search = String(formData.get("search") ?? "");
    applyFilters({ search });
  }

  if (!viewModel && !loadError) {
    return null;
  }

  const records = viewModel?.records ?? [];
  const monthGroups = viewModel?.monthGroups ?? [];
  const summary = viewModel?.summary ?? {
    upcomingTrainingCount: 0,
    personnelAttendingCount: 0,
    trainingDaysCount: 0,
  };
  const availableYears = viewModel?.availableYears ?? [];
  const emptyStateMessage =
    viewModel?.emptyStateMessage ??
    "No approved training matches the selected filters.";

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Approved Training
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Centralized schedule of fully approved training requests across
              the department.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {loadError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {loadError}
          </div>
        ) : null}

        {!loadError && viewModel ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label="Upcoming Training"
                value={summary.upcomingTrainingCount}
              />
              <SummaryCard
                label="Personnel Attending"
                value={summary.personnelAttendingCount}
              />
              <SummaryCard
                label="Training Days"
                value={summary.trainingDaysCount}
              />
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/60 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                      View
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TIME_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            applyFilters({ timeFilter: option.value });
                          }}
                          className={cn(
                            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                            timeFilter === option.value
                              ? "bg-red-700 text-white"
                              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                          )}
                          aria-pressed={timeFilter === option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="approved-training-year-filter"
                      className="mb-2 block text-xs font-semibold tracking-wide text-zinc-500 uppercase"
                    >
                      Year
                    </label>
                    <select
                      id="approved-training-year-filter"
                      value={yearFilter}
                      onChange={(event) => {
                        applyFilters({ year: event.target.value });
                      }}
                      className="h-11 min-w-40 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 shadow-sm"
                    >
                      <option value="all">All Years</option>
                      <option value="current">{currentYear}</option>
                      {availableYears.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                  <form
                    onSubmit={handleSearchSubmit}
                    className="flex w-full flex-col gap-2 sm:flex-row"
                  >
                    <label htmlFor="approved-training-search" className="sr-only">
                      Search approved training
                    </label>
                    <input
                      id="approved-training-search"
                      key={initialSearch}
                      name="search"
                      type="search"
                      defaultValue={initialSearch}
                      placeholder="Search name, badge, course, location, request #"
                      className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 shadow-sm sm:min-w-72"
                    />
                    <Button type="submit" variant="secondary" className="h-11 px-5">
                      Search
                    </Button>
                  </form>

                  <a
                    href={exportUrl}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
                  >
                    Export CSV
                  </a>
                </div>
              </div>
            </section>

            {isPending ? (
              <p className="text-sm text-zinc-500" role="status">
                Updating schedule…
              </p>
            ) : null}

            {records.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center shadow-sm shadow-zinc-200/60">
                <p className="text-sm text-zinc-600">{emptyStateMessage}</p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 md:block">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                        <tr>
                          <th className="px-4 py-3 font-semibold">
                            Training Date(s)
                          </th>
                          <th className="px-4 py-3 font-semibold">Requester</th>
                          <th className="px-4 py-3 font-semibold">Rank</th>
                          <th className="px-4 py-3 font-semibold">Badge</th>
                          <th className="px-4 py-3 font-semibold">Course</th>
                          <th className="px-4 py-3 font-semibold">Location</th>
                          <th className="px-4 py-3 font-semibold">Total Days</th>
                          <th className="px-4 py-3 font-semibold">Days On Duty</th>
                          <th className="px-4 py-3 font-semibold">
                            Request Number
                          </th>
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeFilter === "upcoming"
                          ? monthGroups.flatMap((group) => [
                              <tr key={`${group.monthKey}-header`}>
                                <td
                                  colSpan={10}
                                  className="bg-zinc-50 px-4 py-3 text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase"
                                >
                                  {group.monthLabel}
                                </td>
                              </tr>,
                              ...group.records.map((record) => (
                                <ApprovedTrainingTableRow
                                  key={record.id}
                                  record={record}
                                />
                              )),
                            ])
                          : records.map((record) => (
                              <ApprovedTrainingTableRow
                                key={record.id}
                                record={record}
                              />
                            ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-col gap-4 md:hidden">
                  {timeFilter === "upcoming"
                    ? monthGroups.flatMap((group) => [
                        <div key={`${group.monthKey}-header-mobile`}>
                          <h2 className="mb-3 text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
                            {group.monthLabel}
                          </h2>
                          <div className="flex flex-col gap-3">
                            {group.records.map((record) => (
                              <ApprovedTrainingCard
                                key={record.id}
                                record={record}
                              />
                            ))}
                          </div>
                        </div>,
                      ])
                    : records.map((record) => (
                        <ApprovedTrainingCard key={record.id} record={record} />
                      ))}
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm shadow-zinc-200/60">
      <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function ApprovedTrainingActions({
  requestId,
}: {
  requestId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/requests/${encodeURIComponent(requestId)}/confirmation`}
        className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
      >
        View Request
      </Link>
      <a
        href={`/api/training-requests/${encodeURIComponent(requestId)}/approved-packet`}
        className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
      >
        Download Approved Packet
      </a>
    </div>
  );
}

function ApprovedTrainingTableRow({
  record,
}: {
  record: ApprovedTrainingScheduleViewModel["records"][number];
}) {
  return (
    <tr className="border-b border-zinc-100 last:border-b-0">
      <td className="px-4 py-4 align-top font-medium text-zinc-900">
        {formatApprovedTrainingDateRange(
          record.courseStartDate,
          record.courseEndDate,
        )}
      </td>
      <td className="px-4 py-4 align-top text-zinc-700">
        {record.requesterName}
      </td>
      <td className="px-4 py-4 align-top text-zinc-700">
        {formatApprovedTrainingRequesterRank(record)}
      </td>
      <td className="px-4 py-4 align-top text-zinc-700">
        {record.requesterBadgeNumber}
      </td>
      <td className="px-4 py-4 align-top text-zinc-700">{record.courseName}</td>
      <td className="px-4 py-4 align-top text-zinc-700">{record.location}</td>
      <td className="px-4 py-4 align-top text-zinc-700">
        {formatTotalDaysIncludingTravelDisplay(record.totalDaysIncludingTravel)}
      </td>
      <td className="px-4 py-4 align-top text-zinc-700">
        {formatDaysOnDutyDisplay(record.numberOfDaysOnDuty)}
      </td>
      <td className="px-4 py-4 align-top text-zinc-700">
        {record.requestNumber}
      </td>
      <td className="px-4 py-4 align-top">
        <ApprovedTrainingActions requestId={record.id} />
      </td>
    </tr>
  );
}

function ApprovedTrainingCard({
  record,
}: {
  record: ApprovedTrainingScheduleViewModel["records"][number];
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/60">
      <p className="text-base font-semibold text-zinc-900">
        {formatApprovedTrainingDateRange(
          record.courseStartDate,
          record.courseEndDate,
        )}
      </p>
      <p className="mt-2 text-sm font-medium text-zinc-800">
        {record.requesterName}
      </p>
      <p className="mt-1 text-sm text-zinc-700">{record.courseName}</p>
      <p className="mt-1 text-sm text-zinc-700">{record.location}</p>

      <dl className="mt-4 grid gap-2 text-sm text-zinc-600">
        <div className="flex justify-between gap-4">
          <dt>Rank</dt>
          <dd className="text-right text-zinc-800">
            {formatApprovedTrainingRequesterRank(record)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Total Days</dt>
          <dd className="text-right text-zinc-800">
            {formatTotalDaysIncludingTravelDisplay(record.totalDaysIncludingTravel)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Days On Duty</dt>
          <dd className="text-right text-zinc-800">
            {formatDaysOnDutyDisplay(record.numberOfDaysOnDuty)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Badge</dt>
          <dd className="text-right text-zinc-800">
            {record.requesterBadgeNumber}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Request Number</dt>
          <dd className="text-right text-zinc-800">{record.requestNumber}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <ApprovedTrainingActions requestId={record.id} />
      </div>
    </article>
  );
}

function parseIsoYear(value: string): number {
  const match = /^(\d{4})-/.exec(value);
  return match ? Number.parseInt(match[1], 10) : new Date().getFullYear();
}

export function ApprovedTrainingScheduleView(
  props: ApprovedTrainingScheduleViewProps,
) {
  return (
    <AdminGate>
      <ApprovedTrainingScheduleContent {...props} />
    </AdminGate>
  );
}
