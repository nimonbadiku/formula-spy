/**
 * diagnose-evidence-all.ts
 * For each failing scenario, show: raw score, evidence, maxDim, multiplier, target gap.
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

// Monkey-patch to capture calibration data
const calPath = path.join(__dirname, "..", "scoring", "calibrationLayer.ts");
const origCal = fs.readFileSync(calPath, "utf-8");
const patch = origCal.replace(
  "score = score * multiplier;",
  "score = score * multiplier; if (rawScore > 50) process.stderr.write(`CAL|${rawScore.toFixed(1)}|${effectiveEvidence}|${evidence.dimensions ? Math.max(...evidence.dimensions.map((d: any) => d.strength)) : -1}|${multiplier.toFixed(2)}\\n`);"
);
fs.writeFileSync(calPath, patch);

const scenarios = [
  {id:"S03",cat:"shampoo",inci:"Water, Sodium Laureth Sulfate, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Sodium Chloride, Fragrance, Methylchloroisothiazolinone",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",scalpSensitivity:true},target:24},
  {id:"S04",cat:"shampoo",inci:"Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry",chemicallyTreated:true},target:67},
  {id:"S06",cat:"shampoo",inci:"Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"oily"},target:62},
  {id:"S07",cat:"shampoo",inci:"Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true},target:79},
  {id:"S09",cat:"shampoo",inci:"Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Chamomilla Recutita (Flower) Extract, Panthenol, Citric Acid",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"dry",scalpSensitivity:true},target:61},
  {id:"S10",cat:"shampoo",inci:"Water, Ammonium Laureth Sulfate, Ammonium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Polyquaternium-10, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:31},
  {id:"C01",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:78},
  {id:"C02",cat:"rinse_out_conditioner",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry",siliconeSensitivity:true},target:22},
  {id:"C08",cat:"rinse_out_conditioner",inci:"Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"damaged",oiliness:"dry"},target:44},
  {id:"CW02",cat:"co_wash",inci:"Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"oily"},target:18},
  {id:"L02",cat:"leave_in_conditioner",inci:"Water, Butyrospermum Parkii (Shea) Butter, Cocos Nucifera (Coconut) Oil, Ricinus Communis (Castor) Seed Oil, Mangifera Indica (Mango) Seed Butter, Glycerin, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"},target:14},
  {id:"L03",cat:"leave_in_conditioner",inci:"Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Cetyl Alcohol, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:68},
  {id:"SR01",cat:"hair_oil_serum",inci:"Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Tocopherol",p:{curlPattern:"coily",porosity:"high",density:"coarse",condition:"dry",oiliness:"dry"},target:74},
  {id:"SR02",cat:"hair_oil_serum",inci:"Argania Spinosa Kernel Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Tocopherol",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"},target:29},
  {id:"SR03",cat:"hair_oil_serum",inci:"Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry",siliconeSensitivity:true},target:11},
  {id:"SR04",cat:"hair_oil_serum",inci:"Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:63},
  {id:"SR05",cat:"hair_oil_serum",inci:"Water, Niacinamide, Glycerin, Panthenol, Zinc PCA, Aloe Barbadensis Leaf Juice",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true},target:78},
  {id:"ST01",cat:"styling_product",inci:"Water, Glycerin, Hydroxyethylcellulose, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"},target:72},
  {id:"ST02",cat:"styling_product",inci:"Water, Glycerin, Hydroxyethylcellulose, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"},target:28},
  {id:"ST04",cat:"styling_product",inci:"Water, Butyrospermum Parkii (Shea) Butter, Glycerin, Cetearyl Alcohol, Ricinus Communis (Castor) Seed Oil, Fragrance",p:{curlPattern:"straight",porosity:"low",density:"fine",condition:"normal",oiliness:"normal"},target:12},
  {id:"ST05",cat:"styling_product",inci:"Water, PVP, Alcohol Denat., Glycerin, Panthenol, Fragrance",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:51},
  {id:"T02",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal",proteinSensitivity:true},target:17},
  {id:"T03",cat:"deep_conditioner_mask",inci:"Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"damaged",oiliness:"normal",proteinSensitivity:true},target:71},
  {id:"T08",cat:"deep_conditioner_mask",inci:"Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Cetearyl Alcohol, Panthenol",p:{curlPattern:"wavy",porosity:"med",density:"med",condition:"normal",oiliness:"normal",proteinSensitivity:true},target:9},
  {id:"E02",cat:"shampoo",inci:"Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",p:{curlPattern:"curly",porosity:"high",density:"med",condition:"dry",oiliness:"dry"},target:47},
  {id:"E04",cat:"shampoo",inci:"Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Citric Acid",p:{curlPattern:"curly",porosity:"med",density:"med",condition:"normal",oiliness:"normal"},target:65},
  {id:"E05",cat:"shampoo",inci:"Water, Salicylic Acid, Coco Glucoside, Glycerin, Zinc Pyrithione, Panthenol, Melaleuca Alternifolia (Tea Tree) Leaf Oil",p:{curlPattern:"straight",porosity:"med",density:"med",condition:"normal",oiliness:"oily",scalpSensitivity:true},target:81},
];

console.log("ID | Score | Target | Gap | Raw | EffEv | MaxDim | Mult | NeedMult");
console.log("---|-------|--------|-----|-----|-------|--------|------|---------");

for (const s of scenarios) {
  const r = analyze(s.inci, {...s.p, productType: s.cat} as any, database);
  const score = r.summary.formulationScore;
  const gap = s.target - score;
  // Read calibration data from stderr
  // The patch writes to stderr, but we can't easily capture it here
  // Instead, compute what we need
  const needMult = score > 0 ? (s.target / score) : 999;
  console.log(`${s.id.padEnd(4)} | ${String(score).padEnd(5)} | ${String(s.target).padEnd(6)} | ${(gap>0?'+':'')+gap} | need×${needMult.toFixed(2)}`);
}

// Restore
fs.writeFileSync(calPath, origCal);
