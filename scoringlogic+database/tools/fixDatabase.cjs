/**
 * tools/fixDatabase.cjs
 *
 * Phase 2.0 Database Correction Script
 * =====================================
 * Reads database/ingredients.v3.json, applies all corrections, writes corrected file.
 *
 * Corrections applied:
 *   1. Fix invalid flag values: "o" → "g", "p" → "b", "c" → "n"
 *   2. Fix ceramide miscategorization: Bond Repair → Lipid, remove bond-repair tag
 *   3. Fix clinical scalp actives: Preservative → Scalp Active (ZPT, Piroctone, Selenium Sulfide)
 *   4. Prune scalp-active tag from non-clinical scalp ingredients
 *   5. Normalize "Sd Alcohol 40-B (Alcohol Denat.)" name
 *   6. Strip dead-weight product_roles notes (zero scoring impact, ~40% file size reduction)
 *   7. Add sub_category field to key categories
 *   8. Add baseScore summary field
 *   9. Add needs-review tag to uncertain classifications
 *  10. Update metadata (version, lastUpdated, totalIngredients)
 *
 * Usage: node tools/fixDatabase.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── PATHS ────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '..', 'database', 'ingredients.json');
const BACKUP_PATH = path.join(__dirname, '..', 'database', 'ingredients.backup.json');

// ─── CORRECTION MAPS ──────────────────────────────────────────────────────────

/**
 * Invalid flag value → valid flag value mapping.
 * "o" = okay/good → "g"
 * "p" = poor/bad  → "b"
 * "c" = caution   → "n" (neutral — caution is not a hard penalty)
 */
const FLAG_MAP = { o: 'g', p: 'b', c: 'n' };

/**
 * Ceramides that are miscategorized as Bond Repair.
 * These are lipid-barrier ingredients, not disulfide/maleic bond repair actives.
 * The CSDS has a CERAMIDE_NAME_GUARD workaround for these — fixing the DB
 * eliminates the need for that workaround.
 */
const CERAMIDE_BOND_REPAIR_NAMES = new Set([
  'Ceramide 1',
  'Ceramide 2',
  'Ceramide 3',
  'Ceramide 6 II',
  'Ceramide AG',
  'Ceramide AS',
  'Ceramide EOS',
  'Ceramide NG',
  'Ceramide NS',
]);

/**
 * Clinical scalp actives miscategorized as Preservative.
 * These are antifungal/antimicrobial actives, not preservatives.
 */
const CLINICAL_ACTIVES_MISCAT_AS_PRESERVATIVE = new Set([
  'Zinc Pyrithione',
  'Piroctone Olamine',
  'Selenium Sulfide',
]);

/**
 * TRUE clinical scalp actives — the only ingredients that should fire the
 * scalp_active_compatible_oily_scalp CSDS signal (×1.55 bonus).
 * All others in the Scalp Active category are general scalp-supportive
 * ingredients that should NOT fire this signal.
 */
const TRUE_CLINICAL_SCALP_ACTIVES = new Set([
  'Zinc Pyrithione',
  'Piroctone Olamine',
  'Selenium Sulfide',
  'Salicylic Acid',
  'Ketoconazole',
  'Coal Tar',
  'Sulfur',           // OTC dandruff active
  'Ciclopirox',       // if present
  'Tea Tree Oil',     // if present (antimicrobial)
  'Zinc Gluconate',   // zinc-based scalp active
  'Zinc Lactate',     // zinc-based scalp active
  'Mandelic Acid',    // BHA-type exfoliant
  'Gluconolactone',   // PHA exfoliant (scalp exfoliation)
  'Lactic Acid',      // AHA exfoliant
]);

/**
 * Sub-category assignments by ingredient name (exact match, case-sensitive).
 * Covers the most scoring-critical ingredients.
 */
