/**
 * tools/auditShampooScores.ts
 * Audit current shampoo base scores for all ingredients in the 3 benchmark shampoos.
 */
import database from "../database/ingredients.v3.json";

const allNames = [
  // Good shampoo
  "Water", "Lauryl Glucoside", "Aloe Barbadensis Leaf Juice", "Glycerin",
  "Disodium Cocoyl Glutamate", "Propanediol", "Citric Acid", "Sodium Chloride",
  "Sodium Cocoyl Glutamate", "Sodium Benzoate", "Glyceryl Caprylate", "Inulin",
  "Fragrance", "Guar Hydroxypropyltrimonium Chloride", "Pullulan",
  "Polyglyceryl-4 Caprate", "Xanthan Gum", "Potassium Sorbate", "Propylene Glycol",
  "Sodium Gluconate", "Euterpe Oleracea Fruit Extract", "Hydrolyzed Rice Protein",
  // Moderate shampoo extras
  "Sodium Laureth Sulfate", "Cocamidopropyl Betaine", "Dimethylsilanol Hyaluronate",
  "Laminaria Saccharina Extract", "Coco-Glucoside", "Polyquaternium-10",
  "Glyceryl Oleate", "PEG-120 Methyl Glucose Dioleate", "Panthenol",
  "Phenoxyethanol",
  // Harsh shampoo extras
  "Sodium Lauryl Sulfate", "Alcohol Denat.", "Isopropyl Alcohol",
  "Polyquaternium-7", "PEG-80 Sorbitan Laurate", "Menthol", "Benzyl Alcohol",
  "Methylchloroisothiazolinone", "Methylisothiazolinone", "Dimethicone",
  "Cocamide DEA",
];

const db = database as { ingredients: Array<Record<string, unknown>> };

console.log("Ingredient | Shampoo Score | Category | Low flag | Oily flag");
console.log("-".repeat(80));

for (const name of allNames) {
  const r = db.ingredients.find(i => i.name === name);
  if (!r) {
    console.log(`NOT FOUND: ${name}`);
    continue;
  }
  const roles = r.product_roles as Record<string, { score: number }> | undefined;
  const score = roles?.shampoo?.score ?? "MISSING";
  const cat = r.category ?? "?";
  const low = r.low ?? "?";
  const oily = r.oily ?? "?";
  console.log(`${name} | ${score} | ${cat} | low:${low} | oily:${oily}`);
}
