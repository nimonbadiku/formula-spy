const fs = require('fs');
const path = require('path');

const unknownFilePath = path.join(__dirname, '../database/unknown-ingredients.txt');
const dbPath = path.join(__dirname, '../database/ingredients.v3.json');
const outputPath = path.join(__dirname, '../database/new-ingredients-batch.json');

const lines = fs.readFileSync(unknownFilePath, 'utf-8').split('\n').map(l => l.trim());
let db = { ingredients: [] };
try {
  db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
} catch (err) {
  console.error('Failed to read db', err);
}

const existingNames = new Set(db.ingredients.map(i => i.name.toLowerCase()));

const offensiveWords = ['nigger', 'bitch', 'fuck', 'shit', 'cunt', 'placeholder', 'test'];

function normalizeName(name) {
  name = name.replace(/\*+/g, '').trim(); // Remove asterisks
  name = name.replace(/\.$/, '').trim(); // Remove trailing dot
  // Capitalize properly
  name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return name;
}

const results = [];
const skipped = [];
const reviewFlagged = [];

// Heuristics for classification
function classify(name) {
  const lName = name.toLowerCase();
  
  if (lName.includes('extract') || lName.includes('powder') || lName.includes('water') || lName.includes('juice') || lName.includes('leaf') || lName.includes('root') || lName.includes('flower')) {
    return { category: 'Botanical', sub_category: 'Plant Extract', tags: ['botanical', 'natural'] };
  }
  if (lName.includes('oil') || lName.includes('butter')) {
    if (lName.includes('essential')) return { category: 'Functional Additive', sub_category: 'Essential Oil', tags: ['fragrance', 'sensitizer-risk'] };
    return { category: 'Oil', sub_category: 'Plant Oil', tags: ['oil', 'natural', 'emollient'] };
  }
  if (lName.includes('polyquaternium')) {
    return { category: 'Polymer', sub_category: 'Cationic Polymer', tags: ['cationic', 'conditioning', 'film-forming', 'polymer'] };
  }
  if (lName.includes('protein') || lName.includes('collagen') || lName.includes('elastin') || lName.includes('keratin') || lName.includes('amino acid')) {
    return { category: 'Protein', sub_category: 'Hydrolyzed Protein', tags: ['protein', 'strengthening'] };
  }
  if (lName.includes('ferment')) {
    return { category: 'Functional Additive', sub_category: 'Ferment', tags: ['ferment', 'microbiome'] };
  }
  if (lName.includes('sulfate') || lName.includes('sulfosuccinate') || lName.includes('carboxylate') || lName.includes('glucoside') || lName.includes('betaine') || lName.includes('saponaria')) {
    return { category: 'Surfactant', sub_category: 'Cleansing Agent', tags: ['surfactant', 'cleansing'] };
  }
  if (lName.includes('chloride') && (lName.includes('stearalkonium') || lName.includes('behentrimonium') || lName.includes('cetrimonium'))) {
    return { category: 'Cationic Surfactant', sub_category: 'Conditioning Agent', tags: ['cationic', 'conditioning', 'surfactant'] };
  }
  if (lName.includes('paraben') || lName.includes('phenoxyethanol') || lName.includes('tropolone')) {
    return { category: 'Preservative', sub_category: 'Preservative', tags: ['preservative'] };
  }
  if (lName.includes('glycol') || lName.includes('glycerin') || lName.includes('pca') || lName.includes('saccharide')) {
    return { category: 'Humectant', sub_category: 'Humectant', tags: ['humectant', 'hydrating'] };
  }
  if (lName.includes('alcohol')) {
    if (lName.includes('stearyl') || lName.includes('cetyl') || lName.includes('batyl') || lName.includes('isostearyl')) return { category: 'Fatty Alcohol', sub_category: 'Fatty Alcohol', tags: ['fatty-alcohol', 'emollient'] };
    if (lName.includes('benzyl') || lName.includes('isopropyl')) return { category: 'Preservative', sub_category: 'Preservative', tags: ['preservative', 'fragrance'] };
    return { category: 'Drying Alcohol', sub_category: 'Solvent', tags: ['drying-alcohol'] };
  }
  if (lName.includes('acid') && (lName.includes('citric') || lName.includes('glycolic') || lName.includes('malic') || lName.includes('tartaric'))) {
    return { category: 'Functional Additive', sub_category: 'pH Adjuster', tags: ['ph-adjuster', 'aha'] };
  }
  if (lName.includes('fragrance') || lName.includes('parfum') || lName.includes('limonene') || lName.includes('citral') || lName.includes('linalool') || lName.includes('geraniol') || lName.includes('citronellol') || lName.includes('hexyl cinnamal')) {
    return { category: 'Functional Additive', sub_category: 'Fragrance', tags: ['fragrance', 'sensitizer-risk'] };
  }
  if (lName.includes('clay') || lName.includes('mud') || lName.includes('kaolin') || lName.includes('bentonite') || lName.includes('hectorite')) {
    return { category: 'Functional Additive', sub_category: 'Clay', tags: ['absorbent', 'cleansing'] };
  }
  if (lName.includes('mica') || lName.includes('oxide') || lName.includes('titanium') || lName.includes('color') || lName.includes('basic') || lName.includes('acid') && (lName.includes('blue') || lName.includes('red') || lName.includes('yellow') || lName.includes('violet') || lName.includes('brown'))) {
    return { category: 'Functional Additive', sub_category: 'Colorant', tags: ['colorant'] };
  }
  if (lName.includes('gum') || lName.includes('carrageenan') || lName.includes('agar') || lName.includes('algin') || lName.includes('starch') || lName.includes('cellulose')) {
    return { category: 'Polymer', sub_category: 'Natural Polymer', tags: ['thickener', 'film-forming'] };
  }
  
  return { category: 'Unknown', sub_category: 'Unknown', tags: [] };
}

