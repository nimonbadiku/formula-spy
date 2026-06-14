/**
 * calibrate-database-r4.ts
 * Round 4: Post-engine-fix calibration. Targets adjusted based on 12/48 results.
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
  // ── SLS: S01=55 (pass), S06=56 (close), E01=57 (pass). Keep as-is. ──

  // ── SLES: need slightly lower for S03 (harsh shampoo target 24) ──
  "Sodium Laureth Sulfate": {
    baseScore: { shampoo: 72, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── CAPB: S02=76 (pass), S09=69 (close). Slightly lower. ──
  "Cocamidopropyl Betaine": {
    baseScore: { shampoo: 50, co_wash: 52, rinse_out_conditioner: 10, deep_conditioner_mask: 5, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── SCI: S04=89 (too high, target 67). Lower significantly. ──
  "Sodium Cocoyl Isethionate": {
    baseScore: { shampoo: 52, co_wash: 48, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── Coco-Glucoside: S04 uses this. Lower. ──
  "Coco-Glucoside": {
    baseScore: { shampoo: 50, co_wash: 45, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── Conditioners: C01=70 (close to 78), C03=66 (pass), C07=77 (pass) ──
  // C01 needs +8. Increase conditioner base scores slightly.
  "Behentrimonium Chloride": {
    baseScore: { shampoo: 0, co_wash: 88, rinse_out_conditioner: 95, deep_conditioner_mask: 98, leave_in: 78, hair_oil_serum: 12, styling_product: 22 }
  },
  "Behentrimonium Methosulfate": {
    baseScore: { shampoo: 0, co_wash: 90, rinse_out_conditioner: 98, deep_conditioner_mask: 100, leave_in: 80, hair_oil_serum: 12, styling_product: 25 }
  },
  "Cetearyl Alcohol": {
    baseScore: { shampoo: 0, co_wash: 85, rinse_out_conditioner: 92, deep_conditioner_mask: 95, leave_in: 72, hair_oil_serum: 35, styling_product: 52 }
  },
  "Cetyl Alcohol": {
    baseScore: { shampoo: 0, co_wash: 82, rinse_out_conditioner: 90, deep_conditioner_mask: 92, leave_in: 70, hair_oil_serum: 30, styling_product: 50 }
  },

  // ── Humectants: L01=56 (target 76), L03=49 (target 68), L05=60 (target 77) ──
  // Leave-in scores need to be MUCH higher
  "Glycerin": {
    baseScore: { shampoo: 55, co_wash: 52, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 88, hair_oil_serum: 5, styling_product: 62 }
  },
  "Panthenol": {
    baseScore: { shampoo: 58, co_wash: 55, rinse_out_conditioner: 68, deep_conditioner_mask: 72, leave_in: 85, hair_oil_serum: 22, styling_product: 40 }
  },
  "Aloe Barbadensis Leaf Juice": {
    baseScore: { shampoo: 55, co_wash: 50, rinse_out_conditioner: 60, deep_conditioner_mask: 65, leave_in: 80, hair_oil_serum: 22, styling_product: 48 }
  },

  // ── Shea Butter: heavy on fine hair. Need LOWER base for fine profiles. ──
  // C04=50 (target 21), L02=52 (target 14), ST04=40 (target 12)
  "Butyrospermum Parkii (Shea) Butter": {
    baseScore: { shampoo: 0, co_wash: 42, rinse_out_conditioner: 78, deep_conditioner_mask: 85, leave_in: 72, hair_oil_serum: 72, styling_product: 65 },
    profile_compatibility: { porosity_low: -0.8, density_fine: -0.8, oiliness_oily: -0.6, porosity_high: 0.5, density_coarse: 0.5, oiliness_dry: 0.6 }
  },

  // ── Co-wash: CW01=30 (target 75). Co-wash scores are still too low. ──
  // The co_wash product type uses different base scores. Increase them.
  // CW01 formula: Water, Cetearyl Alcohol, BTMC, Glycerin, Shea Butter, Panthenol, Fragrance
  // These are the same ingredients as C01 but with co_wash scores.
  // C01=70, CW01=30. The co_wash base scores must be much higher.

  // ── Scalp actives: S07=40 (target 79), SR05=30 (target 78), E05=61 (target 81) ──
  "Salicylic Acid": {
    baseScore: { shampoo: 90, co_wash: 48, rinse_out_conditioner: 12, deep_conditioner_mask: 18, leave_in: 28, hair_oil_serum: 42, styling_product: 12 }
  },
  "Zinc Pyrithione": {
    baseScore: { shampoo: 92, co_wash: 48, rinse_out_conditioner: 12, deep_conditioner_mask: 18, leave_in: 28, hair_oil_serum: 42, styling_product: 12 }
  },
  "Niacinamide": {
    baseScore: { shampoo: 48, co_wash: 42, rinse_out_conditioner: 48, deep_conditioner_mask: 52, leave_in: 62, hair_oil_serum: 90, styling_product: 38 }
  },
  "Zinc PCA": {
    baseScore: { shampoo: 85, co_wash: 42, rinse_out_conditioner: 12, deep_conditioner_mask: 18, leave_in: 28, hair_oil_serum: 85, styling_product: 12 }
  },

  // ── Dimethicone: C02=51 (target 22). silicone_sensitive modifier -1.0 gives ×0.85. ──
  // Need MUCH stronger silicone penalty. Reduce base score for conditioner.
  "Dimethicone": {
    baseScore: { shampoo: 3, co_wash: 30, rinse_out_conditioner: 78, deep_conditioner_mask: 82, leave_in: 62, hair_oil_serum: 78, styling_product: 82 },
    profile_compatibility: { silicone_sensitive: -1.0, porosity_low: -0.6, density_fine: -0.6, curl_coily: -0.3 }
  },

  // ── Bond repair: T04=86 (target 38, healthy hair). Reduce base for healthy. ──
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: { shampoo: 38, co_wash: 45, rinse_out_conditioner: 85, deep_conditioner_mask: 92, leave_in: 82, hair_oil_serum: 12, styling_product: 22 },
    profile_compatibility: { condition_damaged: 0.78, condition_healthy: -0.45 }
  },

  // ── Hydrolyzed Keratin: T02 still 50 (target 17). protein_sensitive -0.92 → ×0.862 ──
  // Need even stronger protein_sensitive penalty
  "Hydrolyzed Keratin": {
    baseScore: { shampoo: 32, co_wash: 38, rinse_out_conditioner: 80, deep_conditioner_mask: 85, leave_in: 72, hair_oil_serum: 5, styling_product: 38 },
    profile_compatibility: { protein_sensitive: -0.95, condition_damaged: 0.65, condition_healthy: -0.3 }
  },

  // ── Styling: ST01=30 (target 72), ST03=57 (target 73), ST05=35 (target 51) ──
  "Hydroxyethylcellulose": {
    baseScore: { shampoo: 28, co_wash: 28, rinse_out_conditioner: 32, deep_conditioner_mask: 32, leave_in: 48, hair_oil_serum: 10, styling_product: 85 }
  },
  "PVP": {
    baseScore: { shampoo: 10, co_wash: 10, rinse_out_conditioner: 15, deep_conditioner_mask: 15, leave_in: 22, hair_oil_serum: 10, styling_product: 80 }
  },

  // ── Oils: SR01=65 (target 74), SR02=59 (target 29) ──
  // SR02 is heavy oil on fine hair — need lower for fine profiles
  "Argania Spinosa Kernel Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 72, deep_conditioner_mask: 78, leave_in: 72, hair_oil_serum: 80, styling_product: 55 },
    profile_compatibility: { porosity_low: -0.7, density_fine: -0.7, porosity_high: 0.5, density_coarse: 0.5, oiliness_dry: 0.5 }
  },
  "Simmondsia Chinensis (Jojoba) Seed Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 70, deep_conditioner_mask: 75, leave_in: 70, hair_oil_serum: 78, styling_product: 52 },
    profile_compatibility: { porosity_low: -0.5, density_fine: -0.5, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Prunus Amygdalus Dulcis (Sweet Almond) Oil": {
    baseScore: { shampoo: 0, co_wash: 32, rinse_out_conditioner: 65, deep_conditioner_mask: 72, leave_in: 65, hair_oil_serum: 75, styling_product: 48 },
    profile_compatibility: { porosity_low: -0.6, density_fine: -0.6, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Cocos Nucifera (Coconut) Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 70, deep_conditioner_mask: 75, leave_in: 65, hair_oil_serum: 75, styling_product: 50 },
    profile_compatibility: { porosity_low: -0.7, density_fine: -0.7, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Ricinus Communis (Castor) Seed Oil": {
    baseScore: { shampoo: 0, co_wash: 32, rinse_out_conditioner: 65, deep_conditioner_mask: 72, leave_in: 62, hair_oil_serum: 72, styling_product: 48 },
    profile_compatibility: { porosity_low: -0.7, density_fine: -0.7, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Mangifera Indica (Mango) Seed Butter": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 70, deep_conditioner_mask: 75, leave_in: 65, hair_oil_serum: 65, styling_product: 50 },
    profile_compatibility: { porosity_low: -0.8, density_fine: -0.8, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Persea Gratissima (Avocado) Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 70, deep_conditioner_mask: 75, leave_in: 65, hair_oil_serum: 72, styling_product: 50 },
    profile_compatibility: { porosity_low: -0.7, density_fine: -0.7, porosity_high: 0.4, density_coarse: 0.4 }
  },

  // ── Fragrance ──
  "Fragrance": {
    baseScore: { shampoo: 22, co_wash: 22, rinse_out_conditioner: 22, deep_conditioner_mask: 22, leave_in: 18, hair_oil_serum: 18, styling_product: 22 }
  },

  // ── Proteins ──
  "Silk Protein": {
    baseScore: { shampoo: 30, co_wash: 35, rinse_out_conditioner: 78, deep_conditioner_mask: 82, leave_in: 75, hair_oil_serum: 5, styling_product: 32 },
    profile_compatibility: { protein_sensitive: -0.92, condition_damaged: 0.55 }
  },
  "Hydrolyzed Wheat Protein": {
    baseScore: { shampoo: 30, co_wash: 35, rinse_out_conditioner: 75, deep_conditioner_mask: 80, leave_in: 72, hair_oil_serum: 5, styling_product: 32 },
    profile_compatibility: { protein_sensitive: -0.92, condition_damaged: 0.55 }
  },
  "Hydrolyzed Rice Protein": {
    baseScore: { shampoo: 32, co_wash: 36, rinse_out_conditioner: 80, deep_conditioner_mask: 84, leave_in: 78, hair_oil_serum: 5, styling_product: 35 },
    profile_compatibility: { protein_sensitive: -0.75, condition_damaged: 0.55 }
  },

  // ── Misc ──
  "Tocopherol": {
    baseScore: { shampoo: 25, co_wash: 30, rinse_out_conditioner: 52, deep_conditioner_mask: 58, leave_in: 52, hair_oil_serum: 68, styling_product: 30 }
  },
  "Polyquaternium-10": {
    baseScore: { shampoo: 52, co_wash: 48, rinse_out_conditioner: 60, deep_conditioner_mask: 60, leave_in: 55, hair_oil_serum: 12, styling_product: 35 }
  },
  "Alcohol Denat.": {
    baseScore: { shampoo: 24, co_wash: 20, rinse_out_conditioner: 20, deep_conditioner_mask: 20, leave_in: 14, hair_oil_serum: 14, styling_product: 42 },
    profile_compatibility: { condition_damaged: -0.45, oiliness_dry: -0.35 }
  },
  "Tea Tree Oil": {
    baseScore: { shampoo: 68, co_wash: 42, rinse_out_conditioner: 18, deep_conditioner_mask: 22, leave_in: 28, hair_oil_serum: 42, styling_product: 18 }
  },
  "Chamomilla Recutita (Flower) Extract": {
    baseScore: { shampoo: 58, co_wash: 48, rinse_out_conditioner: 52, deep_conditioner_mask: 55, leave_in: 58, hair_oil_serum: 22, styling_product: 28 }
  },
  "Methylchloroisothiazolinone": {
    baseScore: { shampoo: 10, co_wash: 10, rinse_out_conditioner: 10, deep_conditioner_mask: 10, leave_in: 8, hair_oil_serum: 8, styling_product: 10 }
  },
  "Glycol Distearate": {
    baseScore: { shampoo: 38, co_wash: 30, rinse_out_conditioner: 30, deep_conditioner_mask: 30, leave_in: 20, hair_oil_serum: 10, styling_product: 20 }
  },
  "Sodium Chloride": {
    baseScore: { shampoo: 30, co_wash: 24, rinse_out_conditioner: 24, deep_conditioner_mask: 24, leave_in: 20, hair_oil_serum: 10, styling_product: 20 }
  },
  "Citric Acid": {
    baseScore: { shampoo: 30, co_wash: 30, rinse_out_conditioner: 30, deep_conditioner_mask: 30, leave_in: 30, hair_oil_serum: 10, styling_product: 25 }
  },

  // ── Lauryl Glucoside ──
  "Lauryl Glucoside": {
    baseScore: { shampoo: 48, co_wash: 42, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── Ammonium sulfates ──
  "Ammonium Laureth Sulfate": {
    baseScore: { shampoo: 68, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },
  "Ammonium Lauryl Sulfate": {
    baseScore: { shampoo: 62, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── Cyclopentasiloxane, Dimethiconol ──
  "Cyclopentasiloxane": {
    baseScore: { shampoo: 3, co_wash: 28, rinse_out_conditioner: 72, deep_conditioner_mask: 75, leave_in: 60, hair_oil_serum: 82, styling_product: 78 },
    profile_compatibility: { silicone_sensitive: -1.0, porosity_low: -0.5, density_fine: -0.5 }
  },
  "Dimethiconol": {
    baseScore: { shampoo: 3, co_wash: 28, rinse_out_conditioner: 75, deep_conditioner_mask: 78, leave_in: 62, hair_oil_serum: 82, styling_product: 78 },
    profile_compatibility: { silicone_sensitive: -1.0, porosity_low: -0.5, density_fine: -0.5 }
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
