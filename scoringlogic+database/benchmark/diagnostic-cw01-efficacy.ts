/**
 * diagnostic-cw01-efficacy.ts
 * Check efficacy gate for CW01.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { checkFunctionalEfficacy } = await import("../scoring/functionalEfficacy.ts");

const rawInci = "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance";

const efficacyResult = checkFunctionalEfficacy("co_wash" as any, rawInci);
console.log("=== CW01 EFFICACY ===");
console.log(`Passed: ${efficacyResult.passed}`);
console.log(`Cap score: ${efficacyResult.capScore}`);
console.log(`Modifier: ${efficacyResult.modifier}`);
console.log(`Reason: ${efficacyResult.reason}`);
