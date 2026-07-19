import { NextResponse } from "next/server";
import {
  APPROVED_TRAINING_SCHEDULE_EXPORT_ERROR_MESSAGE,
  APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE,
} from "@/lib/approved-training-schedule";
import { loadApprovedTrainingScheduleExport } from "@/lib/approved-training-schedule-server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await loadApprovedTrainingScheduleExport({
      timeFilter: url.searchParams.get("timeFilter"),
      year: url.searchParams.get("year"),
      search: url.searchParams.get("search"),
    });

    if (!result) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Approved training CSV export failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: APPROVED_TRAINING_SCHEDULE_EXPORT_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE },
    { status: 405 },
  );
}
