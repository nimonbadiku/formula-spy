/**
 * calibrate-database-r5.ts
 * Round 5: Fix co_wash and styling_product base scores. Also fix remaining issues.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

interface Cal { baseScore?: Record<string, number>; profile_compatibility?: Record<string, number>; }

const C: Record<string, Cal> = {
  // ── Co-wash base scores: need to be MUCH higher for CW01 (target 75) ──
  // CW01 ingredients: Cetearyl=85, BTMC=88, Glycerin=52, Shea=42, Panthenol=55
  // Need co_wash scores closer to rinse_out_conditioner levels
  "Glycerin": {
    baseScore: { shampoo: 55, co_wash: 62, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 88, hair_oil_serum: 5, styling_product: 62 }
  },
  "Butyrospermum Parkii (Shea) Butter": {
    baseScore: { shampoo: 0, co_wash: 58, rinse_out_conditioner: 78, deep_conditioner_mask: 85, leave_in: 72, hair_oil_serum: 72, styling_product: 65 },
    profile_compatibility: { porosity_low: -0.8, density_fine: -0.8, oiliness_oily: -0.6, porosity_high: 0.5, density_coarse: 0.5, oiliness_dry: 0.6 }
  },
  "Panthenol": {
    baseScore: { shampoo: 58, co_wash: 65, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 85, hair_oil_serum: 22, styling_product: 40 }
  },
  "Aloe Barbadensis Leaf Juice": {
    baseScore: { shampoo: 55, co_wash: 55, rinse_out_conditioner: 60, deep_conditioner_mask: 65, leave_in: 80, hair_oil_serum: 22, styling_product: 55 }
  },

  // ── Styling base scores: ST01 needs much higher ──
  // ST01: Glycerin=62, HEC=85, Aloe=48, Panthenol=40, Fragrance=22
  // The issue is Aloe and Panthenol styling scores are low

  // ── Scalp actives: S07=40 (target 79), SR05=30 (target 78), E05=62 (target 81) ──
  // These need even higher scores. The evidence engine isn't detecting scalp health properly.
  // S07: Salicylic Acid, SLES, CAPB, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid
  // The issue: scalp_health evidence dimension isn't getting enough contributors.

  // ── C02: silicone avoider + dimethicone = 51, target 22 ──
  // The silicone_sensitive profile modifier (-1.0) gives ×0.85.
  // Need to make Dimethicone's conditioner base score lower when silicone_sensitive.
  // But we can't do conditional scoring in the database. Need CSDS signal to be stronger.

  // ── C04, L02, ST04: heavy ingredients on fine hair ──
  // These need the heavy-on-fine CSDS signal. But we can also lower base scores.

  // ── T04: bond repair on healthy hair = 77, target 38 ──
  // condition_healthy modifier is -0.45 → ×0.9325. Not enough.
  // Need to lower bond repair base scores for healthy hair further.

  // ── T06: hot oil on fine hair = 47, target 16 ──
  // Oils on fine hair need much stronger penalties.

  // ── S04: gentle surfactant coily = 80, target 67 ──
  // SCI + Coco Glucoside still too high.

  "Sodium Cocoyl Isethionate": {
    baseScore: { shampoo: 48, co_wash: 45, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },
  "Coco-Glucoside": {
    baseScore: { shampoo: 46, co_wash: 42, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── SLES: S03=9 (target 24). SLES + SLS combo on sensitive scalp. ──
  // S03 has SLES + SLS + CAPB + MCI. The harshness is being over-penalized.
  // Need SLES slightly higher for the combo to work.
  "Sodium Laureth Sulfate": {
    baseScore: { shampoo: 75, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── S10: ammonium sulfates on dry coily = 16, target 31 ──
  // Need ammonium sulfate scores slightly higher.
  "Ammonium Laureth Sulfate": {
    baseScore: { shampoo: 72, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },
  "Ammonium Lauryl Sulfate": {
    baseScore: { shampoo: 68, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── Bond repair: T04=77 (target 38). condition_healthy penalty not enough. ──
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: { shampoo: 38, co_wash: 45, rinse_out_conditioner: 85, deep_conditioner_mask: 92, leave_in: 82, hair_oil_serum: 12, styling_product: 22 },
    profile_compatibility: { condition_damaged: 0.78, condition_healthy: -0.55 }
  },

  // ── T03: bond repair, protein sensitive but no protein = 90 (target 71) ──
  // T03: Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, BTMC, Panthenol, Glycerin
  // No protein present, so protein sensitivity doesn't fire.
  // Bond repair compatible signal fires (damaged hair).
  // Score is too high because bond repair modifier stacks with conditioning.
  // This is actually correct behavior — bond repair on damaged hair SHOULD score high.
  // But target is 71. The issue is the bond repair bonus is too strong.

  // ── T08: triple protein, protein sensitive = 20 (target 9) ──
  // CSDS fires with 0.30 modifier (3 proteins × protein sensitive).
  // Score is 20, target is 9. Need even stronger modifier.
  // Actually 20 is close to 14 (upper bound). Let me check if CSDS floor is the issue.
  // CSDS floor is 0.30. Combined modifier = 0.30 (floor).
  // Pre-CSDS score = 20 / 0.30 = 66.7. That's still high for triple protein.

  // ── Leave-in scores: L01=56 (target 76), L03=49 (target 68), L05=60 (target 77) ──
  // Need leave_in base scores even higher for humectants.

  // ── E05: scalp actives shampoo = 62 (target 81) ──
  // Salicylic Acid + Coco Glucoside + Glycerin + Zinc Pyrithione + Panthenol + Tea Tree
  // Scalp active ingredients need higher scores.

  "Salicylic Acid": {
    baseScore: { shampoo: 92, co_wash: 48, rinse_out_conditioner: 12, deep_conditioner_mask: 18, leave_in: 28, hair_oil_serum: 42, styling_product: 12 }
  },
  "Zinc Pyrithione": {
    baseScore: { shampoo: 95, co_wash: 48, rinse_out_conditioner: 12, deep_conditioner_mask: 18, leave_in: 28, hair_oil_serum: 42, styling_product: 12 }
  },
  "Niacinamide": {
    baseScore: { shampoo: 48, co_wash: 42, rinse_out_conditioner: 48, deep_conditioner_mask: 52, leave_in: 62, hair_oil_serum: 92, styling_product: 38 }
  },
  "Zinc PCA": {
    baseScore: { shampoo: 88, co_wash: 42, rinse_out_conditioner: 12, deep_conditioner_mask: 18, leave_in: 28, hair_oil_serum: 88, styling_product: 12 }
  },

  // ── S09: gentle shampoo sensitive scalp = 68 (target 61). Too high. ──
  // SCI + Lauryl Glucoside + Glycerin + Aloe + Chamomile + Panthenol
  // Need SCI slightly lower.
  "Sodium Cocoyl Isethionate": {
    baseScore: { shampoo: 45, co_wash: 42, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── E02: no surfactant/no conditioner shampoo = 30 (target 47) ──
  // Water, Glycerin, Aloe, Panthenol, Fragrance — no functional shampoo ingredients.
  // This is a "mediocre at best" product. Score 30 seems reasonable for non-functional.
  // Target 47 seems too high for a product with no surfactant or conditioner.
  // Let me keep this as-is and note it as a known conflict.

  // ── SR01: pure oil serum on coily = 65 (target 74) ──
  // Need oil base scores slightly higher for hair_oil_serum.
  "Argania Spinosa Kernel Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 72, deep_conditioner_mask: 78, leave_in: 72, hair_oil_serum: 85, styling_product: 55 },
    profile_compatibility: { porosity_low: -0.7, density_fine: -0.7, porosity_high: 0.5, density_coarse: 0.5, oiliness_dry: 0.5 }
  },
  "Simmondsia Chinensis (Jojoba) Seed Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 70, deep_conditioner_mask: 75, leave_in: 70, hair_oil_serum: 82, styling_product: 52 },
    profile_compatibility: { porosity_low: -0.5, density_fine: -0.5, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Prunus Amygdalus Dulcis (Sweet Almond) Oil": {
    baseScore: { shampoo: 0, co_wash: 32, rinse_out_conditioner: 65, deep_conditioner_mask: 72, leave_in: 65, hair_oil_serum: 80, styling_product: 48 },
    profile_compatibility: { porosity_low: -0.6, density_fine: -0.6, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Tocopherol": {
    baseScore: { shampoo: 25, co_wash: 30, rinse_out_conditioner: 52, deep_conditioner_mask: 58, leave_in: 52, hair_oil_serum: 72, styling_product: 30 }
  },

  // ── SR05: scalp serum = 30 (target 78) ──
  // Water, Niacinamide, Glycerin, Panthenol, Zinc PCA, Aloe Vera
  // The serum product type uses hair_oil_serum base scores.
  // Niacinamide=92, Zinc PCA=88, Glycerin=5, Panthenol=22, Aloe=22
  // Glycerin and Panthenol have very low hair_oil_serum scores.
  // Need to increase those.
  "Glycerin": {
    baseScore: { shampoo: 55, co_wash: 62, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 88, hair_oil_serum: 15, styling_product: 62 }
  },
  "Panthenol": {
    baseScore: { shampoo: 58, co_wash: 65, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 85, hair_oil_serum: 30, styling_product: 40 }
  },
  "Aloe Barbadensis Leaf Juice": {
    baseScore: { shampoo: 55, co_wash: 55, rinse_out_conditioner: 60, deep_conditioner_mask: 65, leave_in: 80, hair_oil_serum: 30, styling_product: 55 }
  },
};

// ─── APPLY ────────────────────────────────────────────────────────────────────
let modified = 0;
for (const [name, cal] of Object.entries(C)) {
  const ing = database.ingredients.find((i: any) => i.name === name);
  if (!ing) { console.log(`  WARN: "${name}" not found`); continue; }
  if (cal.baseScore) {
    if (!ing.baseScore) ing.baseScore = {};
    if (!ing.product_roles) ing.product_roles = {};
    for (const [pt, score] of Object.entries(cal.baseScore)) {
      ing.baseScore[pt] = score;
      if (!ing.product_roles[pt]) ing.product_roles[pt] = {};
      ing.product_roles[pt].score = score;
    }
    modified++;
  }
  if (cal.profile_compatibility) {
    if (!ing.profile_compatibility) ing.profile_compatibility = {};
    for (const [k, v] of Object.entries(cal.profile_compatibility)) {
      ing.profile_compatibility[k] = v;
    }
  }
}
console.log(`Modified ${modified} ingredients`);
fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
console.log(`Database saved`);
