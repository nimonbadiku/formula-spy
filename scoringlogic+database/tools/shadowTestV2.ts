// Ensure Node built-ins are recognized
declare module "fs";
declare module "path";
declare const process: any;

import fs from "fs";
import path from "path";
import { analyze, HairProfile, IngredientDatabase, ProductType } from "../engine/index";
import { analyzeV2 } from "../engine/v2/index";
import { FitLevel, FormulationTendency } from "../engine/v2/types";

const DB_PATH = path.resolve(process.cwd(), "database/ingredients.v3.json");
let db: IngredientDatabase;
try {
  db = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as IngredientDatabase;
} catch (err: any) {
  console.error(`\x1b[31mFailed to load database from ${DB_PATH}: ${err.message}\x1b[0m`);
  process.exit(1);
}

interface ProcessStats {
  total: number;
  disagreements: number;
}

function processProduct(name: string, category: string, rawInci: string, profile: HairProfile) {
  console.log(`\n=============================================================`);
  console.log(`\x1b[36mProduct:\x1b[0m ${name} (${category})`);
  console.log(`=============================================================`);

  try {
    // V1 Analysis
    const v1Result = analyze(rawInci, profile, db);
    const score = v1Result?.summary?.formulationScore || 0;
    
    console.log(`\n\x1b[33m--- V1 ENGINE (LEGACY) ---\x1b[0m`);
    console.log(`Score: \x1b[1m${score.toFixed(1)}/100\x1b[0m`);
    
    if (v1Result?.summary?.subscores) {
      console.log(`Subscores:`);
      console.log(`  Cleansing: ${v1Result.summary.subscores.cleansing.toFixed(1)}`);
      console.log(`  Conditioning: ${v1Result.summary.subscores.conditioning.toFixed(1)}`);
      console.log(`  Buildup: ${v1Result.summary.subscores.buildup.toFixed(1)}`);
    }

    if (v1Result?.summary?.heuristicWarningCount > 0) {
      console.log(`Warnings: ${v1Result.summary.heuristicWarningCount}`);
    }

    // V2 Analysis
    const v2Result = analyzeV2(rawInci, profile, db);
    
    console.log(`\n\x1b[32m--- V2 ENGINE (NEW) ---\x1b[0m`);
    
    if (!v2Result || !v2Result.compatibility) {
      console.log(`\x1b[31mError: V2 result missing compatibility object\x1b[0m`);
      return { v1Score: score, v2FitLevel: "unknown" as FitLevel };
    }

    console.log(`Fit Level: \x1b[1m${v2Result.compatibility.fitLevel.toUpperCase()}\x1b[0m`);
    
    if (v2Result.formulationProfile) {
      const intents = [v2Result.formulationProfile.primaryIntent, ...(v2Result.formulationProfile.secondaryIntents || [])].filter(Boolean);
      if (intents.length > 0) {
        console.log(`Intent: ${intents.join(", ")}`);
      }

      if (v2Result.formulationProfile.tendencies && v2Result.formulationProfile.tendencies.length > 0) {
        console.log(`Tendencies: ${v2Result.formulationProfile.tendencies.map((t: FormulationTendency) => t.id).join(", ")}`);
      }
    }

    if (v2Result.compatibility.cautions && v2Result.compatibility.cautions.length > 0) {
      console.log(`Cautions:`);
      v2Result.compatibility.cautions.forEach((c: any) => {
        // Handle gracefully whether caution is an object with reason, or just a string
        const msg = typeof c === 'string' ? c : c.reason || JSON.stringify(c);
        console.log(`  - ${msg}`);
      });
    }
    
    if (v2Result.explanation && v2Result.explanation.overallSummary) {
      console.log(`\n\x1b[35mSummary Explanation:\x1b[0m\n${v2Result.explanation.overallSummary}`);
      if (v2Result.explanation.keyStrengths?.length) {
        console.log(`\n\x1b[35mKey Strengths:\x1b[0m\n  - ${v2Result.explanation.keyStrengths.join('\n  - ')}`);
      }
      if (v2Result.explanation.keyCautions?.length) {
        console.log(`\n\x1b[35mKey Cautions:\x1b[0m\n  - ${v2Result.explanation.keyCautions.join('\n  - ')}`);
      }
      if (v2Result.explanation.usageAdvice?.length) {
        console.log(`\n\x1b[35mUsage Advice:\x1b[0m\n  - ${v2Result.explanation.usageAdvice.join('\n  - ')}`);
      }
      if (v2Result.explanation.transparencyNotes?.length) {
        console.log(`\n\x1b[35mTransparency Notes:\x1b[0m\n  - ${v2Result.explanation.transparencyNotes.join('\n  - ')}`);
      }
    }

    return { v1Score: score, v2FitLevel: v2Result.compatibility.fitLevel };
  } catch (err: any) {
    console.log(`\x1b[31mError analyzing product:\x1b[0m ${err.message}`);
    return null;
  }
}

