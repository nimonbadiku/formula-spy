/**
 * calibrate-database.ts
 * 
 * Calibrates base scores and profile compatibility values in ingredients.v3.json
 * to match the 50 anchor scenarios.
 * 
 * ONLY changes database values. Does NOT touch engine logic.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const backupPath = path.join(__dirname, "..", "database", "ingredients.v3.backup.calibration.json");

// Load database
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

// Backup
fs.copyFileSync(dbPath, backupPath);
console.log(`Backup created: ${backupPath}`);

// ─── CALIBRATION TABLE ────────────────────────────────────────────────────────
// Format: ingredient name → { baseScore adjustments, profile_compatibility adjustments }
// baseScore keys: shampoo, co_wash, rinse_out_conditioner, deep_conditioner_mask, leave_in, hair_oil_serum, styling_product

interface CalibrationEntry {
  baseScore?: Record<string, number>;
  profile_compatibility?: Record<string, number>;
}

const CALIBRATIONS: Record<string, CalibrationEntry> = {
  // ── WATER: Must be 0 everywhere (inert solvent) ──
  "Water": {
    baseScore: {
      shampoo: 0, co_wash: 0, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },
  "Aqua": {
    baseScore: {
      shampoo: 0, co_wash: 0, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── SLS: Functional but harsh. Target 55-65 for shampoo ──
  "Sodium Lauryl Sulfate": {
    baseScore: {
      shampoo: 58, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    },
    profile_compatibility: {
      // Keep existing but ensure strong negatives for sensitive profiles
      porosity_high: -0.6,
      condition_damaged: -0.85,
      oiliness_dry: -0.75,
      curl_curly: -0.8,
      curl_coily: -0.9,
      chemically_treated: -0.85,
      color_treated: -0.9,
      protein_sensitive: 0,
      silicone_sensitive: 0,
    }
  },

  // ── SLES: Slightly gentler than SLS. Target 58-68 ──
  "Sodium Laureth Sulfate": {
    baseScore: {
      shampoo: 62, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    },
    profile_compatibility: {
      porosity_high: -0.5,
      condition_damaged: -0.8,
      oiliness_dry: -0.7,
      curl_curly: -0.7,
      curl_coily: -0.85,
      chemically_treated: -0.8,
      color_treated: -0.85,
    }
  },

  // ── CAPB: Genuinely gentle amphoteric. Target 60-70 ──
  "Cocamidopropyl Betaine": {
    baseScore: {
      shampoo: 65, co_wash: 70, rinse_out_conditioner: 10,
      deep_conditioner_mask: 5, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── Coco Glucoside: Gentle, good. Target 65-72 ──
  "Coco Glucoside": {
    baseScore: {
      shampoo: 68, co_wash: 60, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── Sodium Cocoyl Isethionate: Very gentle, excellent. Target 68-75 ──
  "Sodium Cocoyl Isethionate": {
    baseScore: {
      shampoo: 72, co_wash: 65, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── Lauryl Glucoside: Gentle co-surfactant ──
  "Lauryl Glucoside": {
    baseScore: {
      shampoo: 60, co_wash: 55, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    }
  },

  // ── Ammonium Laureth Sulfate: Harsh like SLES ──
  "Ammonium Laureth Sulfate": {
    baseScore: {
      shampoo: 55, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    },
    profile_compatibility: {
      porosity_high: -0.5,
      condition_damaged: -0.8,
      oiliness_dry: -0.7,
      curl_curly: -0.7,
      curl_coily: -0.85,
      chemically_treated: -0.8,
    }
  },

  // ── Ammonium Lauryl Sulfate: Harsh like SLS ──
  "Ammonium Lauryl Sulfate": {
    baseScore: {
      shampoo: 52, co_wash: 15, rinse_out_conditioner: 0,
      deep_conditioner_mask: 0, leave_in: 0, hair_oil_serum: 0, styling_product: 0
    },
    profile_compatibility: {
      porosity_high: -0.6,
      condition_damaged: -0.85,
      oiliness_dry: -0.75,
      curl_curly: -0.8,
      curl_coily: -0.9,
      chemically_treated: -0.85,
    }
  },

  // ── Glycerin: Reliable humectant. Target 62-70 ──
  "Glycerin": {
    baseScore: {
      shampoo: 65, co_wash: 55, rinse_out_conditioner: 65,
      deep_conditioner_mask: 68, leave_in: 70, hair_oil_serum: 5, styling_product: 50
    }
  },

  // ── Panthenol: Excellent vitamin/humectant. Target 65-72 ──
  "Panthenol": {
    baseScore: {
      shampoo: 68, co_wash: 60, rinse_out_conditioner: 65,
      deep_conditioner_mask: 68, leave_in: 68, hair_oil_serum: 20, styling_product: 30
    }
  },

  // ── Aloe Barbadensis Leaf Juice: Good humectant/botanical ──
  "Aloe Barbadensis Leaf Juice": {
    baseScore: {
      shampoo: 65, co_wash: 50, rinse_out_conditioner: 55,
      deep_conditioner_mask: 58, leave_in: 62, hair_oil_serum: 20, styling_product: 40
    }
  },

  // ── Fragrance: Neutral to slight negative. Target 20-30 ──
  "Fragrance": {
    baseScore: {
      shampoo: 25, co_wash: 25, rinse_out_conditioner: 25,
      deep_conditioner_mask: 25, leave_in: 20, hair_oil_serum: 20, styling_product: 25
    }
  },

  // ── Dimethicone: Good for no-sensitivity, bad for silicone-sensitive ──
  "Dimethicone": {
    baseScore: {
      shampoo: 3, co_wash: 30, rinse_out_conditioner: 72,
      deep_conditioner_mask: 74, leave_in: 55, hair_oil_serum: 70, styling_product: 72
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.5,
      density_fine: -0.5,
      curl_coily: -0.3,
    }
  },

  // ── Hydrolyzed Keratin: Excellent for damaged, bad for protein sensitive ──
  "Hydrolyzed Keratin": {
    baseScore: {
      shampoo: 30, co_wash: 35, rinse_out_conditioner: 72,
      deep_conditioner_mask: 78, leave_in: 65, hair_oil_serum: 5, styling_product: 35
    },
    profile_compatibility: {
      protein_sensitive: -0.85,
      condition_damaged: 0.6,
      condition_healthy: -0.2,
    }
  },

  // ── Shea Butter: Rich lipid, good for coarse/dry, bad for fine/low porosity ──
  "Butyrospermum Parkii (Shea) Butter": {
    baseScore: {
      shampoo: 0, co_wash: 35, rinse_out_conditioner: 70,
      deep_conditioner_mask: 75, leave_in: 60, hair_oil_serum: 65, styling_product: 55
    },
    profile_compatibility: {
      porosity_low: -0.6,
      density_fine: -0.6,
      oiliness_oily: -0.4,
      porosity_high: 0.4,
      density_coarse: 0.4,
      oiliness_dry: 0.5,
    }
  },

  // ── Cetearyl Alcohol: Fatty alcohol, beneficial in conditioners ──
  "Cetearyl Alcohol": {
    baseScore: {
      shampoo: 0, co_wash: 65, rinse_out_conditioner: 70,
      deep_conditioner_mask: 72, leave_in: 55, hair_oil_serum: 30, styling_product: 40
    },
    profile_compatibility: {
      porosity_low: -0.3,
      density_fine: -0.3,
      porosity_high: 0.3,
      density_coarse: 0.3,
    }
  },

  // ── Cetyl Alcohol: Lighter fatty alcohol ──
  "Cetyl Alcohol": {
    baseScore: {
      shampoo: 0, co_wash: 62, rinse_out_conditioner: 68,
      deep_conditioner_mask: 70, leave_in: 52, hair_oil_serum: 25, styling_product: 38
    },
    profile_compatibility: {
      porosity_low: -0.2,
      density_fine: -0.2,
      porosity_high: 0.3,
      density_coarse: 0.3,
    }
  },

  // ── Behentrimonium Chloride: Primary conditioning agent ──
  "Behentrimonium Chloride": {
    baseScore: {
      shampoo: 0, co_wash: 72, rinse_out_conditioner: 75,
      deep_conditioner_mask: 78, leave_in: 60, hair_oil_serum: 10, styling_product: 20
    }
  },

  // ── Behentrimonium Methosulfate: Gentle conditioning agent ──
  "Behentrimonium Methosulfate": {
    baseScore: {
      shampoo: 0, co_wash: 74, rinse_out_conditioner: 78,
      deep_conditioner_mask: 80, leave_in: 62, hair_oil_serum: 10, styling_product: 22
    }
  },

  // ── Hydrolyzed Silk Protein: Small protein, good for damaged ──
  "Hydrolyzed Silk Protein": {
    baseScore: {
      shampoo: 25, co_wash: 30, rinse_out_conditioner: 70,
      deep_conditioner_mask: 75, leave_in: 68, hair_oil_serum: 5, styling_product: 30
    },
    profile_compatibility: {
      protein_sensitive: -0.7,
      condition_damaged: 0.5,
    }
  },

  // ── Hydrolyzed Wheat Protein: Medium protein ──
  "Hydrolyzed Wheat Protein": {
    baseScore: {
      shampoo: 25, co_wash: 30, rinse_out_conditioner: 68,
      deep_conditioner_mask: 72, leave_in: 65, hair_oil_serum: 5, styling_product: 28
    },
    profile_compatibility: {
      protein_sensitive: -0.75,
      condition_damaged: 0.5,
    }
  },

  // ── Hydrolyzed Rice Protein: Small, gentle protein ──
  "Hydrolyzed Rice Protein": {
    baseScore: {
      shampoo: 28, co_wash: 32, rinse_out_conditioner: 72,
      deep_conditioner_mask: 76, leave_in: 70, hair_oil_serum: 5, styling_product: 32
    },
    profile_compatibility: {
      protein_sensitive: -0.5,
      condition_damaged: 0.5,
    }
  },

  // ── Bis-Aminopropyl Diglycol Dimaleate: Bond repair (Olaplex-style) ──
  "Bis-Aminopropyl Diglycol Dimaleate": {
    baseScore: {
      shampoo: 35, co_wash: 40, rinse_out_conditioner: 78,
      deep_conditioner_mask: 85, leave_in: 75, hair_oil_serum: 10, styling_product: 20
    },
    profile_compatibility: {
      condition_damaged: 0.7,
      condition_healthy: -0.3,
    }
  },

  // ── Salicylic Acid: Scalp active ──
  "Salicylic Acid": {
    baseScore: {
      shampoo: 75, co_wash: 40, rinse_out_conditioner: 10,
      deep_conditioner_mask: 15, leave_in: 20, hair_oil_serum: 30, styling_product: 10
    }
  },

  // ── Zinc Pyrithione: Scalp active ──
  "Zinc Pyrithione": {
    baseScore: {
      shampoo: 78, co_wash: 40, rinse_out_conditioner: 10,
      deep_conditioner_mask: 15, leave_in: 20, hair_oil_serum: 30, styling_product: 10
    }
  },

  // ── Niacinamide: Scalp active ──
  "Niacinamide": {
    baseScore: {
      shampoo: 40, co_wash: 35, rinse_out_conditioner: 40,
      deep_conditioner_mask: 45, leave_in: 50, hair_oil_serum: 75, styling_product: 30
    }
  },

  // ── Zinc PCA: Scalp active ──
  "Zinc PCA": {
    baseScore: {
      shampoo: 72, co_wash: 35, rinse_out_conditioner: 10,
      deep_conditioner_mask: 15, leave_in: 20, hair_oil_serum: 70, styling_product: 10
    }
  },

  // ── Methylchloroisothiazolinone: Preservative, potential irritant ──
  "Methylchloroisothiazolinone": {
    baseScore: {
      shampoo: 15, co_wash: 15, rinse_out_conditioner: 15,
      deep_conditioner_mask: 15, leave_in: 10, hair_oil_serum: 10, styling_product: 15
    },
    profile_compatibility: {
      scalp_sensitivity: -0.5,
    }
  },

  // ── Glycol Distearate: Pearlizing agent, mild ──
  "Glycol Distearate": {
    baseScore: {
      shampoo: 40, co_wash: 30, rinse_out_conditioner: 30,
      deep_conditioner_mask: 30, leave_in: 20, hair_oil_serum: 10, styling_product: 20
    }
  },

  // ── Sodium Chloride: Thickening agent, neutral ──
  "Sodium Chloride": {
    baseScore: {
      shampoo: 30, co_wash: 25, rinse_out_conditioner: 25,
      deep_conditioner_mask: 25, leave_in: 20, hair_oil_serum: 10, styling_product: 20
    }
  },

  // ── Polyquaternium-10: Conditioning polymer ──
  "Polyquaternium-10": {
    baseScore: {
      shampoo: 50, co_wash: 45, rinse_out_conditioner: 55,
      deep_conditioner_mask: 55, leave_in: 50, hair_oil_serum: 10, styling_product: 30
    }
  },

  // ── Citric Acid: pH adjuster, neutral ──
  "Citric Acid": {
    baseScore: {
      shampoo: 30, co_wash: 30, rinse_out_conditioner: 30,
      deep_conditioner_mask: 30, leave_in: 30, hair_oil_serum: 10, styling_product: 25
    }
  },

  // ── Argan Oil: Good sealant ──
  "Argania Spinosa Kernel Oil": {
    baseScore: {
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 65,
      deep_conditioner_mask: 70, leave_in: 65, hair_oil_serum: 72, styling_product: 50
    },
    profile_compatibility: {
      porosity_low: -0.5,
      density_fine: -0.5,
      porosity_high: 0.4,
      density_coarse: 0.4,
      oiliness_dry: 0.4,
    }
  },

  // ── Jojoba Oil: Light oil ──
  "Simmondsia Chinensis (Jojoba) Seed Oil": {
    baseScore: {
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 62,
      deep_conditioner_mask: 68, leave_in: 62, hair_oil_serum: 70, styling_product: 48
    },
    profile_compatibility: {
      porosity_low: -0.3,
      density_fine: -0.3,
      porosity_high: 0.4,
      density_coarse: 0.3,
    }
  },

  // ── Sweet Almond Oil ──
  "Prunus Amygdalus Dulcis (Sweet Almond) Oil": {
    baseScore: {
      shampoo: 0, co_wash: 28, rinse_out_conditioner: 60,
      deep_conditioner_mask: 65, leave_in: 58, hair_oil_serum: 68, styling_product: 45
    },
    profile_compatibility: {
      porosity_low: -0.4,
      density_fine: -0.4,
      porosity_high: 0.3,
      density_coarse: 0.3,
    }
  },

  // ── Tocopherol (Vitamin E) ──
  "Tocopherol": {
    baseScore: {
      shampoo: 20, co_wash: 25, rinse_out_conditioner: 45,
      deep_conditioner_mask: 50, leave_in: 45, hair_oil_serum: 60, styling_product: 25
    }
  },

  // ── Coconut Oil ──
  "Cocos Nucifera (Coconut) Oil": {
    baseScore: {
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 62,
      deep_conditioner_mask: 68, leave_in: 60, hair_oil_serum: 68, styling_product: 48
    },
    profile_compatibility: {
      porosity_low: -0.5,
      density_fine: -0.5,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  // ── Castor Oil ──
  "Ricinus Communis (Castor) Seed Oil": {
    baseScore: {
      shampoo: 0, co_wash: 28, rinse_out_conditioner: 60,
      deep_conditioner_mask: 65, leave_in: 58, hair_oil_serum: 66, styling_product: 45
    },
    profile_compatibility: {
      porosity_low: -0.5,
      density_fine: -0.5,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  // ── Mango Butter ──
  "Mangifera Indica (Mango) Seed Butter": {
    baseScore: {
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 62,
      deep_conditioner_mask: 68, leave_in: 58, hair_oil_serum: 60, styling_product: 45
    },
    profile_compatibility: {
      porosity_low: -0.6,
      density_fine: -0.6,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  // ── Avocado Oil ──
  "Persea Gratissima (Avocado) Oil": {
    baseScore: {
      shampoo: 0, co_wash: 30, rinse_out_conditioner: 62,
      deep_conditioner_mask: 68, leave_in: 58, hair_oil_serum: 65, styling_product: 45
    },
    profile_compatibility: {
      porosity_low: -0.5,
      density_fine: -0.5,
      porosity_high: 0.4,
      density_coarse: 0.4,
    }
  },

  // ── Cyclopentasiloxane: Volatile silicone ──
  "Cyclopentasiloxane": {
    baseScore: {
      shampoo: 3, co_wash: 25, rinse_out_conditioner: 65,
      deep_conditioner_mask: 68, leave_in: 55, hair_oil_serum: 72, styling_product: 70
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.4,
      density_fine: -0.4,
    }
  },

  // ── Dimethiconol: Silicone ──
  "Dimethiconol": {
    baseScore: {
      shampoo: 3, co_wash: 25, rinse_out_conditioner: 68,
      deep_conditioner_mask: 70, leave_in: 55, hair_oil_serum: 72, styling_product: 70
    },
    profile_compatibility: {
      silicone_sensitive: -1.0,
      porosity_low: -0.4,
      density_fine: -0.4,
    }
  },

  // ── Hydroxyethylcellulose: Thickener/gel agent ──
  "Hydroxyethylcellulose": {
    baseScore: {
      shampoo: 30, co_wash: 30, rinse_out_conditioner: 35,
      deep_conditioner_mask: 35, leave_in: 40, hair_oil_serum: 10, styling_product: 65
    }
  },

  // ── PVP: Film former/styling polymer ──
  "PVP": {
    baseScore: {
      shampoo: 10, co_wash: 10, rinse_out_conditioner: 15,
      deep_conditioner_mask: 15, leave_in: 20, hair_oil_serum: 10, styling_product: 65
    }
  },

  // ── Alcohol Denat: Drying alcohol ──
  "Alcohol Denat": {
    baseScore: {
      shampoo: 25, co_wash: 20, rinse_out_conditioner: 20,
      deep_conditioner_mask: 20, leave_in: 15, hair_oil_serum: 15, styling_product: 35
    },
    profile_compatibility: {
      condition_damaged: -0.4,
      oiliness_dry: -0.3,
    }
  },

  // ── Chamomile Extract: Soothing botanical ──
  "Chamomilla Recutita (Matricaria) Extract": {
    baseScore: {
      shampoo: 55, co_wash: 45, rinse_out_conditioner: 50,
      deep_conditioner_mask: 52, leave_in: 55, hair_oil_serum: 20, styling_product: 25
    }
  },

  // ── Tea Tree Oil: Antimicrobial ──
  "Melaleuca Alternifolia (Tea Tree) Leaf Oil": {
    baseScore: {
      shampoo: 60, co_wash: 35, rinse_out_conditioner: 15,
      deep_conditioner_mask: 20, leave_in: 25, hair_oil_serum: 35, styling_product: 15
    }
  },

  // ── Aloe Vera (short name alias) ──
  "Aloe Vera": {
    baseScore: {
      shampoo: 65, co_wash: 50, rinse_out_conditioner: 55,
      deep_conditioner_mask: 58, leave_in: 62, hair_oil_serum: 20, styling_product: 40
    }
  },
};

// ─── APPLY CALIBRATIONS ───────────────────────────────────────────────────────

let modified = 0;
let notFound = 0;

for (const [name, calibration] of Object.entries(CALIBRATIONS)) {
  // Find the ingredient in the database
  const ingredient = database.ingredients.find((ing: any) => ing.name === name);
  
  if (!ingredient) {
    console.log(`  WARNING: "${name}" not found in database`);
    notFound++;
    continue;
  }

  // Apply baseScore changes
  if (calibration.baseScore) {
    if (!ingredient.baseScore) ingredient.baseScore = {};
    if (!ingredient.product_roles) ingredient.product_roles = {};
    
    for (const [productType, score] of Object.entries(calibration.baseScore)) {
      ingredient.baseScore[productType] = score;
      // Also update product_roles for consistency
      if (!ingredient.product_roles[productType]) {
        ingredient.product_roles[productType] = {};
      }
      ingredient.product_roles[productType].score = score;
    }
    modified++;
  }

  // Apply profile_compatibility changes
  if (calibration.profile_compatibility) {
    if (!ingredient.profile_compatibility) ingredient.profile_compatibility = {};
    
    for (const [key, value] of Object.entries(calibration.profile_compatibility)) {
      ingredient.profile_compatibility[key] = value;
    }
  }
}

console.log(`\nModified ${modified} ingredients, ${notFound} not found`);

// ─── SAVE ─────────────────────────────────────────────────────────────────────

fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
console.log(`Database saved: ${dbPath}`);
console.log(`Total ingredients: ${database.ingredients.length}`);