function generatePhase3(name) {
  const { category, sub_category, tags } = classify(name);
  const needsReview = category === 'Unknown' || tags.length === 0;
  
  const obj = {
    name: name,
    category: category,
    low: "g", med: "g", high: "g", fine: "g", oily: "g", // default
    notes: `Autogenerated Phase 3 profile for ${name}.`,
    tags: tags,
    product_roles: {
      shampoo: { score: 50 },
      co_wash: { score: 50 },
      rinse_out_conditioner: { score: 50 },
      deep_conditioner_mask: { score: 50 },
      leave_in_conditioner: { score: 50 },
      hair_oil_serum: { score: 50 },
      styling_product: { score: 50 }
    },
    aliases: [],
    molecular_weight_da: 0,
    ionic_charge: tags.includes('cationic') ? 'cationic' : (tags.includes('anionic') ? 'anionic' : 'neutral'),
    penetration_depth: "surface",
    baseScore: {
      shampoo: 50,
      co_wash: 50,
      rinse_out_conditioner: 50,
      deep_conditioner_mask: 50,
      leave_in: 50,
      hair_oil_serum: 50,
      styling_product: 50
    },
    sub_category: sub_category,
    molecular_weight_confidence: "estimated",
    profile_compatibility: {
      porosity_low: 0, porosity_med: 0, porosity_high: 0,
      density_fine: 0, density_med: 0, density_coarse: 0,
      condition_damaged: 0, condition_normal: 0, condition_healthy: 0,
      oiliness_dry: 0, oiliness_normal: 0, oiliness_oily: 0,
      curl_straight: 0, curl_wavy: 0, curl_curly: 0, curl_coily: 0,
      protein_sensitive: 0, silicone_sensitive: 0,
      chemically_treated: 0, color_treated: 0
    },
    physicochemical: {
      water_solubility: tags.includes('oil') ? "low" : "moderate",
      volatility: "non-volatile",
      film_forming_strength: tags.includes('film-forming') ? 0.5 : 0,
      humectant_capacity: tags.includes('humectant') ? 0.5 : 0,
      emolliency: tags.includes('emollient') ? 0.5 : 0,
      cleansing_strength: tags.includes('cleansing') ? 0.5 : 0,
      substantivity: tags.includes('cationic') ? "high" : "low"
    },
    functional_signals: {
      bond_repair: { active: tags.includes('bond-repair'), mechanism: "none", strength: "none" },
      scalp_active: { active: tags.includes('scalp-active'), activity_type: "none", strength: "none", evidence_level: "none" },
      drying_alcohol: tags.includes('drying-alcohol'),
      fatty_alcohol: tags.includes('fatty-alcohol'),
      sulfate: tags.includes('sulfate'),
      fragrance: tags.includes('fragrance'),
      color_protection: { active: false, mechanism: "none", strength: "none" },
      heavy_polymer: tags.includes('heavy-polymer') || false,
      conditioning_polymer: tags.includes('conditioning') && tags.includes('polymer'),
      protein_weight_class: tags.includes('protein') ? "medium" : "none",
      humectant_type: tags.includes('humectant') ? "polyol" : "none"
    },
    sensitivity_profile: {
      sensitizer_risk: tags.includes('sensitizer-risk') ? "moderate" : "none",
      allergen_risk: tags.includes('allergen-risk') ? "moderate" : "none",
      irritant_class: "none",
      avoid_for_profiles: []
    },
    concentration_context: {
      typical_use_pct_min: 0.1,
      typical_use_pct_max: 5,
      activity_threshold_pct: 0.1,
      "position_sensitivity": "moderate"
    }
  };

  if (needsReview) {
    obj["needs-review"] = true;
  }
  
  return obj;
}

lines.forEach(line => {
  if (!line) return;
  
  let name = normalizeName(line);
  let lowerName = name.toLowerCase();

  // Validate non-offensive
  if (offensiveWords.some(w => lowerName.includes(w))) {
    skipped.push({ name, reason: 'offensive/irrelevant' });
    return;
  }
  // Validate numbers only
  if (/^\d+$/.test(name)) {
    skipped.push({ name, reason: 'number only' });
    return;
  }

  // Deduplicate
  if (existingNames.has(lowerName)) {
    skipped.push({ name, reason: 'duplicate in DB' });
    return;
  }
  
  // Also check if duplicate in current run
  if (results.some(r => r.name.toLowerCase() === lowerName)) {
    skipped.push({ name, reason: 'duplicate in batch' });
    return;
  }

  const ingredientObj = generatePhase3(name);
  if (ingredientObj["needs-review"]) {
    reviewFlagged.push(name);
  }
  results.push(ingredientObj);
});

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.log(`Processed ${lines.length} lines.`);
console.log(`Added: ${results.length}`);
console.log(`Skipped: ${skipped.length}`);
console.log(`Needs Review: ${reviewFlagged.length}`);

// Write a small report
const reportPath = path.join(__dirname, '../database/integration-report.md');
const reportContent = `
# Phase 3 Ingredient Integration Report

- **Total New Ingredients Added:** ${results.length}
- **Skipped Entries (Duplicates/Offensive/Irrelevant):** ${skipped.length}
- **Entries Flagged for Review:** ${reviewFlagged.length}

## Skipped Examples
${skipped.slice(0, 10).map(s => `- ${s.name} (${s.reason})`).join('\n')}

## Review Flagged Examples
${reviewFlagged.slice(0, 10).map(n => `- ${n}`).join('\n')}
`;
fs.writeFileSync(reportPath, reportContent);
console.log('Report written to database/integration-report.md');
