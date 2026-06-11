/**
 * tools/runBenchmarks.ts
 *
 * CLI entry point for the benchmark runner.
 *
 * Usage:
 *   node --experimental-strip-types tools/runBenchmarks.ts
 *   node --experimental-strip-types tools/runBenchmarks.ts --filter shampoos
 *   node --experimental-strip-types tools/runBenchmarks.ts --filter synthetic
 *   node --experimental-strip-types tools/runBenchmarks.ts --verbose
 *   node --experimental-strip-types tools/runBenchmarks.ts --filter conditioners --verbose
 *
 * Flags:
 *   --filter <substr>   Only run benchmarks whose file path contains <substr>.
 *   --verbose           Print per-field pass/fail details for every product.
 *   --fail-only         Only print failing products (useful for CI).
 *
 * Exit codes:
 *   0 — all benchmarks passed (or no expected fields declared)
 *   1 — one or more benchmarks failed
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { loadBenchmarks } from "./benchmarkLoader";
import { runAllBenchmarks } from "./benchmarkRunner";
import type { BenchmarkResult, FieldResult } from "./benchmarkTypes";

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

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

const filterArg  = getFlag("--filter");
const verbose    = hasFlag("--verbose");
const failOnly   = hasFlag("--fail-only");

// ─── PATHS ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const DB_PATH        = path.join(PROJECT_ROOT, "database", "ingredients.v3.json");

// ─── LOAD DATABASE ────────────────────────────────────────────────────────────

function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch (e) {
    console.error(red(`✗ Failed to parse database: ${e}`));
    process.exit(1);
  }
}

// ─── REPORTER ─────────────────────────────────────────────────────────────────

function printFieldResults(fieldResults: readonly FieldResult[]): void {
  for (const fr of fieldResults) {
    const icon = fr.pass ? green("  ✓") : red("  ✗");
    const label = fr.field.padEnd(18);
    if (fr.pass) {
      console.log(`${icon} ${dim(label)} expected ${cyan(fr.expected)} → actual ${cyan(fr.actual)}`);
    } else {
      console.log(`${icon} ${label} expected ${cyan(fr.expected)} → actual ${red(fr.actual)}`);
    }
  }
}

/** Threshold below which we warn about low resolution confidence. */
const LOW_RESOLUTION_THRESHOLD = 0.90;
/** Minimum ingredient count before the threshold warning applies. */
const LOW_RESOLUTION_MIN_INGREDIENTS = 5;

function printResult(result: BenchmarkResult, showVerbose: boolean): void {
  const icon = result.pass ? green("✓") : red("✗");
  const name = result.pass ? dim(result.name) : bold(result.name);
  const score = `score=${result.formulationScore.toFixed(1)}`;
  const total = result.resolvedCount + result.unresolvedCount;
  const resolved = `resolved=${result.resolvedCount}/${total}`;

  if (result.error) {
    console.log(`${red("✗")} ${bold(result.name)}`);
    console.log(`  ${red("ERROR:")} ${result.error}`);
    console.log(`  ${dim(result.file)}`);
    return;
  }

  console.log(`${icon} ${name}  ${dim(score + "  " + resolved)}`);

  // ── Resolution confidence warning ────────────────────────────────────────
  if (total >= LOW_RESOLUTION_MIN_INGREDIENTS) {
    const rate = total > 0 ? result.resolvedCount / total : 1;
    if (rate < LOW_RESOLUTION_THRESHOLD) {
      const pct = (rate * 100).toFixed(0);
      console.log(
        `  ${yellow("⚠")} ${yellow(`Low resolution confidence  ${pct}% resolved (${result.resolvedCount}/${total})`)}`
      );
    }
  }

  if (showVerbose && result.fieldResults.length > 0) {
    printFieldResults(result.fieldResults);
  } else if (!result.pass && result.fieldResults.length > 0) {
    // Always show failing fields even without --verbose
    const failing = result.fieldResults.filter((f) => !f.pass);
    for (const fr of failing) {
      console.log(
        `  ${red("✗")} ${fr.field.padEnd(18)} expected ${cyan(fr.expected)} → actual ${red(fr.actual)}`
      );
    }
  }
}

function groupByFile(results: BenchmarkResult[]): Map<string, BenchmarkResult[]> {
  const map = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const group = map.get(r.file) ?? [];
    group.push(r);
    map.set(r.file, group);
  }
  return map;
}

function printReport(results: BenchmarkResult[]): void {
  const total   = results.length;
  const passed  = results.filter((r) => r.pass).length;
  const failed  = total - passed;
  const errored = results.filter((r) => !!r.error).length;

  const grouped = groupByFile(results);

  for (const [file, group] of grouped) {
    const filePass = group.every((r) => r.pass);
    const fileIcon = filePass ? green("●") : red("●");
    console.log(`\n${fileIcon} ${cyan(file)}`);

    for (const result of group) {
      if (failOnly && result.pass) continue;
      printResult(result, verbose);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log(bold("Benchmark Summary"));
  console.log("─".repeat(60));
  console.log(`  Total:   ${total}`);
  console.log(`  ${green("Passed:")}  ${passed}`);
  if (failed > 0) {
    console.log(`  ${red("Failed:")}  ${failed}`);
  }
  if (errored > 0) {
    console.log(`  ${yellow("Errors:")}  ${errored}`);
  }

  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";
  const pctColored = failed === 0 ? green(`${pct}%`) : red(`${pct}%`);
  console.log(`  Pass rate: ${pctColored}`);
  console.log("─".repeat(60));

  if (failed === 0 && errored === 0) {
    console.log(green("\n✓ All benchmarks passed.\n"));
  } else {
    console.log(red(`\n✗ ${failed} benchmark(s) failed.\n`));
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(bold("\nProduct INCI Analyzer — Benchmark Runner"));
  console.log(dim("─".repeat(60)));

  if (filterArg) {
    console.log(dim(`Filter: ${filterArg}`));
  }

  // Load database
  const database = loadDatabase();
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));

  // Load benchmarks
  const benchmarks = loadBenchmarks(BENCHMARKS_DIR, filterArg);

  if (benchmarks.length === 0) {
    console.log(yellow("\nNo benchmark products found."));
    if (filterArg) {
      console.log(dim(`(filter: "${filterArg}" matched nothing)`));
    }
    process.exit(0);
  }

  console.log(dim(`Loaded: ${benchmarks.length} benchmark product(s)`));

  // Run
  const results = runAllBenchmarks(benchmarks, database);

  // Report
  printReport(results);

  // Exit code
  const anyFailed = results.some((r) => !r.pass);
  process.exit(anyFailed ? 1 : 0);
}

main();
