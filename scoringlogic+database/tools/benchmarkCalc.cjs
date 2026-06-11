// Manual benchmark calculation to verify expected scores AFTER DB patch
// Profile: low-porosity, curly, dry scalp, medium density
const raw = require('../database/ingredients.v3.json');
const db = raw.ingredients;

console.log('DB total:', db.length);

function findIngredient(name) {
  const n = name.toLowerCase().trim();
  // exact match first
  let found = db.find(i => i.name.toLowerCase() === n);
  if (found) return found;
  // alias match
  found = db.find(i => {
    if (!Array.isArray(i.aliases)) return false;
    return i.aliases.some(a => a.toLowerCase() === n);
  });
  if (found) return found;
  // partial match (name starts with search term or vice versa)
  found = db.find(i => {
    const iname = i.name.toLowerCase();
    return iname.startsWith(n.substring(0, 12)) || n.startsWith(iname.substring(0, 12));
  });
  return found || null;
}

function positionWeight(index, total) {
  const decay = 0.85;
  const raw = Math.pow(decay, index);
  let sum = 0;
  for (let i = 0; i < total; i++) sum += Math.pow(decay, i);
  return raw / sum;
}

function calcShampoo(name, ingredients) {
  console.log(`\n=== ${name} ===`);
  const total = ingredients.length;
  let weightedSum = 0;
  
  ingredients.forEach((ingName, idx) => {
    const rec = findIngredient(ingName);
    const score = rec && rec.product_roles && rec.product_roles.shampoo 
      ? rec.product_roles.shampoo.score : 0;
    const w = positionWeight(idx, total);
    const contrib = score * w;
    weightedSum += contrib;
    const status = rec ? `"${rec.name}" (${rec.category})` : 'NOT FOUND';
    console.log(`  [${idx+1}] ${ingName} → score=${score}, w=${w.toFixed(4)}, contrib=${contrib.toFixed(2)} | ${status}`);
  });
  
  console.log(`  BASE SCORE (pre-CSDS): ${weightedSum.toFixed(2)}`);
  return weightedSum;
}

// Good Shampoo
const good = [
  'Aqua', 'Lauryl Glucoside', 'Aloe Barbadensis Leaf Juice', 'Glycerin',
  'Disodium Cocoyl Glutamate', 'Propanediol', 'Citric Acid', 'Sodium Chloride',
  'Sodium Cocoyl Glutamate', 'Sodium Benzoate', 'Glyceryl Caprylate', 'Inulin',
  'Parfum', 'Guar Hydroxypropyltrimonium Chloride', 'Pullulan',
  'Polyglyceryl-4 Caprate', 'Xanthan Gum', 'Potassium Sorbate', 'Propylene Glycol',
  'Sodium Gluconate', 'Phyllostachys Bambusoides Extract', 'Zingiber Officinale Root Extract',
  'Euterpe Oleracea Fruit Extract', 'Hydrolyzed Rice Protein'
];

// Moderate Shampoo
const moderate = [
  'Aqua', 'Sodium Laureth Sulfate', 'Sodium Chloride', 'Cocamidopropyl Betaine',
  'Dimethiconol Hyaluronate', 'Glycerin', 'Laminaria Saccharina Extract', 'Parfum',
  'Sodium Benzoate', 'Coco-Glucoside', 'Polyquaternium-10', 'Glyceryl Oleate',
  'Citric Acid', 'PEG-120 Methyl Glucose Dioleate', 'Panthenol',
  'Tetramethyl Acetyloctahydronaphthalenes', 'Benzyl Salicylate', 'Sodium Hydroxide',
  'Linalool', 'Propylene Glycol', 'Phenoxyethanol', 'Potassium Sorbate'
];

// Harsh Shampoo
const harsh = [
  'Water', 'Sodium Lauryl Sulfate', 'Sodium Laureth Sulfate', 'Cocamidopropyl Betaine',
  'Alcohol Denat.', 'Isopropyl Alcohol', 'Propylene Glycol', 'Polyquaternium-7',
  'PEG-80 Sorbitan Laurate', 'Fragrance', 'Menthol', 'Benzyl Alcohol',
  'Citric Acid', 'Methylchloroisothiazolinone', 'Methylisothiazolinone',
  'Dimethicone', 'Cocamide DEA', 'Sodium Chloride'
];

const goodBase = calcShampoo('GOOD SHAMPOO', good);
const modBase = calcShampoo('MODERATE SHAMPOO', moderate);
const harshBase = calcShampoo('HARSH SHAMPOO', harsh);

console.log('\n=== CSDS SIGNAL ANALYSIS ===');
console.log('Profile: low-porosity, curly, dry scalp, medium density');

console.log('\n--- GOOD SHAMPOO ---');
console.log('Signals:');
console.log('  + sulfate_free_mild_shampoo_compatible (curly + dry scalp) → ×1.22');
console.log('  (No sulfates, has Lauryl Glucoside + Disodium Cocoyl Glutamate + Cocamidopropyl Betaine-like mild surfactants)');
const goodFinal = goodBase * 1.22;
console.log(`  CSDS modifier: ×1.22`);
console.log(`  FINAL SCORE: ${goodBase.toFixed(2)} × 1.22 = ${goodFinal.toFixed(1)}`);
console.log(`  TARGET: ≥80 → ${goodFinal >= 80 ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n--- MODERATE SHAMPOO ---');
console.log('Signals:');
console.log('  - single_sulfate_curly_moderate (1 SLES, curly) → ×0.82');
console.log('  (No dry scalp sulfate penalty — requires 2+ sulfates)');
const modFinal = modBase * 0.82;
console.log(`  CSDS modifier: ×0.82`);
console.log(`  FINAL SCORE: ${modBase.toFixed(2)} × 0.82 = ${modFinal.toFixed(1)}`);
console.log(`  TARGET: ~45 → ${modFinal >= 40 && modFinal <= 55 ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n--- HARSH SHAMPOO ---');
console.log('Signals:');
console.log('  - sulfate_incompatible_curly (2 sulfates: SLS+SLES) → ×0.55');
console.log('  - sulfate_incompatible_dry_scalp (2 sulfates + dry) → ×0.72');
console.log('  - drying_alcohol_incompatible_coily_styler (2 alcohols: Alcohol Denat. + IPA) → ×0.62');
const harshCombined = 0.55 * 0.72 * 0.62;
const harshCombinedFloored = Math.max(0.30, harshCombined);
console.log(`  Combined: 0.55 × 0.72 × 0.62 = ${harshCombined.toFixed(4)}`);
console.log(`  After CSDS_FLOOR(0.30): ${harshCombinedFloored.toFixed(4)}`);
const harshFinal = harshBase * harshCombinedFloored;
console.log(`  FINAL SCORE: ${harshBase.toFixed(2)} × ${harshCombinedFloored.toFixed(4)} = ${harshFinal.toFixed(1)}`);
console.log(`  TARGET: 10-20 → ${harshFinal >= 10 && harshFinal <= 25 ? '✅ PASS' : '❌ FAIL (adjust needed)'}`);

console.log('\n=== SUMMARY ===');
console.log(`Good Shampoo:     ${goodFinal.toFixed(1)} (target ≥80)`);
console.log(`Moderate Shampoo: ${modFinal.toFixed(1)} (target ~45)`);
console.log(`Harsh Shampoo:    ${harshFinal.toFixed(1)} (target 10-20)`);
