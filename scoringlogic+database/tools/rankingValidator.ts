/**
 * tools/rankingValidator.ts
 *
 * Ranking validation tool for the human calibration phase.
 *
 * Validates that clearly superior products rank above clearly inferior ones
 * for specific hair profiles. Each ranking pair defines:
 *   - A "better" product (expected to score higher)
 *   - A "worse" product (expected to score lower)
 *   - A profile under which the ranking should hold
 *   - A minimum score gap (default: 3 points)
 *
 * Usage:
 *   tsx tools/rankingValidator.ts
 *   tsx tools/rankingValidator.ts --verbose
 *   tsx tools/rankingValidator.ts --min-gap 5
 *
 * Exit codes:
 *   0 — all ranking pairs validated correctly
 *   1 — one or more ranking inversions detected
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase } from "../engine/index";

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

interface RankingPair {
  readonly id: string;
  readonly description: string;
  readonly profile: HairProfile;
  readonly better: {
    readonly name: string;
    readonly productType: string;
    readonly ingredients: readonly string[];
  };
  readonly worse: {
    readonly name: string;
    readonly productType: string;
    readonly ingredients: readonly string[];
  };
  /** Minimum score gap required: better.score - worse.score >= minGap */
  readonly minGap: number;
  /** Human-readable rationale for why better > worse */
  readonly rationale: string;
}

interface RankingResult {
  readonly id: string;
  readonly description: string;
  readonly betterName: string;
  readonly betterScore: number;
  readonly worseName: string;
  readonly worseScore: number;
  readonly gap: number;
  readonly minGap: number;
  readonly pass: boolean;
  readonly rationale: string;
}

// ─── FIXED TIMESTAMP ──────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// ─── RANKING PAIRS ────────────────────────────────────────────────────────────

/**
 * Canonical ranking pairs for human calibration validation.
 *
 * Each pair is designed so that the "better" product is genuinely superior
 * for the given profile according to cosmetic chemistry principles.
 * The minimum gap is set conservatively (3–5 points) to avoid brittleness.
 */
