export function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return 0;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
}

export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function addCurrency(...amounts: number[]): number {
  const totalCents = amounts.reduce((sum, amount) => {
    return sum + Math.round(roundCurrency(amount) * 100);
  }, 0);

  return totalCents / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(roundCurrency(amount));
}

export function formatCurrencyInput(value: string): string {
  if (!value.trim()) {
    return "";
  }

  const amount = parseCurrencyInput(value);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isValidCurrencyInput(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) {
    return false;
  }

  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) && amount >= 0;
}

export function formatMileageRate(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(rate);
}
