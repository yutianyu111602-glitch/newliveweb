export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(
  record: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const v = record[key];
  return typeof v === "string" ? v : fallback;
}

export function getNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const v = record[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean
): boolean {
  const v = record[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
