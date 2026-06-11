/**
 * tools/benchmarkRunner.ts
 *
 * Runs the analysis engine against a loaded benchmark product and compares
 * the output against the expected fields declared in the benchmark file.
 *
 * Responsibilities:
 *   - Build a neutral HairProfile from the product's category/productType.
 *   - Join ingredients array into a raw INCI string.
 *   - Call analyze() from the engine.
 *   - Compare subscores and formulation score against expected qualitative levels.
 *   - Check for expected tags (archetype ids) and warning label substrings.
 *   - Return a structured BenchmarkResult — no console output here.
 *
 * Constraints:
 *   - Pure logic: no I/O, no side effects.
 *   - Deterministic: fixed timestamp injected so results never vary by time.
 */

import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase, ProductType } from "../engine/index";
import type {
  BenchmarkProduct,
  BenchmarkResult,
  FieldResult,
  QualLevel,
} from "./benchmarkTypes";
import type { LoadedBenchmark } from "./benchmarkLoader";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/**
 * Qualitative level → numeric subscore range [min, max].
 * Subscores are in [0, 100].
 *
 * These bands are intentionally wide to avoid brittle exact-match failures.
 * The goal is to catch gross scoring anomalies, not micro-differences.
 */
const QUAL_RANGES: Record<QualLevel, readonly [number, number]> = {
  very_low: [0, 20],
  low: [0, 35],
  medium: [25, 65],
  high: [55, 100],
  very_high: [75, 100],
};

/**
 * The complete set of expectation keys that this runner knows how to validate.
 *
 * Any key present in a benchmark's `expected` object that is NOT in this set
 * will produce a loud UNSUPPORTED_KEY failure rather than being silently ignored.
 *
 * To add support for a new key:
 *   1. Add it here.
 *   2. Add the corresponding validation logic in runBenchmark().
 */
const SUPPORTED_EXPECTATION_KEYS = new Set<string>([
  // Qualitative subscore checks (mapped to engine subscores)
  "cleansing",
  "buildup",
  "moisture",
  "protein",
  "smoothing",
  "repairSupport",
  "lightweightFeel",
  // Numeric range check for overall formulation score
  "overall",
  // Tag/archetype presence checks
  "tags",
  // Warning label substring checks
  "warnings",
]);

// ─── PRODUCT TYPE MAPPING ─────────────────────────────────────────────────────

/**
 * Maps benchmark category/product_type strings to engine ProductType values.
 * Falls back to "rinse_out_conditioner" for unknown types.
 */
function resolveProductType(product: BenchmarkProduct): ProductType {
  const raw = (
    product.productType ??
    product.product_type ??
    product.category ??
    ""
  ).toLowerCase();

  if (raw.includes("shampoo") || raw.includes("clarif")) return "shampoo";
  if (raw.includes("co_wash") || raw.includes("co-wash")) return "co_wash";
  if (raw.includes("deep") || raw.includes("mask") || raw.includes("treatment")) return "deep_conditioner_mask";
  if (raw.includes("leave") || raw.includes("leave_in") || raw.includes("leave-in")) return "leave_in_conditioner";
  if (raw.includes("oil") || raw.includes("serum")) return "hair_oil_serum";
  if (raw.includes("styl") || raw.includes("gel") || raw.includes("cream") || raw.includes("mousse")) return "styling_product";
  if (raw.includes("condition")) return "rinse_out_conditioner";
  return "rinse_out_conditioner";
}

/**
 * Normalizes benchmark profile field values to engine HairProfile values.
 * Benchmark files may use "medium" as an alias for "med" (porosity/density).
 * All other values are passed through unchanged.
 */
function normalizePorosity(v: string | undefined): "low" | "med" | "high" {
  if (v === "low") return "low";
  if (v === "high") return "high";
  return "med"; // "medium", "med", or undefined → "med"
}

function normalizeDensity(v: string | undefined): "fine" | "med" | "coarse" {
  if (v === "fine") return "fine";
  if (v === "coarse") return "coarse";
  return "med"; // "medium", "med", or undefined → "med"
}

function normalizeCondition(v: string | undefined): "damaged" | "normal" | "healthy" {
  if (v === "damaged") return "damaged";
  if (v === "healthy") return "healthy";
  return "normal";
}

function normalizeOiliness(v: string | undefined): "dry" | "normal" | "oily" {
  if (v === "dry") return "dry";
  if (v === "oily") return "oily";
  return "normal";
}

/**
 * Builds a neutral mid-range HairProfile for benchmark runs.
 * Using neutral values avoids profile-specific scoring skew.
 */
