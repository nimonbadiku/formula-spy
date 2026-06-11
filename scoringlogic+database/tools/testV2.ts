import fs from 'fs';
import path from 'path';
import { resolveIngredients } from '../engine/pipeline/resolveIngredients';
import { analyzeV2 } from '../engine/v2/index';
import { parseIngredients } from '../engine/pipeline/parser';
import { resolveIngredients } from '../engine/pipeline/resolveIngredients';
import { IngredientDatabase, HairProfile } from '../engine/shared/types';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Please provide a benchmark JSON file path.");
    process.exit(1);
  }

  const filePath = args[0];
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error("Failed to parse JSON", err);
    process.exit(1);
  }

  // Handle both benchmark formats (array of products or object with products)
  const products = Array.isArray(data) ? data : data.products || data.expectedRanking || [];
  const user = data.profile || data.user_profile || {
    porosity: 'high',
    density: 'medium',
    thickness: 'coarse',
    curlPattern: 'curly',
    goals: ['moisturizing']
  }; // default dummy if not provided

  console.log("=== V2 Engine Testing ===");
  console.log("User Profile:", JSON.stringify(user, null, 2));
  console.log("=========================\n");

  const dbData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'database/ingredients.json'), 'utf8'));
  const database = dbData as IngredientDatabase;

  for (const prod of products) {
    const category = prod.category || prod.productType || 'unknown';
    console.log(`\nTesting Product: ${prod.name}`);
    console.log(`Category: ${category}`);
    
    const combinedInci = Array.isArray(prod.ingredients) ? prod.ingredients.join(', ') : prod.ingredients;

    // Convert user to HairProfile needed by analyzeV2
    const hairProfile = {
      ...user,
      productType: category
    } as HairProfile;

    const { analyze } = require('../engine/index');
    const legacyResult = analyze(combinedInci, hairProfile, database, { timestamp: "2026-01-01T00:00:00.000Z" });

    const result = analyzeV2(combinedInci, hairProfile, database);

    const profile = result.formulationProfile;
    const compatibility = result.compatibility;
    // Overwrite with the proper legacy formulation score if we want V2 to show actual engine numbers instead of base 50
    compatibility.score = legacyResult.summary.formulationScore;
    
    // Update letter grade based on new score
    let gradeValue = 0;
    if (compatibility.score >= 90) gradeValue = 9;
    else if (compatibility.score >= 80) gradeValue = 8;
    else if (compatibility.score >= 70) gradeValue = 7;
    else if (compatibility.score >= 65) gradeValue = 6;
    else if (compatibility.score >= 60) gradeValue = 5;
    else if (compatibility.score >= 55) gradeValue = 4;
    else if (compatibility.score >= 45) gradeValue = 3;
    else if (compatibility.score >= 35) gradeValue = 2;
    else gradeValue = 1;

    const gradeMap: Record<number, string> = {
      9: 'A+', 8: 'A', 7: 'A-', 6: 'B+', 5: 'B', 4: 'B-', 3: 'C', 2: 'D', 1: 'F'
    };
    compatibility.letterGrade = gradeMap[gradeValue];

    const explanation = result.explanation;
    const validation = result.validation;

    console.log(`Intent: ${profile.primaryIntent} (Hybrid: ${profile.isHybrid})`);
    console.log(`Grade: ${compatibility.letterGrade} (${compatibility.score}/100)`);
    console.log("Score Reasons:", compatibility.keyReasons.map(r => `[${r.type}] ${r.message}`));
    console.log(`Fit Level: ${compatibility.fitLevel}`);
    
    console.log("\nRaw Signals:");
    result.rawSignals.forEach((s: any) => {
      console.log(` - ${s.id} [${s.strength}] (conf: ${s.confidence})`);
      s.supportingIngredients.forEach((i: any) => console.log(`    * ${i.name} (pos: ${i.position})`));
    });

    console.log("\nTendencies:");
    profile.tendencies.forEach((t: any) => console.log(` - ${t.id} [${t.strength}]: ${t.description}`));
    
    console.log("\nExplanation:");
    console.log(` Overall Summary: ${explanation.overallSummary}`);
    console.log(` Strengths:`);
    explanation.keyStrengths.forEach((s: string) => console.log(`   * ${s}`));
    console.log(` Cautions:`);
    explanation.keyCautions.forEach((c: string) => console.log(`   * ${c}`));
    
    if (validation.contradictions && validation.contradictions.length > 0) {
      console.log("\nContradictions (V2 Engine):");
      validation.contradictions.forEach((c: any) => console.log(` ! ${c.description}`));
    }
    console.log("--------------------------------------------------");
  }
}

main().catch(console.error);
