/**
 * diagnostic-l01-evidence.ts
 * Trace L01 evidence multiplier path.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read and patch calibrateScore to log
const calPath = path.join(__dirname, "..", "scoring", "calibrationLayer.ts");
let calSrc = fs.readFileSync(calPath, "utf-8");

// Add logging to getEvidenceMultiplier
const origFn = `function getEvidenceMultiplier(evidence: number, dimensions?: readonly { strength: number; contributorCount: number }[]): number {`;
const loggedFn = `function getEvidenceMultiplier(evidence: number, dimensions?: readonly { strength: number; contributorCount: number }[]): number {
  console.log("  [EVIDENCE_MULT] evidence=" + evidence + " dims=" + JSON.stringify(dimensions?.map(d => ({s:d.strength,c:d.contributorCount}))) + " maxDim=" + (dimensions ? Math.max(...dimensions.map(d => d.strength)) : "N/A"));`;
calSrc = calSrc.replace(origFn, loggedFn);
fs.writeFileSync(calPath, calSrc);

// Now run
const { analyze } = await import("../engine/index.ts");
const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

console.log("=== L01 EVIDENCE TRACE ===");
const result = analyze(
  "Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Silk Protein, Fragrance",
  { productType: "leave_in_conditioner", curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry" } as any,
  database
);
console.log("Score:", result.summary.formulationScore);

// Restore
calSrc = calSrc.replace(loggedFn, origFn);
fs.writeFileSync(calPath, calSrc);