function buildNeutralProfile(productType: ProductType): HairProfile {
  return {
    porosity: "med",
    density: "med",
    condition: "normal",
    oiliness: "normal",
    productType,
  };
}

/**
 * Builds a HairProfile from a benchmark's profile override field.
 * Falls back to neutral values for any missing fields.
 * Normalizes "medium" → "med" for porosity and density.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
function buildProfileFromBenchmark(
  productType: ProductType,
  benchmarkProfile: NonNullable<import("./benchmarkTypes").BenchmarkProduct["profile"]>
): HairProfile {
  // Resolve optional extended fields first, then spread into the final object.
  const curlPatternRaw = benchmarkProfile.curlPattern?.toLowerCase();
  const curlPattern: "straight" | "wavy" | "curly" | "coily" | undefined =
    curlPatternRaw === "straight" || curlPatternRaw === "wavy" ||
    curlPatternRaw === "curly" || curlPatternRaw === "coily"
      ? (curlPatternRaw as "straight" | "wavy" | "curly" | "coily")
      : undefined;

  return {
    porosity: normalizePorosity(benchmarkProfile.porosity),
    density: normalizeDensity(benchmarkProfile.density),
    condition: normalizeCondition(benchmarkProfile.condition),
    oiliness: normalizeOiliness(benchmarkProfile.oiliness),
    productType,
    ...(curlPattern !== undefined ? { curlPattern } : {}),
    ...(benchmarkProfile.scalpSensitivity !== undefined
      ? { scalpSensitivity: benchmarkProfile.scalpSensitivity } : {}),
    ...(benchmarkProfile.proteinSensitivity !== undefined
      ? { proteinSensitivity: benchmarkProfile.proteinSensitivity } : {}),
    ...(benchmarkProfile.siliconeSensitivity !== undefined
      ? { siliconeSensitivity: benchmarkProfile.siliconeSensitivity } : {}),
    ...(benchmarkProfile.chemicallyTreated !== undefined
      ? { chemicallyTreated: benchmarkProfile.chemicallyTreated } : {}),
  };
}

// ─── INCI STRING ──────────────────────────────────────────────────────────────

function toInciString(ingredients: readonly string[] | string): string {
  if (typeof ingredients === "string") return ingredients;
  return ingredients.join(", ");
}

// ─── COMPARISON UTILITIES ─────────────────────────────────────────────────────

/**
 * Converts a numeric subscore to a qualitative label for display.
 */
function scoreToQualLabel(score: number): QualLevel {
  if (score <= 20) return "very_low";
  if (score <= 35) return "low";
  if (score <= 55) return "medium";
  if (score <= 75) return "high";
  return "very_high";
}

/**
 * Checks whether a numeric score falls within the expected qualitative range.
 */
function checkQualLevel(score: number, expected: QualLevel): boolean {
  const [min, max] = QUAL_RANGES[expected];
  return score >= min && score <= max;
}

/**
 * Checks whether a numeric score falls within an explicit [min, max] range.
 */