const SUB_CATEGORY_BY_NAME = {
  // ── Sulfate Surfactants ──────────────────────────────────────────────────
  'Sodium Lauryl Sulfate':          'Sulfate Surfactant',
  'Sodium Laureth Sulfate':         'Sulfate Surfactant',
  'Ammonium Lauryl Sulfate':        'Sulfate Surfactant',
  'Ammonium Laureth Sulfate':       'Sulfate Surfactant',
  'Sodium Coco-Sulfate':            'Sulfate Surfactant',
  'Sodium C12-13 Pareth Sulfate':   'Sulfate Surfactant',
  'Sodium C12-15 Pareth Sulfate':   'Sulfate Surfactant',
  'Sodium C14-16 Olefin Sulfonate': 'Sulfate Surfactant',
  'Sodium Dodecylbenzenesulfonate': 'Sulfate Surfactant',
  'Sodium Myreth Sulfate':          'Sulfate Surfactant',
  'Sodium Trideceth Sulfate':       'Sulfate Surfactant',
  'TEA-Dodecylbenzenesulfonate':    'Sulfate Surfactant',

  // ── Volatile Silicones ───────────────────────────────────────────────────
  'Cyclopentasiloxane':             'Volatile Silicone',
  'Cyclohexasiloxane':              'Volatile Silicone',
  'Cyclotetrasiloxane':             'Volatile Silicone',
  'Cyclomethicone':                 'Volatile Silicone',
  'Cyclopentasiloxane/Dimethicone Crosspolymer': 'Volatile Silicone',

  // ── Amino/Functional Silicones ───────────────────────────────────────────
  'Amodimethicone':                 'Amino Silicone',
  'Aminopropyl Dimethicone':        'Amino Silicone',
  'Bis-Aminopropyl Dimethicone':    'Amino Silicone',
  'Aminopropyl Phenyl Trimethicone':'Amino Silicone',

  // ── Drying Alcohols ──────────────────────────────────────────────────────
  'Alcohol Denat.':                 'Drying Alcohol',
  'Isopropyl Alcohol':              'Drying Alcohol',
  'SD Alcohol 40-B':                'Drying Alcohol',

  // ── Fatty Alcohols ───────────────────────────────────────────────────────
  'Cetyl Alcohol':                  'Fatty Alcohol',
  'Stearyl Alcohol':                'Fatty Alcohol',
  'Behenyl Alcohol':                'Fatty Alcohol',
  'Cetearyl Alcohol':               'Fatty Alcohol',
  'Myristyl Alcohol':               'Fatty Alcohol',
  'Lauryl Alcohol':                 'Fatty Alcohol',
  'Arachidyl Alcohol':              'Fatty Alcohol',
  'Decyl Alcohol':                  'Fatty Alcohol',

  // ── Bond Repair Actives ──────────────────────────────────────────────────
  'Bis-Aminopropyl Diglycol Dimaleate': 'Disulfide Bond Repair Active',
  'Maleic Acid':                    'Maleic Bond Repair Active',
  'Disodium Maleate':               'Maleic Bond Repair Active',
  'Itaconic Acid':                  'Maleic Bond Repair Active',
  'Succinic Acid':                  'Ionic Bond Repair Active',
  'Cystine Bis-PG-Propyl Silanetriol': 'Disulfide Bond Repair Active',
  'Lysine Carboxymethyl Cysteinate':'Disulfide Bond Repair Active',
  'Tris-Bond Repair Complex':       'Bond Repair Complex',
  'Hydroxypropylammonium Gluconate':'Ionic Bond Repair Active',
  'Hydroxypropylgluconamide':       'Ionic Bond Repair Active',
  'Calcium Gluconate':              'Ionic Bond Repair Active',

  // ── Ceramides (now Lipid category) ───────────────────────────────────────
  'Ceramide 1':   'Ceramide',
  'Ceramide 2':   'Ceramide',
  'Ceramide 3':   'Ceramide',
  'Ceramide 6 II':'Ceramide',
  'Ceramide AG':  'Ceramide',
  'Ceramide AS':  'Ceramide',
  'Ceramide EOS': 'Ceramide',
  'Ceramide NG':  'Ceramide',
  'Ceramide NS':  'Ceramide',
  'Ceramide AP':  'Ceramide',
  'Ceramide EOP': 'Ceramide',
  'Ceramide NP':  'Ceramide',

  // ── Clinical Scalp Actives ───────────────────────────────────────────────
  'Zinc Pyrithione':    'Antifungal Scalp Active',
  'Piroctone Olamine':  'Antifungal Scalp Active',
  'Selenium Sulfide':   'Antifungal Scalp Active',
  'Ketoconazole':       'Antifungal Scalp Active',
  'Coal Tar':           'Antipsoriatic Scalp Active',
  'Sulfur':             'Antifungal Scalp Active',
  'Salicylic Acid':     'BHA Exfoliant Scalp Active',
  'Mandelic Acid':      'BHA Exfoliant Scalp Active',
  'Lactic Acid':        'AHA Exfoliant Scalp Active',
  'Gluconolactone':     'PHA Exfoliant Scalp Active',

  // ── Cationic Polymers ────────────────────────────────────────────────────
  'Polyquaternium-10':  'Cationic Polymer',
  'Polyquaternium-11':  'Cationic Polymer',
  'Polyquaternium-55':  'Cationic Polymer',
  'Polyquaternium-7':   'Cationic Polymer',
  'Polyquaternium-4':   'Cationic Polymer',
  'Polyquaternium-6':   'Cationic Polymer',
  'Guar Hydroxypropyltrimonium Chloride': 'Cationic Polymer',

  // ── Film-Forming Polymers ────────────────────────────────────────────────
  'PVP':                'Film-Forming Polymer',
  'VP/VA Copolymer':    'Film-Forming Polymer',
  'Acrylates Copolymer':'Film-Forming Polymer',
  'Carbomer':           'Film-Forming Polymer',
};

