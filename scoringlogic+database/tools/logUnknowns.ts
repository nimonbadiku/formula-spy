/**
 * tools/logUnknowns.ts
 *
 * Passive logger for ingredients the engine fails to resolve.
 *
 * - Browser (npm run dev): POST /__log-unknown → Vite middleware writes
 *   unknown_ingredients.txt at the project root.
 * - Node (tsx, benchmarks): dynamic import of unknownLogStore.ts (real fs).
 *
 * Logging never throws; failures are ignored so analysis is not blocked.
 */

/** Session dedupe (case-insensitive), shared across transports. */
const seenThisRun = new Set<string>();

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

function markSeenAndCheckNew(trimmed: string): boolean {
  const key = normalizeKey(trimmed);
  if (!key || seenThisRun.has(key)) return false;
  seenThisRun.add(key);
  return true;
}

// ─── Browser (Vite dev server) ─────────────────────────────────────────────

const pendingBrowser = new Set<string>();
let browserFlushScheduled = false;

function flushBrowserQueue(): void {
  browserFlushScheduled = false;
  const names = [...pendingBrowser];
  pendingBrowser.clear();
  if (names.length === 0) return;

  try {
    void fetch("/__log-unknown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function logUnknownIngredientBrowser(trimmed: string): void {
  if (!markSeenAndCheckNew(trimmed)) return;
  pendingBrowser.add(trimmed);
  if (!browserFlushScheduled) {
    browserFlushScheduled = true;
    setTimeout(flushBrowserQueue, 0);
  }
}

// ─── Node ────────────────────────────────────────────────────────────────────

function logUnknownIngredientNode(trimmed: string): void {
  if (!markSeenAndCheckNew(trimmed)) return;
  void import("./unknownLogStore.js")
    .then((store) => {
      store.appendUniqueNames(store.UNKNOWN_LOG_PATH, [trimmed]);
    })
    .catch(() => {});
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Append an unresolved ingredient name to unknown_ingredients.txt.
 * Skips empty strings and names already logged this session (and on disk).
 */
export function logUnknownIngredient(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;

  try {
    if (typeof window !== "undefined") {
      logUnknownIngredientBrowser(trimmed);
    } else {
      logUnknownIngredientNode(trimmed);
    }
  } catch {
    // never break scoring
  }
}
