import fs from "fs";
import path from "path";

// ─── PROFILES & INGREDIENT LISTS ─────────────────────────────────────────────
const PROFILES = [
  "low_porosity",
  "high_porosity",
  "curly",
  "coily",
  "damaged",
  "sensitive_scalp",
];

const INGREDIENTS_BY_TYPE = {
  sulfates: {
    harsh: ["Sodium Lauryl Sulfate", "Sodium Laureth Sulfate", "Ammonium Lauryl Sulfate"],
    mild: ["Sodium Cocoyl Isethionate", "Sodium Lauroyl Sarcosinate", "Cocamidopropyl Betaine"],
    safe: ["Decyl Glucoside", "Coco-Glucoside", "Lauryl Glucoside"]
  },
  proteins: {
    large: ["Hydrolyzed Wheat Protein", "Hydrolyzed Soy Protein", "Hydrolyzed Collagen"],
    small: ["Hydrolyzed Silk", "Hydrolyzed Keratin", "Amino Acids"],
    safe: ["Panthenol", "Glycerin", "Aloe Barbadensis Leaf Juice"] // Moisturizing alternatives
  },
  silicones: {
    heavy: ["Dimethicone", "Amodimethicone", "Cyclopentasiloxane"],
    light: ["Cyclomethicone", "Dimethiconol"],
    safe: ["Argania Spinosa Kernel Oil", "Simmondsia Chinensis (Jojoba) Seed Oil", "Squalane"]
  }
};

const BASE_FORMULATIONS = [
  "Water", "Cetearyl Alcohol", "Glycerin", "Behentrimonium Chloride", "Fragrance", "Phenoxyethanol" // Conditioner base
];

const SHAMPOO_BASE = [
  "Water", "Glycerin", "Fragrance", "Phenoxyethanol", "Citric Acid" // Shampoo base
];

// Helper to determine expected behavior (simplified logic for generator)
function determineExpected(type: string, profile: string, ingredientIntensity: string) {
  let expected: any = {
    overall: [50, 100] // Default range
  };
  let warnings: string[] = [];

  if (type === "sulfates") {
    if (ingredientIntensity === "harsh") {
      if (profile === "curly" || profile === "coily" || profile === "damaged" || profile === "sensitive_scalp") {
        warnings.push("Harsh Sulfate");
        expected.overall = [0, 40];
      } else {
        warnings.push("Harsh Sulfate");
        expected.overall = [30, 60];
      }
      expected.cleansing = "very_high";
    } else if (ingredientIntensity === "mild") {
      expected.overall = [60, 90];
      expected.cleansing = "medium";
    } else {
      expected.overall = [80, 100];
      expected.cleansing = "low";
    }
  } else if (type === "proteins") {
    if (ingredientIntensity === "large") {
      if (profile === "low_porosity") {
        warnings.push("Protein Overload Risk");
        expected.overall = [20, 60];
      } else if (profile === "damaged" || profile === "high_porosity") {
        expected.overall = [80, 100];
      } else {
        expected.overall = [50, 80];
      }
      expected.protein = "high";
    } else if (ingredientIntensity === "small") {
      expected.overall = [70, 100];
      expected.protein = "medium";
    } else {
      expected.overall = [80, 100];
      expected.protein = "very_low";
    }
  } else if (type === "silicones") {
    if (ingredientIntensity === "heavy") {
      if (profile === "curly" || profile === "coily" || profile === "low_porosity") {
        warnings.push("Buildup Risk");
        expected.overall = [30, 60];
      } else {
        expected.overall = [50, 80];
      }
      expected.buildup = "high";
      expected.smoothing = "high";
    } else if (ingredientIntensity === "light") {
      expected.overall = [60, 90];
      expected.buildup = "medium";
      expected.smoothing = "medium";
    } else {
      expected.overall = [80, 100];
      expected.buildup = "very_low";
    }
  }

  if (warnings.length > 0) {
    expected.warnings = warnings;
  }

  return expected;
}

// ─── GENERATOR ───────────────────────────────────────────────────────────────

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generate() {
  const rootDir = path.join(__dirname, "../benchmarks/scientific");
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  const generatedCount = {
    sulfates: 0,
    proteins: 0,
    silicones: 0
  };

  for (const [type, intensityMap] of Object.entries(INGREDIENTS_BY_TYPE)) {
    const typeDir = path.join(rootDir, type);
    if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true });

    for (const profile of PROFILES) {
      const profileDir = path.join(typeDir, profile);
      if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

      const formulations: any[] = [];
      let counter = 1;

      for (const [intensity, ingredients] of Object.entries(intensityMap)) {
        // Generate a few variations for each intensity
        for (const ingredient of ingredients) {
          // Variation 1: Single active
          const base = type === "sulfates" ? SHAMPOO_BASE : BASE_FORMULATIONS;
          const formulation1 = [base[0], ingredient, ...base.slice(1)];
          formulations.push({
            name: `${profile} ${type} ${intensity} - Single Active (${counter++})`,
            product_type: type === "sulfates" ? "shampoo" : "conditioner",
            ingredients: formulation1,
            profile: { [profile]: true }, // Needs mapping to actual profile fields later if necessary, but runner can handle it or we define it properly
            expected: determineExpected(type, profile, intensity)
          });

          // Variation 2: High concentration (first ingredient after water)
          const formulation2 = [base[0], ingredient, ingredient, ...base.slice(1)];
          formulations.push({
            name: `${profile} ${type} ${intensity} - High Concentration (${counter++})`,
            product_type: type === "sulfates" ? "shampoo" : "conditioner",
            ingredients: formulation2,
            profile: { [profile]: true },
            expected: determineExpected(type, profile, intensity) // Maybe adjust expected for high concentration
          });

          // Variation 3: Multiple actives (blend)
          const formulation3 = [base[0], ingredient, ingredients[(ingredients.indexOf(ingredient) + 1) % ingredients.length], ...base.slice(1)];
          formulations.push({
            name: `${profile} ${type} ${intensity} - Blend (${counter++})`,
            product_type: type === "sulfates" ? "shampoo" : "conditioner",
            ingredients: formulation3,
            profile: { [profile]: true },
            expected: determineExpected(type, profile, intensity)
          });
          
          generatedCount[type as keyof typeof generatedCount] += 3;
        }
      }

      // Write to file
      const filePath = path.join(profileDir, "formulations.json");
      fs.writeFileSync(filePath, JSON.stringify(formulations, null, 2), "utf8");
    }
  }

  console.log(`Generated benchmark files in ${rootDir}`);
  console.log(`Counts: `, generatedCount);
}

generate();