const RANKING_PAIRS: RankingPair[] = [
  // ── Pair 1: Sulfate-free vs. dual-sulfate shampoo for curly/damaged hair ──
  {
    id: "rank_sulfate_free_vs_sls_curly_damaged",
    description: "Sulfate-free shampoo ranks above dual-sulfate shampoo for curly/damaged hair",
    profile: {
      porosity: "high",
      density: "coarse",
      condition: "damaged",
      oiliness: "dry",
      productType: "shampoo",
      curlPattern: "curly",
    },
    better: {
      name: "Gentle Sulfate-Free Shampoo",
      productType: "shampoo",
      ingredients: [
        "Water", "Cocamidopropyl Betaine", "Decyl Glucoside",
        "Glycerin", "Panthenol", "Citric Acid", "Sodium Benzoate",
      ],
    },
    worse: {
      name: "Harsh Dual-Sulfate Shampoo",
      productType: "shampoo",
      ingredients: [
        "Water", "Sodium Lauryl Sulfate", "Sodium Laureth Sulfate",
        "Glycerin", "Panthenol", "Citric Acid", "Sodium Benzoate",
      ],
    },
    minGap: 3,
    rationale: "Curly + damaged + dry profile: CURLY_HARSH_PENALTY=0.90 + STRONG_DAMAGED_PENALTY=0.82 + STRONG_DRY_SCALP_PENALTY=0.78 compound on both sulfates. Sulfate-free formula avoids all these penalties. Both formulas have same ingredient count for fair comparison.",
  },

  // ── Pair 2: Protein-rich mask vs. protein-free mask for damaged hair ──────
  {
    id: "rank_protein_mask_vs_plain_mask_damaged",
    description: "Protein-rich mask ranks above protein-free mask for damaged hair",
    profile: {
      porosity: "high",
      density: "med",
      condition: "damaged",
      oiliness: "dry",
      productType: "deep_conditioner_mask",
    },
    better: {
      name: "Protein Repair Mask",
      productType: "deep_conditioner_mask",
      ingredients: [
        "Water", "Hydrolyzed Keratin", "Hydrolyzed Wheat Protein",
        "Glycerin", "Panthenol", "Cetyl Alcohol",
        "Behentrimonium Chloride", "Citric Acid",
      ],
    },
    worse: {
      name: "Plain Moisture Mask",
      productType: "deep_conditioner_mask",
      ingredients: [
        "Water", "Glycerin", "Panthenol",
        "Cetyl Alcohol", "Behentrimonium Chloride",
        "Shea Butter", "Citric Acid",
      ],
    },
    minGap: 3,
    rationale: "Damaged hair profile activates DAMAGED_PROTEIN_BONUS=1.12 for protein ingredients; protein-rich mask benefits more than protein-free",
  },

  // ── Pair 3: Lightweight leave-in vs. heavy silicone leave-in for low porosity ──
  {
    id: "rank_lightweight_vs_heavy_low_porosity",
    description: "Lightweight leave-in ranks above heavy silicone leave-in for low-porosity hair",
    profile: {
      porosity: "low",
      density: "fine",
      condition: "normal",
      oiliness: "normal",
      productType: "leave_in_conditioner",
    },
    better: {
      name: "Lightweight Humectant Leave-In",
      productType: "leave_in_conditioner",
      ingredients: [
        "Water", "Glycerin", "Panthenol",
        "Aloe Vera", "Hydrolyzed Wheat Protein",
        "Citric Acid", "Phenoxyethanol",
      ],
    },
    worse: {
      name: "Heavy Silicone Leave-In",
      productType: "leave_in_conditioner",
      ingredients: [
        "Water", "Dimethicone", "Amodimethicone",
        "Bis-Aminopropyl Dimethicone", "Cetyl Alcohol",
        "Behentrimonium Chloride", "Phenoxyethanol",
      ],
    },
    minGap: 3,
    rationale: "Low-porosity profile activates BUILDUP_SENSITIVE_PENALTY=0.80 for heavy silicones; lightweight humectant formula avoids buildup penalties",
  },

  // ── Pair 4: Gentle co-wash vs. SLS co-wash for sensitive scalp ───────────
  {
    id: "rank_gentle_cowash_vs_sls_cowash_sensitive",
    description: "Gentle co-wash ranks above SLS co-wash for sensitive scalp",
    profile: {
      porosity: "med",
      density: "med",
      condition: "normal",
      oiliness: "normal",
      productType: "co_wash",
      scalpSensitivity: true,
    },
    better: {
      name: "Gentle Conditioning Co-Wash",
      productType: "co_wash",
      ingredients: [
        "Water", "Behentrimonium Methosulfate", "Cetyl Alcohol",
        "Glycerin", "Panthenol", "Aloe Vera",
        "Citric Acid", "Phenoxyethanol",
      ],
    },
    worse: {
      name: "SLS Co-Wash",
      productType: "co_wash",
      ingredients: [
        "Water", "Sodium Lauryl Sulfate", "Cocamidopropyl Betaine",
        "Glycerin", "Panthenol", "Citric Acid", "Phenoxyethanol",
      ],
    },
    minGap: 3,
    rationale: "scalpSensitivity=true + SLS in co_wash triggers harsh_cleanser_sensitive_profile warning and SENSITIVE_SCALP_IRRITANT_PENALTY; gentle formula avoids these",
  },

  // ── Pair 5: Bond repair product vs. basic conditioner for chemically treated ──
  {
    id: "rank_bond_repair_vs_basic_conditioner_chemical",
    description: "Bond repair product ranks above basic conditioner for chemically treated hair",
    profile: {
      porosity: "high",
      density: "med",
      condition: "damaged",
      oiliness: "normal",
      productType: "deep_conditioner_mask",
      chemicallyTreated: true,
    },
    better: {
      name: "Bond Repair Treatment",
      productType: "deep_conditioner_mask",
      ingredients: [
        "Water", "Bis-Aminopropyl Diglycol Dimaleate",
        "Hydrolyzed Keratin", "Glycerin", "Panthenol",
        "Cetyl Alcohol", "Behentrimonium Chloride", "Citric Acid",
      ],
    },
    worse: {
      name: "Basic Rinse-Out Conditioner",
      productType: "deep_conditioner_mask",
      ingredients: [
        "Water", "Cetyl Alcohol", "Behentrimonium Chloride",
        "Glycerin", "Fragrance", "Citric Acid",
        "Phenoxyethanol", "Sodium Benzoate",
      ],
    },
    minGap: 3,
    rationale: "chemicallyTreated=true activates CHEMICALLY_TREATED_REPAIR_BONUS=1.1 for protein/repair ingredients; bond repair formula has more qualifying ingredients",
  },

  // ── Pair 6: Clarifying shampoo vs. moisturizing shampoo for oily scalp ────
  {
    id: "rank_clarifying_vs_moisturizing_oily_scalp",
    description: "Clarifying shampoo ranks above moisturizing shampoo for oily scalp",
    profile: {
      porosity: "med",
      density: "med",
      condition: "normal",
      oiliness: "oily",
      productType: "shampoo",
    },
    better: {
      name: "Clarifying Sulfate Shampoo",
      productType: "shampoo",
      ingredients: [
        "Water", "Sodium Laureth Sulfate", "Cocamidopropyl Betaine",
        "Sodium Chloride", "Citric Acid",
        "Sodium Benzoate", "Tetrasodium EDTA",
      ],
    },
    worse: {
      name: "Heavy Moisturizing Shampoo",
      productType: "shampoo",
      ingredients: [
        "Water", "Cocamidopropyl Betaine", "Glycerin",
        "Shea Butter", "Dimethicone", "Panthenol",
        "Cetyl Alcohol", "Behentrimonium Chloride",
      ],
    },
    minGap: 3,
    rationale: "Oily scalp profile benefits from strong cleansing; clarifying shampoo has higher cleansing subscore while heavy moisturizing formula may trigger over-conditioning for oily profile",
  },

  // ── Pair 7: Silicone-free conditioner vs. silicone-heavy for silicone-avoiding ──
  {
    id: "rank_silicone_free_vs_silicone_heavy_avoiding",
    description: "Silicone-free conditioner ranks above silicone-heavy for silicone-avoiding profile",
    profile: {
      porosity: "low",
      density: "fine",
      condition: "normal",
      oiliness: "normal",
      productType: "rinse_out_conditioner",
      siliconeSensitivity: true,
    },
    better: {
      name: "Silicone-Free Conditioner",
      productType: "rinse_out_conditioner",
      ingredients: [
        "Water", "Behentrimonium Methosulfate", "Cetyl Alcohol",
        "Glycerin", "Panthenol", "Shea Butter",
        "Citric Acid", "Phenoxyethanol",
      ],
    },
    worse: {
      name: "Silicone-Heavy Conditioner",
      productType: "rinse_out_conditioner",
      ingredients: [
        "Water", "Dimethicone", "Amodimethicone",
        "Bis-Aminopropyl Dimethicone", "Cetyl Alcohol",
        "Glycerin", "Citric Acid", "Phenoxyethanol",
      ],
    },
    minGap: 3,
    rationale: "siliconeSensitivity=true activates BUILDUP_SENSITIVE_PENALTY=0.80 for each silicone; three silicones (Dimethicone, Amodimethicone, Bis-Aminopropyl Dimethicone) compound the penalty. Silicone-free formula avoids all penalties. high_buildup_risk warning fires for silicone-heavy.",
  },

  // ── Pair 8: Coily-optimized conditioner vs. generic conditioner for coily hair ──
  {
    id: "rank_coily_conditioner_vs_generic_coily",
    description: "Rich conditioning formula ranks above minimal formula for coily hair",
    profile: {
      porosity: "high",
      density: "coarse",
      condition: "normal",
      oiliness: "dry",
      productType: "rinse_out_conditioner",
      curlPattern: "coily",
    },
    better: {
      name: "Rich Coily Hair Conditioner",
      productType: "rinse_out_conditioner",
      ingredients: [
        "Water", "Behentrimonium Chloride", "Cetyl Alcohol",
        "Shea Butter", "Glycerin", "Panthenol",
        "Dimethicone", "Citric Acid",
      ],
    },
    worse: {
      name: "Minimal Conditioner",
      productType: "rinse_out_conditioner",
      ingredients: [
        "Water", "Cetyl Alcohol", "Glycerin",
        "Citric Acid", "Phenoxyethanol",
      ],
    },
    minGap: 3,
    rationale: "curlPattern=coily activates COILY_CONDITIONING_BONUS=1.12 for conditioning ingredients; rich formula has more qualifying ingredients and benefits more",
  },
];

