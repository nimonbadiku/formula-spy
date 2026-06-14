/**
 * calibrate-database-r2.ts
 * 
 * Round 2 calibration — more aggressive adjustments based on round 1 results.
 * Key findings from round 1:
 * - Gentle surfactants still scoring too high (S02=86, S04=95, E04=90)
 * - Conditioners/co-washes/leave-ins scoring too low (C01=56, CW01=30, L01=43)
 * - Protein sensitivity conflicts not penalized enough (T02=53, L04=43)
 * - Heavy products on fine hair not penalized enough (L02=41, C04=34)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");

const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

// ─── ROUND 2 CALIBRATIONS ────────────────────────────────────────────────────

interface CalibrationEntry {
  baseScore?: Record<string, number>;
  profile_compatibility?: Record<string, number>;
}

const CALIBRATIONS: Record<string, CalibrationEntry> = {
  // ── Gentle surfactants are STILL too high ──
  // S02 (Sodium Cocoyl Isethionate + CAPB + Glycerin + Panthenol + Aloe) = 86, target 74
  // The problem: top-active weighting gives too much to these high-scoring gentle surfactants
  
  "Sodium Cocoyl Isethionate": {
    baseScore: {
      shampoo: 62, co_wash: 55, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  
  "Cocamidopropyl Betaine": {
    baseScore: {
      shampoo: 55, co_wash: 60, rinse_out_conditioner: 10,
      deep_conditioner_mask: 5, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  
  "Coco-Glucoside": {
    baseScore: {
      shampoo: 58, co_wash: 50, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  "Lauryl Glucoside": {
    baseScore: {
      shampoo: 52, co_wash: 48, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  
  // SLS needs to be higher for S01 (target 58, currently 45)
  "Sodium Lauryl Sulfate": {
    baseScore: {
      shampoo: 65, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  
  "Sodium Laureth Sulfate": {
    baseScore: {
      shampoo: 68, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  
  // Ammonium sulfates need to be higher for S10 (target 31, currently 14)
  "Ammonium Laureth Sulfate": {
    baseScore: {
      shampoo: 62, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  
  "Ammonium Lauryl Sulfate": {
    baseScore: {
      shampoo: 58, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── Conditioners need HIGHER base scores ──
  // C01 (Cetearyl + BTMC + Glycerin + Shea + Panthenol) = 56, target 78
  // C03 (Cetyl + BTMS + Glycerin + Panthenol + Aloe) = 37, target 71
  
  "Behentrimonium Chloride": {
    baseScore: {
      shampoo: 0, co_wash: 78, rinse_out_conditioner: 82,
      deep_conditioner_mask: 85, leave_in: 65, hair_oil_serum: 10, styling_product: 20
    }
  },
  
  "Behentrimonium Methosulfate": {
    baseScore: {
      shampoo: 0, co_wash: 80, rinse_out_conditioner: 85,
      deep_conditioner_mask: 88, leave_in: 68, hair_oil_serum: 10, styling_product: 22
    }
  },
  
  "Cetearyl Alcohol": {
    baseScore: {
      shampoo: 0, co_wash: 72, rinse_out_conditioner: 78,
      deep_conditioner_mask: 80, leave_in: 60, hair_oil_serum: 30, styling_product: 45
    }
  },
  
  "Cetyl Alcohol": {
    baseScore: {
      shampoo: 0, co_wash: 70, rinse_out_conditioner: 76,
      deep_conditioner_mask: 78, leave_in: 58, hair_oil_serum: 25, styling_product: 42
    }
  },

  // ── Humectants need higher scores for leave-ins and styling ──
  "Glycerin": {
    baseScore: {
      shampoo: 55, co_wash: 50, rinse_out_conditioner: 62,
      deep_conditioner_mask: 65, leave_in: 72, hair_oil_serum: 5, styling_product: 55
    }
  },
  
  "Panthenol": {
    baseScore: {
      shampoo: 58, co_wash: 55, rinse_out_conditioner: 62,
      deep_conditioner_mask: 65, leave_in: 72, hair_oil_serum: 20, styling_product: 35
    }
  },
  
  "Aloe Barbadensis Leaf Juice": {
    baseScore: {
      shampoo: 55, co_wash: 48, rinse_out_conditioner: 55,
      deep_conditioner_mask: 58, leave_in: 65, hair_oil_serum: 20, styling_product: 42
    }
  },

  // ── Lipids need higher scores for leave-ins/styling ──
  "Butyrospermum Parkii (Shea) Butter": {
    baseScore: {
      shampoo: 0, co_wash: 40, rinse_out_conditioner: 75,
      deep_conditioner_mask: 80, leave_in: 68, hair_oil_serum: 70, styling_product: 62
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

  // ── Proteins need stronger protein_sensitive penalty ──
  "Hydrolyzed Keratin": {
    baseScore: {
      shampoo: 30, co_wash: 35, rinse_out_conditioner: 75,
      deep_conditioner_mask: 80, leave_in: 68, hair_oil_serum: 5, styling_product: 35
    },
    profile_compatibility: {
      protein_sensitive: -0.92,
      condition_damaged: 0.6,
      condition_healthy: -0.25,
    }
  },

  "Hydrolyzed Wheat Protein": {
    baseScore: {
      shampoo: 28, co_wash: 32, rinse_out_conditioner: 72,
      deep_conditioner_mask: 76, leave_in: 68, hair_oil_serum: 5, styling_product: 30
    },
    profile_compatibility: {
      protein_sensitive: -0.9,
      condition_damaged: 0.5,
    }
  },

  "Silk Protein": {
    baseScore: {
      shampoo: 28, co_wash: 32, rinse_out_conditioner: 72,
      deep_conditioner_mask: 76, leave_in: 70, hair_oil_serum: 5, styling_product: 30
    },
    profile_compatibility: {
      protein_sensitive: -0.85,
      condition_damaged: 0.5,
    }
  },

  "Hydrolyzed Rice Protein": {
    baseScore: {
      shampoo: 30, co_wash: 34, rinse_out_conditioner: 75,
      deep_conditioner_mask: 78, leave_in: 72, hair_oil_serum: 5, styling_product: 32
    },
    profile_compatibility: {
      protein_sensitive: -0.7,
      condition_damaged: 0.5,
    }
  },

  // ── Bond repair needs stronger condition_damaged bonus ──
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: {
      shampoo: 35, co_wash: 42, rinse_out_conditioner: 82,
      deep_conditioner_mask: 88, leave_in: 78, hair_oil_serum: 10, styling_product: 20
    },
    profile_compatibility: {
      condition_damaged: 0.75,
      condition_healthy: -0.35,
    }
  },

  // ── Silicones — need stronger silicone_sensitive penalty ──
  "Dimethicone": {
    baseScore: {
      shampoo: 3, co_wash: 30, rinse_out_conditioner: 75,
      deep_conditioner_mask: 78, leave_in: 58, hair_oil_serum: 72, styling_product: 75
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
      shampoo: 3, co_wash: 25, rinse_out_conditioner: 68,
      deep_conditioner_mask: 70, leave_in: 55, hair_oil_serum: 75, styling_product: 72
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.5,
      density_fine: -0.5,
    }
  },

  "Dimethiconol": {
    baseScore: {
      shampoo: 3, co_wash: 25, rinse_out_conditioner: 72,
      deep_conditioner_mask: 74, leave_in: 58, hair_oil_serum: 75, styling_product: 72
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.5,
      density_fine: -0.5,
    }
  },

  // ── Styling polymers ──
  "Hydroxyethylcellulose": {
    baseScore: {
      shampoo: 25, co_wash: 25, rinse_out_conditioner: 30,
      deep_conditioner_mask: 30, leave_in: 40, hair_oil_serum: 10, styling_product: 72
    }
  },

  "PVP": {
    baseScore: {
      shampoo: 10, co_wash: 10, rinse_out_conditioner: 15,
      deep_conditioner_mask: 15, leave_in: 20, hair_oil_serum: 10, styling_product: 68
    }
  },

  // ── Scalp actives ──
  "Salicylic Acid": {
    baseScore: {
      shampoo: 80, co_wash: 42, rinse_out_conditioner: 10,
      deep_conditioner_mask: 15, leave_in: 22, hair_oil_serum: 35, styling_product: 10
    }
  },

  "Zinc Pyrithione": {
    baseScore: {
      shampoo: 82, co_wash: 42, rinse_out_conditioner: 10,
      deep_conditioner_mask: 15, leave_in: 22, hair_oil_serum: 35, styling_product: 10
    }
  },

  "Niacinamide": {
    baseScore: {
      shampoo: 42, co_wash: 38, rinse_out_conditioner: 42,
      deep_conditioner_mask: 48, leave_in: 55, hair_oil_serum: 80, styling_product: 32
    }
  },

  "Zinc PCA": {
    baseScore: {
      shampoo: 75, co_wash: 38, rinse_out_conditioner: 10,
      deep_conditioner_mask: 15, leave_in: 22, hair_oil_serum: 75, styling_product: 10
    }
  },

  // ── Fragrance: lower for sensitive scalp scenarios ──
  "Fragrance": {
    baseScore: {
      shampoo: 22, co_wash: 22, rinse_out_conditioner: 22,
      deep_conditioner_mask: 22, leave_in: 18, hair_oil_serum: 18, styling_product: 22
    }
  },

  // ── Oils ──
  "Argania Spinosa Kernel Oil": {
    baseScore: {
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 68,
      deep_conditioner_mask: 72, leave_in: 68, hair_oil_serum: 75, styling_product: 52
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
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 65,
      deep_conditioner_mask: 70, leave_in: 65, hair_oil_serum: 72, styling_product: 50
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
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 62,
      deep_conditioner_mask: 68, leave_in: 62, hair_oil_serum: 70, styling_product: 48
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
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 65,
      deep_conditioner_mask: 70, leave_in: 62, hair_oil_serum: 70, styling_product: 50
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
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 62,
      deep_conditioner_mask: 68, leave_in: 60, hair_oil_serum: 68, styling_product: 48
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
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 65,
      deep_conditioner_mask: 70, leave_in: 60, hair_oil_serum: 62, styling_product: 48
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
      shampoo: 0, co_wash: 32, rinse_out_conditioner: 65,
      deep_conditioner_mask: 70, leave_in: 60, hair_oil_serum: 68, styling_product: 48
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
      shampoo: 22, co_wash: 28, rinse_out_conditioner: 48,
      deep_conditioner_mask: 52, leave_in: 48, hair_oil_serum: 62, styling_product: 28
    }
  },

  // ── Preservative ──
  "Methylchloroisothiazolinone": {
    baseScore: {
      shampoo: 12, co_wash: 12, rinse_out_conditioner: 12,
      deep_conditioner_mask: 12, leave_in: 8, hair_oil_serum: 8, styling_product: 12
    }
  },

  // ── Misc ──
  "Glycol Distearate": {
    baseScore: {
      shampoo: 38, co_wash: 28, rinse_out_conditioner: 28,
      deep_conditioner_mask: 28, leave_in: 18, hair_oil_serum: 10, styling_product: 18
    }
  },

  "Sodium Chloride": {
    baseScore: {
      shampoo: 28, co_wash: 22, rinse_out_conditioner: 22,
      deep_conditioner_mask: 22, leave_in: 18, hair_oil_serum: 10, styling_product: 18
    }
  },

  "Polyquaternium-10": {
    baseScore: {
      shampoo: 48, co_wash: 42, rinse_out_conditioner: 55,
      deep_conditioner_mask: 55, leave_in: 50, hair_oil_serum: 10, styling_product: 32
    }
  },

  "Citric Acid": {
    baseScore: {
      shampoo: 28, co_wash: 28, rinse_out_conditioner: 28,
      deep_conditioner_mask: 28, leave_in: 28, hair_oil_serum: 10, styling_product: 22
    }
  },

  "Alcohol Denat.": {
    baseScore: {
      shampoo: 22, co_wash: 18, rinse_out_conditioner: 18,
      deep_conditioner_mask: 18, leave_in: 12, hair_oil_serum: 12, styling_product: 32
    },
    profile_compatibility: {
      condition_damaged: -0.45,
      oiliness_dry: -0.35,
    }
  },

  "Tea Tree Oil": {
    baseScore: {
      shampoo: 62, co_wash: 38, rinse_out_conditioner: 15,
      deep_conditioner_mask: 20, leave_in: 25, hair_oil_serum: 38, styling_product: 15
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
