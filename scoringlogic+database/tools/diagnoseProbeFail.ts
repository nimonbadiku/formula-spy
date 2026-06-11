/**
 * tools/diagnoseProbeFail.ts
 *
 * Diagnostic: why do protein_balance and cleanser_harshness trigger probes fail?
 * Checks actual resolved category for probe ingredients.
 * Temporary investigation tool — safe to delete after investigation.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index.js";
import type { HairProfile, IngredientDatabase } from "../engine/index.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = path.join(PROJECT_ROOT, "database", "ingredients.json");
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as IngredientDatabase;

function run(label: string, inci: string, profile: HairProfile): void {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`PROBE: ${label}`);
  console.log(`INCI:  ${inci}`);
  console.log(`Profile: ${JSON.stringify(profile)}`);

  const result = analyze(inci, profile, db, { timestamp: "2026-01-01T00:00:00.000Z" });
  const scored = result.formulation.ingredients;

  console.log(`Resolved: ${scored.length} ingredients`);
  for (const si of scored) {
    const name = si.ingredient.record.name;
    const category = si.ingredient.record.category;
    const resolved = si.ingredient.type === "hit";
    console.log(`  [${resolved ? "✓" : "✗"}] "${name}"  category="${category}"  base=${si.baseScore}  final=${si.finalScore.toFixed(2)}`);
    if (si.scoreTrace.length > 0) {
      for (const t of si.scoreTrace) {
        console.log(`       stage="${t.stage}"  value=${t.value}  dir=${t.direction}  → ${t.explanation.slice(0, 80)}`);
      }
    } else {
      console.log(`       (no trace entries)`);
    }
  }
}

// ── protein_balance probes ────────────────────────────────────────────────────

const neutralConditioner: HairProfile = {
  condition: "normal", porosity: "med", density: "med", oiliness: "normal",
  productType: "rinse_out_conditioner",
};
const damagedConditioner: HairProfile = {
  condition: "damaged", porosity: "high", density: "med", oiliness: "normal",
  productType: "rinse_out_conditioner",
};
const healthyConditioner: HairProfile = {
  condition: "healthy", porosity: "med", density: "med", oiliness: "normal",
  productType: "rinse_out_conditioner",
};
const proteinSensitive: HairProfile = {
  condition: "normal", porosity: "med", density: "med", oiliness: "normal",
  productType: "rinse_out_conditioner",
  proteinSensitivity: true,
};

run("Hydrolyzed Keratin — neutral", "Hydrolyzed Keratin", neutralConditioner);
run("Hydrolyzed Keratin — damaged", "Hydrolyzed Keratin", damagedConditioner);
run("Hydrolyzed Wheat Protein — neutral", "Hydrolyzed Wheat Protein", neutralConditioner);
run("Two proteins — neutral (stacking)", "Hydrolyzed Keratin, Hydrolyzed Wheat Protein", neutralConditioner);
run("Two proteins — damaged+sensitive", "Hydrolyzed Keratin, Hydrolyzed Wheat Protein", { ...damagedConditioner, proteinSensitivity: true });

// Try alternate protein names that might be in the DB
run("Keratin — neutral", "Keratin", damagedConditioner);
run("Wheat Protein — neutral", "Wheat Protein", damagedConditioner);
run("Silk Amino Acids — neutral", "Silk Amino Acids", damagedConditioner);

// ── cleanser_harshness probes ─────────────────────────────────────────────────

const dryShampoo: HairProfile = {
  condition: "normal", porosity: "med", density: "med", oiliness: "dry",
  productType: "shampoo",
};
const damagedShampoo: HairProfile = {
  condition: "damaged", porosity: "med", density: "med", oiliness: "normal",
  productType: "shampoo",
};

run("SLS — dry scalp", "Sodium Lauryl Sulfate", dryShampoo);
run("SLS — damaged", "Sodium Lauryl Sulfate", damagedShampoo);
run("SLES — dry scalp", "Sodium Laureth Sulfate", dryShampoo);
run("SLES — damaged", "Sodium Laureth Sulfate", damagedShampoo);

// ── Check what the AUDIT_REPORT's 2 protein hits actually were ────────────────
// Run the Aphogee two-step protein treatment (specialty benchmark)
const aphogeeInci = "Hydrolyzed Animal Protein, Water, Magnesium Sulfate, Hydrolyzed Keratin";
run("Aphogee-like — damaged", aphogeeInci, damagedConditioner);
run("Aphogee-like — neutral", aphogeeInci, neutralConditioner);
