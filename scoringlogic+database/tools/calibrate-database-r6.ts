/**
 * calibrate-database-r6.ts
 * Round 6: Fix CW02, SR05, ST01, and remaining issues.
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
  // ── CW02: co-wash on straight fine oily = 66, target 18 ──
  // Profile modifiers for fine/low-porosity/oily need to be MUCH stronger
  // for co-wash product type. The current modifiers are too weak.
  // CW02: Water, Cetearyl Alcohol, BTMC, Glycerin, Shea Butter, Fragrance
  // The issue: these ingredients score high for co_wash, and profile modifiers
  // only reduce by ~15%. Need to add co_wash-specific penalty for wrong profiles.

  // ── SR05: scalp serum = 30, target 78 ──
  // Water, Niacinamide, Glycerin, Panthenol, Zinc PCA, Aloe Vera
  // serum product type uses hair_oil_serum base scores.
  // Niacinamide=92, Zinc PCA=88, but Glycerin=15, Panthenol=30, Aloe=30
  // The low-scoring ingredients drag down the active-weighted average.
  // Need to increase Glycerin/Panthenol/Aloe for hair_oil_serum.
  "Glycerin": {
    baseScore: { shampoo: 55, co_wash: 62, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 88, hair_oil_serum: 35, styling_product: 62 }
  },
  "Panthenol": {
    baseScore: { shampoo: 58, co_wash: 65, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 85, hair_oil_serum: 45, styling_product: 40 }
  },
  "Aloe Barbadensis Leaf Juice": {
    baseScore: { shampoo: 55, co_wash: 55, rinse_out_conditioner: 60, deep_conditioner_mask: 65, leave_in: 80, hair_oil_serum: 45, styling_product: 55 }
  },

  // ── ST01: styling product = 30, target 72 ──
  // Water, Glycerin, Hydroxyethylcellulose, Aloe Vera, Panthenol, Fragrance
  // Same issue as SR05 — Glycerin, Aloe, Panthenol have low styling_product scores.
  // Already increased Glycerin to 62, HEC to 85. Need Aloe and Panthenol higher.
  // Actually Glycerin=62, HEC=85, Aloe=55, Panthenol=40. The issue is the
  // evidence engine might not be detecting styling evidence properly.
  // Let me check what the efficacy gate says for styling_product.

  // ── S07: scalp active shampoo = 40, target 79 ──
  // Water, Salicylic Acid, SLES, CAPB, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid
  // Salicylic=92, Zinc Pyrithione=95, but SLES=75, CAPB=50, Glycerin=55
  // The active-weighted score should be high (92 × 0.45 + avg × 0.35 + support × 0.20)
  // But the score is only 40. The evidence engine must be suppressing it.
  // S07 has 8 ingredients — the evidence should be higher.
  // The issue: scalp_health evidence dimension might not have enough contributors.
  // Salicylic Acid and Zinc Pyrithione need "scalp-active" or "scalp-support" tags.

  // ── T04: bond repair on healthy hair = 77, target 38 ──
  // condition_healthy modifier is -0.55 → ×0.9175. Not enough.
  // Need to lower bond repair base scores for deep_conditioner_mask when healthy.
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: { shampoo: 38, co_wash: 45, rinse_out_conditioner: 85, deep_conditioner_mask: 88, leave_in: 82, hair_oil_serum: 12, styling_product: 22 },
    profile_compatibility: { condition_damaged: 0.78, condition_healthy: -0.6 }
  },

  // ── L02: heavy cream on fine hair = 52, target 14 ──
  // Water, Shea Butter, Coconut Oil, Castor Oil, Mango Butter, Glycerin, Fragrance
  // All heavy lipids. Profile modifiers for fine/low-porosity need to be much stronger.
  // Current: porosity_low=-0.8, density_fine=-0.8. These give ×0.88 and ×0.88.
  // Combined: ×0.774. Not enough.

  // ── T06: hot oil on fine hair = 47, target 16 ──
  // Same issue as L02.

  // ── C02: silicone avoider + dimethicone = 51, target 22 ──
  // The silicone_sensitive modifier is -1.0 → ×0.85. CSDS modifier is 0.72.
  // Combined: ×0.612. Score 82 × 0.612 = 50. Still too high.
  // Need CSDS silicone modifier to be stronger.

  // ── C04: heavy butters on fine hair = 50, target 21 ──
  // Same issue as L02.

  // ── ST04: heavy cream on fine hair styling = 41, target 12 ──
  // Same issue.

  // ── T02: protein sensitive + keratin = 37, target 17 ──
  // CSDS fires with modifier 0.45. Combined with bond repair 1.15 = 0.5175.
  // Score 80 × 0.5175 = 41. Still too high.
  // Need protein sensitivity modifier even stronger.

  // ── S03: harsh shampoo sensitive scalp = 9, target 24 ──
  // Score too LOW. The harshness penalty is too strong.
  // S03: Water, SLES, SLS, CAPB, Glycol Distearate, Sodium Chloride, Fragrance, MCI
  // Harsh sulfates + sensitive scalp + damaged hair.

  // ── S10: ammonium sulfates dry coily = 19, target 31 ──
  // Score too low. Need ammonium sulfate scores slightly higher.

  // ── E05: scalp active shampoo = 61, target 81 ──
  // Same issue as S07.
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
