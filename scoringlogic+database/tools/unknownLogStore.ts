/**
 * tools/unknownLogStore.ts
 *
 * Node-only file I/O for unknown_ingredients.txt.
 * Imported by the Vite dev middleware and by logUnknowns.ts in Node only.
 * Do not import this module from browser-facing code paths.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const UNKNOWN_LOG_PATH = path.join(PROJECT_ROOT, "unknown_ingredients.txt");

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

export function loadExistingKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const key = normalizeKey(line);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Appends names not already present in the log file (case-insensitive).
 * @returns Number of lines appended.
 */
export function appendUniqueNames(
  filePath: string,
  names: readonly string[]
): number {
  const persisted = fs.existsSync(filePath)
    ? loadExistingKeys(fs.readFileSync(filePath, "utf8"))
    : new Set<string>();

  const toAppend: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (persisted.has(key)) continue;
    persisted.add(key);
    toAppend.push(trimmed);
  }

  if (toAppend.length === 0) return 0;

  fs.appendFileSync(filePath, toAppend.map((n) => `${n}\n`).join(""), "utf8");
  return toAppend.length;
}
