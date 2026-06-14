/**
 * calibrate-database-r3.ts
 * 
 * Round 3: Much more aggressive ingredient scores to compensate for
 * evidence engine suppression of simple formulas.
 * 
 * Key insight: The evidence layer normalizes by contributor count and
 * penalizes ingredients below 1% line. Simple formulas (5-7 ingredients)
 * get evidence of only 25-35%, which applies a 0.55-0.7x multiplier.
 * We need base scores high enough that after this suppression, the final
 * score lands in the target range.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");

const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

interface CalibrationEntry {
  baseScore?: Record<string, number>;
  profile_compatibility?: Record<string, number>;
}

const CALIBRATIONS: Record<string, CalibrationEntry> = {
  // ── SLS: needs to be higher for S01 (target 58, currently 40) ──
  "Sodium Lauryl Sulfate": {
    baseScore: {
      shampoo: 72, co_wash: 18, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Sodium Laureth Sulfate": {
    baseScore: {
      shampoo: 75, co_wash: 18, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Ammonium Laureth Sulfate": {
    baseScore: {
      shampoo: 70, co_wash: 18, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Ammonium Lauryl Sulfate": {
    baseScore: {
      shampoo: 65, co_wash: 18, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── CAPB: lower for S02 (target 74) ──
  "Cocamidopropyl Betaine": {
    baseScore: {
      shampoo: 52, co_wash: 55, rinse_out_conditioner: 10,
      deep_conditioner_mask: 5, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Sodium Cocoyl Isethionate": {
    baseScore: {
      shampoo: 58, co_wash: 52, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Coco-Glucoside": {
    baseScore: {
      shampoo: 55, co_wash: 48, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Lauryl Glucoside": {
    baseScore: {
      shampoo: 50, co_wash: 45, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── Conditioners: MUCH higher to overcome evidence suppression ──
  "Behentrimonium Chloride": {
    baseScore: {
      shampoo: 0, co_wash: 85, rinse_out_conditioner: 92,
      deep_conditioner_mask: 95, leave_in: 75, hair_oil_serum: 12, styling_product: 22
    }
  },

  "Behentrimonium Methosulfate": {
    baseScore: {
      shampoo: 0, co_wash: 88, rinse_out_conditioner: 95,
      deep_conditioner_mask: 98, leave_in: 78, hair_oil_serum: 12, styling_product: 25
    }
  },

  "Cetearyl Alcohol": {
    baseScore: {
      shampoo: 0, co_wash: 82, rinse_out_conditioner: 88,
      deep_conditioner_mask: 90, leave_in: 70, hair_oil_serum: 35, styling_product: 50
    }
  },

  "Cetyl Alcohol": {
    baseScore: {
      shampoo: 0, co_wash: 80, rinse_out_conditioner: 86,
      deep_conditioner_mask: 88, leave_in: 68, hair_oil_serum: 30, styling_product: 48
    }
  },

  // ── Humectants: higher for leave-ins ──
  "Glycerin": {
    baseScore: {
      shampoo: 55, co_wash: 52, rinse_out_conditioner: 68,
      deep_conditioner_mask: 72, leave_in: 82, hair_oil_serum: 5, styling_product: 60
    }
  },

  "Panthenol": {
    baseScore: {
      shampoo: 58, co_wash: 55, rinse_out_conditioner: 68,
      deep_conditioner_mask: 72, leave_in: 80, hair_oil_serum: 22, styling_product: 38
    }
  },

  "Aloe Barbadensis Leaf Juice": {
    baseScore: {
      shampoo: 55, co_wash: 50, rinse_out_conditioner: 60,
      deep_conditioner_mask: 65, leave_in: 75, hair_oil_serum: 22, styling_product: 45
    }
  },

  // ── Shea Butter: higher for leave-ins ──
  "Butyrospermum Parkii (Shea) Butter": {
    baseScore: {
      shampoo: 0, co_wash: 45, rinse_out_conditioner: 82,
      deep_conditioner_mask: 88, leave_in: 78, hair_oil_serum: 75, styling_product: 68
    },
    profile_compatibility: {
      porosity_low: -0.7,
      density_fine: -0.7,
      oiliness_oily: -0.5,
      porosity_high: 0.5,
      density_coarse: 0.5,
      oiliness_dry: 0.6,
    }
  },

  // ── Proteins ──
  "Hydrolyzed Keratin": {
    baseScore: {
      shampoo: 32, co_wash: 38, rinse_out_conditioner: 82,
      deep_conditioner_mask: 88, leave_in: 75, hair_oil_serum: 5, styling_product: 38
    },
    profile_compatibility: {
      protein_sensitive: -0.92,
      condition_damaged: 0.65,
      condition_healthy: -0.3,
    }
  },

  "Silk Protein": {
    baseScore: {
      shampoo: 30, co_wash: 35, rinse_out_conditioner: 80,
      deep_conditioner_mask: 85, leave_in: 78, hair_oil_serum: 5, styling_product: 32
    },
    profile_compatibility: {
      protein_sensitive: -0.88,
      condition_damaged: 0.55,
    }
  },

  "Hydrolyzed Wheat Protein": {
    baseScore: {
      shampoo: 30, co_wash: 35, rinse_out_conditioner: 78,
      deep_conditioner_mask: 82, leave_in: 75, hair_oil_serum: 5, styling_product: 32
    },
    profile_compatibility: {
      protein_sensitive: -0.9,
      condition_damaged: 0.55,
    }
  },

  "Hydrolyzed Rice Protein": {
    baseScore: {
      shampoo: 32, co_wash: 36, rinse_out_conditioner: 82,
      deep_conditioner_mask: 86, leave_in: 80, hair_oil_serum: 5, styling_product: 35
    },
    profile_compatibility: {
      protein_sensitive: -0.72,
      condition_damaged: 0.55,
    }
  },

  // ── Bond repair ──
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: {
      shampoo: 38, co_wash: 45, rinse_out_conditioner: 88,
      deep_conditioner_mask: 95, leave_in: 85, hair_oil_serum: 12, styling_product: 22
    },
    profile_compatibility: {
      condition_damaged: 0.78,
      condition_healthy: -0.4,
    }
  },

  // ── Silicones ──
  "Dimethicone": {
    baseScore: {
      shampoo: 3, co_wash: 32, rinse_out_conditioner: 82,
      deep_conditioner_mask: 85, leave_in: 65, hair_oil_serum: 78, styling_product: 82
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.6,
      density_fine: -0.6,
      curl_coily: -0.3,
    }
  },

  "Cyclopentasiloxane": {
    baseScore: {
      shampoo: 3, co_wash: 28, rinse_out_conditioner: 75,
      deep_conditioner_mask: 78, leave_in: 62, hair_oil_serum: 80, styling_product: 78
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.5,
      density_fine: -0.5,
    }
  },

  "Dimethiconol": {
    baseScore: {
      shampoo: 3, co_wash: 28, rinse_out_conditioner: 78,
      deep_conditioner_mask: 80, leave_in: 65, hair_oil_serum: 80, styling_product: 78
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.5,
      density_fine: -0.5,
    }
  },

  // ── Styling ──
  "Hydroxyethylcellulose": {
    baseScore: {
      shampoo: 28, co_wash: 28, rinse_out_conditioner: 32,
      deep_conditioner_mask: 32, leave_in: 45, hair_oil_serum: 10, styling_product: 80
    }
  },

  "PVP": {
    baseScore: {
      shampoo: 10, co_wash: 10, rinse_out_conditioner: 15,
      deep_conditioner_mask: 15, leave_in: 22, hair_oil_serum: 10, styling_product: 75
    }
  },

  // ── Scalp actives ──
  "Salicylic Acid": {
    baseScore: {
      shampoo: 85, co_wash: 45, rinse_out_conditioner: 12,
      deep_conditioner_mask: 18, leave_in: 25, hair_oil_serum: 38, styling_product: 12
    }
  },

  "Zinc Pyrithione": {
    baseScore: {
      shampoo: 88, co_wash: 45, rinse_out_conditioner: 12,
      deep_conditioner_mask: 18, leave_in: 25, hair_oil_serum: 38, styling_product: 12
    }
  },

  "Niacinamide": {
    baseScore: {
      shampoo: 45, co_wash: 40, rinse_out_conditioner: 45,
      deep_conditioner_mask: 50, leave_in: 58, hair_oil_serum: 85, styling_product: 35
    }
  },

  "Zinc PCA": {
    baseScore: {
      shampoo: 80, co_wash: 40, rinse_out_conditioner: 12,
      deep_conditioner_mask: 18, leave_in: 25, hair_oil_serum: 80, styling_product: 12
    }
  },

  // ── Fragrance ──
  "Fragrance": {
    baseScore: {
      shampoo: 22, co_wash: 22, rinse_out_conditioner: 22,
      deep_conditioner_mask: 22, leave_in: 18, hair_oil_serum: 18, styling_product: 22
    }
  },

  // ── Oils ──
  "Argania Spinosa Kernel Oil": {
    baseScore: {
      shampoo: 0, co_wash: 35, rinse_out_conditioner: 75,
      deep_conditioner_mask: 80, leave_in: 75, hair_oil_serum: 82, styling_product: 55
    },
    profile_compatibility: {
      porosity_low: -0.6,
      density_fine: -0.6,
      porosity_high: 0.5,
      density_coarse: 0.5,
      oiliness_dry: 0.5,
    }
  },

  "Simmondsia Chinensis (Jojoba) Seed Oil": {
    baseScore: {
      shampoo: 0, co_wash: 35, rinse_out_conditioner: 72,
      deep_conditioner_mask: 78, leave_in: 72, hair_oil_serum: 80, styling_product: 52
    },
    profile_compatibility: {
      porosity_low: -0.4,
      density_fine: -0.4,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  "Prunus Amygdalus Dulcis (Sweet Almond) Oil": {
    baseScore: {
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 68,
      deep_conditioner_mask: 75, leave_in: 68, hair_oil_serum: 78, styling_product: 50
    },
    profile_compatibility: {
      porosity_low: -0.5,
      density_fine: -0.5,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  "Cocos Nucifera (Coconut) Oil": {
    baseScore: {
      shampoo: 0, co_wash: 35, rinse_out_conditioner: 72,
      deep_conditioner_mask: 78, leave_in: 68, hair_oil_serum: 78, styling_product: 52
    },
    profile_compatibility: {
      porosity_low: -0.6,
      density_fine: -0.6,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  "Ricinus Communis (Castor) Seed Oil": {
    baseScore: {
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 68,
      deep_conditioner_mask: 75, leave_in: 65, hair_oil_serum: 75, styling_product: 50
    },
    profile_compatibility: {
      porosity_low: -0.6,
      density_fine: -0.6,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  "Mangifera Indica (Mango) Seed Butter": {
    baseScore: {
      shampoo: 0, co_wash: 35, rinse_out_conditioner: 72,
      deep_conditioner_mask: 78, leave_in: 68, hair_oil_serum: 68, styling_product: 52
    },
    profile_compatibility: {
      porosity_low: -0.7,
      density_fine: -0.7,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  "Persea Gratissima (Avocado) Oil": {
    baseScore: {
      shampoo: 0, co_wash: 35, rinse_out_conditioner: 72,
      deep_conditioner_mask: 78, leave_in: 68, hair_oil_serum: 75, styling_product: 52
    },
    profile_compatibility: {
      porosity_low: -0.6,
      density_fine: -0.6,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  "Tocopherol": {
    baseScore: {
      shampoo: 25, co_wash: 30, rinse_out_conditioner: 52,
      deep_conditioner_mask: 58, leave_in: 52, hair_oil_serum: 68, styling_product: 30
    }
  },

  // ── Misc ──
  "Methylchloroisothiazolinone": {
    baseScore: {
      shampoo: 12, co_wash: 12, rinse_out_conditioner: 12,
      deep_conditioner_mask: 12, leave_in: 8, hair_oil_serum: 8, styling_product: 12
    }
  },

  "Glycol Distearate": {
    baseScore: {
      shampoo: 40, co_wash: 30, rinse_out_conditioner: 30,
      deep_conditioner_mask: 30, leave_in: 20, hair_oil_serum: 10, styling_product: 20
    }
  },

  "Sodium Chloride": {
    baseScore: {
      shampoo: 30, co_wash: 24, rinse_out_conditioner: 24,
      deep_conditioner_mask: 24, leave_in: 20, hair_oil_serum: 10, styling_product: 20
    }
  },

  "Polyquaternium-10": {
    baseScore: {
      shampoo: 52, co_wash: 48, rinse_out_conditioner: 60,
      deep_conditioner_mask: 60, leave_in: 55, hair_oil_serum: 12, styling_product: 35
    }
  },

  "Citric Acid": {
    baseScore: {
      shampoo: 30, co_wash: 30, rinse_out_conditioner: 30,
      deep_conditioner_mask: 30, leave_in: 30, hair_oil_serum: 10, styling_product: 25
    }
  },

  "Alcohol Denat.": {
    baseScore: {
      shampoo: 24, co_wash: 20, rinse_out_conditioner: 20,
      deep_conditioner_mask: 20, leave_in: 14, hair_oil_serum: 14, styling_product: 38
    },
    profile_compatibility: {
      condition_damaged: -0.45,
      oiliness_dry: -0.35,
    }
  },

  "Tea Tree Oil": {
    baseScore: {
      shampoo: 65, co_wash: 40, rinse_out_conditioner: 18,
      deep_conditioner_mask: 22, leave_in: 28, hair_oil_serum: 40, styling_product: 18
    }
  },

  "Chamomilla Recutita (Flower) Extract": {
    baseScore: {
      shampoo: 58, co_wash: 48, rinse_out_conditioner: 52,
      deep_conditioner_mask: 55, leave_in: 58, hair_oil_serum: 22, styling_product: 28
    }
  },
};

// ─── APPLY ────────────────────────────────────────────────────────────────────

let modified = 0;
for (const [name, calibration] of Object.entries(CALIBRATIONS)) {
  const ingredient = database.ingredients.find((ing: any) => ing.name === name);
  if (!ingredient) {
    console.log(`  WARNING: "${name}" not found`);
    continue;
  }

  if (calibration.baseScore) {
    if (!ingredient.baseScore) ingredient.baseScore = {};
    if (!ingredient.product_roles) ingredient.product_roles = {};
    for (const [pt, score] of Object.entries(calibration.baseScore)) {
      ingredient.baseScore[pt] = score;
      if (!ingredient.product_roles[pt]) ingredient.product_roles[pt] = {};
      ingredient.product_roles[pt].score = score;
    }
    modified++;
  }

  if (calibration.profile_compatibility) {
    if (!ingredient.profile_compatibility) ingredient.profile_compatibility = {};
    for (const [key, value] of Object.entries(calibration.profile_compatibility)) {
      ingredient.profile_compatibility[key] = value;
    }
  }
}

console.log(`Modified ${modified} ingredients`);

fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
console.log(`Database saved`);
