/**
 * tools/benchmarkLoader.ts
 *
 * Loads benchmark product files from the benchmarks/ directory.
 *
 * Handles two file shapes:
 *   - Single object  { name, ingredients, expected, ... }
 *   - Array of objects  [{ name, ... }, ...]
 *
 * Returns a flat list of { product, file } pairs ready for the runner.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import type { BenchmarkProduct } from "./benchmarkTypes";

export interface LoadedBenchmark {
  readonly product: BenchmarkProduct;
  readonly file: string; // relative path from project root
}

/**
 * Recursively walks a directory and returns all .json file paths.
 */
function collectJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectJsonFiles(full));
    } else if (extname(entry) === ".json") {
      results.push(full);
    }
  }
  return results;
}

/**
 * Loads all benchmark products from the given root directory.
 *
 * @param benchmarksDir - Absolute path to the benchmarks/ folder.
 * @param filter        - Optional substring filter on file path.
 * @returns Flat array of { product, file } pairs.
 */
export function loadBenchmarks(
  benchmarksDir: string,
  filter?: string
): LoadedBenchmark[] {
  const files = collectJsonFiles(benchmarksDir);
  const results: LoadedBenchmark[] = [];

  for (const filePath of files) {
    // Normalize to forward-slash relative path for display
    const relPath = filePath
      .replace(/\\/g, "/")
      .replace(/^.*?benchmarks\//, "benchmarks/");

    if (filter && !relPath.includes(filter)) continue;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.warn(`[benchmark-loader] Could not parse ${relPath}: ${e}`);
      continue;
    }

    const entries: unknown[] = Array.isArray(raw) ? raw : [raw];

    for (const entry of entries) {
      if (!isValidBenchmarkProduct(entry)) {
        console.warn(
          `[benchmark-loader] Skipping invalid entry in ${relPath}: missing name/ingredients/expected`
        );
        continue;
      }
      results.push({ product: entry as BenchmarkProduct, file: relPath });
    }
  }

  return results;
}

function isValidBenchmarkProduct(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["name"] === "string" &&
    (Array.isArray(obj["ingredients"]) || typeof obj["ingredients"] === "string") &&
    typeof obj["expected"] === "object" &&
    obj["expected"] !== null
  );
}
