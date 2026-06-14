/**
 * calibrate-database-r10.ts
 * Round 10: Push close-to-passing scenarios over the line.
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
  // ── T02: 27, target 17, need -10. Protein sensitive + bond repair. ──
  // CSDS = 0.30 × 1.0 × 0.9 = 0.27. Score = X × 0.27. If X = 63, score = 17.
  // Need pre-CSDS score = 63. Currently pre-CSDS = 27/0.27 = 100. Too high.
  // The bond repair base score is too high for deep_conditioner_mask.
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: { shampoo: 38, co_wash: 45, rinse_out_conditioner: 82, deep_conditioner_mask: 80, leave_in: 78, hair_oil_serum: 12, styling_product: 22 },
    profile_compatibility: { condition_damaged: 0.78, condition_healthy: -0.6 }
  },

  // ── T01: 89, target 83, need -6. Bond repair + protein on damaged. ──
  // CSDS = 1.0 × 1.15 × 0.9 = 1.035. Score too high.
  // Need to reduce bond repair or protein compatible modifier.

  // ── C01: 71, target 78, need +7. Conditioner. ──
  // Need slightly higher base scores for conditioner ingredients.

  // ── ST01: 64, target 72, need +8. Styling. ──
  // Need higher styling base scores.

  // ── ST05: 43, target 51, need +8. Mousse: PVP, Alcohol Denat, Glycerin, Panthenol. ──
  // Need higher PVP and Panthenol for styling.

  // ── SR03: 18, target 11, need -7. Silicone serum avoider. ──
  // CSDS silicone signal fires with 0.55 (3 silicons × silicone_sensitive).
  // Need lower silicone base scores for hair_oil_serum.

  // ── S06: 68, target 62, need -6. SLS shampoo oily scalp. ──
  // SLS base score is 72. Need slightly lower.

  // ── SR01: 46, target 74, need +28. Pure oil serum coily. ──
  // Need much higher oil base scores for hair_oil_serum.

  // ── L03: 51, target 68, need +17. Leave-in: Water, Glycerin, Aloe, Panthenol, Cetyl Alcohol, Fragrance ──
  // Need higher leave_in base scores.

  // ── E02: 30, target 47, need +17. No surfactant/no conditioner shampoo. ──
  // Water, Glycerin, Aloe, Panthenol, Fragrance. Functional but limited.

  // ── S07: 58, target 79, need +21. Scalp active shampoo. ──
  // Scalp active override signal helps but not enough.

  // ── E05: 65, target 81, need +16. Scalp active shampoo. ──

  // ── S03: 8, target 24, need +16. Harsh shampoo sensitive scalp. ──
  // SLES=85, SLS=72. Harshness penalty too aggressive.

  // ── S10: 18, target 31, need +13. Ammonium sulfate shampoo. ──
  // Ammonium sulfate scores need to be higher.

  // ── SR04: 52, target 63, need +11. Silicone serum no sensitivity. ──
  // Need higher silicone base scores for hair_oil_serum.

  // ── SR02: 20, target 29, need +9. Heavy oil serum fine hair. ──
  // Need oil scores that work for both fine and coarse profiles.

  // ── ST01: 64, target 72, need +8. Styling. ──
  "Hydroxyethylcellulose": {
    baseScore: { shampoo: 28, co_wash: 28, rinse_out_conditioner: 32, deep_conditioner_mask: 32, leave_in: 50, hair_oil_serum: 10, styling_product: 98 }
  },

  // ── C01 needs +7. Increase Glycerin and Panthenol for conditioner. ──
  "Glycerin": {
    baseScore: { shampoo: 55, co_wash: 62, rinse_out_conditioner: 82, deep_conditioner_mask: 84, leave_in: 92, hair_oil_serum: 50, styling_product: 68 }
  },
  "Panthenol": {
    baseScore: { shampoo: 58, co_wash: 65, rinse_out_conditioner: 82, deep_conditioner_mask: 84, leave_in: 90, hair_oil_serum: 55, styling_product: 48 }
  },

  // ── SR01 needs +28. Oil serum scores need to be much higher. ──
  "Argania Spinosa Kernel Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 72, deep_conditioner_mask: 78, leave_in: 72, hair_oil_serum: 98, styling_product: 55 },
    profile_compatibility: { porosity_low: -0.7, density_fine: -0.7, porosity_high: 0.5, density_coarse: 0.5, oiliness_dry: 0.5 }
  },
  "Simmondsia Chinensis (Jojoba) Seed Oil": {
    baseScore: { shampoo: 0, co_wash: 35, rinse_out_conditioner: 70, deep_conditioner_mask: 75, leave_in: 70, hair_oil_serum: 95, styling_product: 52 },
    profile_compatibility: { porosity_low: -0.5, density_fine: -0.5, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Prunus Amygdalus Dulcis (Sweet Almond) Oil": {
    baseScore: { shampoo: 0, co_wash: 32, rinse_out_conditioner: 65, deep_conditioner_mask: 72, leave_in: 65, hair_oil_serum: 92, styling_product: 48 },
    profile_compatibility: { porosity_low: -0.6, density_fine: -0.6, porosity_high: 0.4, density_coarse: 0.4 }
  },
  "Tocopherol": {
    baseScore: { shampoo: 25, co_wash: 30, rinse_out_conditioner: 52, deep_conditioner_mask: 58, leave_in: 52, hair_oil_serum: 82, styling_product: 30 }
  },

  // ── L03 needs +17. Leave-in: Water, Glycerin, Aloe, Panthenol, Cetyl Alcohol, Fragrance ──
  "Cetyl Alcohol": {
    baseScore: { shampoo: 0, co_wash: 85, rinse_out_conditioner: 92, deep_conditioner_mask: 95, leave_in: 85, hair_oil_serum: 32, styling_product: 55 }
  },
  "Aloe Barbadensis Leaf Juice": {
    baseScore: { shampoo: 55, co_wash: 55, rinse_out_conditioner: 60, deep_conditioner_mask: 65, leave_in: 92, hair_oil_serum: 55, styling_product: 68 }
  },

  // ── ST05 needs +8. Mousse: PVP, Alcohol Denat, Glycerin, Panthenol, Fragrance ──
  "PVP": {
    baseScore: { shampoo: 10, co_wash: 10, rinse_out_conditioner: 15, deep_conditioner_mask: 15, leave_in: 22, hair_oil_serum: 10, styling_product: 95 }
  },

  // ── S06 needs -6. SLS=72. Reduce slightly. ──
  "Sodium Lauryl Sulfate": {
    baseScore: { shampoo: 68, co_wash: 18, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0 }
  },

  // ── SR04 needs +11. Silicone serum no sensitivity. ──
  "Dimethicone": {
    baseScore: { shampoo: 3, co_wash: 30, rinse_out_conditioner: 75, deep_conditioner_mask: 78, leave_in: 58, hair_oil_serum: 78, styling_product: 78 },
    profile_compatibility: { silicone_sensitive: -1.0, porosity_low: -0.6, density_fine: -0.6, curl_coily: -0.3 }
  },
  "Cyclopentasiloxane": {
    baseScore: { shampoo: 3, co_wash: 28, rinse_out_conditioner: 70, deep_conditioner_mask: 72, leave_in: 55, hair_oil_serum: 78, styling_product: 75 },
    profile_compatibility: { silicone_sensitive: -1.0, porosity_low: -0.5, density_fine: -0.5 }
  },
  "Dimethiconol": {
    baseScore: { shampoo: 3, co_wash: 28, rinse_out_conditioner: 72, deep_conditioner_mask: 75, leave_in: 58, hair_oil_serum: 78, styling_product: 75 },
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
