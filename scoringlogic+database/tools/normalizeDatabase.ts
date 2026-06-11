/**
 * tools/normalizeDatabase.ts
 *
 * One-time database normalization utility.
 *
 * Fixes category inconsistencies that cause the scoring system to miss
 * surfactant ingredients:
 *
 *   "Strong Surfactant"    → "Surfactant"
 *     (ionic_charge + tags already distinguish harshness: anionic + sulfate tag = strong)
 *
 *   "Amphoteric Surfactant" → "Surfactant"
 *     (ionic_charge = "amphoteric" already distinguishes these)
 *
 * The scoring system uses CLEANSING_CATEGORIES = Set(["Surfactant"]) and
 * classifySurfactantHarshness() which checks ionic_charge + tags. The category
 * just needs to be "Surfactant" for the scoring to see these ingredients.
 *
 * Also adds missing common ingredients found in benchmark products.
 *
 * Usage:
 *   tsx tools/normalizeDatabase.ts          (dry run — shows what would change)
 *   tsx tools/normalizeDatabase.ts --apply  (applies changes to database)
 *
 * IMPORTANT: Always review the dry-run output before applying.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH      = path.join(PROJECT_ROOT, "database", "ingredients.json");

const APPLY = process.argv.includes("--apply");

const BOLD   = "\x1b[1m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const RED    = "\x1b[31m";
const RESET  = "\x1b[0m";

// ─── CATEGORY NORMALIZATION MAP ───────────────────────────────────────────────
//
// Maps database category names → canonical category names expected by scoring.
// The scoring system uses these exact strings in CLEANSING_CATEGORIES,
// CONDITIONING_CATEGORIES, etc.
//
const CATEGORY_REMAP: Record<string, string> = {
  "Strong Surfactant":    "Surfactant",
  "Amphoteric Surfactant": "Surfactant",
};

// ─── MISSING INGREDIENTS TO ADD ───────────────────────────────────────────────
//
// Common benchmark ingredients not currently in the database.
// Each entry is a minimal but complete ingredient record.
//
const MISSING_INGREDIENTS = [
  {
    name: "Cocamide DEA",
    category: "Surfactant",
    notes: "Foam booster and viscosity builder derived from coconut oil fatty acids. Mild nonionic surfactant.",
    tags: ["foam-booster", "mild", "mild-cleanser", "nonionic", "rinse-off", "surfactant", "viscosity-builder"],
    ionic_charge: "nonionic",
    molecular_weight_da: 300,
    penetration_depth: "surface",
    aliases: ["Cocamide Diethanolamine", "Coconut Diethanolamide"],
    product_roles: {
      shampoo:              { score: 72, notes: "Cocamide DEA: foam booster and mild cleanser in shampoo systems." },
      co_wash:              { score: 55, notes: "Cocamide DEA: mild foam booster in co-wash." },
      rinse_out_conditioner:{ score: 8,  notes: "Cocamide DEA: minimal role in conditioner." },
      deep_conditioner_mask:{ score: 4,  notes: "Cocamide DEA: minimal role in mask." },
      leave_in_conditioner: { score: 0,  notes: "Cocamide DEA: not suitable for leave-on." },
      hair_oil_serum:       { score: 0,  notes: "Cocamide DEA: not suitable for oil/serum." },
      styling_product:      { score: 5,  notes: "Cocamide DEA: minor role in styling." },
    },
  },
  {
    name: "Tea Tree Oil",
    category: "Botanical",
    notes: "Essential oil from Melaleuca alternifolia with antimicrobial and scalp-soothing properties.",
    tags: ["antimicrobial", "botanical", "essential-oil", "scalp-active", "scalp-soothing"],
    ionic_charge: "neutral",
    molecular_weight_da: 154,
    penetration_depth: "surface",
    aliases: ["Melaleuca Alternifolia Leaf Oil", "Melaleuca Alternifolia Oil"],
    product_roles: {
      shampoo:              { score: 65, notes: "Tea Tree Oil: scalp-active antimicrobial in shampoo." },
      co_wash:              { score: 50, notes: "Tea Tree Oil: scalp benefit in co-wash." },
      rinse_out_conditioner:{ score: 40, notes: "Tea Tree Oil: scalp benefit in conditioner." },
      deep_conditioner_mask:{ score: 35, notes: "Tea Tree Oil: scalp benefit in mask." },
      leave_in_conditioner: { score: 45, notes: "Tea Tree Oil: scalp benefit in leave-in." },
      hair_oil_serum:       { score: 55, notes: "Tea Tree Oil: scalp benefit in serum." },
      styling_product:      { score: 30, notes: "Tea Tree Oil: minor scalp benefit in styler." },
    },
  },
  {
    name: "Castor Oil",
    category: "Heavy Oil",
    notes: "Thick, viscous oil from Ricinus communis seeds. High in ricinoleic acid. Sealing and conditioning.",
    tags: ["emollient", "heavy-oil", "high-buildup", "occlusive", "oil", "sealant"],
    ionic_charge: "neutral",
    molecular_weight_da: 932,
    penetration_depth: "surface",
    aliases: ["Ricinus Communis Seed Oil", "Ricinus Communis (Castor) Seed Oil"],
    product_roles: {
      shampoo:              { score: 10, notes: "Castor Oil: heavy oil, minimal role in shampoo." },
      co_wash:              { score: 45, notes: "Castor Oil: conditioning in co-wash." },
      rinse_out_conditioner:{ score: 55, notes: "Castor Oil: sealing conditioner." },
      deep_conditioner_mask:{ score: 70, notes: "Castor Oil: heavy conditioning in mask." },
      leave_in_conditioner: { score: 50, notes: "Castor Oil: sealing leave-in." },
      hair_oil_serum:       { score: 80, notes: "Castor Oil: primary sealing oil." },
      styling_product:      { score: 40, notes: "Castor Oil: hold and shine in styler." },
    },
  },
  {
    name: "Yeast Extract",
    category: "Functional Additive",
    notes: "Fermented yeast-derived extract rich in amino acids, vitamins, and minerals. Scalp and hair conditioning.",
    tags: ["amino-acid-source", "conditioning", "fermented", "scalp-active"],
    ionic_charge: "neutral",
    molecular_weight_da: 500,
    penetration_depth: "cortex",
    aliases: ["Saccharomyces Cerevisiae Extract", "Saccharomyces Ferment Filtrate"],
    product_roles: {
      shampoo:              { score: 50, notes: "Yeast Extract: scalp conditioning in shampoo." },
      co_wash:              { score: 55, notes: "Yeast Extract: conditioning in co-wash." },
      rinse_out_conditioner:{ score: 60, notes: "Yeast Extract: conditioning in conditioner." },
      deep_conditioner_mask:{ score: 65, notes: "Yeast Extract: conditioning in mask." },
      leave_in_conditioner: { score: 60, notes: "Yeast Extract: conditioning in leave-in." },
      hair_oil_serum:       { score: 45, notes: "Yeast Extract: minor role in serum." },
      styling_product:      { score: 40, notes: "Yeast Extract: minor role in styler." },
    },
  },
  {
    name: "Dextran",
    category: "Polymer",
    notes: "Polysaccharide polymer used as a film former and humectant. Provides moisture retention.",
    tags: ["film-former", "humectant", "low-buildup", "polymer", "water-soluble"],
    ionic_charge: "neutral",
    molecular_weight_da: 10000,
    penetration_depth: "surface",
    aliases: [],
    product_roles: {
      shampoo:              { score: 30, notes: "Dextran: minor film-forming in shampoo." },
      co_wash:              { score: 45, notes: "Dextran: film-forming in co-wash." },
      rinse_out_conditioner:{ score: 55, notes: "Dextran: film-forming conditioner." },
      deep_conditioner_mask:{ score: 60, notes: "Dextran: film-forming in mask." },
      leave_in_conditioner: { score: 65, notes: "Dextran: film-forming leave-in." },
      hair_oil_serum:       { score: 40, notes: "Dextran: minor role in serum." },
      styling_product:      { score: 50, notes: "Dextran: film-forming in styler." },
    },
  },
  {
    name: "Sodium Dehydroacetate",
    category: "Preservative",
    notes: "Broad-spectrum preservative effective against bacteria and fungi.",
    tags: ["antimicrobial", "antifungal", "preservative"],
    ionic_charge: "neutral",
    molecular_weight_da: 190,
    penetration_depth: "surface",
    aliases: [],
    product_roles: {
      shampoo:              { score: 60, notes: "Sodium Dehydroacetate: preservative in shampoo." },
      co_wash:              { score: 60, notes: "Sodium Dehydroacetate: preservative in co-wash." },
      rinse_out_conditioner:{ score: 60, notes: "Sodium Dehydroacetate: preservative in conditioner." },
      deep_conditioner_mask:{ score: 60, notes: "Sodium Dehydroacetate: preservative in mask." },
      leave_in_conditioner: { score: 60, notes: "Sodium Dehydroacetate: preservative in leave-in." },
      hair_oil_serum:       { score: 60, notes: "Sodium Dehydroacetate: preservative in serum." },
      styling_product:      { score: 60, notes: "Sodium Dehydroacetate: preservative in styler." },
    },
  },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  const ingredients: any[] = db.ingredients;

  console.log(`\n${BOLD}Database Normalization Tool${RESET}`);
  console.log(`${DIM}${"─".repeat(60)}${RESET}`);
  console.log(`${DIM}Mode: ${APPLY ? "APPLY" : "DRY RUN (use --apply to write changes)"}${RESET}`);
  console.log(`${DIM}Database: ${ingredients.length} ingredients${RESET}\n`);

  let categoryChanges = 0;
  let addedIngredients = 0;

  // ── Step 1: Normalize categories ────────────────────────────────────────
  console.log(`${BOLD}Category normalization:${RESET}`);
  for (const ing of ingredients) {
    const oldCat = ing.category;
    const newCat = CATEGORY_REMAP[oldCat];
    if (newCat) {
      console.log(`  ${CYAN}${ing.name}${RESET}`);
      console.log(`    ${RED}${oldCat}${RESET} → ${GREEN}${newCat}${RESET}`);
      if (APPLY) {
        ing.category = newCat;
      }
      categoryChanges++;
    }
  }

  if (categoryChanges === 0) {
    console.log(`  ${DIM}No category changes needed.${RESET}`);
  } else {
    console.log(`\n  ${categoryChanges} ingredient(s) would be updated.`);
  }

  // ── Step 2: Add missing ingredients ─────────────────────────────────────
  console.log(`\n${BOLD}Missing ingredient additions:${RESET}`);
  const existingNames = new Set(ingredients.map((i: any) => i.name.toLowerCase()));

  for (const newIng of MISSING_INGREDIENTS) {
    const key = newIng.name.toLowerCase();
    if (existingNames.has(key)) {
      console.log(`  ${DIM}SKIP (already exists): ${newIng.name}${RESET}`);
      continue;
    }
    console.log(`  ${GREEN}ADD:${RESET} ${newIng.name} ${DIM}(${newIng.category})${RESET}`);
    if (APPLY) {
      ingredients.push(newIng);
      existingNames.add(key);
    }
    addedIngredients++;
  }

  if (addedIngredients === 0) {
    console.log(`  ${DIM}No new ingredients to add.${RESET}`);
  }

  // ── Step 3: Write if applying ────────────────────────────────────────────
  if (APPLY) {
    db.ingredients = ingredients;
    db.totalIngredients = ingredients.length;
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    console.log(`\n${GREEN}✓ Database updated:${RESET}`);
    console.log(`  Category changes: ${categoryChanges}`);
    console.log(`  New ingredients:  ${addedIngredients}`);
    console.log(`  Total ingredients: ${ingredients.length}`);
  } else {
    console.log(`\n${YELLOW}Dry run complete. Run with --apply to write changes.${RESET}`);
    console.log(`  Would change: ${categoryChanges} categories, add ${addedIngredients} ingredients`);
  }

  console.log();
}

main();
