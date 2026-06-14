import { analyze } from "./engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

// Default profile for qualifying cases
const defaultProfile = {
  porosity: "high" as const,
  density: "medium" as const,
  condition: "dry" as const,
  oiliness: "dry" as const,
  curlPattern: "curly" as const,
  scalpSensitivity: false,
  proteinSensitivity: false,
  siliconeSensitivity: false,
  chemicallyTreated: false,
  goal: "moisture" as const,
};

const cases = [
  {
    name: "Q01",
    desc: "Shampoo: NO surfactant (Cetyl Alcohol, BTMS, etc.)",
    inci: "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Argan Oil, Fragrance",
    profile: { ...defaultProfile, productType: "shampoo" as const },
    expectedMin: 0,
    expectedMax: 22,
    expectDisqualified: true,
  },
  {
    name: "Q02",
    desc: "Shampoo: HAS surfactant (SCI, CAPB)",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Fragrance",
    profile: { ...defaultProfile, productType: "shampoo" as const },
    expectedMin: 58,
    expectedMax: 80,
    expectDisqualified: false,
  },
  {
    name: "Q03",
    desc: "Conditioner: NO conditioning agent (just water, glycerin, aloe)",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Fragrance",
    profile: { ...defaultProfile, productType: "rinse_out_conditioner" as const },
    expectedMin: 0,
    expectedMax: 22,
    expectDisqualified: true,
  },
  {
    name: "Q04",
    desc: "Conditioner: HAS conditioning agent (Cetearyl Alcohol, BTMC)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Fragrance",
    profile: { ...defaultProfile, productType: "rinse_out_conditioner" as const },
    expectedMin: 62,
    expectedMax: 78,
    expectDisqualified: false,
  },
  {
    name: "Q05",
    desc: "Styler: NO hold agent (just water, glycerin, aloe)",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Fragrance",
    profile: { ...defaultProfile, productType: "styling_product" as const },
    expectedMin: 0,
    expectedMax: 22,
    expectDisqualified: true,
  },
  {
    name: "Q06",
    desc: "Styler: HAS hold agent (Hydroxyethylcellulose, PVP)",
    inci: "Water, Glycerin, Hydroxyethylcellulose, Aloe Vera, PVP, Fragrance",
    profile: { ...defaultProfile, productType: "styling_product" as const, goal: "definition" as const },
    expectedMin: 62,
    expectedMax: 76,
    expectDisqualified: false,
  },
  {
    name: "Q07",
    desc: "Treatment: NO treatment active (just water, cetearyl alcohol, glycerin)",
    inci: "Water, Cetearyl Alcohol, Glycerin, Panthenol, Fragrance",
    profile: { ...defaultProfile, productType: "treatment" as const },
    expectedMin: 0,
    expectedMax: 28,
    expectDisqualified: true,
  },
  {
    name: "Q08",
    desc: "Treatment: HAS protein (Hydrolyzed Keratin)",
    inci: "Water, Hydrolyzed Keratin, Cetearyl Alcohol, Panthenol, Glycerin",
    profile: { ...defaultProfile, productType: "treatment" as const, goal: "damage-repair" as const },
    expectedMin: 65,
    expectedMax: 82,
    expectDisqualified: false,
  },
];

console.log("=== PRODUCT QUALIFICATION TEST (Q01-Q08) ===\n");

let passed = 0;
let failed = 0;

for (const c of cases) {
  const result = analyze(c.inci, c.profile, database);
  const score = result.summary.formulationScore;
  const disqualified = (result.formulation as any).disqualified === true;
  const disqualificationReason = (result.formulation as any).disqualificationReason || "";

  const scoreOk = score >= c.expectedMin && score <= c.expectedMax;
  const qualOk = disqualified === c.expectDisqualified;

  const status = scoreOk && qualOk ? "PASS" : "FAIL";
  if (status === "PASS") {
    passed++;
  } else {
    failed++;
  }

  console.log(`${status} | ${c.name} | ${c.desc}`);
  console.log(`  score=${score}  expected=[${c.expectedMin}-${c.expectedMax}]  disqualified=${disqualified}  expected_disq=${c.expectDisqualified}`);
  if (disqualified) {
    console.log(`  reason: ${disqualificationReason}`);
  }
  if (!scoreOk) {
    console.log(`  *** SCORE OUT OF RANGE ***`);
  }
  if (!qualOk) {
    console.log(`"  *** DISQUALIFICATION MISMATCH ***`);
  }
  console.log("");
}

console.log(`=== RESULTS: ${passed} passed, ${failed} failed ===`);

// Also test the cross-product formula as shampoo (the key validation from the spec)
console.log("\n=== CROSS-PRODUCT AS SHAMPOO ===");
const crossProductInci = "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Argan Oil, Hydrolyzed Rice Protein, Niacinamide, Hyaluronic Acid, Citric Acid, Phenoxyethanol";
const shampooProfile = { ...defaultProfile, productType: "shampoo" as const };
const crossResult = analyze(crossProductInci, shampooProfile, database);
const crossScore = crossResult.summary.formulationScore;
const crossDisqualified = (crossResult.formulation as any).disqualified === true;
console.log(`score=${crossScore}  expected=0-22  disqualified=${crossDisqualified}`);
if (crossScore <= 22 && crossDisqualified) {
  console.log("PASS — conditioner formula correctly disqualified as shampoo\n");
} else {
  console.log("FAIL — conditioner formula should score 0-22 as shampoo\n");
}
