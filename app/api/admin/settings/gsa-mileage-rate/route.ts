import { NextResponse, type NextRequest } from "next/server";
import { PasswordResetError } from "@/lib/auth/password-reset-messages";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isAdministrativeRole } from "@/lib/auth/roles";
import {
  getGsaMileageRateSettingForAdmin,
  SystemSettingsValidationError,
  updateGsaMileageRateSettingAsAdministrator,
} from "@/lib/system-settings-server";
import {
  parseGsaMileageRateSettingValue,
  validateGsaMileageRateSettingInput,
} from "@/lib/system-settings";

function accessDeniedResponse() {
  return NextResponse.json({ error: "Access denied." }, { status: 403 });
}

export async function GET() {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel || !isAdministrativeRole(personnel.role)) {
    return accessDeniedResponse();
  }

  try {
    const setting = await getGsaMileageRateSettingForAdmin();
    return NextResponse.json(setting);
  } catch {
    return NextResponse.json(
      { error: "Unable to load GSA mileage rate settings." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid GSA mileage rate update request." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || typeof (body as { rate?: unknown }).rate !== "string") {
    return NextResponse.json(
      { error: "Invalid GSA mileage rate update request." },
      { status: 400 },
    );
  }

  const rawRate = (body as { rate: string }).rate;
  const validationMessage = validateGsaMileageRateSettingInput(rawRate);
  if (validationMessage) {
    return NextResponse.json({ error: validationMessage }, { status: 400 });
  }

  const parsed = parseGsaMileageRateSettingValue(rawRate);
  if (parsed === null) {
    return NextResponse.json(
      { error: "Enter a valid rate with up to four decimal places." },
      { status: 400 },
    );
  }

  try {
    const result = await updateGsaMileageRateSettingAsAdministrator({
      rate: parsed,
    });
    return NextResponse.json({
      rate: result.rate,
      updatedAt: result.updatedAt,
      source: "database" as const,
    });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return accessDeniedResponse();
    }

    if (error instanceof SystemSettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Unable to save the GSA mileage rate. Try again later." },
      { status: 500 },
    );
  }
}