function checkNumericRange(score: number, range: readonly [number, number]): boolean {
  return score >= range[0] && score <= range[1];
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────

/**
 * Runs a single benchmark product through the engine and returns a result.
 *
 * @param loaded   - The loaded benchmark (product + file path).
 * @param database - The loaded ingredient database.
 * @returns        - A BenchmarkResult with pass/fail per field.
 */
export function runBenchmark(
  loaded: LoadedBenchmark,
  database: IngredientDatabase
): BenchmarkResult {
  const { product, file } = loaded;
  const fieldResults: FieldResult[] = [];

  let formulationScore = 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;

  try {
    const productType = resolveProductType(product);
    // Use the benchmark's profile override when present; fall back to neutral.
    const profile = product.profile
      ? buildProfileFromBenchmark(productType, product.profile)
      : buildNeutralProfile(productType);
    const inci = toInciString(product.ingredients);

    const result = analyze(inci, profile, database, {
      timestamp: FIXED_TIMESTAMP,
    });

    formulationScore = result.summary.formulationScore;
    resolvedCount = result.summary.resolvedCount;
    unresolvedCount = result.summary.unresolvedCount;

    const { subscores } = result.formulation;
    const expected = product.expected;

    // ── Unsupported key detection ────────────────────────────────────────────
    // Every key declared in `expected` must be in SUPPORTED_EXPECTATION_KEYS.
    // Unknown keys are never silently ignored — they produce an explicit failure.

    for (const key of Object.keys(expected as Record<string, unknown>)) {
      if (!SUPPORTED_EXPECTATION_KEYS.has(key)) {
        fieldResults.push({
          field: key,
          expected: "supported expectation key",
          actual: `UNSUPPORTED KEY — "${key}" is not validated by this runner`,
          pass: false,
        });
      }
    }

    // ── Qualitative subscore checks ──────────────────────────────────────────

    const qualChecks: Array<{ field: string; score: number; level: QualLevel | undefined }> = [
      { field: "cleansing",       score: subscores.cleansing,      level: expected.cleansing },
      { field: "buildup",         score: subscores.buildup,        level: expected.buildup },
      { field: "moisture",        score: subscores.moisture,       level: expected.moisture },
      { field: "protein",         score: subscores.protein,        level: expected.protein },
      { field: "smoothing",       score: subscores.smoothing,      level: expected.smoothing },
      { field: "repairSupport",   score: subscores.repairSupport,  level: expected.repairSupport },
      { field: "lightweightFeel", score: subscores.lightweightFeel, level: expected.lightweightFeel },
    ];

    for (const { field, score, level } of qualChecks) {
      if (level === undefined) continue; // not declared — skip
      const pass = checkQualLevel(score, level);
      fieldResults.push({
        field,
        expected: level,
        actual: `${scoreToQualLabel(score)} (${score.toFixed(1)})`,
        pass,
      });
    }

    // ── Overall score range check ────────────────────────────────────────────

    if (expected.overall !== undefined) {
      const pass = checkNumericRange(formulationScore, expected.overall);
      fieldResults.push({
        field: "overall",
        expected: `[${expected.overall[0]}, ${expected.overall[1]}]`,
        actual: formulationScore.toFixed(1),
        pass,
      });
    }

    // ── Tag checks (archetype ids) ───────────────────────────────────────────

    if (expected.tags && expected.tags.length > 0) {
      const archetypeIds = new Set(
        result.formulation.formulationArchetypes.map((a) => a.id.toLowerCase())
      );
      const intentIds = new Set(
        result.formulation.formulationIntent.map((i) => i.id.toLowerCase())
      );
      const activeIds = new Set(
        result.formulation.activeSystems.map((s) => s.id.toLowerCase())
      );

      for (const tag of expected.tags) {
        const t = tag.toLowerCase();
        const pass =
          archetypeIds.has(t) ||
          intentIds.has(t) ||
          activeIds.has(t) ||
          // also check label substrings for flexibility
          [...archetypeIds, ...intentIds, ...activeIds].some((id) =>
            id.includes(t) || t.includes(id)
          );
        fieldResults.push({
          field: `tag:${tag}`,
          expected: "present",
          actual: pass ? "found" : "not found",
          pass,
        });
      }
    }

    // ── Warning checks (label substring match) ───────────────────────────────

    if (expected.warnings && expected.warnings.length > 0) {
      const warningIds = result.formulation.heuristicWarnings.map((w) =>
        w.id.toLowerCase()
      );
      const warningLabels = result.formulation.heuristicWarnings.map((w) =>
        w.label.toLowerCase()
      );
      const warningReasons = result.formulation.heuristicWarnings.map((w) =>
        w.reason.toLowerCase()
      );

      for (const warnSubstr of expected.warnings) {
        const needle = warnSubstr.toLowerCase();
        const pass =
          // Check id exact match first (most reliable — probes use id strings)
          warningIds.some((id) => id === needle) ||
          // Then check id substring match
          warningIds.some((id) => id.includes(needle) || needle.includes(id)) ||
          // Then check label substring match
          warningLabels.some((l) => l.includes(needle)) ||
          // Then check reason substring match
          warningReasons.some((r) => r.includes(needle));
        fieldResults.push({
          field: `warning:${warnSubstr}`,
          expected: "present",
          actual: pass ? "found" : "not found",
          pass,
        });
      }
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: product.name,
      file,
      pass: false,
      formulationScore: 0,
      resolvedCount: 0,
      unresolvedCount: 0,
      fieldResults: [],
      error: message,
    };
  }

  const pass = fieldResults.length === 0 || fieldResults.every((r) => r.pass);

  return {
    name: product.name,
    file,
    pass,
    formulationScore,
    resolvedCount,
    unresolvedCount,
    fieldResults,
  };
}

/**
 * Runs all loaded benchmarks and returns results.
 */
export function runAllBenchmarks(
  benchmarks: LoadedBenchmark[],
  database: IngredientDatabase
): BenchmarkResult[] {
  return benchmarks.map((b) => runBenchmark(b, database));
}