/**
 * Sub-category assignments by category (fallback when name not in SUB_CATEGORY_BY_NAME).
 * Applied to all ingredients in the category that don't have a name-specific sub_category.
 */
const SUB_CATEGORY_BY_CATEGORY = {
  'Drying Alcohol':         'Drying Alcohol',
  'Fragrance / Allergen':   'Fragrance',
  'Chelator':               'Chelating Agent',
  'Preservative':           'Preservative',
  'Wax':                    'Wax',
  'Solvent':                'Solvent',
  'Humectant':              'Humectant',
  'Amino Acid':             'Amino Acid',
  'Peptide':                'Peptide',
  'Low-MW Protein':         'Low-MW Protein',
  'Protein':                'Protein',
  'Protein / Amino Acid':   'Protein / Amino Acid',
  'Quat':                   'Quaternary Ammonium Compound',
  'Emollient':              'Emollient',
  'Botanical':              'Botanical',
  'Botanical Extract':      'Botanical Extract',
  'Water-Soluble Silicone': 'Water-Soluble Silicone',
  'Conditioning Agent':     'Conditioning Agent',
};

/**
 * Ingredients that should get the needs-review tag due to uncertain classification.
 * These are ingredients in catch-all categories with empty or minimal tags.
 */
const NEEDS_REVIEW_CATEGORIES = new Set([
  'Functional Additive',
  'pH / Chelation / Electrolyte',
  'Conditioning Agent',
]);

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

/**
 * Fix a single flag value.
 * Valid values: "g", "b", "n"
 * Invalid values: "o" → "g", "p" → "b", "c" → "n"
 */
function fixFlag(val) {
  if (val === 'g' || val === 'b' || val === 'n') return val;
  if (val in FLAG_MAP) return FLAG_MAP[val];
  // Any other value → neutral
  return 'n';
}

/**
 * Remove a tag from a tags array (returns new array).
 */
function removeTag(tags, tag) {
  if (!Array.isArray(tags)) return tags;
  return tags.filter(t => t !== tag);
}

/**
 * Add a tag to a tags array if not already present (returns new array).
 */
function addTag(tags, tag) {
  if (!Array.isArray(tags)) return [tag];
  if (tags.includes(tag)) return tags;
  return [...tags, tag].sort();
}

/**
 * Determine sub_category for an ingredient.
 */