// ─── RUNNER ───────────────────────────────────────────────────────────────────

function scoreProduct(
  ingredients: readonly string[],
  profile: HairProfile,
  database: IngredientDatabase
): number {
  const inci = ingredients.join(", ");
  const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });
  return result.summary.formulationScore;
}

function runRankingValidation(
  database: IngredientDatabase,
  minGapOverride?: number
): RankingResult[] {
  return RANKING_PAIRS.map((pair) => {
    const effectiveMinGap = minGapOverride ?? pair.minGap;

    const betterProfile: HairProfile = { ...pair.profile, productType: pair.better.productType as any };
    const worseProfile: HairProfile = { ...pair.profile, productType: pair.worse.productType as any };

    const betterScore = scoreProduct(pair.better.ingredients, betterProfile, database);
    const worseScore = scoreProduct(pair.worse.ingredients, worseProfile, database);
    const gap = betterScore - worseScore;
    const pass = gap >= effectiveMinGap;

    return {
      id: pair.id,
      description: pair.description,
      betterName: pair.better.name,
      betterScore,
      worseName: pair.worse.name,
      worseScore,
      gap,
      minGap: effectiveMinGap,
      pass,
      rationale: pair.rationale,
    };
  });
}

// ─── REPORTER ─────────────────────────────────────────────────────────────────

