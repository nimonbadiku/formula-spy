/**
 * compute-target-raw-scores.ts
 * For each failing scenario, compute: target / CSDS_modifier = needed raw score.
 * Then compute what ingredient base scores would produce that raw score.
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
  {id:"S02",cat:"shampoo",inci:"Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"},target:74},
  {id:"S04",cat:"shampoo",inci:"Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",chemicallyTreated:true},target:67},
  {id:"S06",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"oily"},target:62},
  {id:"S07",cat:"shampoo",inci:"Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true},target:79},
  {id:"S09",cat:"shampoo",inci:"Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Chamomilla Recutita (Flower) Extract, Panthenol, Citric Acid",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"dry",scalpSensitivity:true},target:61},
  {id:"C01",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:78},
  {id:"C03",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:71},
  {id:"C05",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Silk Protein, Panthenol, Citric Acid",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal"},target:76},
  {id:"C07",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:80},
  {id:"L01",cat:"leave_in_conditioner",inci:"Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Silk Protein, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"},target:76},
  {id:"L05",cat:"leave_in_conditioner",inci:"Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Rice Protein, Argania Spinosa Kernel Oil, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal"},target:77},
  {id:"SR01",cat:"hair_oil_serum",inci:"Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Tocopherol",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:74},
  {id:"ST01",cat:"styling_product",inci:"Water, Glycerin, Hydroxyethylcellulose, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"},target:72},
  {id:"ST03",cat:"styling_product",inci:"Water, Butyrospermum Parkii (Shea) Butter, Glycerin, Cetearyl Alcohol, Ricinus Communis (Castor) Seed Oil, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:73},
  {id:"ST05",cat:"styling_product",inci:"Water, PVP, Alcohol Denat., Glycerin, Panthenol, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:51},
  {id:"T01",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal"},target:83},
  {id:"T07",cat:"deep_conditioner_mask",inci:"Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Cetearyl Alcohol, Panthenol",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"damaged",oiliness:"normal"},target:77},
  {id:"E04",cat:"shampoo",inci:"Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Citric Acid",p:{curlPattern:"curly",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:65},
];

console.log("ID | CSDS | CurrentRaw | NeededRaw | Gap | TopIngredient | NeededBase");
console.log("---|------|-----------|-----------|-----|---------------|-----------");

for (const s of scenarios) {
  const r = analyze(s.inci, {...s.p, productType: s.cat} as any, database);
  const csds = (r.formulation as any).profileCompatibilityModifier;
  const currentScore = r.summary.formulationScore;
  const currentRaw = currentScore / csds;
  const neededRaw = s.target / csds;
  const gap = neededRaw - currentRaw;
  
  // Find the top ingredient
  const topIng = r.formulation.ingredients
    .filter((i: any) => i.ingredient?.record?.name !== "Water")
    .sort((a: any, b: any) => (b.finalScore || 0) - (a.finalScore || 0))[0];
  const topName = topIng?.ingredient?.record?.name || "?";
  const topBase = topIng?.ingredient?.record?.baseScore?.[s.cat] || "?";
  
  console.log(`${s.id.padEnd(4)} | ${csds.toFixed(2)} | ${currentRaw.toFixed(0).padEnd(9)} | ${neededRaw.toFixed(0).padEnd(9)} | ${(gap>0?'+':'')+gap.toFixed(0)} | ${topName.substring(0,15).padEnd(15)} | ${topBase}`);
}