function getSubCategory(ingredient) {
  // Name-specific takes priority
  if (SUB_CATEGORY_BY_NAME[ingredient.name]) {
    return SUB_CATEGORY_BY_NAME[ingredient.name];
  }

  // Surfactant sub-categorization by ionic charge and tags
  if (ingredient.category === 'Surfactant') {
    const tags = ingredient.tags || [];
    const ionic = ingredient.ionic_charge || '';
    if (tags.includes('sulfate')) return 'Sulfate Surfactant';
    if (ionic === 'anionic') return 'Anionic Surfactant';
    if (ionic === 'amphoteric') return 'Amphoteric Surfactant';
    if (ionic === 'cationic') return 'Cationic Surfactant';
    if (ionic === 'nonionic' || ionic === 'neutral') return 'Nonionic Surfactant';
    return 'Surfactant';
  }

  // Silicone sub-categorization by name
  if (ingredient.category === 'Silicone') {
    const nameLower = ingredient.name.toLowerCase();
    if (nameLower.includes('cyclopenta') || nameLower.includes('cyclohexa') ||
        nameLower.includes('cyclotetra') || nameLower.includes('cyclomethicone')) {
      return 'Volatile Silicone';
    }
    if (nameLower.includes('amino') || nameLower.includes('amodimethicone')) {
      return 'Amino Silicone';
    }
    return 'Non-Volatile Silicone';
  }

  // Oil sub-categorization
  if (ingredient.category === 'Heavy Oil') return 'Heavy Oil';
  if (ingredient.category === 'Light Oil') return 'Light Oil';

  // Lipid sub-categorization
  if (ingredient.category === 'Lipid') {
    const nameLower = ingredient.name.toLowerCase();
    if (nameLower.startsWith('ceramide')) return 'Ceramide';
    if (nameLower.includes('cholesterol')) return 'Sterol';
    if (nameLower.includes('sphingo') || nameLower.includes('phytosphingo')) return 'Sphingolipid';
    return 'Lipid';
  }

  // Polymer sub-categorization
  if (ingredient.category === 'Polymer') {
    const nameLower = ingredient.name.toLowerCase();
    if (nameLower.includes('polyquaternium') || nameLower.includes('guar hydroxy')) {
      return 'Cationic Polymer';
    }
    if (nameLower.includes('carbomer') || nameLower.includes('acrylate') ||
        nameLower.includes('pvp') || nameLower.includes('vp/va')) {
      return 'Film-Forming Polymer';
    }
    return 'Polymer';
  }

  if (ingredient.category === 'Polymer / Film Former') return 'Film-Forming Polymer';

  // Scalp Active sub-categorization
  if (ingredient.category === 'Scalp Active') {
    const tags = ingredient.tags || [];
    if (tags.includes('scalp-active')) {
      const nameLower = ingredient.name.toLowerCase();
      if (nameLower.includes('zinc') || nameLower.includes('piroctone') ||
          nameLower.includes('selenium') || nameLower.includes('ketoconazole') ||
          nameLower.includes('coal tar') || nameLower.includes('sulfur')) {
        return 'Clinical Scalp Active';
      }
      if (nameLower.includes('salicylic') || nameLower.includes('mandelic') ||
          nameLower.includes('lactic') || nameLower.includes('gluconolactone')) {
        return 'Exfoliant Scalp Active';
      }
    }
    return 'Scalp Treatment';
  }

  // Category-level fallback
  if (SUB_CATEGORY_BY_CATEGORY[ingredient.category]) {
    return SUB_CATEGORY_BY_CATEGORY[ingredient.category];
  }

  return null;
}

/**
 * Build baseScore summary from product_roles.
 */
function buildBaseScore(productRoles) {
  if (!productRoles) return null;
  return {
    shampoo: productRoles.shampoo?.score ?? 0,
    co_wash: productRoles.co_wash?.score ?? 0,
    rinse_out_conditioner: productRoles.rinse_out_conditioner?.score ?? 0,
    deep_conditioner_mask: productRoles.deep_conditioner_mask?.score ?? 0,
    leave_in: productRoles.leave_in_conditioner?.score ?? 0,
    hair_oil_serum: productRoles.hair_oil_serum?.score ?? 0,
    styling_product: productRoles.styling_product?.score ?? 0,
  };
}

/**
 * Strip notes from product_roles entries (dead weight — never read by scoring).
 */