function printRankingResults(results: RankingResult[], verbose: boolean): void {
  for (const r of results) {
    const icon = r.pass ? green("✓") : red("✗");
    const gapStr = r.gap >= 0
      ? green(`+${r.gap.toFixed(1)}`)
      : red(`${r.gap.toFixed(1)}`);

    console.log(`\n${icon} ${r.pass ? dim(r.description) : bold(r.description)}`);
    console.log(
      `  ${cyan(r.betterName)}: ${r.betterScore.toFixed(1)}  vs  ` +
      `${cyan(r.worseName)}: ${r.worseScore.toFixed(1)}  ` +
      `gap=${gapStr}  (min=${r.minGap})`
    );

    if (!r.pass) {
      console.log(`  ${red("RANKING INVERSION")} — expected ${r.betterName} > ${r.worseName} by ≥${r.minGap} pts`);
      console.log(`  ${dim("Rationale:")} ${r.rationale}`);
    } else if (verbose) {
      console.log(`  ${dim("Rationale:")} ${r.rationale}`);
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const minGapIdx = args.indexOf("--min-gap");
  const minGapOverride = minGapIdx !== -1 ? parseFloat(args[minGapIdx + 1]) : undefined;

  const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const DB_PATH = path.join(PROJECT_ROOT, "database", "ingredients.json");

  console.log(bold("\nProduct INCI Analyzer — Ranking Validator"));
  console.log(dim("─".repeat(60)));

  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));
  console.log(dim(`Ranking pairs: ${RANKING_PAIRS.length}`));
  if (minGapOverride !== undefined) {
    console.log(dim(`Min gap override: ${minGapOverride}`));
  }

  const results = runRankingValidation(database, minGapOverride);

  printRankingResults(results, verbose);

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;

  console.log("\n" + "─".repeat(60));
  console.log(bold("Ranking Validation Summary"));
  console.log("─".repeat(60));
  console.log(`  Total pairs:  ${total}`);
  console.log(`  ${green("Passed:")}       ${passed}`);
  if (failed > 0) {
    console.log(`  ${red("Failed:")}       ${failed}`);
  }

  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";
  const pctColored = failed === 0 ? green(`${pct}%`) : red(`${pct}%`);
  console.log(`  Pass rate:    ${pctColored}`);
  console.log("─".repeat(60));

  if (failed === 0) {
    console.log(green("\n✓ All ranking pairs validated correctly.\n"));
  } else {
    console.log(red(`\n✗ ${failed} ranking inversion(s) detected.\n`));
    console.log(yellow("  Ranking inversions indicate calibration failures where the engine"));
    console.log(yellow("  scores a clearly inferior product higher than a clearly superior one."));
    console.log(yellow("  Investigate the score traces for the failing pairs before adjusting constants.\n"));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
