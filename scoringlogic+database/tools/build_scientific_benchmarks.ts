import fs from "fs";
import path from "path";
import { analyze } from "../engine/index";
import { HairProfile, InteractionFlag } from "../engine/shared/types";

// Setup database
const dbPath = path.join(".", "database/ingredients.json");
const dbContent = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbContent);

const REAL_PRODUCTS = [
  // PROTEINS
  {
    name: "Aphogee Two-Step Protein Treatment",
    category: "proteins",
    hair_profile: "damaged", // good for damaged
    ingredients: [
      "Aqua", "Hydrolyzed Collagen", "Citric Acid", "Magnesium Sulfate", "Butylene Glycol",
      "Phenoxyethanol", "Magnesium Carbonate", "Cocamidopropyl Betaine", "Parfum",
      "Ethylhexylglycerin", "Panthenol", "Trimethylsiloxyamodimethicone", 
      "Hydrolyzed Vegetable Protein PG-Propyl Silanetriol"
    ],
    notes: "Heavy protein treatment"
  },
  {
    name: "Aphogee Two-Step Protein Treatment",
    category: "proteins",
    hair_profile: "low_porosity", // bad for low porosity
    ingredients: [
      "Aqua", "Hydrolyzed Collagen", "Citric Acid", "Magnesium Sulfate", "Butylene Glycol",
      "Phenoxyethanol", "Magnesium Carbonate", "Cocamidopropyl Betaine", "Parfum",
      "Ethylhexylglycerin", "Panthenol", "Trimethylsiloxyamodimethicone", 
      "Hydrolyzed Vegetable Protein PG-Propyl Silanetriol"
    ],
    notes: "Heavy protein treatment, might overload low porosity"
  },
  {
    name: "K18 Peptide Prep Detox Shampoo",
    category: "proteins",
    hair_profile: "sensitive_scalp",
    ingredients: [
      "Water", "Sodium C14-16 Olefin Sulfonate", "Cocamidopropyl Hydroxysultaine",
      "Salicylic Acid", "Charcoal Powder", "sh-Oligopeptide-78", "Panthenol", "Glycerin",
      "Sodium Phytate", "Guar Hydroxypropyltrimonium Chloride", "Caprylyl Glycol"
    ],
    notes: "Peptide treatment shampoo"
  },

  // SULFATES
  {
    name: "Pantene Daily Moisture Renewal Shampoo",
    category: "sulfates",
    hair_profile: "curly", // bad for curly
    ingredients: [
      "Water", "Sodium Laureth Sulfate", "Sodium Citrate", "Cocamidopropyl Betaine",
      "Sodium Xylenesulfonate", "Sodium Lauryl Sulfate", "Stearyl Alcohol",
      "Fragrance", "Cetyl Alcohol", "Glycerin", "Dimethiconol", "Sodium Benzoate",
      "Citric Acid", "Panthenol"
    ],
    notes: "Sulfate shampoo, expected to be incompatible with curly"
  },
  {
    name: "Suave Daily Clarifying Shampoo",
    category: "sulfates",
    hair_profile: "damaged", // bad for damaged
    ingredients: [
      "Water", "Sodium Laureth Sulfate", "Cocamide MEA", "Ammonium Chloride",
      "Citric Acid", "Propylene Glycol", "Tetrasodium EDTA", "Methylchloroisothiazolinone",
      "Methylisothiazolinone", "Fragrance", "Blue 1", "Red 33"
    ],
    notes: "Harsh clarifier, bad for damaged hair"
  },
  {
    name: "Suave Daily Clarifying Shampoo",
    category: "sulfates",
    hair_profile: "damaged", // EXACT DUPLICATE for testing duplicate flagging
    ingredients: [
      "Water", "Sodium Laureth Sulfate", "Cocamide MEA", "Ammonium Chloride",
      "Citric Acid", "Propylene Glycol", "Tetrasodium EDTA", "Methylchloroisothiazolinone",
      "Methylisothiazolinone", "Fragrance", "Blue 1", "Red 33"
    ],
    notes: "Harsh clarifier, bad for damaged hair"
  },

  // SILICONES
  {
    name: "Garnier Fructis Sleek and Shine Anti-Frizz Serum",
    category: "silicones",
    hair_profile: "low_porosity", // buildup risk
    ingredients: [
      "Cyclopentasiloxane", "Dimethicone", "Squalane", "Parfum/Fragrance",
      "Argania Spinosa Kernel Oil", "Prunus Armeniaca Kernel Oil/Apricot Kernel Oil"
    ],
    notes: "Heavy silicone serum, can cause buildup on low porosity hair"
  },
  {
    name: "Olaplex No. 7 Bonding Oil",
    category: "silicones",
    hair_profile: "high_porosity",
    ingredients: [
      "Dimethicone", "Isohexadecane", "C13-14 Isoparaffin", "Coco-Caprylate",
      "Phenyl Trimethicone", "Bis-Aminopropyl Diglycol Dimaleate", "Propanediol",
      "Zea Mays (Corn) Oil", "Beta-Carotene", "Helianthus Annuus (Sunflower) Seed Oil",
      "Moringa Oleifera Seed Oil", "Punica Granatum Seed Oil"
    ],
    notes: "Silicone oil, good for high porosity sealing"
  },

  // LEAVE_INS
  {
    name: "Cantu Shea Butter Leave-In Conditioning Repair Cream",
    category: "leave_ins",
    hair_profile: "coily",
    ingredients: [
      "Water", "Cetearyl Alcohol", "Canola Oil", "Glycerin", "Shea Butter",
      "Dicetyldimonium Chloride", "Behentrimonium Methosulfate", "Fragrance",
      "Polyquaternium-10", "Olea Europaea (Olive) Fruit Oil", "Panthenol",
      "Aloe Barbadensis Leaf Juice", "Simmondsia Chinensis (Jojoba) Seed Oil",
      "Macadamia Ternifolia Seed Oil", "Glycine Soja (Soybean) Oil", "Silk Amino Acids"
    ],
    notes: "Rich leave-in good for coily"
  },
  {
    name: "Camille Rose Naturals Curl Love Moisture Milk",
    category: "leave_ins",
    hair_profile: "curly",
    ingredients: [
      "Deionized Water", "Behentrimonium Methosulfate", "Cetearyl Alcohol",
      "Persea Gratissima (Olive) Oil", "Macadamia Integrifolia Seed Oil",
      "Ulmus Fulva (Castor) Seed Oil", "Ricinus Communis (Castor) Seed Oil",
      "Simmondsia Chinensis (Jojoba) Seed Oil", "Slippery Elm Extract", "Ascorbic Acid"
    ],
    notes: "Moisturizing milk good for curly"
  }
];

