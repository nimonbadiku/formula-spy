/**
 * Browser bundle stub — real I/O lives in unknownLogStore.ts (Node / Vite middleware).
 */

export const PROJECT_ROOT = "";
export const UNKNOWN_LOG_PATH = "";

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

export function loadExistingKeys(): Set<string> {
  return new Set();
}

export function appendUniqueNames(): number {
  return 0;
}
