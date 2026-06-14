/**
 * find-unresolved.ts
 * Find all unresolved ingredients across all 48 anchor scenarios.
 */
import { analyze } from "../engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const scenarios = [
  {id:"S01",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"S02",cat:"shampoo",inci:"Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"}},
  {id:"S03",cat:"shampoo",inci:"Water, Sodium Laureth Sulfate, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Sodium Chloride, Fragrance, Methylchloroisothiazolinone",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",scalpSensitivity:true}},
  {id:"S04",cat:"shampoo",inci:"Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",chemicallyTreated:true}},
  {id:"S05",cat:"shampoo",inci:"Water, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"S06",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"oily"}},
  {id:"S07",cat:"shampoo",inci:"Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true}},
  {id:"S08",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Hydrolyzed Keratin, Panthenol, Glycerin, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal",proteinSensitivity:true}},
  {id:"S09",cat:"shampoo",inci:"Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Chamomile Extract, Panthenol, Citric Acid",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"dry",scalpSensitivity:true}},
  {id:"S10",cat:"shampoo",inci:"Water, Ammonium Laureth Sulfate, Ammonium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Polyquaternium-10, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"C01",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"C02",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry",siliconeSensitivity:true}},
  {id:"C03",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Citric Acid",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"C04",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Butyrospermum Parkii (Shea) Butter, Cocos Nucifera (Coconut) Oil, Ricinus Communis (Castor) Seed Oil, Mangifera Indica (Mango) Seed Butter, Persea Gratissima (Avocado) Oil, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"}},
  {id:"C05",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Silk Protein, Panthenol, Citric Acid",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal"}},
  {id:"C06",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Panthenol",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal",proteinSensitivity:true}},
  {id:"C07",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"C08",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry"}},
  {id:"CW01",cat:"co_wash",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"CW02",cat:"co_wash",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"oily"}},
  {id:"L01",cat:"leave_in_conditioner",inci:"Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Silk Protein, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"}},
  {id:"L02",cat:"leave_in_conditioner",inci:"Water, Butyrospermum Parkii (Shea) Butter, Cocos Nucifera (Coconut) Oil, Ricinus Communis (Castor) Seed Oil, Mangifera Indica (Mango) Seed Butter, Glycerin, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"}},
  {id:"L03",cat:"leave_in_conditioner",inci:"Water, Glycerin, Aloe Vera, Panthenol, Cetyl Alcohol, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"L04",cat:"leave_in_conditioner",inci:"Water, Butyrospermum Parkii (Shea) Butter, Glycerin, Ricinus Communis (Castor) Seed Oil, Cetearyl Alcohol, Panthenol, Hydrolyzed Keratin, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",proteinSensitivity:true}},
  {id:"L05",cat:"leave_in_conditioner",inci:"Water, Glycerin, Aloe Vera, Panthenol, Hydrolyzed Rice Protein, Argania Spinosa Kernel Oil, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal"}},
  {id:"SR01",cat:"hair_oil_serum",inci:"Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Tocopherol",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"SR02",cat:"hair_oil_serum",inci:"Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Tocopherol",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"}},
  {id:"SR03",cat:"hair_oil_serum",inci:"Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry",siliconeSensitivity:true}},
  {id:"SR04",cat:"hair_oil_serum",inci:"Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"SR05",cat:"hair_oil_serum",inci:"Water, Niacinamide, Glycerin, Panthenol, Zinc PCA, Aloe Barbadensis Leaf Juice",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true}},
  {id:"ST01",cat:"styling_product",inci:"Water, Glycerin, Hydroxyethylcellulose, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"}},
  {id:"ST02",cat:"styling_product",inci:"Water, Glycerin, Hydroxyethylcellulose, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"}},
  {id:"ST03",cat:"styling_product",inci:"Water, Butyrospermum Parkii (Shea) Butter, Glycerin, Cetearyl Alcohol, Ricinus Communis (Castor) Seed Oil, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"ST04",cat:"styling_product",inci:"Water, Butyrospermum Parkii (Shea) Butter, Glycerin, Cetearyl Alcohol, Ricinus Communis (Castor) Seed Oil, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"}},
  {id:"ST05",cat:"styling_product",inci:"Water, PVP, Alcohol Denat., Glycerin, Panthenol, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"T01",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal"}},
  {id:"T02",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal",proteinSensitivity:true}},
  {id:"T03",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal",proteinSensitivity:true}},
  {id:"T04",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"T05",cat:"deep_conditioner_mask",inci:"Cocos Nucifera (Coconut) Oil, Argania Spinosa Kernel Oil, Ricinus Communis (Castor) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"}},
  {id:"T06",cat:"deep_conditioner_mask",inci:"Cocos Nucifera (Coconut) Oil, Argania Spinosa Kernel Oil, Ricinus Communis (Castor) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"}},
  {id:"T07",cat:"deep_conditioner_mask",inci:"Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Cetearyl Alcohol, Panthenol",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"damaged",oiliness:"normal"}},
  {id:"T08",cat:"deep_conditioner_mask",inci:"Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Cetearyl Alcohol, Panthenol",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal",proteinSensitivity:true}},
  {id:"E01",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"oily"}},
  {id:"E02",cat:"shampoo",inci:"Water, Glycerin, Aloe Vera, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"}},
  {id:"E03",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",scalpSensitivity:true,proteinSensitivity:true,siliconeSensitivity:true,chemicallyTreated:true}},
  {id:"E04",cat:"shampoo",inci:"Water, Coco Glucoside, Glycerin, Aloe Vera, Panthenol, Citric Acid",p:{curlPattern:"curly",porosity:"med",density:"med",condition:"normal",oiliness:"normal"}},
  {id:"E05",cat:"shampoo",inci:"Water, Salicylic Acid, Coco Glucoside, Glycerin, Zinc Pyrithione, Panthenol, Melaleuca Alternifolia (Tea Tree) Leaf Oil",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true}},
];

const unresolved = new Set<string>();
for (const s of scenarios) {
  const r = analyze(s.inci, {...s.p, productType: s.cat} as any, database);
  if (r.summary.unresolvedCount > 0) {
    for (const u of r.formulation.unresolved) {
      unresolved.add(u.rawQuery);
    }
  }
}

if (unresolved.size === 0) {
  console.log("No unresolved ingredients found!");
} else {
  console.log("UNRESOLVED INGREDIENTS:");
  for (const name of unresolved) {
    console.log(`  - "${name}"`);
  }
}
