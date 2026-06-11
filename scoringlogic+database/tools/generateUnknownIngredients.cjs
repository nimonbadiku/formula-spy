'use strict';
/**
 * generateUnknownIngredients.cjs
 * 
 * Reads database/unknown-ingredients.txt, classifies each ingredient into
 * full Phase 3 schema format, deduplicates against ingredients.v3.json,
 * and outputs:
 *   - database/new-ingredients-batch.json  (import-ready array)
 *   - database/integration-report.md       (summary report)
 */

const fs = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const UNKNOWN_TXT = path.join(ROOT, 'database', 'unknown-ingredients.txt');
const V3_JSON     = path.join(ROOT, 'database', 'ingredients.v3.json');
const OUT_BATCH   = path.join(ROOT, 'database', 'new-ingredients-batch.json');
const OUT_REPORT  = path.join(ROOT, 'database', 'integration-report.md');

// ─── Load existing DB ─────────────────────────────────────────────────────────
const v3db = JSON.parse(fs.readFileSync(V3_JSON, 'utf8'));
const existingNames = new Set(v3db.ingredients.map(i => i.name.toLowerCase().trim()));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalize(raw) {
  return raw
    .replace(/\*/g, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(str) {
  // Preserve known acronyms and special patterns
  const acronyms = new Set(['PEG','PPG','PVP','VP','SLS','SLES','MIT','CMIT','IPBC','PHMB','DEA','MEA','MIPA','TEA','AMP','PVM','MA','VA','HC','DNA','RNA','ATP','EGCG','OPC','MSM','DHA','DMAPA','EDTA','NTA','PCA','PABA','UV','UVA','UVB']);
  return str.replace(/\b([A-Za-z0-9]+)\b/g, (word) => {
    if (acronyms.has(word.toUpperCase())) return word.toUpperCase();
    if (/^[A-Z]{2,}$/.test(word)) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function fixCaps(name) {
  // If entire name is ALL CAPS, convert to title case
  if (name === name.toUpperCase() && name.length > 3) {
    return toTitleCase(name.toLowerCase());
  }
  return name;
}

// ─── Classification Engine ────────────────────────────────────────────────────

/**
 * Classify an ingredient name into category, sub_category, tags, and all Phase 3 fields.
 */
function classify(name) {
  const n = name.toLowerCase();
  const nOrig = name;

  // ── Water / Solvent ──────────────────────────────────────────────────────
  if (/^(aqua|water|eau|aqua\/water|aqua\/water\/eau|distilled water|purified water|deionized water)$/i.test(n)) {
    return makeEntry(name, {
      category: 'Solvent',
      sub_category: 'Water',
      tags: ['water', 'solvent', 'low-buildup', 'fine-hair-safe'],
      notes: 'Water — universal solvent and primary carrier in aqueous formulations.',
      profile_compatibility: profileAll(0.1),
      physicochemical: { water_solubility: 'complete', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'none' },
      functional_signals: defaultSignals(),
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 30, typical_use_pct_max: 95, activity_threshold_pct: 0, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 0, styling_product: 5 },
      molecular_weight_da: 18, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Fragrance / Parfum ───────────────────────────────────────────────────
  if (/^(fragrance|parfum|parfum\/fragrance|fragrance blend)$/i.test(n)) {
    return makeEntry(name, {
      category: 'Fragrance',
      sub_category: 'Fragrance Blend',
      tags: ['fragrance', 'allergen-risk', 'sensitizer-risk'],
      notes: 'Fragrance blend — undisclosed mixture of aromatic compounds. Common sensitizer.',
      profile_compatibility: { ...profileAll(0), protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0, color_treated: 0 },
      physicochemical: { water_solubility: 'variable', volatility: 'moderate', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), fragrance: true },
      sensitivity_profile: { sensitizer_risk: 'high', allergen_risk: 'high', irritant_class: 'moderate', avoid_for_profiles: ['sensitive-scalp', 'allergy-prone'] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 2, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 5 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── EU Fragrance Allergens (listed individually) ─────────────────────────
  const fragranceAllergens = [
    'limonene','linalool','citral','geraniol','citronellol','hexyl cinnamal',
    'benzyl salicylate','eugenol','isoeugenol','farnesol','coumarin','cinnamaldehyde',
    'benzyl benzoate','benzyl cinnamate','anise alcohol','benzyl alcohol',
    'cinnamyl alcohol','hydroxycitronellal','lilial','lyral','methyl 2-octynoate',
    'alpha-isomethyl ionone','evernia prunastri extract','evernia furfuracea extract',
    'oakmoss absolute','treemoss absolute','amyl cinnamal','amylcinnamyl alcohol',
    'butylphenyl methylpropional','hexyl cinnamaldehyde','hydroxyisohexyl 3-cyclohexene carboxaldehyde',
    'isoeugenol','methyl eugenol','anethole','geranial','neral','citronellal',
    'alpha-pinene','beta-pinene','myrcene','camphene','sabinene','terpinolene',
    'phellandrene','gamma-terpinene','alpha-terpinene','para-cymene','ocimene',
    'bisabolene','cadinene','caryophyllene','humulene','germacrene','selinene',
    'valencene','nootkatone','cedrol','cedrene','guaiol','bulnesol','patchoulol',
    'santalol','vetivrol','jasmone','methyl jasmonate','cis-3-hexenol',
    'cis-3-hexenyl acetate','ethyl butyrate','benzyl acetate','phenethyl acetate',
    'linalyl acetate','geranyl acetate','citronellyl acetate','terpinyl acetate',
    'bornyl acetate','vetiveryl acetate','cedryl acetate','methyl anthranilate',
    'linalyl propionate','geranyl propionate','citronellyl propionate',
    'methyl benzoate','ethyl benzoate','methyl salicylate','ethyl salicylate',
    'amyl salicylate','hexyl salicylate','methyl cinnamate','ethyl cinnamate',
    'vanillin','ethyl vanillin','maltol','ethyl maltol','heliotropine','piperonal',
    'anisaldehyde','benzaldehyde','cyclamen aldehyde','bourgeonal','florosa',
    'hedione','iso e super','galaxolide','tonalide','ethylene brassylate',
    'musk ketone','musk xylene','isopulegol','eucalyptol','thymol','carvacrol',
    'menthyl lactate','menthyl pca','terpineol','carvone',
  ];
  if (fragranceAllergens.includes(n.replace(/\*/g,''))) {
    return makeEntry(name, {
      category: 'Fragrance',
      sub_category: 'Fragrance Allergen',
      tags: ['fragrance', 'allergen-risk', 'sensitizer-risk', 'eu-allergen'],
      notes: `EU-listed fragrance allergen. Requires declaration above 0.001% (leave-on) / 0.01% (rinse-off).`,
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'low', volatility: 'moderate', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), fragrance: true },
      sensitivity_profile: { sensitizer_risk: 'high', allergen_risk: 'high', irritant_class: 'moderate', avoid_for_profiles: ['sensitive-scalp', 'allergy-prone', 'color-treated'] },
      concentration_context: { typical_use_pct_min: 0.001, typical_use_pct_max: 0.5, activity_threshold_pct: 0.001, position_sensitivity: 'low' },
      product_roles: { shampoo: 3, co_wash: 3, rinse_out_conditioner: 3, deep_conditioner_mask: 3, leave_in_conditioner: 3, hair_oil_serum: 3, styling_product: 3 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Sulfate Surfactants ──────────────────────────────────────────────────
  if (/sulfate/.test(n) && !/(sulfosuccinate|sulfonate|sulfate-free)/.test(n)) {
    const isMild = /magnesium|ammonium|tea-|triethanolamine/.test(n);
    return makeEntry(name, {
      category: 'Surfactant',
      sub_category: 'Sulfate Surfactant',
      tags: ['surfactant', 'sulfate', isMild ? 'mild-sulfate' : 'harsh-sulfate', 'cleansing'],
      notes: `Sulfate-based anionic surfactant. ${isMild ? 'Milder variant.' : 'Can be drying at high concentrations.'}`,
      profile_compatibility: {
        porosity_low: 0.6, porosity_med: 0.4, porosity_high: 0.2,
        density_fine: 0.5, density_med: 0.3, density_coarse: 0.2,
        condition_damaged: -0.3, condition_normal: 0.3, condition_healthy: 0.5,
        oiliness_dry: -0.2, oiliness_normal: 0.4, oiliness_oily: 0.7,
        curl_straight: 0.4, curl_wavy: 0.3, curl_curly: 0.1, curl_coily: 0,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: -0.2, color_treated: -0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: isMild ? 0.6 : 0.85, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), sulfate: true },
      sensitivity_profile: { sensitizer_risk: isMild ? 'low' : 'moderate', allergen_risk: 'none', irritant_class: isMild ? 'mild' : 'moderate', avoid_for_profiles: ['sensitive-scalp', 'dry-hair'] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 15, activity_threshold_pct: 1, position_sensitivity: 'high' },
      product_roles: { shampoo: isMild ? 55 : 45, co_wash: 10, rinse_out_conditioner: 5, deep_conditioner_mask: 2, leave_in_conditioner: 2, hair_oil_serum: 0, styling_product: 5 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── Sulfosuccinate Surfactants ───────────────────────────────────────────
  if (/sulfosuccinate/.test(n)) {
    return makeEntry(name, {
      category: 'Surfactant',
      sub_category: 'Sulfosuccinate Surfactant',
      tags: ['surfactant', 'mild-surfactant', 'anionic', 'cleansing', 'fine-hair-safe'],
      notes: 'Mild anionic sulfosuccinate surfactant. Gentle cleansing with low irritation potential.',
      profile_compatibility: {
        porosity_low: 0.5, porosity_med: 0.5, porosity_high: 0.4,
        density_fine: 0.6, density_med: 0.5, density_coarse: 0.3,
        condition_damaged: 0.2, condition_normal: 0.5, condition_healthy: 0.5,
        oiliness_dry: 0.2, oiliness_normal: 0.5, oiliness_oily: 0.6,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.3, curl_coily: 0.2,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.2, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0.45, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), sulfate: false },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'none', irritant_class: 'mild', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 10, activity_threshold_pct: 1, position_sensitivity: 'high' },
      product_roles: { shampoo: 60, co_wash: 30, rinse_out_conditioner: 10, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 0, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── Glucoside / Sugar Surfactants ────────────────────────────────────────
  if (/glucoside|glucoside tartrate|glucoside citrate/.test(n)) {
    return makeEntry(name, {
      category: 'Surfactant',
      sub_category: 'Alkyl Glucoside Surfactant',
      tags: ['surfactant', 'mild-surfactant', 'nonionic', 'cleansing', 'fine-hair-safe', 'low-buildup', 'biodegradable'],
      notes: 'Mild nonionic alkyl glucoside surfactant derived from sugar. Excellent skin and scalp tolerance.',
      profile_compatibility: {
        porosity_low: 0.5, porosity_med: 0.5, porosity_high: 0.5,
        density_fine: 0.6, density_med: 0.5, density_coarse: 0.4,
        condition_damaged: 0.3, condition_normal: 0.5, condition_healthy: 0.5,
        oiliness_dry: 0.3, oiliness_normal: 0.5, oiliness_oily: 0.6,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.4, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.3, color_treated: 0.4,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.1, emolliency: 0.1, cleansing_strength: 0.4, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), sulfate: false },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 15, activity_threshold_pct: 1, position_sensitivity: 'high' },
      product_roles: { shampoo: 65, co_wash: 45, rinse_out_conditioner: 15, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 0, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'nonionic', penetration_depth: 'surface',
    });
  }

  // ── Betaine / Amphoteric Surfactants ─────────────────────────────────────
  if (/betaine|sultaine|hydroxysultaine|amphoacetate|amphodipropionate|amphodiacetate/.test(n)) {
    return makeEntry(name, {
      category: 'Surfactant',
      sub_category: 'Amphoteric Surfactant',
      tags: ['surfactant', 'amphoteric', 'mild-surfactant', 'cleansing', 'fine-hair-safe', 'conditioning'],
      notes: 'Amphoteric betaine/sultaine surfactant. Mild, conditioning, reduces irritation of anionic surfactants.',
      profile_compatibility: {
        porosity_low: 0.4, porosity_med: 0.5, porosity_high: 0.5,
        density_fine: 0.6, density_med: 0.5, density_coarse: 0.4,
        condition_damaged: 0.3, condition_normal: 0.5, condition_healthy: 0.5,
        oiliness_dry: 0.3, oiliness_normal: 0.5, oiliness_oily: 0.5,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.4, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.3, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.1, emolliency: 0.1, cleansing_strength: 0.35, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), sulfate: false },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 15, activity_threshold_pct: 1, position_sensitivity: 'high' },
      product_roles: { shampoo: 60, co_wash: 40, rinse_out_conditioner: 15, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 0, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'amphoteric', penetration_depth: 'surface',
    });
  }

  // ── Lactylate Surfactants ────────────────────────────────────────────────
  if (/lactylate/.test(n)) {
    return makeEntry(name, {
      category: 'Surfactant',
      sub_category: 'Lactylate Surfactant',
      tags: ['surfactant', 'mild-surfactant', 'anionic', 'cleansing', 'biodegradable'],
      notes: 'Mild anionic lactylate surfactant derived from lactic acid. Gentle and biodegradable.',
      profile_compatibility: {
        porosity_low: 0.5, porosity_med: 0.5, porosity_high: 0.4,
        density_fine: 0.5, density_med: 0.5, density_coarse: 0.4,
        condition_damaged: 0.2, condition_normal: 0.5, condition_healthy: 0.5,
        oiliness_dry: 0.2, oiliness_normal: 0.5, oiliness_oily: 0.6,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.3, curl_coily: 0.2,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.2, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0.1, cleansing_strength: 0.4, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), sulfate: false },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 10, activity_threshold_pct: 1, position_sensitivity: 'high' },
      product_roles: { shampoo: 60, co_wash: 35, rinse_out_conditioner: 10, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 0, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── Cocamide DEA/MEA/MIPA ────────────────────────────────────────────────
  if (/cocamide|lauramide|isostearamide|oleamide/.test(n) && /(dea|mea|mipa)/.test(n)) {
    return makeEntry(name, {
      category: 'Surfactant',
      sub_category: 'Alkanolamide Foam Booster',
      tags: ['surfactant', 'foam-booster', 'viscosity-builder', 'needs-review'],
      notes: 'Fatty acid alkanolamide used as foam booster and viscosity builder. DEA variants have potential nitrosamine concerns.',
      needs_review: /dea/.test(n),
      profile_compatibility: {
        porosity_low: 0.3, porosity_med: 0.4, porosity_high: 0.3,
        density_fine: 0.4, density_med: 0.4, density_coarse: 0.3,
        condition_damaged: 0.1, condition_normal: 0.4, condition_healthy: 0.4,
        oiliness_dry: 0.2, oiliness_normal: 0.4, oiliness_oily: 0.5,
        curl_straight: 0.3, curl_wavy: 0.3, curl_curly: 0.2, curl_coily: 0.2,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0, color_treated: 0,
      },
      physicochemical: { water_solubility: 'moderate', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0.2, cleansing_strength: 0.2, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: /dea/.test(n) ? 'moderate' : 'low', allergen_risk: 'none', irritant_class: /dea/.test(n) ? 'mild' : 'none', avoid_for_profiles: /dea/.test(n) ? ['sensitive-scalp'] : [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 5, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 40, co_wash: 20, rinse_out_conditioner: 10, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 0, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'nonionic', penetration_depth: 'surface',
    });
  }

  // ── Quaternary Ammonium / Cationic Conditioners ──────────────────────────
  if (/stearalkonium|dicocodimonium|didecyldimonium|benzalkonium|benzethonium|cetrimonium|behentrimonium|disteardimonium|dihydrogenated tallow|dimethyldicocoammonium/.test(n)) {
    return makeEntry(name, {
      category: 'Conditioning Agent',
      sub_category: 'Quaternary Ammonium Conditioner',
      tags: ['conditioning', 'cationic', 'detangling', 'antistatic'],
      notes: 'Cationic quaternary ammonium compound. Provides conditioning, detangling, and antistatic effects.',
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.5, porosity_high: 0.7,
        density_fine: 0.3, density_med: 0.5, density_coarse: 0.6,
        condition_damaged: 0.6, condition_normal: 0.4, condition_healthy: 0.2,
        oiliness_dry: 0.6, oiliness_normal: 0.4, oiliness_oily: 0.1,
        curl_straight: 0.3, curl_wavy: 0.4, curl_curly: 0.5, curl_coily: 0.6,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.5, color_treated: 0.4,
      },
      physicochemical: { water_solubility: 'moderate', volatility: 'non-volatile', film_forming_strength: 0.3, humectant_capacity: 0, emolliency: 0.4, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals(), conditioning_polymer: true },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 5, activity_threshold_pct: 0.1, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 15, co_wash: 45, rinse_out_conditioner: 65, deep_conditioner_mask: 70, leave_in_conditioner: 60, hair_oil_serum: 10, styling_product: 30 },
      molecular_weight_da: null, ionic_charge: 'cationic', penetration_depth: 'surface',
    });
  }

  // ── Polyquaternium ───────────────────────────────────────────────────────
  if (/^polyquaternium-\d+$/.test(n)) {
    const num = parseInt(n.replace('polyquaternium-', ''), 10);
    // Known heavy film-formers: PQ-4, 10, 11, 37, 55, 67, 68, 72, 73
    const heavyFilmFormers = new Set([4,10,11,37,55,67,68,72,73]);
    const isHeavy = heavyFilmFormers.has(num);
    return makeEntry(name, {
      category: 'Conditioning Polymer',
      sub_category: isHeavy ? 'Heavy Conditioning Polymer' : 'Conditioning Polymer',
      tags: ['conditioning-polymer', 'cationic', 'antistatic', 'film-former', isHeavy ? 'buildup-risk' : 'low-buildup'],
      notes: `Cationic conditioning polymer. ${isHeavy ? 'Higher MW variant with buildup potential on fine/low-porosity hair.' : 'Moderate MW conditioning polymer.'}`,
      needs_review: num > 100,
      profile_compatibility: {
        porosity_low: isHeavy ? -0.2 : 0.2, porosity_med: 0.4, porosity_high: 0.6,
        density_fine: isHeavy ? -0.1 : 0.3, density_med: 0.4, density_coarse: 0.5,
        condition_damaged: 0.5, condition_normal: 0.3, condition_healthy: 0.1,
        oiliness_dry: 0.5, oiliness_normal: 0.3, oiliness_oily: 0,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.5, curl_coily: 0.6,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: isHeavy ? 0.7 : 0.4, humectant_capacity: 0.1, emolliency: 0.2, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals(), heavy_polymer: isHeavy, conditioning_polymer: !isHeavy },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: isHeavy ? ['fine-hair', 'low-porosity'] : [] },
      concentration_context: { typical_use_pct_min: 0.05, typical_use_pct_max: 3, activity_threshold_pct: 0.05, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 20, co_wash: 50, rinse_out_conditioner: 65, deep_conditioner_mask: 60, leave_in_conditioner: 55, hair_oil_serum: 5, styling_product: 35 },
      molecular_weight_da: null, ionic_charge: 'cationic', penetration_depth: 'surface',
    });
  }

  // ── Volatile Cyclic Silicones (D4/D5/D6) ────────────────────────────────
  if (/cyclotetrasiloxane|cyclopentasiloxane|cyclohexasiloxane|octamethylcyclotetrasiloxane|decamethylcyclopentasiloxane|decamethylcyclopentasiloxane|^d4$|^d5$|^d6$|hexamethyldisiloxane|octamethyltrisiloxane|decamethyltetrasiloxane|dodecamethylpentasiloxane|methyl trimethicone|ethyl trisiloxane/.test(n)) {
    return makeEntry(name, {
      category: 'Silicone',
      sub_category: 'Volatile Cyclic Silicone',
      tags: ['silicone', 'volatile-silicone', 'low-buildup', 'fine-hair-safe', 'needs-review'],
      notes: 'Volatile cyclic silicone. Evaporates after application leaving no residue. D4/D5 under regulatory scrutiny in EU.',
      needs_review: true,
      profile_compatibility: {
        porosity_low: 0.5, porosity_med: 0.4, porosity_high: 0.3,
        density_fine: 0.6, density_med: 0.4, density_coarse: 0.3,
        condition_damaged: 0.3, condition_normal: 0.4, condition_healthy: 0.4,
        oiliness_dry: 0.3, oiliness_normal: 0.4, oiliness_oily: 0.4,
        curl_straight: 0.5, curl_wavy: 0.4, curl_curly: 0.3, curl_coily: 0.2,
        protein_sensitive: 0, silicone_sensitive: -0.3, chemically_treated: 0.3, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'high', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0.3, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: ['silicone-sensitive'] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 20, activity_threshold_pct: 0.5, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 10, rinse_out_conditioner: 20, deep_conditioner_mask: 15, leave_in_conditioner: 30, hair_oil_serum: 50, styling_product: 40 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Non-volatile Silicones (Polysilicone-N, PEG-dimethicone, etc.) ───────
  if (/polysilicone-\d+|dimethicone peg|peg.*dimethicone|bis-peg.*dimethicone|lauryl peg.*methicone|cetyl peg.*dimethicone|dimethicone\/peg|dimethicone\/polyglycerin|dimethicone\/vinyl|dimethicone\/bis|dimethicone\/silsesquioxane|dimethiconol|polymethylsilsesquioxane|diphenylsiloxy|vinyl dimethicone|c24-28 alkyl methicone|silica dimethyl silylate|silica silylate|polypropylsilsesquioxane/.test(n)) {
    return makeEntry(name, {
      category: 'Silicone',
      sub_category: 'Non-volatile Silicone',
      tags: ['silicone', 'non-volatile-silicone', 'film-former', 'conditioning'],
      notes: 'Non-volatile silicone derivative. Provides slip, shine, and heat protection. May build up on low-porosity hair.',
      profile_compatibility: {
        porosity_low: -0.1, porosity_med: 0.4, porosity_high: 0.6,
        density_fine: 0.2, density_med: 0.4, density_coarse: 0.5,
        condition_damaged: 0.5, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.5, oiliness_normal: 0.3, oiliness_oily: 0,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.3, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: -0.5, chemically_treated: 0.4, color_treated: 0.4,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.6, humectant_capacity: 0, emolliency: 0.5, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals(), heavy_polymer: true },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: ['silicone-sensitive', 'low-porosity'] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 10, activity_threshold_pct: 0.1, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 5, co_wash: 15, rinse_out_conditioner: 35, deep_conditioner_mask: 30, leave_in_conditioner: 45, hair_oil_serum: 60, styling_product: 40 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Polyurethane Film Formers ────────────────────────────────────────────
  if (/^polyurethane-\d+$/.test(n)) {
    return makeEntry(name, {
      category: 'Film Former',
      sub_category: 'Polyurethane Film Former',
      tags: ['film-former', 'styling', 'hold', 'polymer'],
      notes: 'Polyurethane film-forming polymer. Provides flexible hold in styling products.',
      profile_compatibility: {
        porosity_low: 0.3, porosity_med: 0.4, porosity_high: 0.4,
        density_fine: 0.4, density_med: 0.4, density_coarse: 0.3,
        condition_damaged: 0.2, condition_normal: 0.4, condition_healthy: 0.4,
        oiliness_dry: 0.3, oiliness_normal: 0.4, oiliness_oily: 0.4,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.4, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.3, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'low', volatility: 'non-volatile', film_forming_strength: 0.7, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals(), heavy_polymer: true },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 10, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 2, co_wash: 5, rinse_out_conditioner: 10, deep_conditioner_mask: 5, leave_in_conditioner: 20, hair_oil_serum: 5, styling_product: 65 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── PVP / VP Copolymers / Acrylate Film Formers ──────────────────────────
  if (/^pvp$|^pvp\/|^vp\/|polyvinylpyrrolidone|polyvinyl alcohol|polyvinyl acetate|acrylates copolymer|acrylates\/|octylacrylamide.*copolymer|styrene\/acrylates|pvm\/ma|vinyl caprolactam|polyimide-|polyvinylcaprolactam|amp-acrylates|maltodextrin\/vp/.test(n)) {
    return makeEntry(name, {
      category: 'Film Former',
      sub_category: 'Synthetic Film Former',
      tags: ['film-former', 'styling', 'hold', 'polymer'],
      notes: 'Synthetic film-forming polymer. Provides hold and definition in styling products.',
      profile_compatibility: {
        porosity_low: 0.3, porosity_med: 0.4, porosity_high: 0.4,
        density_fine: 0.4, density_med: 0.4, density_coarse: 0.3,
        condition_damaged: 0.2, condition_normal: 0.4, condition_healthy: 0.4,
        oiliness_dry: 0.3, oiliness_normal: 0.4, oiliness_oily: 0.4,
        curl_straight: 0.4, curl_wavy: 0.4, curl_curly: 0.4, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.3, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0.7, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals(), heavy_polymer: true },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 15, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 2, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 20, hair_oil_serum: 5, styling_product: 70 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Carbomer / Crosspolymers / Thickeners ────────────────────────────────
  if (/^carbomer$|acrylates.*crosspolymer|polyacrylate crosspolymer|polyacrylate-\d+|hydroxyethyl acrylate.*copolymer|ammonium acryloyldimethyltaurate|ammonium polyacrylate|sodium polyacrylate|dehydroxanthan gum/.test(n)) {
    return makeEntry(name, {
      category: 'Rheology Modifier',
      sub_category: 'Carbomer/Acrylate Thickener',
      tags: ['thickener', 'rheology-modifier', 'gel-former', 'low-buildup'],
      notes: 'Synthetic acrylate-based thickener/rheology modifier. Provides gel texture and viscosity.',
      profile_compatibility: profileAll(0.1),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0.3, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 2, activity_threshold_pct: 0.1, position_sensitivity: 'low' },
      product_roles: { shampoo: 10, co_wash: 15, rinse_out_conditioner: 15, deep_conditioner_mask: 15, leave_in_conditioner: 20, hair_oil_serum: 5, styling_product: 40 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── Cellulose Derivatives ────────────────────────────────────────────────
  if (/cellulose|methylcellulose|ethylcellulose|hydroxypropylcellulose|hydroxyethylcellulose|hydroxypropyl methylcellulose|carboxymethylcellulose|microcrystalline cellulose|cellulose gum/.test(n)) {
    return makeEntry(name, {
      category: 'Rheology Modifier',
      sub_category: 'Cellulose Derivative',
      tags: ['thickener', 'rheology-modifier', 'natural-derived', 'film-former'],
      notes: 'Cellulose-derived thickener and film former. Natural origin, biodegradable.',
      profile_compatibility: profileAll(0.2),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0.4, humectant_capacity: 0.2, emolliency: 0, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 3, activity_threshold_pct: 0.1, position_sensitivity: 'low' },
      product_roles: { shampoo: 15, co_wash: 20, rinse_out_conditioner: 20, deep_conditioner_mask: 20, leave_in_conditioner: 25, hair_oil_serum: 5, styling_product: 35 },
      molecular_weight_da: null, ionic_charge: 'nonionic', penetration_depth: 'surface',
    });
  }

  // ── Starch / Flour / Powder (absorbents/texturizers) ─────────────────────
  if (/(starch|flour|powder)$/.test(n) && !/(extract|oil|butter|protein|hydrolyzed)/.test(n)) {
    const isAbsorbent = /(starch|flour|powder)$/.test(n);
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'Absorbent/Texturizer',
      tags: ['absorbent', 'texturizer', 'natural-derived', 'low-buildup', 'oily-scalp-friendly'],
      notes: 'Natural starch/flour/powder used as absorbent, texturizer, or dry shampoo base.',
      profile_compatibility: {
        porosity_low: 0.3, porosity_med: 0.3, porosity_high: 0.2,
        density_fine: 0.4, density_med: 0.3, density_coarse: 0.2,
        condition_damaged: 0.1, condition_normal: 0.3, condition_healthy: 0.3,
        oiliness_dry: 0, oiliness_normal: 0.3, oiliness_oily: 0.6,
        curl_straight: 0.3, curl_wavy: 0.3, curl_curly: 0.2, curl_coily: 0.1,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0, color_treated: 0,
      },
      physicochemical: { water_solubility: 'low', volatility: 'non-volatile', film_forming_strength: 0.1, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'low', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 20, activity_threshold_pct: 0.5, position_sensitivity: 'low' },
      product_roles: { shampoo: 10, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 10, hair_oil_serum: 5, styling_product: 30 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Gums / Polysaccharide Thickeners ─────────────────────────────────────
  if (/(gum|glucomannan|pectin|carrageenan|agar|algin|alginic acid|sodium alginate|calcium alginate|gellan|welan|sclerotium|pullulan|dextran|furcellaran|potassium alginate|ammonium alginate|propylene glycol alginate|amidated pectin|citrus pectin|apple pectin|beet pectin|gum arabic|acacia gum|tragacanth|karaya|ghatti|locust bean|carob gum|tara gum|konjac|fenugreek gum|tamarind seed|psyllium|quince seed|flaxseed gum|chia seed gum|okra gum|marshmallow gum|agar-agar|cassia angustifolia seed polysaccharide|tamarindus indica seed polysaccharide|biosaccharide gum|galactoarabinan)/.test(n)) {
    return makeEntry(name, {
      category: 'Rheology Modifier',
      sub_category: 'Natural Gum/Polysaccharide',
      tags: ['thickener', 'rheology-modifier', 'natural-derived', 'humectant', 'film-former'],
      notes: 'Natural polysaccharide gum used as thickener, stabilizer, and film former.',
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.3, porosity_high: 0.4,
        density_fine: 0.3, density_med: 0.3, density_coarse: 0.3,
        condition_damaged: 0.3, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.3, oiliness_normal: 0.3, oiliness_oily: 0.2,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.4, curl_coily: 0.4,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.2, color_treated: 0.2,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0.4, humectant_capacity: 0.4, emolliency: 0.1, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals(), humectant_type: 'polysaccharide' },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 3, activity_threshold_pct: 0.1, position_sensitivity: 'low' },
      product_roles: { shampoo: 15, co_wash: 25, rinse_out_conditioner: 25, deep_conditioner_mask: 30, leave_in_conditioner: 35, hair_oil_serum: 5, styling_product: 40 },
      molecular_weight_da: null, ionic_charge: 'nonionic', penetration_depth: 'surface',
    });
  }

  // ── Parabens ─────────────────────────────────────────────────────────────
  if (/paraben/.test(n)) {
    const isLongChain = /butyl|isobutyl|propyl|isopropyl/.test(n);
    return makeEntry(name, {
      category: 'Preservative',
      sub_category: 'Paraben Preservative',
      tags: ['preservative', 'paraben', isLongChain ? 'long-chain-paraben' : 'short-chain-paraben', 'sensitizer-risk'],
      notes: `Paraben preservative. ${isLongChain ? 'Long-chain parabens (butyl/propyl) have greater endocrine disruption concern.' : 'Short-chain parabens (methyl/ethyl) considered lower risk.'}`,
      needs_review: isLongChain,
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: isLongChain ? 'low' : 'moderate', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: isLongChain ? 'moderate' : 'low', allergen_risk: isLongChain ? 'moderate' : 'low', irritant_class: 'none', avoid_for_profiles: isLongChain ? ['sensitive-scalp', 'allergy-prone'] : [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 0.4, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 5 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Biocide Preservatives (MIT, CMIT, IPBC, PHMB, etc.) ─────────────────
  if (/^(mit|cmit|ipbc|phmb|methylisothiazolinone|chloromethylisothiazolinone|iodopropynyl butylcarbamate|polyhexamethylene biguanide|chlorhexidine|triclocarban|hexamidine|benzethonium chloride|benzalkonium chloride|silver citrate|colloidal silver|glutaral|dichlorobenzyl alcohol)$/.test(n)) {
    return makeEntry(name, {
      category: 'Preservative',
      sub_category: 'Biocide Preservative',
      tags: ['preservative', 'biocide', 'sensitizer-risk', 'allergen-risk'],
      notes: 'Biocide preservative. High sensitization potential; restricted/banned in leave-on products in EU.',
      needs_review: true,
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'high', allergen_risk: 'high', irritant_class: 'moderate', avoid_for_profiles: ['sensitive-scalp', 'allergy-prone', 'eczema'] },
      concentration_context: { typical_use_pct_min: 0.0001, typical_use_pct_max: 0.1, activity_threshold_pct: 0.0001, position_sensitivity: 'low' },
      product_roles: { shampoo: 3, co_wash: 3, rinse_out_conditioner: 3, deep_conditioner_mask: 3, leave_in_conditioner: 1, hair_oil_serum: 1, styling_product: 3 },
      molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'surface',
    });
  }

  // ── Sodium Dehydroacetate / Etidronic Acid / Other Preservatives ─────────
  if (/dehydroacetate|etidronic acid|tetrasodium etidronate|undecylenoyl glycine|capryloyl glycine|capryloyl salicylic acid|undeceth|propionic acid|propyl gallate|sodium metabisulfite|sodium sulfite|erythorbic acid|sodium erythorbate/.test(n)) {
    return makeEntry(name, {
      category: 'Preservative',
      sub_category: 'Multifunctional Preservative',
      tags: ['preservative', 'chelator', 'low-sensitizer'],
      notes: 'Multifunctional preservative or preservative booster. Generally well-tolerated.',
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 1, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 5 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── pH Adjusters ─────────────────────────────────────────────────────────
  if (/^(sodium hydroxide|potassium hydroxide|triethanolamine|aminomethyl propanol|tromethamine|citric acid|lactic acid|malic acid|tartaric acid|glycolic acid|sodium bicarbonate|sodium carbonate|potassium phosphate|disodium phosphate|trisodium phosphate|dipotassium phosphate|diammonium phosphate|dicalcium phosphate|diisopropanolamine|aminomethyl propanol)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'pH Adjuster',
      tags: ['ph-adjuster', 'functional', 'low-buildup'],
      notes: 'pH adjusting agent. Used to optimize formulation pH for stability and efficacy.',
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'none' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 2, activity_threshold_pct: 0, position_sensitivity: 'low' },
      product_roles: { shampoo: 3, co_wash: 3, rinse_out_conditioner: 3, deep_conditioner_mask: 3, leave_in_conditioner: 3, hair_oil_serum: 3, styling_product: 3 },
      molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'surface',
    });
  }

  // ── AHA / BHA Acids ──────────────────────────────────────────────────────
  if (/^(glycolic acid|malic acid|tartaric acid|lactic acid|mandelic acid|citric acid|salicylic acid|capryloyl salicylic acid|lactobionic acid|gluconic acid|gluconolactone|tranexamic acid|kojic acid)$/.test(n)) {
    const isAHA = /(glycolic|malic|tartaric|lactic|mandelic|citric|lactobionic|gluconic|gluconolactone)/.test(n);
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: isAHA ? 'Alpha Hydroxy Acid' : 'Beta Hydroxy Acid',
      tags: ['exfoliant', isAHA ? 'aha' : 'bha', 'scalp-active', 'ph-adjuster'],
      notes: `${isAHA ? 'Alpha' : 'Beta'} hydroxy acid. Exfoliates scalp, improves texture, adjusts pH.`,
      profile_compatibility: {
        porosity_low: 0.4, porosity_med: 0.3, porosity_high: 0.2,
        density_fine: 0.3, density_med: 0.3, density_coarse: 0.3,
        condition_damaged: 0.1, condition_normal: 0.3, condition_healthy: 0.4,
        oiliness_dry: 0, oiliness_normal: 0.3, oiliness_oily: 0.5,
        curl_straight: 0.3, curl_wavy: 0.3, curl_curly: 0.2, curl_coily: 0.2,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: -0.1, color_treated: -0.1,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.3, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), scalp_active: { active: true, activity_type: 'exfoliant', strength: 'moderate', evidence_level: 'established' } },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'none', irritant_class: 'mild', avoid_for_profiles: ['sensitive-scalp'] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 10, activity_threshold_pct: 0.5, position_sensitivity: 'high' },
      product_roles: { shampoo: 35, co_wash: 15, rinse_out_conditioner: 20, deep_conditioner_mask: 25, leave_in_conditioner: 10, hair_oil_serum: 5, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── Penetrating Oils ─────────────────────────────────────────────────────
  const penetratingOils = ['cocos nucifera oil','coconut oil','persea gratissima oil','avocado oil','olea europaea fruit oil','olive oil','prunus amygdalus dulcis oil','sweet almond oil','helianthus annuus seed oil','sunflower oil','simmondsia chinensis seed oil','jojoba oil','argania spinosa kernel oil','argan oil','ricinus communis seed oil','castor oil','sesamum indicum seed oil','sesame oil','linum usitatissimum seed oil','flaxseed oil','cannabis sativa seed oil','hemp seed oil','glycine soja oil','soybean oil','zea mays oil','corn oil','oryza sativa bran oil','rice bran oil','triticum vulgare germ oil','wheat germ oil','brassica campestris seed oil','canola oil','brassica campestris oil','camelina sativa seed oil','camelina sativa oil','gossypium herbaceum seed oil','cottonseed oil','bertholletia excelsa seed oil','brazil nut oil','bertholletia excelsa nut oil','corylus avellana seed oil','hazelnut oil','oenothera biennis oil','evening primrose oil','borago officinalis oil','borage oil','elaeis guineensis oil','palm oil','camellia oleifera seed oil','camellia japonica seed oil','camellia kissi seed oil','lupinus albus seed oil','amaranthus spinosus seed oil','juglans regia seed oil','papaver somniferum seed oil','passiflora edulis seed oil','pistacia vera seed oil','ribes nigrum seed oil','solanum lycopersicum seed oil','brassica abyssinica seed oil','silybum marianum seed oil','pentaclethra macroloba seed oil','mauritia fleuosa fruit oil','caryocar brasiliense fruit oil','euterpe oleracea fruit oil','cynara cardunculus seed oil','echinops sphaerocephalus seed oil','mortierella alpina oil'];
  if (penetratingOils.includes(n) || (/(seed oil|kernel oil|nut oil|fruit oil|bran oil|germ oil)$/.test(n) && !/hydro|wax|butter/.test(n))) {
    return makeEntry(name, {
      category: 'Oil',
      sub_category: 'Penetrating Oil',
      tags: ['oil', 'penetrating-oil', 'emollient', 'conditioning', 'natural'],
      notes: 'Plant-derived penetrating oil. Rich in fatty acids; penetrates hair shaft to reduce protein loss.',
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.5, porosity_high: 0.7,
        density_fine: 0.2, density_med: 0.5, density_coarse: 0.6,
        condition_damaged: 0.7, condition_normal: 0.4, condition_healthy: 0.2,
        oiliness_dry: 0.7, oiliness_normal: 0.4, oiliness_oily: 0,
        curl_straight: 0.3, curl_wavy: 0.4, curl_curly: 0.6, curl_coily: 0.7,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.6, color_treated: 0.5,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.3, humectant_capacity: 0, emolliency: 0.8, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'low', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 30, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 10, co_wash: 30, rinse_out_conditioner: 40, deep_conditioner_mask: 60, leave_in_conditioner: 55, hair_oil_serum: 80, styling_product: 30 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'cortical',
    });
  }

  // ── Butters ───────────────────────────────────────────────────────────────
  if (/(butter|cera|wax)$/.test(n) && /(butyrospermum|theobroma|mangifera|shorea|garcinia|irvingia|kokum|astrocaryum|platonia|bassia|madhuca|virola|myristica|trichilia|helianthus annuus seed butter|gossypium herbaceum butter|cocos nucifera butter|hydrogenated shea|hydrogenated sweet almond|hydrogenated wheat germ|hydrogenated pistachio|hydrogenated rice bran|hydrogenated palm|hydrogenated cottonseed|hydrogenated castor|murumuru|cupuacu|babassu|mango butter|cocoa butter)/.test(n)) {
    return makeEntry(name, {
      category: 'Oil',
      sub_category: 'Butter',
      tags: ['butter', 'emollient', 'occlusive', 'conditioning', 'natural'],
      notes: 'Plant-derived butter. Rich in saturated fatty acids; provides deep conditioning and occlusive moisture sealing.',
      profile_compatibility: {
        porosity_low: -0.1, porosity_med: 0.4, porosity_high: 0.8,
        density_fine: -0.1, density_med: 0.4, density_coarse: 0.7,
        condition_damaged: 0.8, condition_normal: 0.4, condition_healthy: 0.1,
        oiliness_dry: 0.8, oiliness_normal: 0.3, oiliness_oily: -0.2,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.6, curl_coily: 0.8,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.6, color_treated: 0.5,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.5, humectant_capacity: 0, emolliency: 0.9, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'low', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 20, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 5, co_wash: 25, rinse_out_conditioner: 35, deep_conditioner_mask: 65, leave_in_conditioner: 50, hair_oil_serum: 60, styling_product: 25 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Waxes ─────────────────────────────────────────────────────────────────
  if (/(wax|cera)$/.test(n) || /^(euphorbia cerifera|copernicia cerifera|oryza sativa bran wax|rice bran wax|helianthus annuus seed wax|sunflower wax|rhus verniciflua peel wax|berry wax|bayberry wax|acacia decurrens flower wax|mimosa wax|candelilla|carnauba|montan wax|fischer-tropsch wax|lanolin wax|hydrogenated lanolin|cera microcristallina|petroleum jelly|white petrolatum|yellow petrolatum|polyethylene|polybutene|hydrogenated polydecene|liquid paraffin|white mineral oil)/.test(n)) {
    return makeEntry(name, {
      category: 'Wax',
      sub_category: 'Plant/Synthetic Wax',
      tags: ['wax', 'film-former', 'occlusive', 'emollient'],
      notes: 'Wax used as emollient, film former, and texture modifier.',
      profile_compatibility: {
        porosity_low: -0.1, porosity_med: 0.3, porosity_high: 0.6,
        density_fine: -0.1, density_med: 0.3, density_coarse: 0.5,
        condition_damaged: 0.5, condition_normal: 0.3, condition_healthy: 0.1,
        oiliness_dry: 0.5, oiliness_normal: 0.2, oiliness_oily: -0.2,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.5, curl_coily: 0.6,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.6, humectant_capacity: 0, emolliency: 0.7, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 15, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 2, co_wash: 10, rinse_out_conditioner: 15, deep_conditioner_mask: 20, leave_in_conditioner: 25, hair_oil_serum: 40, styling_product: 50 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Mineral Oils / Petrolatum ─────────────────────────────────────────────
  if (/^(liquid paraffin|white mineral oil|petroleum jelly|white petrolatum|yellow petrolatum|petrolatum|mineral oil|paraffinum liquidum)$/.test(n)) {
    return makeEntry(name, {
      category: 'Oil',
      sub_category: 'Mineral Oil',
      tags: ['mineral-oil', 'occlusive', 'emollient', 'non-penetrating'],
      notes: 'Mineral oil/petrolatum. Highly occlusive; seals moisture but does not penetrate hair shaft.',
      profile_compatibility: {
        porosity_low: -0.2, porosity_med: 0.3, porosity_high: 0.6,
        density_fine: -0.2, density_med: 0.3, density_coarse: 0.5,
        condition_damaged: 0.5, condition_normal: 0.2, condition_healthy: 0,
        oiliness_dry: 0.6, oiliness_normal: 0.2, oiliness_oily: -0.3,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.4, curl_coily: 0.5,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.5, humectant_capacity: 0, emolliency: 0.8, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: ['fine-hair', 'low-porosity'] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 20, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 2, co_wash: 15, rinse_out_conditioner: 20, deep_conditioner_mask: 30, leave_in_conditioner: 30, hair_oil_serum: 60, styling_product: 25 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Essential Oils / Volatile Plant Oils ─────────────────────────────────
  if (/(peel oil|leaf oil|flower oil|bark oil|root oil|seed oil|herb oil|fruit oil|wood oil|resin|absolute|balsam oil|needle oil|stem oil|nut\/stem oil|leaf\/nut\/stem oil|leaf\/stem oil|flower\/leaf oil)$/.test(n) ||
      /^(melaleuca alternifolia leaf oil|rosmarinus officinalis leaf oil|lavandula angustifolia oil|mentha piperita oil|citrus aurantium dulcis.*peel oil|citrus reticulata.*peel oil|citrus bergamia peel oil|citrus paradisi peel oil|citrus limon peel oil|citrus aurantifolia oil|eucalyptus globulus leaf oil|melaleuca quinquenervia oil|cymbopogon|thymus vulgaris|origanum vulgare|ocimum basilicum|salvia sclarea|santalum album|cedrus atlantica|juniperus virginiana|pinus sylvestris|abies sibirica|cupressus sempervirens|pogostemon cablin|vetiveria zizanoides|zingiber officinale root oil|cinnamomum zeylanicum bark oil|eugenia caryophyllus leaf oil|pimpinella anisum|foeniculum vulgare|apium graveolens seed oil|carum carvi|anethum graveolens|elettaria cardamomum|piper nigrum fruit oil|schinus molle|boswellia carterii|commiphora myrrha|helichrysum italicum flower oil|achillea millefolium|anthemis nobilis|matricaria chamomilla|tanacetum annuum|cananga odorata flower oil|pelargonium graveolens|michelia alba flower oil)/.test(n) ||
      /^(ylang ylang oil|geranium oil|bergamot oil|grapefruit oil|eucalyptus oil|lemongrass oil|thyme oil|oregano oil|basil oil|clary sage oil|sandalwood oil|cedarwood oil|pine oil|patchouli oil|ginger oil|cinnamon oil|clove oil|frankincense oil|myrrh oil|chamomile blue oil|chamomile roman oil|cinnamon bark oil|cinnamon leaf oil|citronella oil|clove bud oil|coriander seed oil|cumin seed oil|cypress oil|dill seed oil|eucalyptus globulus oil|eucalyptus citriodora oil|fennel sweet oil|helichrysum oil|hyssop oil|jasmine absolute|juniper berry oil|lemon oil|lime oil|mandarin oil|marjoram sweet oil|melissa oil|neroli oil|nutmeg oil|orange sweet oil|orange bitter oil|palmarosa oil|petitgrain oil|pine needle oil|rose absolute|rose otto|rosewood oil|spearmint oil|spikenard oil|spruce oil|tagetes oil|tangerine oil|valerian oil|vetiver oil|wintergreen oil|wormwood oil|yarrow oil|artemisia annua oil|inula helenium oil|lovage oil|parsley seed oil|tarragon oil|ajowan oil|buchu oil|calamus oil|cananga oil|carrot seed oil|celery seed oil|costus root oil|galbanum oil|guaiacwood oil|gurjun balsam oil|ho wood oil|labdanum oil|litsea cubeba oil|manuka oil|niaouli oil|oakmoss absolute|olibanum oil|orris root oil|peru balsam oil|ravensara oil|savory oil|tolu balsam oil|turmeric oil|amyris oil|copaiba balsam oil|elemi oil|garlic oil|onion oil|asafoetida oil|bitter almond oil|birch tar oil|cade oil|camphor oil|pine tar oil|peppermint oil|rosemary oil|lavender oil|tea tree oil)$/.test(n)) {
    const isSensitizer = /(cinnamon|clove|oregano|thyme|garlic|onion|camphor|birch tar|cade|pine tar|bitter almond|asafoetida|calamus|costus|peru balsam|tolu balsam|oakmoss|treemoss|myroxylon)/.test(n);
    return makeEntry(name, {
      category: 'Botanical',
      sub_category: 'Essential Oil',
      tags: ['essential-oil', 'fragrance', 'botanical', 'scalp-active', isSensitizer ? 'sensitizer-risk' : 'allergen-risk'],
      notes: `Essential oil / volatile plant oil. Provides fragrance and potential scalp benefits. ${isSensitizer ? 'High sensitization potential.' : 'Contains EU-listed fragrance allergens.'}`,
      profile_compatibility: {
        porosity_low: 0.1, porosity_med: 0.2, porosity_high: 0.2,
        density_fine: 0.1, density_med: 0.2, density_coarse: 0.2,
        condition_damaged: 0.1, condition_normal: 0.2, condition_healthy: 0.2,
        oiliness_dry: 0.1, oiliness_normal: 0.2, oiliness_oily: 0.2,
        curl_straight: 0.1, curl_wavy: 0.2, curl_curly: 0.2, curl_coily: 0.2,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0, color_treated: 0,
      },
      physicochemical: { water_solubility: 'low', volatility: 'high', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0.2, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), fragrance: true, scalp_active: { active: true, activity_type: 'antimicrobial', strength: 'mild', evidence_level: 'limited' } },
      sensitivity_profile: { sensitizer_risk: isSensitizer ? 'high' : 'moderate', allergen_risk: 'high', irritant_class: isSensitizer ? 'moderate' : 'mild', avoid_for_profiles: ['sensitive-scalp', 'allergy-prone'] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 2, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 15, co_wash: 15, rinse_out_conditioner: 15, deep_conditioner_mask: 15, leave_in_conditioner: 10, hair_oil_serum: 20, styling_product: 15 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Hydrolyzed Proteins ───────────────────────────────────────────────────
  if (/hydrolyzed/.test(n)) {
    const isLowMW = /(wheat|silk|keratin|collagen|elastin|soy|rice|oat|corn|pea|quinoa|jojoba|malt|actin|fibronectin|casein|serum|hemoglobin|royal jelly|honey|propolis|roe|dna|rna|glycosaminoglycans|fish|gadidae|brazil nut|sweet almond|cannabis|chenopodium)/.test(n);
    const proteinClass = isLowMW ? 'low' : 'medium';
    return makeEntry(name, {
      category: 'Protein',
      sub_category: 'Hydrolyzed Protein',
      tags: ['protein', 'hydrolyzed-protein', `${proteinClass}-mw-protein`, 'bond-repair', 'conditioning'],
      notes: `Hydrolyzed protein. Low-to-medium MW peptides penetrate hair shaft to strengthen and repair.`,
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.4, porosity_high: 0.7,
        density_fine: 0.3, density_med: 0.4, density_coarse: 0.4,
        condition_damaged: 0.8, condition_normal: 0.4, condition_healthy: 0.1,
        oiliness_dry: 0.4, oiliness_normal: 0.3, oiliness_oily: 0.1,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.4, curl_coily: 0.5,
        protein_sensitive: -0.5, silicone_sensitive: 0, chemically_treated: 0.7, color_treated: 0.6,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0.3, humectant_capacity: 0.4, emolliency: 0.2, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals(), bond_repair: { active: true, mechanism: 'protein_filling', strength: 'moderate' }, protein_weight_class: proteinClass },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'low', irritant_class: 'none', avoid_for_profiles: ['protein-sensitive'] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 5, activity_threshold_pct: 0.1, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 20, co_wash: 35, rinse_out_conditioner: 55, deep_conditioner_mask: 75, leave_in_conditioner: 65, hair_oil_serum: 10, styling_product: 25 },
      molecular_weight_da: null, ionic_charge: 'amphoteric', penetration_depth: 'cortical',
    });
  }

  // ── Intact Proteins (Collagen, Elastin, Milk Protein, etc.) ──────────────
  if (/^(collagen|soluble collagen|elastin|milk protein|lactis proteinum|whey protein|casein|silk protein|vegetable protein|pea protein|rice protein|soy protein|oat protein|keratin powder|collagen powder|elastin powder|spider silk protein|atelocollagen|sericine)$/.test(n)) {
    return makeEntry(name, {
      category: 'Protein',
      sub_category: 'Intact Protein',
      tags: ['protein', 'high-mw-protein', 'film-former', 'conditioning'],
      notes: 'Intact high-MW protein. Too large to penetrate hair shaft; forms protective film on surface.',
      profile_compatibility: {
        porosity_low: 0.1, porosity_med: 0.3, porosity_high: 0.5,
        density_fine: 0.2, density_med: 0.3, density_coarse: 0.4,
        condition_damaged: 0.6, condition_normal: 0.3, condition_healthy: 0.1,
        oiliness_dry: 0.4, oiliness_normal: 0.3, oiliness_oily: 0.1,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.4, curl_coily: 0.4,
        protein_sensitive: -0.3, silicone_sensitive: 0, chemically_treated: 0.5, color_treated: 0.4,
      },
      physicochemical: { water_solubility: 'moderate', volatility: 'non-volatile', film_forming_strength: 0.5, humectant_capacity: 0.3, emolliency: 0.2, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals(), protein_weight_class: 'high' },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'low', irritant_class: 'none', avoid_for_profiles: ['protein-sensitive'] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 5, activity_threshold_pct: 0.1, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 15, co_wash: 30, rinse_out_conditioner: 50, deep_conditioner_mask: 70, leave_in_conditioner: 55, hair_oil_serum: 5, styling_product: 20 },
      molecular_weight_da: null, ionic_charge: 'amphoteric', penetration_depth: 'surface',
    });
  }

  // ── Vitamins / Antioxidants ───────────────────────────────────────────────
  if (/^(retinol|retinyl acetate|retinyl propionate|retinal|retinoic acid|beta-carotene|lycopene|lutein|zeaxanthin|astaxanthin|ubiquinone|coenzyme q10|idebenone|resveratrol|ferulic acid|ellagic acid|gallic acid|caffeic acid|chlorogenic acid|rosmarinic acid|ursolic acid|oleanolic acid|asiatic acid|madecassic acid|glycyrrhizic acid|dipotassium glycyrrhizate|enoxolone|salicin|esculin|escin|rutin|quercetin|hesperidin|naringin|diosmin|daidzein|genistein|genistin|glycitin|biochanin a|formononetin|epigallocatechin gallate|egcg|epicatechin|catechin|proanthocyanidins|opc|anthocyanins|curcumin|tetrahydrocurcumin|gingerol|shogaol|capsaicin|niacin|vitamin b12|pyridoxine|vitamin b2|thiamine|vitamin b1|pantothenic acid|calcium pantothenate|sodium pantothenate|sodium ascorbate|ascorbyl glucoside|ascorbyl palmitate|ethyl ascorbic acid|tocopheryl nicotinate|tocopheryl linoleate|tocopheryl succinate|vitamin e acetate|tocotrienol|ergocalciferol|vitamin b6|vitamin c|vitamin a|vitamin b3|vitamin h|provitamin b5|panthenyl triacetate|pantethine|pantolactone|niacinamide|nicotinamide|biotin|ascorbyl methylsilanol pectinate|tetrahexyldecyl ascorbate|sodium ascorbyl phosphate|magnesium ascorbyl phosphate|oryzanol|ginsenosides|apigenin|hinokitiol|guaiazulene|chamazulene|troxerutin|hesperidin methyl chalcone|decarboxy carnosine hcl|tranexamic acid|kojic acid|arbutin|alpha-arbutin)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'Vitamin/Antioxidant',
      tags: ['vitamin', 'antioxidant', 'scalp-active', 'functional', 'bond-repair'],
      notes: 'Vitamin or antioxidant active. Supports scalp health, hair growth, and oxidative stress protection.',
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.3, porosity_high: 0.4,
        density_fine: 0.3, density_med: 0.3, density_coarse: 0.3,
        condition_damaged: 0.5, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.3, oiliness_normal: 0.3, oiliness_oily: 0.2,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.3, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.4,
      },
      physicochemical: { water_solubility: 'variable', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.2, emolliency: 0.1, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), scalp_active: { active: true, activity_type: 'antioxidant', strength: 'moderate', evidence_level: 'established' } },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 5, activity_threshold_pct: 0.01, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 20, co_wash: 25, rinse_out_conditioner: 35, deep_conditioner_mask: 50, leave_in_conditioner: 55, hair_oil_serum: 40, styling_product: 20 },
      molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'cortical',
    });
  }

  // ── Scalp Actives (Minoxidil-adjacent, DHT blockers, growth factors) ──────
  if (/^(saw palmetto|panax ginseng root extract|ginseng|caffeine|adenosine|adenosine triphosphate|capsicum annuum fruit extract|capsicum frutescens fruit extract|capsaicin|menthyl nicotinate|menthyl lactate|menthyl pca|niacinamide|nicotinamide|zinc pyrithione|selenium sulfide|ketoconazole|piroctone olamine|climbazole|salicylic acid|coal tar|sulfur|resorcinol|zinc oxide|copper pca|magnesium pca|manganese pca|biotin|saw palmetto extract|pumpkin seed oil|beta-sitosterol|procyanidin b2|oligopeptide-1|oligopeptide-2|superoxide dismutase|glucose oxidase|lactobacillus ferment|galactomyces ferment filtrate|saccharomyces ferment lysate filtrate|saccharomyces\/magnesium ferment|saccharomyces\/iron ferment|saccharomyces\/copper ferment|saccharomyces\/silicon ferment|saccharomyces\/zinc ferment|saccharomyces cerevisiae extract|yeast extract|faex extract|plankton extract|algae extract|dunaliella salina extract|haematococcus pluvialis extract|spirulina maxima extract|spirulina|chlorella|spirulina powder|chlorella powder)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'Scalp Active',
      tags: ['scalp-active', 'functional', 'hair-growth', 'oily-scalp-friendly'],
      notes: 'Scalp-active ingredient. Supports scalp health, circulation, or hair growth pathways.',
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.3, porosity_high: 0.3,
        density_fine: 0.3, density_med: 0.3, density_coarse: 0.2,
        condition_damaged: 0.3, condition_normal: 0.3, condition_healthy: 0.3,
        oiliness_dry: 0.2, oiliness_normal: 0.3, oiliness_oily: 0.4,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.3, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.2, color_treated: 0.2,
      },
      physicochemical: { water_solubility: 'variable', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.1, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), scalp_active: { active: true, activity_type: 'growth_support', strength: 'moderate', evidence_level: 'limited' } },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 5, activity_threshold_pct: 0.1, position_sensitivity: 'high' },
      product_roles: { shampoo: 35, co_wash: 20, rinse_out_conditioner: 25, deep_conditioner_mask: 30, leave_in_conditioner: 40, hair_oil_serum: 45, styling_product: 15 },
      molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'surface',
    });
  }

  // ── Humectants (Glycols, Sugars, Polyols) ─────────────────────────────────
  if (/^(glycerol|glycerin|propylene glycol|butylene glycol|pentylene glycol|hexylene glycol|caprylyl glycol|dipropylene glycol|tripropylene glycol|diethylene glycol|triethylene glycol|ethoxydiglycol|methoxydiglycol|butoxydiglycol|sorbitol|xylitol|mannitol|erythritol|inositol|lactose|galactose|maltitol|isomalt|honey|royal jelly|propolis extract|pollen extract|aloe vera|aloe vera gel|aloe vera inner leaf juice|aloe vera whole leaf extract|aloe barbadensis leaf juice|aloe barbadensis leaf juice powder|sodium hyaluronate|hyaluronic acid|sodium pca|pca|panthenol|panthenol|sodium lactate|lactic acid|urea|glycine|betaine|trehalose|erythrulose|dihydroxyacetone|xylitylglucoside|anhydroxylitol|glucomannan|inulin|fructooligosaccharides|sodium chondroitin sulfate|glycereth-7|glycereth-26|methyl gluceth-10|methyl gluceth-20|hydroxyethyl sorbitol|hydroxypropyl cyclodextrin|2-octanediol|2-pentanediol|2-butanediol|2-decanediol|3-butanediol|3-propanediol|decylene glycol|methyl propanediol|dimethyl isosorbide|isosorbide dicaprylate|propylene carbonate)$/.test(n)) {
    const isSugar = /(honey|royal jelly|propolis|pollen|lactose|galactose|maltitol|isomalt|trehalose|xylitol|sorbitol|mannitol|erythritol|inositol|xylitylglucoside|anhydroxylitol)/.test(n);
    const isAloe = /aloe/.test(n);
    return makeEntry(name, {
      category: 'Humectant',
      sub_category: isSugar ? 'Sugar Humectant' : isAloe ? 'Botanical Humectant' : 'Polyol Humectant',
      tags: ['humectant', 'hydrating', 'low-buildup', 'fine-hair-safe', isSugar ? 'sugar-humectant' : ''],
      notes: `${isSugar ? 'Sugar-based' : isAloe ? 'Aloe-derived' : 'Polyol'} humectant. Attracts and retains moisture in hair and scalp.`,
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.4, porosity_high: 0.5,
        density_fine: 0.4, density_med: 0.4, density_coarse: 0.3,
        condition_damaged: 0.5, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.6, oiliness_normal: 0.3, oiliness_oily: 0.1,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.5, curl_coily: 0.6,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.7, emolliency: 0.1, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), humectant_type: isSugar ? 'sugar' : 'polyol' },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 20, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 15, co_wash: 30, rinse_out_conditioner: 45, deep_conditioner_mask: 60, leave_in_conditioner: 65, hair_oil_serum: 10, styling_product: 30 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── PEG Series (Humectant/Emulsifier) ─────────────────────────────────────
  if (/^peg-\d+$/.test(n) || /^polyethylene glycol$/.test(n)) {
    const num = parseInt(n.replace(/^peg-/, '').replace('polyethylene glycol', '400'), 10) || 400;
    const isHumectant = num <= 20;
    return makeEntry(name, {
      category: isHumectant ? 'Humectant' : 'Emulsifier',
      sub_category: isHumectant ? 'PEG Humectant' : 'PEG Emulsifier',
      tags: [isHumectant ? 'humectant' : 'emulsifier', 'peg', 'synthetic'],
      notes: `PEG-${num}. ${isHumectant ? 'Low MW PEG used as humectant and solvent.' : 'Higher MW PEG used as emulsifier and solubilizer.'}`,
      profile_compatibility: profileAll(0.1),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: isHumectant ? 0.4 : 0.1, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), humectant_type: isHumectant ? 'polyol' : 'none' },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 10, activity_threshold_pct: 0.5, position_sensitivity: 'low' },
      product_roles: { shampoo: 10, co_wash: 15, rinse_out_conditioner: 20, deep_conditioner_mask: 20, leave_in_conditioner: 20, hair_oil_serum: 5, styling_product: 15 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── PEG Esters / Emulsifiers ──────────────────────────────────────────────
  if (/^peg-\d+ (stearate|oleate|laurate|isostearate|cocoate|lanolin|glyceryl|sorbitan|castor|hydrogenated|beeswax|panthenyl|dimethicone)/.test(n) ||
      /^(polysorbate \d+|polysorbate-\d+|steareth-\d+|ceteth-\d+|laureth-\d+|trideceth-\d+|undeceth-\d+|c12-\d+ pareth-\d+|c11-\d+ pareth-\d+|c12-16 pareth-\d+|ppg-\d+ cetyl ether|ppg-\d+ stearyl ether|ppg-\d+ oleyl ether|ppg-\d+ myristyl ether|ppg-\d+ lanolin|ppg-\d+ cocamide|ppg-\d+ benzyl ether|ppg-\d+-peg-\d+|peg-80 sorbitan laurate|peg-80 glyceryl cocoate|peg-120 methyl glucose trioleate|peg-150 pentaerythrityl tetrastearate|peg-150 stearate|peg-200 hydrogenated glyceryl palmate|peg-5 glyceryl|peg-10 glyceryl|peg-15 glyceryl|peg-60 glyceryl|peg-100 stearate|glycol stearate|glycol distearate|peg-5 lanolin|peg-10 lanolin|peg-20 lanolin|peg-30 lanolin|peg-40 lanolin|peg-50 lanolin|peg-60 lanolin|peg-75 lanolin|peg-100 lanolin|peg-150 lanolin|laneth-\d+|acetylated lanolin|peg-2 hydroxyethyl cocamide|ppg-1-peg-9 lauryl glycol ether|ppg-2 cocamide|ppg-5-ceteth-20|ppg-26-buteth-26|ppg-20 methyl glucose ether|ppg-20 lanolin alcohol ether|ppg-30 cetyl ether|ppg-50 cetyl ether|ppg-50 oleyl ether|ppg-5 lanolin alcohol ether|ppg-10 lanolin alcohol ether|ppg-30 lanolin alcohol ether|poloxamer \d+|coceth-\d+|buteth-\d+)$/.test(n)) {
    return makeEntry(name, {
      category: 'Emulsifier',
      sub_category: 'PEG/PPG Emulsifier',
      tags: ['emulsifier', 'surfactant', 'solubilizer', 'peg'],
      notes: 'PEG/PPG-based emulsifier or solubilizer. Helps blend oil and water phases.',
      profile_compatibility: profileAll(0.1),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.1, emolliency: 0.1, cleansing_strength: 0.1, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 10, activity_threshold_pct: 0.1, position_sensitivity: 'low' },
      product_roles: { shampoo: 10, co_wash: 15, rinse_out_conditioner: 20, deep_conditioner_mask: 20, leave_in_conditioner: 20, hair_oil_serum: 15, styling_product: 15 },
      molecular_weight_da: null, ionic_charge: 'nonionic', penetration_depth: 'surface',
    });
  }

  // ── Esters / Emollients (synthetic) ──────────────────────────────────────
  if (/(stearate|oleate|laurate|myristate|palmitate|behenate|isostearate|caprate|caprylate|caprylic|capric|adipate|sebacate|maleate|fumarate|succinate|citrate|lactate|benzoate|salicylate|cinnamate|ricinoleate|hydroxystearate|neopentanoate|isononanoate|pelargonate|trimellitate|malate|erucate|glycyrrhetinate|propionate|heptanoate|acetate|octyldodecyl|hexyldecyl|isocetyl|isotridecyl|tridecyl|isodecyl|isonyl|ethylhexyl|hexyl laurate|hexyl isostearate|hexyl decanol|cetyl|stearyl|myristyl|behenyl|lanolate|isopropyl lanolate|myristyl lanolate|cetyl lanolate|stearyl lanolate|lanolin acid|lanolin oil|lanolin cera|lanolin wax|hydrogenated lanolin|hydroxylated lanolin|isopropyl isostearate|di-isostearyl malate|di-isopropyl adipate|di-isopropyl sebacate|di-octyl sebacate|diisostearyl adipate|diisocetyl adipate|diisodecyl adipate|diisooctyl succinate|dicaprylyl maleate|diethylhexyl adipate|diethylhexyl carbonate|diethylhexyl sebacate|diethylhexyl succinate|dioctyl adipate|dioctyl carbonate|dioctyl maleate|dioctyl sebacate|dicetyl adipate|dilauryl citrate|distearyl citrate|di-stearyl citrate|di-lauryl citrate|di-myristyl malate|di-stearyl dimonium chloride|di-heptaerythrityl|di-pentaerythrityl|dipentaerythrityl|pentaerythrityl|trimethyl pentanyl diisobutyrate|sucrose acetate isobutyrate|acetyl tributyl citrate|triethyl citrate|triacetin|tricaprylin|trihydroxystearin|tridecyl trimellitate|tridecyl stearate|tridecyl neopentanoate|tridecyl isononanoate|tridecyl salicylate|isononyl isononanoate|isodecyl salicylate|isotridecyl isononanoate|isotridecyl stearate|isotridecyl myristate|ethylhexyl pelargonate|ethylhexyl hydroxystearate|ethylhexyl benzoate|c12-15 alkyl ethylhexanoate|c12-15 alkyl lactate|isocetyl stearate|isocetyl stearoyl stearate|isocetyl palmitate|isostearyl lactate|isostearyl benzyl ether|isostearyl glyceryl ether|isostearyl diglyceryl succinate|octyldodecyl myristate|octyldodecyl stearate|octyldodecyl stearoyl stearate|octyldodecyl neopentanoate|octyldodecyl octyldodecanoate|octyldodecyl ricinoleate|octyldodecyl lanolate|octyldodecyl oleate|octyldodecyl benzoate|octyldodecyl lactate|octyldodecyl hydroxystearate|octyldodecanol pca|cetyl lactate|cetyl ricinoleate|cetyl acetate|stearyl heptanoate|stearyl lactate|stearyl glycyrrhetinate|myristyl lactate|myristyl propionate|behenyl isostearate|behenyl behenate|behenyl erucate|di-c12-13 alkyl malate|c10-18 triglycerides|caprylic\/capric triglyceride|squalene|batyl alcohol|isostearyl alcohol|octyldodecanol|di-isostearyl fumarate|diisostearyl fumarate|diisostearyl dimer dilinoleate|dilinoleic acid|dilinoleic acid\/ethylenediamine copolymer|dipalmitoyl hydroxyproline|dimethyl sulfone|myristyl cetyl lactate|polyglyceryl-3 diisostearate|polyglyceryl-2 diisostearate|polyglyceryl-3 polyricinoleate|polyglyceryl-6 polyricinoleate|polyglyceryl-10 polyricinoleate|polyglyceryl-2 triisostearate|polyglyceryl-3 triisostearate|polyglyceryl-10 triisostearate|polyglyceryl-4 caprate|sorbitan oleate|sorbitan stearate|sorbitan sesquioleate|sorbitan trioleate|sorbitan tristearate|diisostearyl malate|di-isostearyl malate|di-isopropyl dimer dilinoleate|di-isostearyl dimer dilinoleate|di-octyldodecyl dimer dilinoleate|di-octyldodecyl lauroyl glutamate|di-octyldodecyl stearoyl glutamate|dioctyldodecyl dimer dilinoleate|dioctyldodecyl stearyl citrate|octyldodecyl stearoyl glutamate|oleyl erucate|lauroyl lysine|lauryl lactate|benzyl laurate|olive oil peg-7 esters|glyceryl rosinate|castor oil benzoate|dextrin palmitate|inulin lauryl carbamate|sucrose polystearate|acetylated glyceryl stearate|diglyceryl stearate|dihydroabietyl alcohol|dihydrocholesterol|dihydroxyisopropyl capryloyl caprylamide|hydrogenated coco-glycerides|hydrogenated palm glycerides|coco-caprylate\/caprate|c10-30 cholesterol\/lanosterol esters|c20-40 alcohols|isoeicosane|eicosene|dodecane|dodecene|decane|hexadecane|c30-45 olefin|polydecene|hydrogenated polydecene|hydrogenated c6-14 olefin polymers|pristane|propylene glycol dicaprylate\/dicaprate|propylene glycol dibenzoate|propylene glycol dimethyl ether|propylene glycol salicylate|di-ppg-2 myreth-10 adipate|di-ppg-3 myristyl ether adipate|dibutyl lauroyl glutamide|dibutyl sebacate|diethyl phthalate|diethyl sebacate|dimethyl phthalate|dipropylene glycol dibenzoate|dipropylene glycol dimethyl ether|dipropylene glycol salicylate|diisobutyl adipate|diisocetyl dodecanedioate|diisocetyl linoleoyl stearate|diisocetyl stearate|diisopropyl methyl cinnamate|diisopropyl dimer dilinoleate|dilauryl thiodipropionate|dioctyl carbonate|dioctyl maleate|dioctyl sebacate|dioctyldodecyl stearyl citrate|di-trimethylolpropane tetraisostearate|pentaerythritol tetraisostearate|pentaerythritol tetraethylhexanoate|adipic acid\/neopentyl glycol\/trimellitic anhydride copolymer|hydrogenated castor oil isostearate|hydrogenated castor oil lauryl esters|hydrogenated castor oil stearyl esters|polyglyceryl-3 betainate acetate|polyglyceryl-3 methylglucose distearate|lauryl\/myristyl polyricinoleate|di-heptaerythrityl hexacaprylate\/hexacaprate|di-heptaerythrityl hexahydroxystearate|di-heptaerythrityl hexahydroxystearate\/hexastearate\/hexarosinate|di-isostearyl malate|di-pentaerythrityl hexacaprylate\/hexacaprate|di-pentaerythrityl hexahydroxystearate|di-pentaerythrityl hexahydroxystearate\/hexastearate\/hexarosinate|dipentaerythrityl hexacaprylate\/hexacaprate|dipentaerythrityl hexahydroxystearate|dipentaerythrityl hexahydroxystearate\/hexastearate\/hexarosinate|dipentaerythrityl pentaisostearate|dipentaerythrityl tetrahydroxystearate\/tetraisostearate|tetradibutyl pentaerythrityl hydroxyhydrocinnamate|pentaerythrityl tetra-di-t-butyl hydroxyhydrocinnamate|bis-diglyceryl polyacyladipate-2|peg-8 beeswax|myristyl cetyl lactate|tridecyl trimellitate|pentaerythritol tetraisostearate|pentaerythritol tetraethylhexanoate|trimethyl pentanyl diisobutyrate|sucrose acetate isobutyrate|acetyl tributyl citrate|diisopropanolamine|dihydroxyacetone|dihydroxyaluminum aminoacetate|dihydroxyethyl soyamine dioleate|dimethylaminoethyl methacrylate|dimethylaminopropylamido pca propyl dimonium chloride|dimethyldibenzylidene sorbitol|dimethylimidazolidinone rice starch|dimethylpabamidopropyl laurdimonium tosylate|dimethylsilanol hyaluronate|dimethyl mea|dimethyl oxazolidine|dimethyl paba ethyl cetearyldimonium tosylate|dimethyl sulfone|diacetyl phosphate|diacetone alcohol|diatomaceous earth|distarch phosphate|distearyl ether|distearyl phthalic acid amide|dithiodiglycolic acid|dna|dodecane|dodecene|eicosene|isoeicosane|hexadecane|decane|c13-14 isoparaffin|c30-45 olefin|polydecene|hydrogenated polydecene|hydrogenated c6-14 olefin polymers|pristane|liquid paraffin|white mineral oil|petroleum jelly|white petrolatum|yellow petrolatum|polypropylene|polybutene|montan wax|fischer-tropsch wax)/.test(n)) {
    return makeEntry(name, {
      category: 'Emollient',
      sub_category: 'Synthetic Ester/Emollient',
      tags: ['emollient', 'emulsifier', 'skin-feel', 'conditioning'],
      notes: 'Synthetic ester or emollient. Provides skin feel, spreadability, and conditioning.',
      profile_compatibility: {
        porosity_low: 0.1, porosity_med: 0.3, porosity_high: 0.5,
        density_fine: 0.2, density_med: 0.3, density_coarse: 0.4,
        condition_damaged: 0.4, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.5, oiliness_normal: 0.3, oiliness_oily: 0,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.4, curl_coily: 0.4,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.3, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.2, humectant_capacity: 0, emolliency: 0.6, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 20, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 5, co_wash: 20, rinse_out_conditioner: 30, deep_conditioner_mask: 40, leave_in_conditioner: 40, hair_oil_serum: 60, styling_product: 25 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── UV Filters / Sunscreens ───────────────────────────────────────────────
  if (/^(ethylhexyl methoxycinnamate|benzophenone-\d+|butyl methoxydibenzoylmethane|ethylhexyl salicylate|ethylhexyl triazone|diethylamino hydroxybenzoyl hexyl benzoate|bis-ethylhexyloxyphenol methoxyphenyl triazine|octocrylene|homosalate|phenylbenzimidazole sulfonic acid|avobenzone|ethylhexyl dimethyl paba|butyloctyl salicylate|methyl perfluorobutyl ether|perfluorodecalin|polysilicone-19)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'UV Filter',
      tags: ['uv-filter', 'sunscreen', 'color-protection'],
      notes: 'UV filter/sunscreen agent. Protects hair and scalp from UV-induced damage and color fading.',
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.3, porosity_high: 0.3,
        density_fine: 0.2, density_med: 0.3, density_coarse: 0.3,
        condition_damaged: 0.3, condition_normal: 0.3, condition_healthy: 0.3,
        oiliness_dry: 0.2, oiliness_normal: 0.3, oiliness_oily: 0.2,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.3, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.6,
      },
      physicochemical: { water_solubility: 'low', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0.1, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals(), color_protection: { active: true, mechanism: 'uv_absorption', strength: 'moderate' } },
      sensitivity_profile: { sensitizer_risk: 'low', allergen_risk: 'low', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 10, activity_threshold_pct: 0.1, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 15, deep_conditioner_mask: 10, leave_in_conditioner: 30, hair_oil_serum: 25, styling_product: 25 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Propellants ───────────────────────────────────────────────────────────
  if (/^(isobutane|propane|butane|dimethyl ether|hydrofluorocarbon 152a)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'Propellant',
      tags: ['propellant', 'aerosol', 'volatile'],
      notes: 'Aerosol propellant. Used in spray formulations.',
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'low', volatility: 'high', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'none' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 5, typical_use_pct_max: 50, activity_threshold_pct: 5, position_sensitivity: 'low' },
      product_roles: { shampoo: 0, co_wash: 0, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 40 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Minerals / Clays / Pigments ───────────────────────────────────────────
  if (/^(bentonite|kaolin|charcoal|charcoal powder|moroccan lava clay|volcanic ash|silica|mica|titanium dioxide|iron oxides|tin oxide|calcium aluminum borosilicate|synthetic fluorphlogopite|magnesium aluminum silicate|montmorillonite|illite|kaolinite|calcite|hectorite|stearalkonium hectorite|disteardimonium hectorite|stearalkonium bentonite|solum fullonum|solum diatomeae|diatomaceous earth|pumice|barium sulfate|bismuth oxychloride|boron nitride|chromium oxide greens|manganese violet|ultramarines|ferric ferrocyanide|pigment blue 15|quinoline yellow|caramel|carmine|hydroxyapatite|aluminum hydroxide|aluminum starch octenylsuccinate|aluminum chlorohydrate|aluminum lactate|zinc oxide|zinc carbonate|zinc chloride|zinc stearate|zinc ricinoleate|zinc sulfate|copper sulfate|iron sulfate|manganese sulfate|silver nitrate|gold|platinum|diamond powder|pearl powder|silk powder|keratin powder|collagen powder|elastin powder|milk powder|goat milk powder|yogurt powder|honey powder|royal jelly powder|propolis powder|pollen powder|wheat germ powder|oat kernel flour|rice powder|arrowroot starch|sago starch|barley flour|rye flour|buckwheat flour|amaranth flour|quinoa flour|soy flour|chickpea flour|lentil flour|pea flour|coconut flour|almond flour|walnut flour|hazelnut flour|pecan flour|pistachio flour|cashew flour|macadamia flour|pumpkin seed flour|sunflower seed flour|sesame seed flour|flaxseed flour|chia seed flour|hemp seed flour|poppy seed flour|mustard seed flour|fenugreek seed flour|cumin seed flour|coriander seed flour|fennel seed flour|caraway seed flour|anise seed flour|dill seed flour|celery seed flour|parsley seed flour|lovage seed flour|angelica seed flour|borage seed flour|evening primrose seed flour|rosehip seed flour|blackcurrant seed flour|raspberry seed flour|blackberry seed flour|strawberry seed flour|blueberry seed flour|cranberry seed flour|pomegranate seed flour|grape seed flour|apple seed flour|pear seed flour|apricot kernel flour|peach kernel flour|plum kernel flour|cherry kernel flour|mango seed flour|avocado seed flour|date seed flour|olive seed flour|coffee bean powder|cocoa bean powder|tea leaf powder|matcha powder|rooibos powder|hibiscus flower powder|rose petal powder|lavender flower powder|chamomile flower powder|calendula flower powder|arnica flower powder|jasmine flower powder|elderflower powder|linden flower powder|mallow flower powder|cornflower powder|safflower flower powder|peony flower powder|lotus flower powder|water lily flower powder|orchid flower powder|magnolia flower powder|gardenia flower powder|tiare flower powder|frangipani flower powder|honeysuckle flower powder|lilac flower powder|violet flower powder|iris root powder|orris root powder|ginger root powder|turmeric root powder|ginseng root powder|ashwagandha root powder|maca root powder|licorice root powder|marshmallow root powder|comfrey root powder|burdock root powder|dandelion root powder|valerian root powder|rhubarb root powder|beet root powder|carrot root powder|sweet potato powder|yam root powder|cassava root powder|yucca root powder|arrowroot powder|kudzu root powder|eleuthero root powder|rhodiola root powder|astragalus root powder|dong quai root powder|reishi mushroom powder|shiitake mushroom powder|maitake mushroom powder|chaga mushroom powder|cordyceps mushroom powder|lion\'s mane mushroom powder|turkey tail mushroom powder|tremella mushroom powder|poria mushroom powder|agaricus mushroom powder|bamboo shoot powder|pine needle powder|ginkgo leaf powder|gotu kola powder|bacopa powder|holy basil powder|neem leaf powder|moringa leaf powder|alfalfa leaf powder|wheatgrass powder|barley grass powder|oat grass powder|spirulina powder|chlorella powder|kelp powder|bladderwrack powder|irish moss powder|dulse powder|nori powder|wakame powder|hijiki powder|amber powder|mother of pearl powder|coral powder|shell powder|bone powder|antler powder|horn powder|hoof powder|feather powder|wool powder|cashmere powder|mohair powder|angora powder|alpaca powder|camel hair powder|horse hair powder|rabbit hair powder|mink hair powder|sable hair powder|ermine powder|chinchilla powder|fox hair powder|wolf hair powder|bear hair powder|lion hair powder|tiger hair powder|leopard hair powder|cheetah powder|elephant hair powder|rhino horn powder|hippo tooth powder|walrus tusk powder|whale bone powder|seal fur powder|penguin feather powder|ostrich feather powder|emu feather powder|peacock feather powder|swan feather powder|goose feather powder|duck feather powder|chicken feather powder|turkey feather powder|quail feather powder|pheasant feather powder|partridge feather powder|grouse feather powder|woodcock feather powder|snipe feather powder|plover feather powder|curlew feather powder|godwit feather powder|whimbrel feather powder|sandpiper feather powder|knot feather powder|dunlin feather powder|stint feather powder|sanderling feather powder|phalarope feather powder|avocet feather powder|stilt feather powder|oystercatcher feather powder|lapwing feather powder|dotterel feather powder|golden plover feather powder|grey plover feather powder|ringed plover feather powder|little ringed plover feather powder|kentish plover feather powder|killdeer feather powder|caspian plover feather powder|oriental plover feather powder|pacific golden plover feather powder|american golden plover feather powder|european golden plover feather powder|sociable lapwing feather powder|white-tailed lapwing feather powder|spur-winged lapwing feather powder|black-headed lapwing feather powder|wattled lapwing feather powder|yellow-wattled lapwing feather powder|banded lapwing feather powder|masked lapwing feather powder|red-wattled lapwing feather powder|grey-headed lapwing feather powder|northern lapwing feather powder|southern lapwing feather powder|andean lapwing feather powder|resplendent lapwing feather powder|black-shouldered lapwing feather powder|crowned lapwing feather powder|senegal lapwing feather powder|black-winged lapwing feather powder|brown-chested lapwing feather powder|spot-breasted lapwing feather powder|african wattled lapwing feather powder|javan wattled lapwing feather powder|river lapwing feather powder|black-fronted dotterel feather powder|red-kneed dotterel feather powder|shore plover feather powder|wrybill feather powder|amber extract|jet extract|shungite extract|hematite extract|malachite extract|rhodochrosite extract|smithsonite extract|turquoise extract|lapis lazuli extract|amethyst extract|citrine extract|rose quartz extract|clear quartz extract|moonstone extract|sunstone extract|labradorite extract|jade extract|nephrite extract|obsidian extract|peridot extract|garnet extract|tourmaline extract|aquamarine extract|emerald extract|ruby extract|sapphire extract|topaz extract|zircon extract|spinel extract|alexandrite extract|opal extract|sea silt extract|maris limus|dead sea salt|himalayan pink salt|epsom salt|magnesium sulfate|sodium sulfate|potassium chloride|calcium chloride|magnesium chloride|sodium bicarbonate|sodium carbonate|borax|boric acid|alum|potassium alum|ammonium alum|zinc sulfate|copper sulfate|iron sulfate|manganese sulfate|silver nitrate|sea salt|maris sal|fullerenes|nylon-12|nylon-6|nylon-66|polymethyl methacrylate|polyester-5|walnutshell powder|juglans regia shell powder|argania spinosa shell powder|chondrus crispus powder|corallina officinalis powder|lithothamnium calcareum powder|mastocarpus stellatus powder|kappaphycus alvarezii powder|palmaria palmata powder|undaria pinnatifida powder|himanthalia elongata powder|hypnea musciformis powder|fucus vesiculosus powder|trametes versicolor powder|ganoderma lucidum spore oil)$/.test(n)) {
    const isAnimalPart = /(feather powder|hair powder|bone powder|antler powder|horn powder|hoof powder|wool powder|cashmere powder|mohair powder|angora powder|alpaca powder|camel hair|horse hair|rabbit hair|mink hair|sable hair|ermine powder|chinchilla powder|fox hair|wolf hair|bear hair|lion hair|tiger hair|leopard hair|cheetah powder|elephant hair|rhino horn|hippo tooth|walrus tusk|whale bone|seal fur|penguin feather|ostrich feather|emu feather|peacock feather|swan feather|goose feather|duck feather|chicken feather|turkey feather|quail feather|pheasant feather|partridge feather|grouse feather|woodcock feather|snipe feather|plover feather|curlew feather|godwit feather|whimbrel feather|sandpiper feather|knot feather|dunlin feather|stint feather|sanderling feather|phalarope feather|avocet feather|stilt feather|oystercatcher feather|lapwing feather|dotterel feather|golden plover feather|grey plover feather|ringed plover feather|little ringed plover feather|kentish plover feather|killdeer feather|caspian plover feather|oriental plover feather|pacific golden plover feather|american golden plover feather|european golden plover feather|sociable lapwing feather|white-tailed lapwing feather|spur-winged lapwing feather|black-headed lapwing feather|wattled lapwing feather|yellow-wattled lapwing feather|banded lapwing feather|masked lapwing feather|red-wattled lapwing feather|grey-headed lapwing feather|northern lapwing feather|southern lapwing feather|andean lapwing feather|resplendent lapwing feather|black-shouldered lapwing feather|crowned lapwing feather|senegal lapwing feather|black-winged lapwing feather|brown-chested lapwing feather|spot-breasted lapwing feather|african wattled lapwing feather|javan wattled lapwing feather|river lapwing feather|black-fronted dotterel feather|red-kneed dotterel feather|shore plover feather|wrybill feather)/.test(n);
    const isGemstone = /(amber extract|jet extract|shungite extract|hematite extract|malachite extract|rhodochrosite extract|smithsonite extract|turquoise extract|lapis lazuli extract|amethyst extract|citrine extract|rose quartz extract|clear quartz extract|moonstone extract|sunstone extract|labradorite extract|jade extract|nephrite extract|obsidian extract|peridot extract|garnet extract|tourmaline extract|aquamarine extract|emerald extract|ruby extract|sapphire extract|topaz extract|zircon extract|spinel extract|alexandrite extract|opal extract)/.test(n);
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: isAnimalPart ? 'Animal-Derived Powder' : isGemstone ? 'Mineral/Gemstone Extract' : 'Mineral/Inorganic',
      tags: ['mineral', isAnimalPart ? 'animal-derived' : 'inorganic', isGemstone ? 'needs-review' : 'texturizer'],
      notes: isAnimalPart ? 'Animal-derived powder. Cosmetic use is uncommon; ethical and regulatory considerations apply.' : isGemstone ? 'Gemstone/mineral extract. Cosmetic efficacy not scientifically established.' : 'Mineral or inorganic ingredient used as pigment, absorbent, or texturizer.',
      needs_review: isAnimalPart || isGemstone,
      profile_compatibility: profileAll(0.1),
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.1, typical_use_pct_max: 20, activity_threshold_pct: 0.1, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Hair Dyes / Colorants ─────────────────────────────────────────────────
  if (/^(basic blue|basic brown|basic red|basic yellow|acid violet|hc blue|hc yellow|hc red|disperse blue|disperse violet|disperse red|disperse orange|disperse yellow|disperse brown|acid black|acid blue|acid green|acid orange|acid red|dye acid|dye basic|dye green|dye orange|dye red|dye violet|dye yellow|dye brown|dye blue|lawsonia inermis leaf powder|cassia italica leaf powder|indigofera tinctoria leaf powder|curcuma longa root extract|crocus sativus flower extract|wine extract|vinegar|lawsonia inermis leaf extract|indigofera tinctoria leaf extract|cassia auriculata leaf powder|emblica officinalis fruit powder|terminalia chebula fruit powder|terminalia bellerica fruit powder|acacia concinna fruit powder|direct blue|direct violet|solvent black|manganese violet|chromium oxide greens|ferric ferrocyanide|pigment blue|quinoline yellow|ultramarines|iron oxides|mica|titanium dioxide|tin oxide|calcium aluminum borosilicate|synthetic fluorphlogopite|bismuth oxychloride|boron nitride|carmine|caramel)/.test(n)) {
    const isNatural = /(lawsonia|cassia|indigofera|curcuma|crocus|wine extract|vinegar|emblica|terminalia|acacia concinna)/.test(n);
    return makeEntry(name, {
      category: 'Colorant',
      sub_category: isNatural ? 'Natural Hair Dye' : 'Synthetic Colorant',
      tags: ['colorant', isNatural ? 'natural-dye' : 'synthetic-dye', 'color-treated'],
      notes: `${isNatural ? 'Natural plant-based colorant/dye.' : 'Synthetic colorant or hair dye.'} Used for color deposition or cosmetic coloring.`,
      needs_review: !isNatural,
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.4, porosity_high: 0.6,
        density_fine: 0.3, density_med: 0.4, density_coarse: 0.4,
        condition_damaged: 0.2, condition_normal: 0.4, condition_healthy: 0.4,
        oiliness_dry: 0.2, oiliness_normal: 0.4, oiliness_oily: 0.3,
        curl_straight: 0.3, curl_wavy: 0.4, curl_curly: 0.4, curl_coily: 0.4,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.3, color_treated: 0.5,
      },
      physicochemical: { water_solubility: 'variable', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals(), color_protection: { active: false, mechanism: 'none', strength: 'none' } },
      sensitivity_profile: { sensitizer_risk: isNatural ? 'low' : 'moderate', allergen_risk: isNatural ? 'low' : 'moderate', irritant_class: 'none', avoid_for_profiles: isNatural ? [] : ['allergy-prone'] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 5, activity_threshold_pct: 0.01, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 10, co_wash: 10, rinse_out_conditioner: 10, deep_conditioner_mask: 10, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 10 },
      molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'surface',
    });
  }

  // ── Botanical Extracts (general — plant, algae, fungi, lichen) ────────────
  // This is the catch-all for the large number of botanical extracts
  if (/(extract|water|juice|filtrate|lysate|ferment|powder|oil)$/.test(n) || /^(honey|royal jelly|propolis|pollen extract|snail secretion filtrate|snail mucin|bee venom|snake venom|silkworm cocoon extract|spider silk protein|pearl extract|shellfish extract|caviar extract|roe extract|salmon egg extract|sea urchin extract|starfish extract|jellyfish extract|coral extract|sponge extract|plankton extract|algae extract|yeast extract|faex extract|spirulina|chlorella|sea kelp extract|bladderwrack extract|bamboo extract|sugar cane extract|maple extract|orange fruit extract|lemon fruit extract|bilberry extract|pomegranate extract|goji berry extract|acai berry extract|coffee seed extract|sage extract|nettle extract|chamomile extract|ginseng|green tea extract|saw palmetto|calendula extract|horse chestnut extract|ivy extract|witch hazel|rose water|sea kelp extract)$/.test(n)) {
    // Determine if it's a well-known vs obscure botanical
    const isAlgae = /(algae|fucus|laminaria|undaria|ascophyllum|sargassum|gracilaria|chondrus|palmaria|porphyra|spirulina|chlorella|kelp|bladderwrack|wakame|dulse|nori|hijiki|irish moss|kappaphycus|hypnea|gigartina|mastocarpus|corallina|lithothamnion|phymatolithon|ahnfeltiopsis|asparagopsis|durvillaea|macrocystis|pelvetia|himanthalia|cystoseira|bifurcaria|cladosiphon|saccharina|alaria|ecklonia|eisenia|postelsia|lessonia|nereocystis|laminaria saccharina|laminaria ochroleuca|laminaria hyperborea|laminaria cloustoni|laminaria diabolica|petalonia|scytosiphon|dictyopteris|dictyota|padina|zonaria|stypopodium|colpomenia|hydroclathrus|rosenvingea|nemacystus|tinocladia|chordaria|sphaerotrichia|elachista|leathesia|ralfsia|petrospongium|myrionema|ectocarpus|pylaiella|hincksia|feldmannia|giffordia|acinetospora|tilopteris|cutleria|aglaozonia|sporochnus|desmarestia|arthrocladia|haplospora|phaeosiphoniella|isthmoplea|myriotrichia|litosiphon|asperococcus|striaria|punctaria|desmotrichum|giraudia|myriactula|corynophlaea|microcoryne|mesogloia|sauvageaugloia|liepmannia|castagnea|cladosiphon zosterae|stilophora|spermatochnus|halothrix|pityothamnion|pleonosporium|callithamnion|aglaothamnion|seirospora|compsothamnion|halurus|griffithsia|bornetia|monospora|wrangelia|crouania|ptilocladiopsis|gulsonia|antithamnion|antithamnionella|pterothamnion|ballia|ceramium|centroceras|spyridia|microcladia|ptilota|neoptilota|plumaria|delesseria|membranoptera|phycodrys|hypoglossum|apoglossum|grinnellia|caloglossa|taenioma|platysiphonia|sarcomenia|cottoniella|claudea|vanvoorstia|martensia|nitophyllum|myriogramme|schizoseris|hymenena|acrosorium|cryptopleura|gonimophyllum|polysiphonia|rhodomela|odonthalia|laurencia|osmundea|chondria|acanthophora|bostrychia|murrayella|digenea|vidalia|amansia|protokuetzingia|lenormandiopsis|neurymenia|dictyurus|thuretia|dasya|heterosiphonia|brongniartella|lophosiphonia|herposiphonia|pterosiphonia|halopithys|boergeseniella|pityosiphonia|alsidium|digeneopsis|pericystis|chamaethamnion|leveillea|polyzonia|cliftonia|enantiocladia|wilsonosiphonia|tayloriella|streblocladia|stichophora|rhodochorton|audouinella|liagora|galaxaura|tricleocarpa|actinotrichia|scinaia|nothogenia|helminthocladia|helminthora|nemalion|cumagloia|dermonema|yamadaella|ganonema|gloiotrichia|izziella|titanophycus|trichogloea|trichogloiopsis|gibsmithia|dudresnaya|thuretellopsis|pikea|schimmelmannia|acrosymphyton|dilsea|neodilsea|constantinea|dumontia|cryptosiphonia|farlowia|gloiosiphonia|schizymenia|platoma|nemastoma|predaea|tsengia|titanophora|sebdenia|crassiconeleia|halymenia|grateloupia|prionitis|polyopes|pachymenia|aeodes|phyllymenia|cryptonemia|thamnoclonium|codiophyllum|carpopeltis|corynomorpha|polyides|peyssonnelia|polystrata|cruoriella|rhodophysema|hildenbrandia|apophlaea|gloiopeltis|endocladia|caulacanthus|catenella|rhabdonia|areschougia|solieria|sarconema|agardhiella|eucheuma|betaphycus|meristotheca|anatheca|turnerella|opuntiella|callophyllis|kallymenia|pugetia|meredithia|euthora|cirrulicarpus|crossocarpus|erythrophyllum|polyneura|callocolax|gigartina|chondrus crispatus|iridaea|rhodoglossum|sarcothalia|mazzaella|gymnogongrus|ahnfeltia|stenogramma|petrocelis|phyllophora|schottera|erythrodermis|coccotylus|ozophora|besa|lomentaria|binghamia|champia|gastroclonium|coeloseira|chylocladia|rhodymenia|halosaccion|devaleraea|chrysymenia|botryocladia|coelarthrum|cordylecladia|fauchea|gloiosaccion|leptofauchea|sciadophycus|weberella|maripelta|fryeella|minium|halichrysis|asteromenia|rhodymeniocolax|sebdenia monardiana|furcellaria|caulerpa|porphyridium)/.test(n);
    const isFungus = /(ganoderma|trametes|fomes|lenzites|daedalea|fistulina|schizophyllum|pleurotus|lentinula|agaricus|cantharellus|boletus|tuber|morchella|auricularia|tremella|grifola|cordyceps|hericium|inonotus|poria|polyporus|armillaria|flammulina|coprinus|lepista|macrolepiota|russula|lactarius|amanita|sparassis|calvatia|lycoperdon|scleroderma|phallus|clathrus|geastrum|tulostoma|nidularia|crucibulum|cyathus|sphaerobolus|pilobolus|mucor|rhizopus|phycomyces|choanephora|mortierella|cunninghamella|syncephalastrum|piptocephalis|dispira|dimargaris|kickxella|coemansia|linderina|martensella|spirodactylon|orphella|smittium|amoebidium|ichthyophonus|psorospermium|dermocystidium|rhinosporidium|rozella|olpidium|synchytrium|physoderma|coelomomyces|blastocladia|allomyces|catenaria|coelomycidium|neocallimastix|piromyces|caecomyces|orpinomyces|anaeromyces|cyllamyces|monoblepharis|gonapodya|hyphochytrium|rhizidiomyces|saprolegnia|achlya|aphanomyces|dictyuchus|thraustotheca|leptolegnia|pythiopsis|brevilegnia|geolegnia|calyptralegnia|sommerstorffia|verrucalvus|phytophthora|pythium|albugo|peronospora|plasmopara|bremia|pseudoperonospora|sclerospora|peronophythora|basidiophora|paraperonospora|hyaloperonospora|protomyces|taphrina|neolecta|pneumocystis|saitoella|saccharomyces|candida|pichia|kluyveromyces|yarrowia|debaryomyces|hansenula|zygosaccharomyces|torulaspora|metschnikowia|wickerhamomyces|meyerozyma|lodderomyces|spathaspora|scheffersomyces|sugiyamaella|lipomyces|nadsonia|trigonopsis|botrytis|sclerotinia|monilinia|rhytisma|lophodermium|geoglossum|trichoglossum|microglossum|cudonia|spathularia|leotia|mitrula|vibrissea|chlorociboria|bulgaria|bisporella|hymenoscyphus|dumontinia|ciboria|rutstroemia|lanzia|poculum|encoelia|cenangium|gremmeniella|crumenulopsis|godronia|ascocoryne|neobulgaria|holwaya|claussenomyces|tympanis|phacidium|pseudophacidium|lophophacidium|ceuthospora|rhytisma salicinum|terriera|colpoma|tryblidiopsis)/.test(n);
    const isLichen = /(cladonia|usnea|evernia|parmelia|cetraria|peltigera|ramalina|roccella|umbilicaria|gyrophora|lecanora|aspicilia|pertusaria|ochrolechia|haematomma|graphis|verrucaria|dermatocarpon|endocarpon|collema|leptogium|pannaria|lobaria|sticta|nephroma|solorina|physcia|xanthoria|caloplaca|teloschistes|buellia|rinodina|pyxine|dirina|opegrapha|arthonia|enterographa|chiodecton|glyphis|sarcographa|phaeographis|graphina|thelotrema|diploschistes|gyalecta|coogonium|petractis|belonia|pachyphiale|dimerella|absconditella|biatoridium|strangospora|biatora|lecidea|psora|catillaria|micarea|scoliciosporum|bacidia|toninia|rhizocarpon|baeomyces|cladonia fimbriata|stereocaulon|pilophorus|leprocaulon|umbilicaria vellea|lasallia|pertusaria albescens|varicellaria|phlyctis|lepra|thelenella|julella|polyblastia|staurothele|thelidium|muellerella|endococcus|tichothecium|polycoccum|stigmidium|cercidospora|pyrenidium|abrothallus|vouauxiella|lichenoconium|illosporiopsis|marchandiomyces|erythricium|athelia|corticium|vuilleminia|peniophora|stereum|hymenochaete|phellinus)/.test(n);
    const isObscure = isLichen || (isAlgae && /(polysiphonia|rhodomela|odonthalia|laurencia|osmundea|chondria|acanthophora|bostrychia|murrayella|digenea|vidalia|amansia|protokuetzingia|lenormandiopsis|neurymenia|dictyurus|thuretia|dasya|heterosiphonia|brongniartella|lophosiphonia|herposiphonia|pterosiphonia|halopithys|boergeseniella|pityosiphonia|alsidium|digeneopsis|pericystis|chamaethamnion|leveillea|polyzonia|cliftonia|enantiocladia|wilsonosiphonia|tayloriella|streblocladia|stichophora|rhodochorton|audouinella|liagora|galaxaura|tricleocarpa|actinotrichia|scinaia|nothogenia|helminthocladia|helminthora|nemalion|cumagloia|dermonema|yamadaella|ganonema|gloiotrichia|izziella|titanophycus|trichogloea|trichogloiopsis|gibsmithia|dudresnaya|thuretellopsis|pikea|schimmelmannia|acrosymphyton|dilsea|neodilsea|constantinea|dumontia|cryptosiphonia|farlowia|gloiosiphonia|schizymenia|platoma|nemastoma|predaea|tsengia|titanophora|sebdenia|crassiconeleia|halymenia|grateloupia|prionitis|polyopes|pachymenia|aeodes|phyllymenia|cryptonemia|thamnoclonium|codiophyllum|carpopeltis|corynomorpha|polyides|peyssonnelia|polystrata|cruoriella|rhodophysema|hildenbrandia|apophlaea|gloiopeltis|endocladia|caulacanthus|catenella|rhabdonia|areschougia|solieria|sarconema|agardhiella|eucheuma|betaphycus|meristotheca|anatheca|turnerella|opuntiella|callophyllis|kallymenia|pugetia|meredithia|euthora|cirrulicarpus|crossocarpus|erythrophyllum|polyneura|callocolax|gigartina|chondrus crispatus|iridaea|rhodoglossum|sarcothalia|mazzaella|gymnogongrus|ahnfeltia|stenogramma|petrocelis|phyllophora|schottera|erythrodermis|coccotylus|ozophora|besa|lomentaria|binghamia|champia|gastroclonium|coeloseira|chylocladia|rhodymenia|halosaccion|devaleraea|chrysymenia|botryocladia|coelarthrum|cordylecladia|fauchea|gloiosaccion|leptofauchea|sciadophycus|weberella|maripelta|fryeella|minium|halichrysis|asteromenia|rhodymeniocolax|sebdenia monardiana)/.test(n)) || (isFungus && /(mucor|rhizopus|phycomyces|choanephora|cunninghamella|syncephalastrum|piptocephalis|dispira|dimargaris|kickxella|coemansia|linderina|martensella|spirodactylon|orphella|smittium|amoebidium|ichthyophonus|psorospermium|dermocystidium|rhinosporidium|rozella|olpidium|synchytrium|physoderma|coelomomyces|blastocladia|allomyces|catenaria|coelomycidium|neocallimastix|piromyces|caecomyces|orpinomyces|anaeromyces|cyllamyces|monoblepharis|gonapodya|hyphochytrium|rhizidiomyces|saprolegnia|achlya|aphanomyces|dictyuchus|thraustotheca|leptolegnia|pythiopsis|brevilegnia|geolegnia|calyptralegnia|sommerstorffia|verrucalvus|phytophthora|pythium|albugo|peronospora|plasmopara|bremia|pseudoperonospora|sclerospora|peronophythora|basidiophora|paraperonospora|hyaloperonospora|protomyces|taphrina|neolecta|pneumocystis|saitoella|botrytis|sclerotinia|monilinia|rhytisma|lophodermium|geoglossum|trichoglossum|microglossum|cudonia|spathularia|leotia|mitrula|vibrissea|chlorociboria|bulgaria|bisporella|hymenoscyphus|dumontinia|ciboria|rutstroemia|lanzia|poculum|encoelia|cenangium|gremmeniella|crumenulopsis|godronia|ascocoryne|neobulgaria|holwaya|claussenomyces|tympanis|phacidium|pseudophacidium|lophophacidium|ceuthospora|rhytisma salicinum|terriera|colpoma|tryblidiopsis)/.test(n));
    const subCat = isLichen ? 'Lichen Extract' : isFungus ? 'Fungal/Mushroom Extract' : isAlgae ? 'Marine Algae Extract' : 'Botanical Extract';
    return makeEntry(name, {
      category: 'Botanical',
      sub_category: subCat,
      tags: ['botanical', isAlgae ? 'marine' : isFungus ? 'fungal' : isLichen ? 'lichen' : 'plant-extract', isObscure ? 'needs-review' : 'antioxidant'],
      notes: `${subCat}. ${isObscure ? 'Obscure species with limited cosmetic literature; efficacy unverified.' : 'Provides antioxidant, conditioning, or scalp-active benefits.'}`,
      needs_review: isObscure,
      profile_compatibility: {
        porosity_low: 0.2, porosity_med: 0.3, porosity_high: 0.3,
        density_fine: 0.2, density_med: 0.3, density_coarse: 0.3,
        condition_damaged: 0.3, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.2, oiliness_normal: 0.3, oiliness_oily: 0.2,
        curl_straight: 0.2, curl_wavy: 0.2, curl_curly: 0.3, curl_coily: 0.3,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.2, color_treated: 0.2,
      },
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0.2, emolliency: 0.1, cleansing_strength: 0, substantivity: 'low' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 5, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 15, co_wash: 20, rinse_out_conditioner: 25, deep_conditioner_mask: 30, leave_in_conditioner: 30, hair_oil_serum: 20, styling_product: 15 },
      molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'surface',
    });
  }

  // ── Chelators ─────────────────────────────────────────────────────────────
  if (/^(edta|disodium edta|tetrasodium edta|dipotassium edta|trisodium nta|pentasodium pentetate|tetrasodium pyrophosphate|disodium pyrophosphate|tetrasodium etidronate|etidronic acid|phytic acid|gluconic acid|citric acid|sodium citrate|trisodium citrate|disodium phosphate|trisodium phosphate|sodium hexametaphosphate|sodium tripolyphosphate)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'Chelating Agent',
      tags: ['chelator', 'functional', 'stability', 'low-buildup'],
      notes: 'Chelating agent. Binds metal ions to improve formulation stability and prevent rancidity.',
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'high', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'none' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 1, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 5, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 5 },
      molecular_weight_da: null, ionic_charge: 'anionic', penetration_depth: 'surface',
    });
  }

  // ── Antioxidant Stabilizers ───────────────────────────────────────────────
  if (/^(bht|bha|tocopherol|vitamin e|alpha-tocopherol|propyl gallate|ascorbic acid|sodium ascorbate|erythorbic acid|sodium erythorbate|sodium metabisulfite|sodium sulfite|t-butyl alcohol|pentaerythrityl tetra-di-t-butyl hydroxyhydrocinnamate|tetradibutyl pentaerythrityl hydroxyhydrocinnamate)$/.test(n)) {
    return makeEntry(name, {
      category: 'Functional Additive',
      sub_category: 'Antioxidant Stabilizer',
      tags: ['antioxidant', 'stabilizer', 'functional'],
      notes: 'Antioxidant used to prevent oxidative degradation of formulation ingredients.',
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'variable', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'none' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 1, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
      product_roles: { shampoo: 3, co_wash: 3, rinse_out_conditioner: 3, deep_conditioner_mask: 3, leave_in_conditioner: 3, hair_oil_serum: 5, styling_product: 3 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Nail / Specialty Film Formers ─────────────────────────────────────────
  if (/^(tosylamide\/epoxy resin|nitrocellulose|shellac|polyester-5|sodium laneth-40 maleate\/styrene sulfonate copolymer)$/.test(n)) {
    return makeEntry(name, {
      category: 'Film Former',
      sub_category: 'Specialty Film Former',
      tags: ['film-former', 'specialty', 'needs-review'],
      notes: 'Specialty film-forming resin. Primarily used in nail or specialty hair products.',
      needs_review: true,
      profile_compatibility: profileAll(0.1),
      physicochemical: { water_solubility: 'low', volatility: 'non-volatile', film_forming_strength: 0.8, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'high' },
      functional_signals: { ...defaultSignals(), heavy_polymer: true },
      sensitivity_profile: { sensitizer_risk: 'moderate', allergen_risk: 'moderate', irritant_class: 'mild', avoid_for_profiles: ['sensitive-scalp', 'allergy-prone'] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 30, activity_threshold_pct: 1, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 0, co_wash: 0, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in_conditioner: 5, hair_oil_serum: 5, styling_product: 30 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Solvents / Nail Solvents ──────────────────────────────────────────────
  if (/^(heptane|ethyl acetate|butyl acetate|diacetone alcohol|ethylcellulose|methyl lactate|dimethyl isosorbide|propylene carbonate|dipropylene glycol dimethyl ether|methyl perfluorobutyl ether|perfluorodecalin|isoeicosane|dodecane|dodecene|decane|hexadecane|c13-14 isoparaffin|eicosene)$/.test(n)) {
    return makeEntry(name, {
      category: 'Solvent',
      sub_category: 'Organic Solvent',
      tags: ['solvent', 'volatile', 'functional'],
      notes: 'Organic solvent used as carrier, diluent, or nail polish solvent.',
      profile_compatibility: profileAll(0),
      physicochemical: { water_solubility: 'low', volatility: 'high', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'none' },
      functional_signals: { ...defaultSignals() },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'mild', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 50, activity_threshold_pct: 1, position_sensitivity: 'low' },
      product_roles: { shampoo: 0, co_wash: 0, rinse_out_conditioner: 0, deep_conditioner_mask: 0, leave_in_conditioner: 5, hair_oil_serum: 10, styling_product: 20 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Fatty Alcohols ────────────────────────────────────────────────────────
  if (/^(batyl alcohol|isostearyl alcohol|octyldodecanol|hexylene glycol|hexyl decanol|hexyldecyl octyldodecanol|dihydroabietyl alcohol|dihydrocholesterol|c20-40 alcohols|lanolin acid|isopropyl lanolate|myristyl lanolate|cetyl lanolate|stearyl lanolate|lanolin oil|lanolin wax|hydrogenated lanolin|hydroxylated lanolin|lanolin cera|acetylated lanolin)$/.test(n)) {
    return makeEntry(name, {
      category: 'Fatty Alcohol',
      sub_category: 'Long-Chain Fatty Alcohol',
      tags: ['fatty-alcohol', 'emollient', 'conditioning', 'emulsifier'],
      notes: 'Long-chain fatty alcohol. Provides emolliency, conditioning, and emulsification.',
      profile_compatibility: {
        porosity_low: 0.1, porosity_med: 0.4, porosity_high: 0.6,
        density_fine: 0.2, density_med: 0.4, density_coarse: 0.5,
        condition_damaged: 0.5, condition_normal: 0.3, condition_healthy: 0.2,
        oiliness_dry: 0.5, oiliness_normal: 0.3, oiliness_oily: 0,
        curl_straight: 0.2, curl_wavy: 0.3, curl_curly: 0.5, curl_coily: 0.6,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: 0.4, color_treated: 0.3,
      },
      physicochemical: { water_solubility: 'insoluble', volatility: 'non-volatile', film_forming_strength: 0.3, humectant_capacity: 0, emolliency: 0.6, cleansing_strength: 0, substantivity: 'moderate' },
      functional_signals: { ...defaultSignals(), fatty_alcohol: true },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
      concentration_context: { typical_use_pct_min: 0.5, typical_use_pct_max: 10, activity_threshold_pct: 0.5, position_sensitivity: 'moderate' },
      product_roles: { shampoo: 5, co_wash: 25, rinse_out_conditioner: 45, deep_conditioner_mask: 55, leave_in_conditioner: 45, hair_oil_serum: 30, styling_product: 20 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Drying Alcohols ───────────────────────────────────────────────────────
  if (/^(ethanol|alcohol denat|isopropyl alcohol|sd alcohol|denatured alcohol|t-butyl alcohol)$/.test(n)) {
    return makeEntry(name, {
      category: 'Solvent',
      sub_category: 'Drying Alcohol',
      tags: ['drying-alcohol', 'solvent', 'volatile', 'fine-hair-safe'],
      notes: 'Short-chain drying alcohol. Evaporates quickly; can be drying at high concentrations.',
      profile_compatibility: {
        porosity_low: 0.3, porosity_med: 0.2, porosity_high: 0.1,
        density_fine: 0.4, density_med: 0.2, density_coarse: 0.1,
        condition_damaged: -0.2, condition_normal: 0.2, condition_healthy: 0.3,
        oiliness_dry: -0.2, oiliness_normal: 0.2, oiliness_oily: 0.5,
        curl_straight: 0.3, curl_wavy: 0.2, curl_curly: 0.1, curl_coily: 0,
        protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: -0.1, color_treated: -0.1,
      },
      physicochemical: { water_solubility: 'complete', volatility: 'high', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0.2, substantivity: 'none' },
      functional_signals: { ...defaultSignals(), drying_alcohol: true },
      sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'mild', avoid_for_profiles: ['dry-hair', 'damaged-hair'] },
      concentration_context: { typical_use_pct_min: 1, typical_use_pct_max: 40, activity_threshold_pct: 1, position_sensitivity: 'high' },
      product_roles: { shampoo: 5, co_wash: 5, rinse_out_conditioner: 5, deep_conditioner_mask: 2, leave_in_conditioner: 5, hair_oil_serum: 10, styling_product: 35 },
      molecular_weight_da: null, ionic_charge: 'neutral', penetration_depth: 'surface',
    });
  }

  // ── Miscellaneous / Catch-all ─────────────────────────────────────────────
  return makeEntry(name, {
    category: 'Functional Additive',
    sub_category: 'Miscellaneous',
    tags: ['functional', 'needs-review'],
    notes: 'Ingredient function not automatically classified. Manual review recommended.',
    needs_review: true,
    profile_compatibility: profileAll(0),
    physicochemical: { water_solubility: 'variable', volatility: 'non-volatile', film_forming_strength: 0, humectant_capacity: 0, emolliency: 0, cleansing_strength: 0, substantivity: 'low' },
    functional_signals: defaultSignals(),
    sensitivity_profile: { sensitizer_risk: 'none', allergen_risk: 'none', irritant_class: 'none', avoid_for_profiles: [] },
    concentration_context: { typical_use_pct_min: 0.01, typical_use_pct_max: 5, activity_threshold_pct: 0.01, position_sensitivity: 'low' },
    product_roles: { shampoo: 10, co_wash: 10, rinse_out_conditioner: 10, deep_conditioner_mask: 10, leave_in_conditioner: 10, hair_oil_serum: 5, styling_product: 10 },
    molecular_weight_da: null, ionic_charge: 'variable', penetration_depth: 'surface',
  });
}

// ─── Helper: Build full Phase 3 entry ────────────────────────────────────────
function makeEntry(name, opts) {
  const pr = opts.product_roles;
  return {
    name: name,
    category: opts.category,
    low: 'g',
    med: 'g',
    high: 'g',
    fine: 'g',
    oily: 'g',
    notes: opts.notes || '',
    tags: (opts.tags || []).filter(Boolean),
    product_roles: {
      shampoo: { score: pr.shampoo },
      co_wash: { score: pr.co_wash },
      rinse_out_conditioner: { score: pr.rinse_out_conditioner },
      deep_conditioner_mask: { score: pr.deep_conditioner_mask },
      leave_in_conditioner: { score: pr.leave_in_conditioner },
      hair_oil_serum: { score: pr.hair_oil_serum },
      styling_product: { score: pr.styling_product },
    },
    aliases: [],
    molecular_weight_da: opts.molecular_weight_da || null,
    ionic_charge: opts.ionic_charge || 'neutral',
    penetration_depth: opts.penetration_depth || 'surface',
    baseScore: {
      shampoo: pr.shampoo,
      co_wash: pr.co_wash,
      rinse_out_conditioner: pr.rinse_out_conditioner,
      deep_conditioner_mask: pr.deep_conditioner_mask,
      leave_in: pr.leave_in_conditioner,
      hair_oil_serum: pr.hair_oil_serum,
      styling_product: pr.styling_product,
    },
    sub_category: opts.sub_category || opts.category,
    molecular_weight_confidence: opts.molecular_weight_da ? 'measured' : 'estimated',
    profile_compatibility: opts.profile_compatibility,
    physicochemical: opts.physicochemical,
    functional_signals: opts.functional_signals,
    sensitivity_profile: opts.sensitivity_profile,
    concentration_context: opts.concentration_context,
    ...(opts.needs_review ? { needs_review: true } : {}),
  };
}

// ─── Helper: Default profile (all zeros) ─────────────────────────────────────
function profileAll(val) {
  return {
    porosity_low: val, porosity_med: val, porosity_high: val,
    density_fine: val, density_med: val, density_coarse: val,
    condition_damaged: val, condition_normal: val, condition_healthy: val,
    oiliness_dry: val, oiliness_normal: val, oiliness_oily: val,
    curl_straight: val, curl_wavy: val, curl_curly: val, curl_coily: val,
    protein_sensitive: 0, silicone_sensitive: 0, chemically_treated: val, color_treated: val,
  };
}

// ─── Helper: Default functional signals ──────────────────────────────────────
function defaultSignals() {
  return {
    bond_repair: { active: false, mechanism: 'none', strength: 'none' },
    scalp_active: { active: false, activity_type: 'none', strength: 'none', evidence_level: 'none' },
    drying_alcohol: false,
    fatty_alcohol: false,
    sulfate: false,
    fragrance: false,
    color_protection: { active: false, mechanism: 'none', strength: 'none' },
    heavy_polymer: false,
    conditioning_polymer: false,
    protein_weight_class: 'none',
    humectant_type: 'none',
  };
}

// ─── Main Processing ──────────────────────────────────────────────────────────
const rawLines = fs.readFileSync(UNKNOWN_TXT, 'utf8').split('\n').map(l => l.trim()).filter(l => l.length > 0);

const offensive = ['nigger', 'nigga', 'fuck', 'shit', 'cunt', 'faggot'];
const nonIngredient = /^[0-9]+$|^[0-9]+\.$|^\s*$/;

const seen = new Set();
const results = [];
const report = {
  total_lines: rawLines.length,
  removed: [],
  duplicates_in_file: [],
  duplicates_in_db: [],
  added: [],
  needs_review: [],
};

for (const line of rawLines) {
  const norm = normalize(line);
  if (!norm) continue;

  // Offensive check
  if (offensive.some(o => norm.toLowerCase().includes(o))) {
    report.removed.push({ name: norm, reason: 'offensive/non-ingredient' });
    continue;
  }

  // Pure number placeholder
  if (nonIngredient.test(norm)) {
    report.removed.push({ name: norm, reason: 'non-ingredient placeholder' });
    continue;
  }

  // Fragment check (single token that starts with digit-dash)
  if (/^[0-9]+-[A-Za-z]+$/.test(norm) && !norm.includes(' ')) {
    report.removed.push({ name: norm, reason: 'fragment/incomplete INCI name' });
    continue;
  }

  const key = norm.toLowerCase();

  // Dedup within file
  if (seen.has(key)) {
    report.duplicates_in_file.push(norm);
    continue;
  }
  seen.add(key);

  // Already in DB
  if (existingNames.has(key)) {
    report.duplicates_in_db.push(norm);
    continue;
  }

  // Fix ALL CAPS names
  const finalName = fixCaps(norm);

  // Classify
  const entry = classify(finalName);
  results.push(entry);
  report.added.push(finalName);
  if (entry.needs_review) {
    report.needs_review.push(finalName);
  }
}

// ─── Write batch JSON ─────────────────────────────────────────────────────────
fs.writeFileSync(OUT_BATCH, JSON.stringify(results, null, 2), 'utf8');
console.log(`✅ Wrote ${results.length} new ingredients to ${OUT_BATCH}`);

// ─── Write integration report ─────────────────────────────────────────────────
const md = `# Integration Report — Unknown Ingredients Batch
Generated: ${new Date().toISOString()}

## Summary

| Metric | Count |
|--------|-------|
| Total lines in unknown-ingredients.txt | ${report.total_lines} |
| Removed (offensive/invalid/fragments) | ${report.removed.length} |
| Duplicates within file | ${report.duplicates_in_file.length} |
| Already in ingredients.v3.json (skipped) | ${report.duplicates_in_db.length} |
| **New ingredients added** | **${report.added.length}** |
| Flagged needs-review | ${report.needs_review.length} |

## Removed Entries (${report.removed.length})

| Name | Reason |
|------|--------|
${report.removed.map(r => `| \`${r.name}\` | ${r.reason} |`).join('\n')}

## Already in Database (${report.duplicates_in_db.length} skipped)

<details>
<summary>Click to expand</summary>

${report.duplicates_in_db.map(d => `- ${d}`).join('\n')}

</details>

## Needs-Review Entries (${report.needs_review.length})

These entries were added but flagged for manual scientific review:

<details>
<summary>Click to expand</summary>

${report.needs_review.map(r => `- ${r}`).join('\n')}

</details>

## Category Distribution

${(() => {
  const cats = {};
  results.forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
  return Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([k,v]) => `- **${k}**: ${v}`).join('\n');
})()}

## Sub-category Distribution

${(() => {
  const cats = {};
  results.forEach(r => { cats[r.sub_category] = (cats[r.sub_category] || 0) + 1; });
  return Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([k,v]) => `- **${k}**: ${v}`).join('\n');
})()}
`;

fs.writeFileSync(OUT_REPORT, md, 'utf8');
console.log(`✅ Wrote integration report to ${OUT_REPORT}`);
console.log(`\n📊 Summary:`);
console.log(`   Total lines: ${report.total_lines}`);
console.log(`   Removed: ${report.removed.length}`);
console.log(`   Skipped (in DB): ${report.duplicates_in_db.length}`);
console.log(`   NEW added: ${report.added.length}`);
console.log(`   Needs review: ${report.needs_review.length}`);
