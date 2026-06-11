/**
 * lib/format.ts — small formatting helpers shared across screens.
 */

/** Formats an ISO timestamp as a short, friendly date + time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Generates a short unique id (sufficient for local history entries). */
export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Derives a friendly default product name from a raw INCI list:
 * uses the first recognizable ingredient token, capped in length.
 */
export function defaultProductName(rawInci: string, productLabel: string): string {
  const first = rawInci
    .split(/[,\n;]/)[0]
    ?.trim()
    .replace(/\s+/g, " ");
  if (first && first.length > 1) {
    const clipped = first.length > 24 ? `${first.slice(0, 24)}…` : first;
    return `${productLabel} · ${clipped}`;
  }
  return productLabel;
}
