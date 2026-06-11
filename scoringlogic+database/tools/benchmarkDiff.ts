/**
 * tools/benchmarkDiff.ts
 *
 * Benchmark drift detector for the human calibration phase.
 *
 * Runs all benchmarks and compares scores against a saved baseline snapshot.
 * Reports any product whose score changed by more than the drift threshold.
 * Saves a new baseline when run with --update-baseline.
 *
 * Usage:
 *   tsx tools/benchmarkDiff.ts                    # compare against saved baseline
 *   tsx tools/benchmarkDiff.ts --update-baseline  # save current scores as new baseline
 *   tsx tools/benchmarkDiff.ts --threshold 5      # custom drift threshold (default: 3)
 *   tsx tools/benchmarkDiff.ts --verbose           # show all products, not just drifted
 *
 * Exit codes:
 *   0 — no drift detected (or baseline updated successfully)
 *   1 — drift detected above threshold
 *   2 — no baseline exists (run with --update-baseline first)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { loadBenchmarks } from "./benchmarkLoader";
import { runAllBenchmarks } from "./benchmarkRunner";
import type { BenchmarkResult } from "./benchmarkTypes";

// ─── ANSI COLOURS ─────────────────────────────────────────────────────────────

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function green(s: string)  { return `${GREEN}${s}${RESET}`; }
function red(s: string)    { return `${RED}${s}${RESET}`; }
function yellow(s: string) { return `${YELLOW}${s}${RESET}`; }
function cyan(s: string)   { return `${CYAN}${s}${RESET}`; }
function dim(s: string)    { return `${DIM}${s}${RESET}`; }
function bold(s: string)   { return `${BOLD}${s}${RESET}`; }

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface BaselineEntry {
  readonly name: string;
  readonly file: string;
  readonly score: number;
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
}

interface BaselineSnapshot {
  readonly createdAt: string;
  readonly engineVersion: string;
  readonly totalProducts: number;
  readonly entries: readonly BaselineEntry[];
}

interface DriftEntry {
  readonly name: string;
  readonly file: string;
  readonly baselineScore: number;
  readonly currentScore: number;
  readonly delta: number;
  readonly resolvedCountChanged: boolean;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULT_DRIFT_THRESHOLD = 3.0;
const BASELINE_FILENAME = "benchmark-baseline.json";

// ─── PATHS ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const DB_PATH        = path.join(PROJECT_ROOT, "database", "ingredients.json");
const BASELINE_PATH  = path.join(PROJECT_ROOT, BASELINE_FILENAME);

// ─── BASELINE I/O ─────────────────────────────────────────────────────────────

function loadBaseline(): BaselineSnapshot | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as BaselineSnapshot;
  } catch {
    return null;
  }
}

function saveBaseline(results: BenchmarkResult[], database: any): void {
  const entries: BaselineEntry[] = results.map(r => ({
    name: r.name,
    file: r.file,
    score: r.formulationScore,
    resolvedCount: r.resolvedCount,
    unresolvedCount: r.unresolvedCount,
  }));

  const snapshot: BaselineSnapshot = {
    createdAt: new Date().toISOString(),
    engineVersion: database.version ?? "unknown",
    totalProducts: entries.length,
    entries,
  };

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(green(`✓ Baseline saved: ${BASELINE_PATH}`));
  console.log(dim(`  ${entries.length} products  |  engine v${snapshot.engineVersion}  |  ${snapshot.createdAt}`));
}

// ─── DIFF LOGIC ───────────────────────────────────────────────────────────────

function computeDiff(
  baseline: BaselineSnapshot,
  current: BenchmarkResult[],
  threshold: number
): { drifted: DriftEntry[]; newProducts: string[]; removedProducts: string[] } {
  const baselineMap = new Map<string, BaselineEntry>(
    baseline.entries.map(e => [`${e.file}::${e.name}`, e])
  );
  const currentMap = new Map<string, BenchmarkResult>(
    current.map(r => [`${r.file}::${r.name}`, r])
  );

  const drifted: DriftEntry[] = [];
  const newProducts: string[] = [];
  const removedProducts: string[] = [];

  // Check current products against baseline
  for (const [key, result] of currentMap) {
    const base = baselineMap.get(key);
    if (!base) {
      newProducts.push(result.name);
      continue;
    }

    const delta = result.formulationScore - base.score;
    const resolvedCountChanged =
      result.resolvedCount !== base.resolvedCount ||
      result.unresolvedCount !== base.unresolvedCount;

    if (Math.abs(delta) >= threshold) {
      drifted.push({
        name: result.name,
        file: result.file,
        baselineScore: base.score,
        currentScore: result.formulationScore,
        delta,
        resolvedCountChanged,
      });
    }
  }

  // Check for removed products
  for (const [key, base] of baselineMap) {
    if (!currentMap.has(key)) {
      removedProducts.push(base.name);
    }
  }

  // Sort drifted by absolute delta descending
  drifted.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { drifted, newProducts, removedProducts };
}

// ─── REPORTER ─────────────────────────────────────────────────────────────────

function printDriftReport(
  diff: ReturnType<typeof computeDiff>,
  current: BenchmarkResult[],
  baseline: BaselineSnapshot,
  threshold: number,
  verbose: boolean
): void {
  const { drifted, newProducts, removedProducts } = diff;

  if (newProducts.length > 0) {
    console.log(`\n${yellow("NEW")} products (not in baseline): ${newProducts.length}`);
    for (const name of newProducts) {
      console.log(`  ${yellow("+")} ${name}`);
    }
  }

  if (removedProducts.length > 0) {
    console.log(`\n${yellow("REMOVED")} products (in baseline, not in current): ${removedProducts.length}`);
    for (const name of removedProducts) {
      console.log(`  ${yellow("-")} ${name}`);
    }
  }

  if (drifted.length > 0) {
    console.log(`\n${bold(red("DRIFTED"))} products (|delta| ≥ ${threshold}): ${drifted.length}`);
    for (const d of drifted) {
      const deltaStr = d.delta > 0
        ? red(`+${d.delta.toFixed(1)}`)
        : red(`${d.delta.toFixed(1)}`);
      const resolvedNote = d.resolvedCountChanged ? yellow(" [resolved count changed]") : "";
      console.log(
        `  ${red("✗")} ${bold(d.name)}\n` +
        `    baseline=${d.baselineScore.toFixed(1)}  current=${d.currentScore.toFixed(1)}  delta=${deltaStr}${resolvedNote}\n` +
        `    ${dim(d.file)}`
      );
    }
  } else {
    console.log(green("\n✓ No score drift detected above threshold.\n"));
  }

  if (verbose && drifted.length === 0) {
    console.log(`\n${dim("All products (no drift):")} `);
    for (const r of current) {
      const key = `${r.file}::${r.name}`;
      const base = baseline.entries.find(e => `${e.file}::${e.name}` === key);
      const delta = base ? r.formulationScore - base.score : 0;
      const deltaStr = delta === 0 ? dim("±0.0") : delta > 0 ? green(`+${delta.toFixed(1)}`) : yellow(`${delta.toFixed(1)}`);
      console.log(`  ${dim("·")} ${dim(r.name.padEnd(55))} ${r.formulationScore.toFixed(1)}  ${deltaStr}`);
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes("--update-baseline");
  const verbose = args.includes("--verbose");
  const thresholdIdx = args.indexOf("--threshold");
  const threshold = thresholdIdx !== -1 ? parseFloat(args[thresholdIdx + 1]) : DEFAULT_DRIFT_THRESHOLD;

  console.log(bold("\nProduct INCI Analyzer — Benchmark Diff"));
  console.log(dim("─".repeat(60)));

  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));

  const benchmarks = loadBenchmarks(BENCHMARKS_DIR);
  console.log(dim(`Loaded: ${benchmarks.length} benchmark products`));

  // Run all benchmarks
  const results = runAllBenchmarks(benchmarks, database);
  const passed = results.filter(r => r.pass).length;
  console.log(dim(`Benchmark run: ${passed}/${results.length} passed`));

  // Update baseline mode
  if (updateBaseline) {
    console.log(dim("\nSaving new baseline..."));
    saveBaseline(results, database);
    console.log(green("\n✓ Baseline updated successfully.\n"));
    process.exit(0);
  }

  // Compare mode
  const baseline = loadBaseline();
  if (baseline === null) {
    console.log(yellow("\n⚠ No baseline found."));
    console.log(dim(`  Run with --update-baseline to create one: tsx tools/benchmarkDiff.ts --update-baseline`));
    console.log(dim(`  Expected location: ${BASELINE_PATH}\n`));
    process.exit(2);
    return; // unreachable but satisfies TS narrowing
  }

  console.log(dim(`Baseline: ${baseline.totalProducts} products  |  engine v${baseline.engineVersion}  |  ${baseline.createdAt}`));
  console.log(dim(`Drift threshold: ±${threshold} points`));

  const diff = computeDiff(baseline, results, threshold);
  printDriftReport(diff, results, baseline, threshold, verbose);

  // Summary
  const totalDrifted = diff.drifted.length;
  const totalNew = diff.newProducts.length;
  const totalRemoved = diff.removedProducts.length;

  console.log("\n" + "─".repeat(60));
  console.log(bold("Benchmark Diff Summary"));
  console.log("─".repeat(60));
  console.log(`  Baseline products:  ${baseline.totalProducts}`);
  console.log(`  Current products:   ${results.length}`);
  if (totalNew > 0)     console.log(`  ${yellow("New:")}              ${totalNew}`);
  if (totalRemoved > 0) console.log(`  ${yellow("Removed:")}          ${totalRemoved}`);
  if (totalDrifted > 0) {
    console.log(`  ${red("Drifted:")}          ${totalDrifted}  (|delta| ≥ ${threshold})`);
  } else {
    console.log(`  ${green("Drifted:")}          0`);
  }
  console.log("─".repeat(60));

  if (totalDrifted === 0 && totalNew === 0 && totalRemoved === 0) {
    console.log(green("\n✓ No benchmark drift detected. Engine output is stable.\n"));
  } else if (totalDrifted > 0) {
    console.log(red(`\n✗ ${totalDrifted} product(s) drifted beyond ±${threshold} points.\n`));
    console.log(dim("  Score drift indicates a scoring constant or heuristic changed."));
    console.log(dim("  Investigate the drifted products before accepting the change.\n"));
  } else {
    console.log(yellow(`\n⚠ Benchmark set changed (${totalNew} new, ${totalRemoved} removed). Update baseline.\n`));
  }

  process.exit(totalDrifted > 0 ? 1 : 0);
}

main();
