import { analyze } from "./engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const cases = [
  { name: "A04", inci: "Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Rice Protein, Cetrimonium Chloride, Propylene Glycol, Camellia Sinensis Leaf Extract, Behentrimonium Methosulfate, Cetyl Alcohol, Phenoxyethanol, Fragrance, Lactic Acid, Arginine, Citric Acid, Sodium PCA, Tocopherol, Caprylyl Glycol, Disodium EDTA, Benzyl Alcohol, Potassium Sorbate, Water",
    profile: {porosity:'med',density:'fine',condition:'healthy',oiliness:'normal',productType:'leave_in_conditioner' as const,curlPattern:'wavy' as const,scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'frizz-control' as const}, expMin: 68, expMax: 80 },
  { name: "A20", inci: "Water, Glycerin, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Sodium PCA, Hyaluronic Acid, Honey, Sorbitol, Betaine, Cetrimonium Chloride, Phenoxyethanol, Fragrance, Citric Acid, Potassium Sorbate, Tocopherol",
    profile: {porosity:'high',density:'coarse',condition:'dry',oiliness:'dry',productType:'leave_in_conditioner' as const,curlPattern:'coily' as const,scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'moisture' as const}, expMin: 70, expMax: 82 },
  { name: "B09", inci: "Water, Shea Butter, Castor Oil, Coconut Oil, Cetearyl Alcohol, Glycerin, Fragrance",
    profile: {porosity:'low',density:'fine',condition:'healthy',oiliness:'normal',productType:'leave_in_conditioner' as const,curlPattern:'straight' as const,scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'volume' as const}, expMin: 10, expMax: 22 },
  { name: "B10", inci: "Water, Glycerin, Aloe Vera, Panthenol, Cetrimonium Chloride, Propylene Glycol, Fragrance",
    profile: {porosity:'low',density:'fine',condition:'healthy',oiliness:'normal',productType:'leave_in_conditioner' as const,curlPattern:'straight' as const,scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'volume' as const}, expMin: 38, expMax: 56 },
];

for (const c of cases) {
  const r = analyze(c.inci, c.profile, database);
  const s = r.summary.formulationScore;
  const ok = s >= c.expMin && s <= c.expMax ? "PASS" : "FAIL";
  console.log(`${c.name}: score=${s}  expected=[${c.expMin}-${c.expMax}]  ${ok}`);
}

// Also check some rinse_out cases
const rinseCases = [
  { name: "A02", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Hydrolyzed Rice Protein, Niacinamide, Phenoxyethanol, Citric Acid",
    profile: {porosity:'high',density:'med',condition:'dry',oiliness:'dry',productType:'rinse_out_conditioner' as const,curlPattern:'curly' as const,scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'moisture' as const}, expMin: 54, expMax: 70 },
  { name: "C01", inci: "Water, Behentrimonium Methosulfate, Cetyl Alcohol, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Wheat Protein, Phenoxyethanol, Fragrance, Citric Acid",
    profile: {porosity:'high',density:'coarse',condition:'dry',oiliness:'dry',productType:'rinse_out_conditioner' as const,curlPattern:'coily' as const,scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'moisture' as const}, expMin: 62, expMax: 80 },
];

for (const c of rinseCases) {
  const r = analyze(c.inci, c.profile, database);
  const s = r.summary.formulationScore;
  const ok = s >= c.expMin && s <= c.expMax ? "PASS" : "FAIL";
  console.log(`${c.name}: score=${s}  expected=[${c.expMin}-${c.expMax}]  ${ok}`);
}
