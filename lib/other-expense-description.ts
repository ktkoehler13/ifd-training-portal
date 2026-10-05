export function normalizeOtherExpenseDescription(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateOtherExpenseDescription(amount: number, description: unknown): string | null {
  return amount > 0 && !normalizeOtherExpenseDescription(description)
    ? "Describe Other Expense when Other Expenses is greater than $0."
    : null;
}

export function otherExpenseLabel(description: unknown): string {
  const text = normalizeOtherExpenseDescription(description);
  return text ? `Other – ${text}` : "Other Expense";
}