function normalizeProfile(p: any): HairProfile {
  // Safe extraction to proper enums/defaults
  const porosityMap: Record<string, "low" | "med" | "high"> = { low: "low", med: "med", medium: "med", high: "high" };
  const densityMap: Record<string, "fine" | "med" | "coarse"> = { fine: "fine", med: "med", medium: "med", thick: "coarse", coarse: "coarse" };
  const conditionMap: Record<string, "damaged" | "normal" | "healthy"> = { damaged: "damaged", normal: "normal", healthy: "healthy" };
  const oilinessMap: Record<string, "dry" | "normal" | "oily"> = { dry: "dry", normal: "normal", oily: "oily" };

  return {
    porosity: porosityMap[p?.porosity?.toLowerCase()] || "med",
    density: densityMap[p?.density?.toLowerCase()] || "med",
    condition: conditionMap[p?.condition?.toLowerCase()] || "normal",
    oiliness: oilinessMap[p?.oiliness?.toLowerCase()] || "normal",
    productType: (p?.productType || "shampoo") as ProductType,
    curlPattern: p?.curlPattern,
    scalpSensitivity: !!p?.scalpSensitivity,
    proteinSensitivity: !!p?.proteinSensitivity,
    siliconeSensitivity: !!p?.siliconeSensitivity,
    chemicallyTreated: !!p?.chemicallyTreated
  };
}

function isGoodV2Fit(fit: FitLevel): boolean {
  return fit === "strong_fit" || fit === "good_fit";
}

function processFile(filePath: string, limit: number): ProcessStats {
  console.log(`\nProcessing File: ${filePath}`);
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err: any) {
    console.error(`\x1b[31mFailed to read JSON file ${filePath}: ${err.message}\x1b[0m`);
    return { total: 0, disagreements: 0 };
  }

  let stats: ProcessStats = { total: 0, disagreements: 0 };
  let products: any[] = [];
  let baseProfile: any = {};

  if (Array.isArray(data)) {
    products = data;
  } else if (data.expectedRanking && Array.isArray(data.expectedRanking)) {
    products = data.expectedRanking;
    baseProfile = data.profile || {};
  } else {
    console.log(`\x1b[33mSkipping ${filePath} - unsupported format.\x1b[0m`);
    return stats;
  }

  if (limit > 0) {
    products = products.slice(0, limit);
  }

  for (const prod of products) {
    const pProfile = prod.profile ? { ...baseProfile, ...prod.profile } : baseProfile;
    if (!pProfile.productType) {
      pProfile.productType = prod.productType || prod.product_type || "shampoo";
    }

    const profile = normalizeProfile(pProfile);
    const rawInci = Array.isArray(prod.ingredients) ? prod.ingredients.join(", ") : prod.ingredients;
    
    if (rawInci) {
      const result = processProduct(prod.name || "Unknown Product", prod.category || prod.productType || "Unknown", rawInci, profile);
      if (result) {
        stats.total++;
        
        // Intelligent disagreement detection
        const v1Score = result.v1Score;
        const v2Fit = result.v2FitLevel;
        
        let isDisagreement = false;
        
        // V1 highly recommends but V2 says Poor or Caution
        if (v1Score >= 75 && (v2Fit === "poor_fit" || v2Fit === "caution")) {
          isDisagreement = true;
        } 
        // V1 fails it but V2 says Strong or Good Fit
        else if (v1Score <= 40 && (v2Fit === "strong_fit" || v2Fit === "good_fit")) {
          isDisagreement = true;
        }

        if (isDisagreement) {
          stats.disagreements++;
          console.log(`\n\x1b[41m\x1b[37m >>> MAJOR DISAGREEMENT: V1 Score (${v1Score.toFixed(1)}) vs V2 Fit (${v2Fit.toUpperCase()}) \x1b[0m`);
        }
      }
    }
  }
  return stats;
}

function main() {
  const args = process.argv.slice(2);
  let targetPath = "";
  let limit = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir") {
      targetPath = args[++i];
    } else if (args[i] === "--limit") {
      limit = parseInt(args[++i], 10);
    } else if (!args[i].startsWith("--") && !targetPath) {
      targetPath = args[i];
    }
  }

  if (!targetPath) {
    console.log(`\x1b[31mError: Please provide a file or directory path.\x1b[0m`);
    console.log(`Usage: npx tsx tools/shadowTestV2.ts <path/to/file.json> [--limit N]`);
    console.log(`       npx tsx tools/shadowTestV2.ts --dir <path/to/directory> [--limit N]`);
    process.exit(1);
  }

  let globalStats: ProcessStats = { total: 0, disagreements: 0 };

  try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(targetPath).filter((f: string) => f.endsWith('.json'));
      for (const file of files) {
        const s = processFile(path.join(targetPath, file), limit);
        globalStats.total += s.total;
        globalStats.disagreements += s.disagreements;
      }
    } else {
      const s = processFile(targetPath, limit);
      globalStats.total += s.total;
      globalStats.disagreements += s.disagreements;
    }
  } catch (err: any) {
    console.error(`\x1b[31mError accessing path ${targetPath}: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  console.log(`\n=============================================================`);
  console.log(`\x1b[36mSHADOW TEST SUMMARY\x1b[0m`);
  console.log(`=============================================================`);
  console.log(`Total Products Analyzed: \x1b[1m${globalStats.total}\x1b[0m`);
  console.log(`Major Disagreements: \x1b[1m${globalStats.disagreements}\x1b[0m`);
  console.log(`(Disagreement defined as V1 > 75 & V2 Poor/Caution, or V1 < 40 & V2 Good/Strong)`);
  console.log(`=============================================================`);
}

main();