import { NextResponse } from "next/server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { getCurrentGsaMileageRate } from "@/lib/system-settings-server";

export async function GET() {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  try {
    const rate = await getCurrentGsaMileageRate();
    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json(
      { error: "Unable to load the current GSA mileage rate." },
      { status: 500 },
    );
  }
}