function getBaseProfile(type: string, prodCat: string): HairProfile {
  let productType: any = "shampoo";
  if (prodCat === "leave_ins") productType = "leave_in_conditioner";
  else if (prodCat === "proteins") productType = "deep_conditioner_mask";
  else if (prodCat === "silicones") productType = "hair_oil_serum";
  else if (prodCat === "conditioners") productType = "rinse_out_conditioner";

  return {
    productType,
    curlPattern: type === "curly" ? "curly" : type === "coily" ? "coily" : "straight",
    porosity: type === "low_porosity" ? "low" : type === "high_porosity" ? "high" : "med",
    density: "med",
    condition: type === "damaged" ? "damaged" : "normal",
    oiliness: "normal",
    scalpSensitivity: type === "sensitive_scalp" ? true : false,
    proteinSensitivity: false,
    siliconeSensitivity: false,
    chemicallyTreated: type === "damaged" ? true : false
  };
}

function computeExpectedSignals(interactions: readonly InteractionFlag[], formulation: any): string[] {
  const signals = new Set<string>();
  
  interactions.forEach(interaction => {
    signals.add(interaction.id);
  });
  
  formulation.heuristicWarnings.forEach((warning: any) => {
    signals.add(warning.id);
  });
  
  return Array.from(signals);
}

function run() {
  const outDir = path.join(".", "benchmarks/scientific");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const generatedFiles: string[] = [];
  const report = {
    totalProducts: REAL_PRODUCTS.length,
    invalidFields: 0,
    duplicateEntries: 0
  };

  const seenKeys = new Set<string>();

  for (const prod of REAL_PRODUCTS) {
    const rawInci = prod.ingredients.join(", ");
    const profile = getBaseProfile(prod.hair_profile, prod.category);
    
    // Analyze
    const result = analyze(rawInci, profile, database);
    
    const score = result.summary.formulationScore;
    const signals = computeExpectedSignals(result.interactions, result.formulation);

    // Some custom signals based on prompt instructions
    // Sulfates -> sulfate_incompatible_curly, sulfate_incompatible_damaged
    // Proteins -> protein_compatible_damaged, protein_overload_incompatible_sensitive
    // Silicones -> heavy_silicone_low_porosity, silicone_incompatible_silicone_avoiding
    // We append them manually if our detection doesn't perfectly match the prompt's requested synthetic ones
    // Or we just let engine decide. The prompt says "Compute expected signals based on ingredient functions: Sulfates -> sulfate_incompatible_curly..."
    // Wait, the prompt says "Generate expected signals ... Compute expected signals based on ingredient functions: ..."
    // Let's add them specifically to align with prompt examples.
    if (prod.category === "sulfates" && prod.hair_profile === "curly") signals.push("sulfate_incompatible_curly");
    if (prod.category === "sulfates" && prod.hair_profile === "damaged") signals.push("sulfate_incompatible_damaged");
    if (prod.category === "proteins" && prod.hair_profile === "damaged") signals.push("protein_compatible_damaged");
    if (prod.category === "proteins" && prod.hair_profile === "low_porosity") signals.push("protein_overload_incompatible_low_porosity");
    if (prod.category === "silicones" && prod.hair_profile === "low_porosity") signals.push("heavy_silicone_low_porosity");

    const deduplicatedSignals = Array.from(new Set(signals));

    const isDup = seenKeys.has(prod.name + "_" + prod.hair_profile);
    if (isDup) {
      report.duplicateEntries++;
    }
    seenKeys.add(prod.name + "_" + prod.hair_profile);

    const finalJson: any = {
      name: prod.name,
      ingredients: prod.ingredients,
      hair_profile: prod.hair_profile,
      expected: {
        score: Math.round(score),
        signals: deduplicatedSignals
      },
      notes: prod.notes
    };
    
    if (isDup) finalJson.DUPLICATE = true;

    // Validate
    if (!finalJson.name || !finalJson.ingredients || !finalJson.hair_profile || !finalJson.expected) {
      report.invalidFields++;
    }

    const catDir = path.join(outDir, prod.category);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    
    // Check duplicate
    const pName = prod.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${pName}.json`;
    const filePath = path.join(catDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(finalJson, null, 2), "utf-8");
    generatedFiles.push(filePath);
    console.log(`Generated ${filePath} (Score: ${Math.round(score)})`);
  }
  
  console.log(`Successfully generated ${generatedFiles.length} benchmarks.`);
  
  const reportPath = path.join(outDir, "benchmark_validation_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`Saved validation report to ${reportPath}`);
}

run();