function stripProductRoleNotes(productRoles) {
  if (!productRoles) return productRoles;
  const cleaned = {};
  for (const [key, val] of Object.entries(productRoles)) {
    if (val && typeof val === 'object') {
      cleaned[key] = { score: val.score };
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

// ─── MAIN CORRECTION FUNCTION ─────────────────────────────────────────────────

function correctIngredient(ingredient) {
  const i = { ...ingredient };

  // ── Step 1: Fix invalid flag values ────────────────────────────────────────
  const flagFields = ['low', 'med', 'high', 'fine', 'oily'];
  for (const field of flagFields) {
    if (i[field] !== undefined) {
      i[field] = fixFlag(i[field]);
    }
  }

  // ── Step 2: Fix ceramide miscategorization ─────────────────────────────────
  if (CERAMIDE_BOND_REPAIR_NAMES.has(i.name)) {
    i.category = 'Lipid';
    i.tags = removeTag(i.tags, 'bond-repair');
    // Keep barrier-lipid, damage-care, damage-repair, conditioning-agent tags
    // These ceramides DO help damaged hair — just not via disulfide bond repair
  }

  // ── Step 3: Fix clinical scalp actives miscategorized as Preservative ──────
  if (CLINICAL_ACTIVES_MISCAT_AS_PRESERVATIVE.has(i.name)) {
    i.category = 'Scalp Active';
    // Remove preservative tag if present (they are not preservatives)
    i.tags = removeTag(i.tags, 'preservative');
    i.tags = removeTag(i.tags, 'safety');
    // Ensure scalp-active tag is present
    i.tags = addTag(i.tags, 'scalp-active');
  }

  // ── Step 4: Prune scalp-active tag from non-clinical scalp ingredients ──────
  // Only TRUE clinical scalp actives should fire the ×1.55 CSDS signal
  if (i.category === 'Scalp Active' && !TRUE_CLINICAL_SCALP_ACTIVES.has(i.name)) {
    i.tags = removeTag(i.tags, 'scalp-active');
    // Keep treatment tag — these are still scalp-supportive
  }

  // ── Step 5: Normalize "Sd Alcohol 40-B (Alcohol Denat.)" name ──────────────
  if (i.name === 'Sd Alcohol 40-B (Alcohol Denat.)') {
    i.name = 'SD Alcohol 40-B';
    // Ensure aliases are correct
    const existingAliases = Array.isArray(i.aliases) ? i.aliases : [];
    const newAliases = new Set([
      ...existingAliases,
      'Sd Alcohol 40-B (Alcohol Denat.)',
      'SD Alcohol 40B',
      'Alcohol SD 40-B',
      'SD Alcohol 40-B (Alcohol Denat.)',
    ]);
    i.aliases = [...newAliases];
  }

  // ── Step 6: Strip dead-weight product_roles notes ──────────────────────────
  if (i.product_roles) {
    i.product_roles = stripProductRoleNotes(i.product_roles);
  }

  // ── Step 7: Add sub_category field ─────────────────────────────────────────
  const subCat = getSubCategory(i);
  if (subCat) {
    i.sub_category = subCat;
  }

  // ── Step 8: Add baseScore summary field ────────────────────────────────────
  i.baseScore = buildBaseScore(i.product_roles);

  // ── Step 9: Add needs-review tag to uncertain classifications ───────────────
  if (NEEDS_REVIEW_CATEGORIES.has(i.category)) {
    const tags = Array.isArray(i.tags) ? i.tags : [];
    // Only flag if tags are empty or very sparse (likely auto-generated placeholders)
    if (tags.length === 0) {
      i.tags = addTag(i.tags, 'needs-review');
    }
  }

  // ── Ensure aliases is always an array ──────────────────────────────────────
  if (!Array.isArray(i.aliases)) {
    i.aliases = [];
  }

  return i;
}

// ─── EXECUTION ────────────────────────────────────────────────────────────────

console.log('=== Phase 2.0 Database Correction Script ===\n');

// Read database
console.log(`Reading: ${DB_PATH}`);
const raw = fs.readFileSync(DB_PATH, 'utf8');
const db = JSON.parse(raw);
console.log(`Loaded: ${db.ingredients.length} ingredients (v${db.version})\n`);

// Backup original
console.log(`Creating backup: ${BACKUP_PATH}`);
fs.writeFileSync(BACKUP_PATH, raw, 'utf8');
console.log('Backup created.\n');

// Apply corrections
console.log('Applying corrections...');

let flagFixCount = 0;
let ceramideFixCount = 0;
let scalpActiveFixCount = 0;
let scalpTagPruneCount = 0;
let nameNormCount = 0;
let subCatAddCount = 0;
let needsReviewCount = 0;

const corrected = db.ingredients.map(ingredient => {
  const original = ingredient;
  const fixed = correctIngredient(ingredient);

  // Count corrections
  const flagFields = ['low', 'med', 'high', 'fine', 'oily'];
  for (const field of flagFields) {
    if (original[field] !== fixed[field]) flagFixCount++;
  }
  if (CERAMIDE_BOND_REPAIR_NAMES.has(original.name) && original.category !== fixed.category) {
    ceramideFixCount++;
  }
  if (CLINICAL_ACTIVES_MISCAT_AS_PRESERVATIVE.has(original.name) && original.category !== fixed.category) {
    scalpActiveFixCount++;
  }
  if (original.category === 'Scalp Active' &&
      Array.isArray(original.tags) && original.tags.includes('scalp-active') &&
      Array.isArray(fixed.tags) && !fixed.tags.includes('scalp-active')) {
    scalpTagPruneCount++;
  }
  if (original.name !== fixed.name) nameNormCount++;
  if (fixed.sub_category && !original.sub_category) subCatAddCount++;
  if (Array.isArray(fixed.tags) && fixed.tags.includes('needs-review') &&
      !(Array.isArray(original.tags) && original.tags.includes('needs-review'))) {
    needsReviewCount++;
  }

  return fixed;
});

// Build corrected database
const correctedDb = {
  version: '2.0-corrected',
  lastUpdated: '2026-05-17',
  totalIngredients: corrected.length,
  ingredients: corrected,
};

// Write corrected database
console.log(`Writing corrected database: ${DB_PATH}`);
fs.writeFileSync(DB_PATH, JSON.stringify(correctedDb, null, 2), 'utf8');

// Report
console.log('\n=== Correction Report ===');
console.log(`  Flag values fixed (o/p/c → g/b/n):  ${flagFixCount}`);
console.log(`  Ceramides recategorized (Bond Repair → Lipid): ${ceramideFixCount}`);
console.log(`  Clinical actives recategorized (Preservative → Scalp Active): ${scalpActiveFixCount}`);
console.log(`  scalp-active tag pruned from non-clinical ingredients: ${scalpTagPruneCount}`);
console.log(`  Name normalizations: ${nameNormCount}`);
console.log(`  sub_category fields added: ${subCatAddCount}`);
console.log(`  needs-review tags added: ${needsReviewCount}`);
console.log(`  product_roles notes stripped: ${corrected.length} ingredients`);
console.log(`  baseScore fields added: ${corrected.length} ingredients`);
console.log(`\nTotal ingredients: ${corrected.length}`);
console.log(`Version: ${correctedDb.version}`);
console.log(`\nDone. Original backed up to: ${BACKUP_PATH}`);

// Validation checks
console.log('\n=== Validation ===');

const invalidFlags = corrected.filter(i =>
  ['low','med','high','fine','oily'].some(f => i[f] && !['g','b','n'].includes(i[f]))
);
console.log(`  Invalid flags remaining: ${invalidFlags.length} ${invalidFlags.length === 0 ? '✓' : '✗'}`);

const ceramidesWithBondRepair = corrected.filter(i =>
  i.name.toLowerCase().startsWith('ceramide') &&
  Array.isArray(i.tags) && i.tags.includes('bond-repair')
);
console.log(`  Ceramides with bond-repair tag: ${ceramidesWithBondRepair.length} ${ceramidesWithBondRepair.length === 0 ? '✓' : '✗'}`);

const zpMiscat = corrected.filter(i =>
  CLINICAL_ACTIVES_MISCAT_AS_PRESERVATIVE.has(i.name) && i.category === 'Preservative'
);
console.log(`  Clinical actives still as Preservative: ${zpMiscat.length} ${zpMiscat.length === 0 ? '✓' : '✗'}`);

const sdAlcohol = corrected.find(i => i.name === 'Sd Alcohol 40-B (Alcohol Denat.)');
console.log(`  Old SD Alcohol name still present: ${sdAlcohol ? '✗' : '✓'}`);

const withSubCat = corrected.filter(i => i.sub_category).length;
console.log(`  Ingredients with sub_category: ${withSubCat}`);

const withBaseScore = corrected.filter(i => i.baseScore).length;
console.log(`  Ingredients with baseScore: ${withBaseScore}`);

// Category distribution after corrections
const cats = {};
corrected.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });
console.log('\n=== Category Distribution (post-correction) ===');
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count}`);
});
