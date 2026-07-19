export interface ApprovedPacketFieldWarning {
  requestId: string;
  field: string;
}

let warningCollector: ApprovedPacketFieldWarning[] | null = null;

export function warnApprovedPacketFieldUnavailable(
  requestId: string,
  field: string,
): void {
  const warning = { requestId, field };

  if (warningCollector) {
    warningCollector.push(warning);
    return;
  }

  console.warn("Approved packet field unavailable", warning);
}

export function collectApprovedPacketWarningsForTest<T>(
  fn: () => T,
): { warnings: ApprovedPacketFieldWarning[]; result: T } {
  warningCollector = [];

  try {
    const result = fn();
    return { warnings: [...warningCollector], result };
  } finally {
    warningCollector = null;
  }
}

export async function collectApprovedPacketWarningsForTestAsync<T>(
  fn: () => Promise<T>,
): Promise<{ warnings: ApprovedPacketFieldWarning[]; result: T }> {
  warningCollector = [];

  try {
    const result = await fn();
    return { warnings: [...warningCollector], result };
  } finally {
    warningCollector = null;
  }
}
