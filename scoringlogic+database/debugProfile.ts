import { analyze } from "./engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const database = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

const rawInci = "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Fragrance";

const profile = {
  porosity: "low",
  density: "medium",
  condition: "normal",
  oiliness: "dry",
  productType: "shampoo",
  curlPattern: "curly",
  scalpSensitivity: false,
  proteinSensitivity: false,
  siliconeSensitivity: false,
  chemicallyTreated: false,
};

const result = analyze(rawInci, profile as any, database);
console.log("Score:", result.summary.formulationScore);
console.log("Disqualified:", (result.formulation as any).disqualified ?? false);
console.log("Reason:", (result.formulation as any).disqualificationReason ?? "none");
