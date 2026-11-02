import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const CURRENCY_FRACTIONS: Record<string, number> = {
  XOF: 0,
  XAF: 0,
  JPY: 0,
  EUR: 2,
  USD: 2,
  GBP: 2,
  MAD: 2,
  GHS: 2,
  NGN: 2,
};

export function currencyFractionDigits(currency: string): number {
  return CURRENCY_FRACTIONS[currency] ?? 2;
}

/** Formate un montant stocké en unité mineure (entier) sans passer par un flottant en base. */
export function formatMoney(
  amountMinor: number | string | null | undefined,
  currency: string,
  locale = "fr-FR",
): string {
  if (amountMinor === null || amountMinor === undefined) return "—";
  const digits = currencyFractionDigits(currency);
  const value = Number(amountMinor) / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

export function parseMoneyToMinor(input: string | number, currency: string): number {
  const digits = currencyFractionDigits(currency);
  const raw = typeof input === "number" ? input : Number(String(input).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 10 ** digits);
}

export function formatDate(value: string | Date | null | undefined, locale = "fr-FR"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, locale = "fr-FR"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: string | Date | null | undefined, locale = "fr-FR"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 3600_000],
    ["month", 30 * 24 * 3600_000],
    ["day", 24 * 3600_000],
    ["hour", 3600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return formatter.format(0, "minute");
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}
