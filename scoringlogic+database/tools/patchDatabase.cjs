/**
 * tools/patchDatabase.cjs
 *
 * Phase 5 DB patch script.
 * Applies targeted fixes to database/ingredients.v3.json:
 *
 * Fix 1: Linalool — add sensitizer-risk tag
 * Fix 2: Benzyl Salicylate — add sensitizer-risk tag
 * Fix 3: Tetramethyl Acetyloctahydronaphthalenes — add sensitizer-risk tag, fragrance category
 * Fix 4: Aloe Barbadensis Leaf Juice — add humectant, low-buildup, low-porosity-safe tags
 * Fix 5: Alcohol Denat. — fix category to "Drying Alcohol", add drying-alcohol tag, lower shampoo score
 * Fix 6: Isopropyl Alcohol — fix category to "Drying Alcohol", add drying-alcohol tag, lower shampoo score
 * Fix 7: Sd Alcohol 40-B (Alcohol Denat.) — add aliases for "Alcohol Denat", fix category
 * Fix 8: Propanediol — raise shampoo score from 36 to 65
 * Fix 9: Pullulan — add low-buildup, low-porosity-safe tags
 * Fix 10: Polyglyceryl-4 Caprate — add low-buildup, low-porosity-safe, emollient tags
 * Fix 11: Xanthan Gum — add low-buildup, low-porosity-safe tags
 * Fix 12: Add "Dimethiconol Hyaluronate" entry (silicone + hyaluronate hybrid)
 * Fix 13: Add "PEG-80 Sorbitan Laurate" entry (mild nonionic surfactant/emulsifier)
 * Fix 14: Add "Sodium Chloride" entry with proper aliases (currently resolves to wrong ingredient)
 * Fix 15: Water — raise shampoo score from 35 to 75 (already done in DB, verify)
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/ingredients.v3.json');

const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const db = raw.ingredients;

let patchCount = 0;

function findByName(name) {
  return db.find(i => i.name === name);
}

function patch(name, patchFn) {
  const entry = findByName(name);
  if (!entry) {
    console.warn(`  WARN: "${name}" not found in DB — skipping`);
    return;
  }
  patchFn(entry);
  patchCount++;
  console.log(`  PATCHED: "${name}"`);
}

function ensureTag(entry, tag) {
  if (!Array.isArray(entry.tags)) entry.tags = [];
  if (!entry.tags.includes(tag)) entry.tags.push(tag);
}

function removeTag(entry, tag) {
  if (!Array.isArray(entry.tags)) return;
  entry.tags = entry.tags.filter(t => t !== tag);
}

function ensureAlias(entry, alias) {
  if (!Array.isArray(entry.aliases)) entry.aliases = [];
  if (!entry.aliases.includes(alias)) entry.aliases.push(alias);
}

console.log('=== Phase 5 DB Patch ===\n');

// Fix 1: Linalool — add sensitizer-risk tag
patch('Linalool', entry => {
  ensureTag(entry, 'sensitizer-risk');
  ensureTag(entry, 'allergen-risk');
  ensureTag(entry, 'fragrance');
});

// Fix 2: Benzyl Salicylate — add sensitizer-risk tag
patch('Benzyl Salicylate', entry => {
  ensureTag(entry, 'sensitizer-risk');
  ensureTag(entry, 'allergen-risk');
  ensureTag(entry, 'fragrance');
});

// Fix 3: Tetramethyl Acetyloctahydronaphthalenes — add sensitizer-risk tag
patch('Tetramethyl Acetyloctahydronaphthalenes', entry => {
  ensureTag(entry, 'sensitizer-risk');
  ensureTag(entry, 'fragrance');
  entry.category = 'Fragrance / Allergen';
  // Lower shampoo score — fragrance allergen should not score 35 in shampoo
  if (entry.product_roles && entry.product_roles.shampoo) {
    entry.product_roles.shampoo.score = 20;
  }
});

// Fix 4: Aloe Barbadensis Leaf Juice — add proper tags
patch('Aloe Barbadensis Leaf Juice', entry => {
  ensureTag(entry, 'humectant');
  ensureTag(entry, 'low-buildup');
  ensureTag(entry, 'low-porosity-safe');
  ensureTag(entry, 'fine-hair-safe');
  ensureTag(entry, 'high-porosity-safe');
  ensureTag(entry, 'botanical');
  ensureTag(entry, 'hydrating');
  entry.category = 'Botanical';
  // Shampoo score 72 is already good — keep it
});

// Fix 5: Alcohol Denat. — fix category, add drying-alcohol tag, lower shampoo score
patch('Alcohol Denat.', entry => {
  entry.category = 'Drying Alcohol';
  ensureTag(entry, 'drying-alcohol');
  ensureTag(entry, 'drying');
  removeTag(entry, 'booster');
  // Shampoo score should be very low — drying alcohol in shampoo is harmful
  if (entry.product_roles && entry.product_roles.shampoo) {
    entry.product_roles.shampoo.score = 8;
    entry.product_roles.shampoo.notes = 'Alcohol Denat.: drying alcohol strips lipid layer; very harmful in shampoo for curly/dry hair.';
  }
  // Add aliases for common INCI variants
  ensureAlias(entry, 'Alcohol Denat');
  ensureAlias(entry, 'Denatured Alcohol');
  ensureAlias(entry, 'Ethanol (Denatured)');
});

// Fix 6: Isopropyl Alcohol — fix category, add drying-alcohol tag, lower shampoo score
patch('Isopropyl Alcohol', entry => {
  entry.category = 'Drying Alcohol';
  ensureTag(entry, 'drying-alcohol');
  ensureTag(entry, 'drying');
  removeTag(entry, 'booster');
  if (entry.product_roles && entry.product_roles.shampoo) {
    entry.product_roles.shampoo.score = 8;
    entry.product_roles.shampoo.notes = 'Isopropyl Alcohol: drying alcohol strips lipid layer; very harmful in shampoo for curly/dry hair.';
  }
  ensureAlias(entry, 'Isopropanol');
  ensureAlias(entry, 'IPA');
  ensureAlias(entry, '2-Propanol');
});

// Fix 7: Sd Alcohol 40-B — add aliases for "Alcohol Denat" variants, fix category
patch('Sd Alcohol 40-B (Alcohol Denat.)', entry => {
  entry.category = 'Drying Alcohol';
  ensureTag(entry, 'drying-alcohol');
  ensureTag(entry, 'drying');
  ensureAlias(entry, 'SD Alcohol 40-B');
  ensureAlias(entry, 'SD Alcohol 40B');
  ensureAlias(entry, 'Alcohol SD 40-B');
  if (entry.product_roles && entry.product_roles.shampoo) {
    entry.product_roles.shampoo.score = 8;
  }
});

// Fix 8: Propanediol — raise shampoo score from 36 to 65
patch('Propanediol', entry => {
  if (entry.product_roles && entry.product_roles.shampoo) {
    entry.product_roles.shampoo.score = 65;
    entry.product_roles.shampoo.notes = 'Propanediol: mild humectant/solvent; safe and effective in shampoo formulas.';
  }
  ensureTag(entry, 'humectant');
  ensureTag(entry, 'low-buildup');
  ensureTag(entry, 'low-porosity-safe');
  ensureTag(entry, 'fine-hair-safe');
});

// Fix 9: Pullulan — add low-buildup, low-porosity-safe tags
patch('Pullulan', entry => {
  ensureTag(entry, 'low-buildup');
  ensureTag(entry, 'low-porosity-safe');
  ensureTag(entry, 'fine-hair-safe');
  ensureTag(entry, 'film-former');
  ensureTag(entry, 'water-soluble');
  entry.category = 'Functional Additive';
});

// Fix 10: Polyglyceryl-4 Caprate — add low-buildup, low-porosity-safe tags
patch('Polyglyceryl-4 Caprate', entry => {
  ensureTag(entry, 'low-buildup');
  ensureTag(entry, 'low-porosity-safe');
  ensureTag(entry, 'fine-hair-safe');
  ensureTag(entry, 'emollient');
  ensureTag(entry, 'mild');
  entry.category = 'Functional Additive';
});

// Fix 11: Xanthan Gum — add low-buildup, low-porosity-safe tags
patch('Xanthan Gum', entry => {
  ensureTag(entry, 'low-buildup');
  ensureTag(entry, 'low-porosity-safe');
  ensureTag(entry, 'fine-hair-safe');
  ensureTag(entry, 'water-soluble');
  // Keep film-former tag
});

// Fix 12: Add "Dimethiconol Hyaluronate" entry if not present
if (!findByName('Dimethiconol Hyaluronate')) {
  const newEntry = {
    name: 'Dimethiconol Hyaluronate',
    category: 'Silicone',
    low: 'b',
    med: 'g',
    high: 'g',
    fine: 'b',
    oily: 'n',
    notes: 'Dimethiconol Hyaluronate: silicone-hyaluronate hybrid. Provides conditioning and moisture. Moderate buildup risk on low-porosity hair.',
    tags: ['buildup-risk', 'conditioning-agent', 'film-former', 'high-porosity-safe', 'humectant', 'silicone', 'slip'],
    product_roles: {
      shampoo: { score: 22, notes: 'Dimethiconol Hyaluronate: silicone in shampoo has low value; rinse-off limits benefit.' },
      co_wash: { score: 45, notes: 'Dimethiconol Hyaluronate: conditioning silicone in co-wash.' },
      rinse_out_conditioner: { score: 72, notes: 'Dimethiconol Hyaluronate: conditioning silicone in rinse-out.' },
      deep_conditioner_mask: { score: 75, notes: 'Dimethiconol Hyaluronate: conditioning silicone in mask.' },
      leave_in_conditioner: { score: 55, notes: 'Dimethiconol Hyaluronate: silicone in leave-in; buildup risk on low-porosity.' },
      hair_oil_serum: { score: 68, notes: 'Dimethiconol Hyaluronate: conditioning silicone in serum.' },
      styling_product: { score: 50, notes: 'Dimethiconol Hyaluronate: conditioning silicone in styler.' }
    },
    aliases: ['Dimethiconol/Hyaluronate', 'Dimethiconol Sodium Hyaluronate'],
    molecular_weight_da: 15000,
    ionic_charge: 'neutral',
    penetration_depth: 'surface'
  };
  db.push(newEntry);
  patchCount++;
  console.log('  ADDED: "Dimethiconol Hyaluronate"');
} else {
  console.log('  SKIP: "Dimethiconol Hyaluronate" already exists');
}

// Fix 13: Add "PEG-80 Sorbitan Laurate" entry if not present
if (!findByName('PEG-80 Sorbitan Laurate')) {
  const newEntry = {
    name: 'PEG-80 Sorbitan Laurate',
    category: 'Surfactant',
    low: 'n',
    med: 'g',
    high: 'g',
    fine: 'n',
    oily: 'n',
    notes: 'PEG-80 Sorbitan Laurate: nonionic PEG-based surfactant/emulsifier. Mild cleansing, used as solubilizer.',
    tags: ['emulsifier', 'fine-hair-safe', 'low-buildup', 'low-porosity-safe', 'mild', 'nonionic', 'peg-ppg', 'rinse-off', 'surfactant'],
    product_roles: {
      shampoo: { score: 55, notes: 'PEG-80 Sorbitan Laurate: mild nonionic surfactant/emulsifier in shampoo.' },
      co_wash: { score: 60, notes: 'PEG-80 Sorbitan Laurate: mild emulsifier in co-wash.' },
      rinse_out_conditioner: { score: 35, notes: 'PEG-80 Sorbitan Laurate: emulsifier in conditioner.' },
      deep_conditioner_mask: { score: 30, notes: 'PEG-80 Sorbitan Laurate: emulsifier in mask.' },
      leave_in_conditioner: { score: 25, notes: 'PEG-80 Sorbitan Laurate: emulsifier in leave-in.' },
      hair_oil_serum: { score: 20, notes: 'PEG-80 Sorbitan Laurate: emulsifier in serum.' },
      styling_product: { score: 25, notes: 'PEG-80 Sorbitan Laurate: emulsifier in styler.' }
    },
    aliases: ['PEG-80 Sorbitan Monolaurate', 'Polysorbate 80 Laurate'],
    molecular_weight_da: 4000,
    ionic_charge: 'neutral',
    penetration_depth: 'surface'
  };
  db.push(newEntry);
  patchCount++;
  console.log('  ADDED: "PEG-80 Sorbitan Laurate"');
} else {
  console.log('  SKIP: "PEG-80 Sorbitan Laurate" already exists');
}

// Fix 14: Add "Sodium Chloride" entry with proper aliases
// The current DB has "Sodium Chloride*" (with asterisk) which doesn't match "Sodium Chloride"
if (!findByName('Sodium Chloride')) {
  const newEntry = {
    name: 'Sodium Chloride',
    category: 'pH / Chelation / Electrolyte',
    low: 'n',
    med: 'n',
    high: 'n',
    fine: 'n',
    oily: 'n',
    notes: 'Sodium Chloride: salt used as viscosity modifier and electrolyte in shampoos. Neutral ingredient.',
    tags: ['electrolyte', 'fine-hair-safe', 'high-porosity-safe', 'low-buildup', 'low-porosity-safe', 'viscosity-modifier'],
    product_roles: {
      shampoo: { score: 55, notes: 'Sodium Chloride: viscosity modifier in shampoo; neutral ingredient.' },
      co_wash: { score: 45, notes: 'Sodium Chloride: electrolyte in co-wash.' },
      rinse_out_conditioner: { score: 42, notes: 'Sodium Chloride: electrolyte in conditioner.' },
      deep_conditioner_mask: { score: 42, notes: 'Sodium Chloride: electrolyte in mask.' },
      leave_in_conditioner: { score: 35, notes: 'Sodium Chloride: electrolyte in leave-in.' },
      hair_oil_serum: { score: 20, notes: 'Sodium Chloride: electrolyte in serum.' },
      styling_product: { score: 38, notes: 'Sodium Chloride: electrolyte in styler.' }
    },
    aliases: ['Salt', 'NaCl', 'Sea Salt', 'Sodium Chloride (Salt)', 'Table Salt'],
    molecular_weight_da: 58,
    ionic_charge: 'neutral',
    penetration_depth: 'surface'
  };
  db.push(newEntry);
  patchCount++;
  console.log('  ADDED: "Sodium Chloride"');
} else {
  console.log('  SKIP: "Sodium Chloride" already exists');
}

// Fix 15: Also add alias to "Sodium Chloride*" to catch the asterisk variant
patch('Sodium Chloride*', entry => {
  ensureAlias(entry, 'Sodium Chloride');
  if (entry.product_roles && entry.product_roles.shampoo) {
    entry.product_roles.shampoo.score = 55;
  }
});

// Fix 16: Water — ensure shampoo score is 75 (not 35)
// The "Water" entry should already have score 75 based on our benchmark calc
const waterEntry = db.find(i => i.name === 'Water');
if (waterEntry) {
  if (waterEntry.product_roles && waterEntry.product_roles.shampoo) {
    if (waterEntry.product_roles.shampoo.score !== 75) {
      waterEntry.product_roles.shampoo.score = 75;
      console.log('  PATCHED: "Water" shampoo score → 75');
      patchCount++;
    } else {
      console.log('  OK: "Water" shampoo score already 75');
    }
  }
}

// Fix 17: Fragrance — ensure shampoo score is 45 (not 35)
const fragranceEntry = db.find(i => i.name === 'Fragrance');
if (fragranceEntry) {
  if (fragranceEntry.product_roles && fragranceEntry.product_roles.shampoo) {
    if (fragranceEntry.product_roles.shampoo.score !== 45) {
      fragranceEntry.product_roles.shampoo.score = 45;
      console.log('  PATCHED: "Fragrance" shampoo score → 45');
      patchCount++;
    } else {
      console.log('  OK: "Fragrance" shampoo score already 45');
    }
  }
}

// Update metadata
raw.lastUpdated = new Date().toISOString().split('T')[0];
raw.totalIngredients = db.length;

// Write back
fs.writeFileSync(DB_PATH, JSON.stringify(raw, null, 2), 'utf8');

console.log(`\n=== Patch complete: ${patchCount} entries modified/added ===`);
console.log(`Total ingredients: ${db.length}`);
