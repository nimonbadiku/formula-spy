'use strict';
const db = require('../database/ingredients.v3.json');
const ing = db.ingredients;

console.log('=== FINAL DATABASE STATE ===');
console.log('version:', db.version);
console.log('correctionVersion:', db.correctionVersion);
console.log('correctionDate:', db.correctionDate);
console.log('totalIngredients:', db.totalIngredients);
console.log('');

console.log('--- Corrections Applied ---');
const invalidFlags = ing.filter(i =>
  ['low','med','high','fine','oily'].some(f => i[f] && !['g','b','n'].includes(i[f]))
);
console.log('Invalid flags (o/p/c) remaining:', invalidFlags.length, '(was 8453)', invalidFlags.length === 0 ? 'PASS' : 'FAIL');

const ceramidesInBondRepair = ing.filter(i =>
  i.name.toLowerCase().startsWith('ceramide') && i.category === 'Bond Repair'
);
console.log('Ceramides in Bond Repair:', ceramidesInBondRepair.length, '(was 9)', ceramidesInBondRepair.length === 0 ? 'PASS' : 'FAIL');

const ceramidesWithBondTag = ing.filter(i =>
  i.name.toLowerCase().startsWith('ceramide') &&
  Array.isArray(i.tags) && i.tags.includes('bond-repair')
);
console.log('Ceramides with bond-repair tag:', ceramidesWithBondTag.length, '(was 9)', ceramidesWithBondTag.length === 0 ? 'PASS' : 'FAIL');

const clinicalMiscat = ing.filter(i =>
  ['Zinc Pyrithione','Piroctone Olamine','Selenium Sulfide'].includes(i.name) &&
  i.category === 'Preservative'
);
console.log('ZPT/Piroctone/SeleniumSulfide as Preservative:', clinicalMiscat.length, '(was 3)', clinicalMiscat.length === 0 ? 'PASS' : 'FAIL');

const CLINICAL = new Set([
  'Zinc Pyrithione','Piroctone Olamine','Selenium Sulfide','Salicylic Acid',
  'Ketoconazole','Coal Tar','Sulfur','Zinc Gluconate','Zinc Lactate',
  'Mandelic Acid','Gluconolactone','Lactic Acid'
]);
const nonClinicalWithTag = ing.filter(i =>
  i.category === 'Scalp Active' &&
  !CLINICAL.has(i.name) &&
  Array.isArray(i.tags) && i.tags.includes('scalp-active')
);
console.log('Non-clinical Scalp Active with scalp-active tag:', nonClinicalWithTag.length, '(was 33)', nonClinicalWithTag.length === 0 ? 'PASS' : 'FAIL');

const oldSDAlcohol = ing.filter(i => i.name === 'Sd Alcohol 40-B (Alcohol Denat.)');
console.log('Old SD Alcohol name present:', oldSDAlcohol.length, '(was 1)', oldSDAlcohol.length === 0 ? 'PASS' : 'FAIL');

const withRoleNotes = ing.filter(i =>
  i.product_roles && Object.values(i.product_roles).some(r => r && r.notes)
);
console.log('product_roles with notes:', withRoleNotes.length, '(was 5678)', withRoleNotes.length === 0 ? 'PASS' : 'FAIL');

console.log('');
console.log('--- New Fields Added ---');
const withSubCat = ing.filter(i => i.sub_category);
console.log('Ingredients with sub_category:', withSubCat.length, '/ 5678');

const withBaseScoreNonNull = ing.filter(i => i.baseScore !== null && i.baseScore !== undefined);
console.log('Ingredients with baseScore (non-null):', withBaseScoreNonNull.length);

const withBaseScoreNull = ing.filter(i => i.baseScore === null);
console.log('Ingredients with baseScore=null (no product_roles):', withBaseScoreNull.length);

const withNeedsReview = ing.filter(i => Array.isArray(i.tags) && i.tags.includes('needs-review'));
console.log('Ingredients with needs-review tag:', withNeedsReview.length);

console.log('');
console.log('--- Signal Integrity ---');
const sulfates = ing.filter(i =>
  i.category === 'Surfactant' &&
  Array.isArray(i.tags) && i.tags.includes('sulfate') &&
  i.ionic_charge === 'anionic'
);
console.log('Sulfate surfactants (sulfate tag + anionic):', sulfates.length, sulfates.length === 12 ? 'PASS' : 'CHECK');

const bondRepair = ing.filter(i => i.category === 'Bond Repair');
console.log('Bond Repair category (non-ceramide):', bondRepair.length, '(was 20, now 11)');

const clinicalScalpActives = ing.filter(i =>
  i.category === 'Scalp Active' &&
  Array.isArray(i.tags) && i.tags.includes('scalp-active')
);
console.log('Scalp Active with scalp-active tag (clinical only):', clinicalScalpActives.length);
clinicalScalpActives.forEach(i => console.log('  -', i.name, '|', i.sub_category));

const dryingAlcohols = ing.filter(i => i.category === 'Drying Alcohol');
console.log('Drying Alcohol category:', dryingAlcohols.length);
dryingAlcohols.forEach(i => console.log('  -', i.name, '| tags:', JSON.stringify(i.tags)));

const fragrance = ing.filter(i => i.category === 'Fragrance / Allergen');
console.log('Fragrance / Allergen category:', fragrance.length);

console.log('');
console.log('--- Spot Checks ---');

function checkIngredient(name, checks) {
  const item = ing.find(i => i.name === name);
  if (!item) {
    console.log(`WARNING: Ingredient '${name}' not found in ingredients.v3.json`);
    return;
  }
  const results = checks.map(c => {
    let val;
    try {
      val = c.fn(item);
    } catch (e) {
      val = 'ERROR';
    }
    return `${c.label}=${val}`;
  });
  console.log(`${name === 'Bis-Aminopropyl Diglycol Dimaleate' ? 'BADGDM' : name}: ${results.join(' ')}`);
}

checkIngredient('Sodium Lauryl Sulfate', [
  { label: 'category', fn: i => i.category },
  { label: 'sub_category', fn: i => i.sub_category },
  { label: 'high', fn: i => i.high }
]);

checkIngredient('Ceramide 1', [
  { label: 'category', fn: i => i.category },
  { label: 'sub_category', fn: i => i.sub_category },
  { label: 'bond-repair-tag', fn: i => Array.isArray(i.tags) && i.tags.includes('bond-repair') }
]);

checkIngredient('Zinc Pyrithione', [
  { label: 'category', fn: i => i.category },
  { label: 'scalp-active-tag', fn: i => Array.isArray(i.tags) && i.tags.includes('scalp-active') },
  { label: 'preservative-tag', fn: i => Array.isArray(i.tags) && i.tags.includes('preservative') }
]);

checkIngredient('SD Alcohol 40-B', [
  { label: 'category', fn: i => i.category },
  { label: 'aliases', fn: i => JSON.stringify(i.aliases) }
]);

checkIngredient('Bis-Aminopropyl Diglycol Dimaleate', [
  { label: 'category', fn: i => i.category },
  { label: 'sub_category', fn: i => i.sub_category },
  { label: 'bond-repair-tag', fn: i => Array.isArray(i.tags) && i.tags.includes('bond-repair') }
]);

console.log('');
console.log('=== ALL CHECKS COMPLETE ===');
