import { analyze } from "./engine/index.ts";
import { scoreFormulationNew } from "./scoring/newEngine";
import { parseIngredients } from "./engine/pipeline/parser";
import { resolveIngredients } from "./engine/pipeline/resolveIngredients";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const rawInci = "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Fragrance";
const profile = {
  porosity: "med" as const,
  density: "fine" as const,
  condition: "normal" as const,
  oiliness: "normal" as const,
  productType: "shampoo" as const,
};

// Step 1: Run through full analyze()
const result = analyze(rawInci, profile, database);

console.log("=== FULL analyze() RESULT ===");
console.log("Formulation score:", result.summary.formulationScore);
console.log("Disqualified:", (result.formulation as any).disqualified ?? false);
console.log("Disqualification reason:", (result.formulation as any).disqualificationReason ?? "none");
console.log();

// Step 2: Deep dive into qualification gate
const tokens = parseIngredients(rawInci);
const resolved = resolveIngredients(tokens, database.ingredients);

console.log("=== RESOLVED INGREDIENTS ===");
for (const hit of resolved) {
  if (hit.type === "miss") {
    console.log(`MISS: ${hit.token}`);
    continue;
  }
  const name = hit.record.name;
  const tags: string[] = hit.record.tags ?? [];
  const category: string = hit.record.category ?? "none";
  console.log(`\nHIT: ${name}`);
  console.log(`  Category: ${category}`);
  console.log(`  Tags: [${tags.join(", ")}]`);

  // Reproduce the shampoo qualification check
  const hasSurfTag = tags.includes("surfactant") || tags.includes("gentle-surfactant") || tags.includes("strong-surfactant") || tags.includes("cleansing-agent");
  const n = name.toLowerCase();
  const hasSulfate = n.includes("sulfate");
  const isCondQuat = n.includes("behentrimonium") || n.includes("cetrimonium") || n.includes("quaternium") || n.includes("stearamidopropyl");
  const surfNamePasses = hasSulfate && !isCondQuat;
  const hasGlucoside = n.includes("glucoside");
  const hasIsethionate = n.includes("isethionate");
  const hasSarcosinate = n.includes("sarcosinate");
  const hasSulfosuccinate = n.includes("sulfosuccinate");
  const hasBetaineName = n.includes("betaine") && category === "Surfactant";
  const hasSurfCategory = category === "Surfactant";

  const anySurfDetected = hasSurfTag || surfNamePasses || hasGlucoside || hasIsethionate || hasSarcosinate || hasSulfosuccinate || hasBetaineName || hasSurfCategory;

  if (anySurfDetected) {
    console.log(`  >>> SURFACTANT DETECTED`);
    if (hasSurfTag) console.log(`      via tag`);
    if (surfNamePasses) console.log(`      via name (sulfate, not quat)`);
    if (hasSulfate && isCondQuat) console.log(`      NOTE: sulfate in name BUT is conditioning quat -> EXCLUDED from name check`);
    if (hasGlucoside) console.log(`      via name (glucoside)`);
    if (hasIsethionate) console.log(`      via name (isethionate)`);
    if (hasSarcosinate) console.log(`      via name (sarcosinate)`);
    if (hasSulfosuccinate) console.log(`      via name (sulfosuccinate)`);
    if (hasBetaineName) console.log(`      via name+category (betaine)`);
    if (hasSurfCategory) console.log(`      via category === "Surfactant"`);
  }
}

console.log("\n=== UNRESOLVED ===");
for (const miss of resolved) {
  if (miss.type === "miss") {
    console.log(`  ${miss.token} (${miss.reason})`);
  }
}
