import fs from 'fs';
import path from 'path';

// Define the shape of our ingredient object
interface Ingredient {
  name: string;
  category: string;
  sub_category?: string;
  functional_signals?: {
    bond_repair?: { active: boolean; mechanism?: string; strength?: string };
    scalp_active?: { active: boolean; activity_type?: string; strength?: string; evidence_level?: string };
    drying_alcohol?: boolean;
    fatty_alcohol?: boolean;
    sulfate?: boolean;
    fragrance?: boolean;
    color_protection?: { active: boolean; mechanism?: string; strength?: string };
    heavy_polymer?: boolean;
    conditioning_polymer?: boolean;
    protein_weight_class?: string;
    humectant_type?: string;
    [key: string]: any;
  };
  physicochemical?: {
    water_solubility?: string;
    volatility?: string;
    film_forming_strength?: number;
    humectant_capacity?: number;
    emolliency?: number;
    cleansing_strength?: number;
    substantivity?: string;
    [key: string]: any;
  };
  aliases?: string[];
  notes?: string;
  tags?: string[];
  molecular_weight_da?: number;
  ionic_charge?: string;
  "needs-review"?: string | boolean;
  [key: string]: any; // Catch-all for phase 3 fields
}

interface DatabaseV3 {
  version: string;
  migratedFrom: string;
  lastUpdated: string;
  totalIngredients: number;
  schemaVersion: string;
  migrationDate: string;
  ingredients: Ingredient[];
}

const DB_PATH = path.join(process.cwd(), 'database/ingredients.v3.json');
const OUTPUT_PATH = path.join(process.cwd(), 'database/ingredients.v3.1.0.audit.json');
const REPORT_PATH = path.join(process.cwd(), 'logs/chemoinformatics_audit_report.json');

// Ensure logs directory exists
if (!fs.existsSync(path.dirname(REPORT_PATH))) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
}

function processIngredient(ing: Ingredient): { modified: boolean; flag?: 'minor' | 'major'; messages: string[] } {
  let modified = false;
  const messages: string[] = [];
  let flag: 'minor' | 'major' | undefined = undefined;

  const nameLower = ing.name.toLowerCase();

  // Initialize functional_signals and physicochemical if missing
  ing.functional_signals = ing.functional_signals || {};
  ing.physicochemical = ing.physicochemical || {};

  // --- Rule 1: Humectants ---
  const knownHumectants = ['glycerin', 'propylene glycol', 'panthenol', 'hyaluronic acid', 'sodium hyaluronate', 'urea', 'sorbitol', 'aloe', 'honey', 'pca', 'sodium pca'];
  const isHumectant = knownHumectants.some(h => nameLower.includes(h)) || ing.category === 'Humectant';
  
  if (isHumectant) {
    if (ing.category !== 'Humectant' && !nameLower.includes('panthenol')) { // Panthenol is usually vitamin/active
       // We won't forcefully change category if it's already something else, but we add functional signal
    }
    if (!ing.functional_signals.humectant_type || ing.functional_signals.humectant_type === 'none') {
      ing.functional_signals.humectant_type = 'polyol'; // Default
      if (nameLower.includes('hyaluronate') || nameLower.includes('hyaluronic')) ing.functional_signals.humectant_type = 'macromolecule';
      if (nameLower.includes('pca') || nameLower.includes('urea') || nameLower.includes('amino')) ing.functional_signals.humectant_type = 'nmf';
      modified = true;
      messages.push(`Set humectant_type to ${ing.functional_signals.humectant_type}`);
    }
    if ((ing.physicochemical.humectant_capacity || 0) < 0.3) {
      ing.physicochemical.humectant_capacity = 0.5; // Baseline
      modified = true;
      messages.push(`Increased humectant_capacity to 0.5`);
    }
  }

  // --- Rule 2: Silicones ---
  if (nameLower.endsWith('cone') || nameLower.endsWith('conol') || nameLower.endsWith('siloxane')) {
    if (ing.category !== 'Silicone') {
      ing.category = 'Silicone';
      modified = true;
      messages.push(`Changed category to Silicone`);
    }
    
    // Sub-categorization
    if (nameLower.includes('amodimethicone') || nameLower.includes('amine') || nameLower.includes('amino')) {
      ing.sub_category = 'Aminosilicone';
      ing.functional_signals.conditioning_polymer = true;
      if (ing.ionic_charge !== 'cationic') { ing.ionic_charge = 'cationic'; modified = true; messages.push('Set ionic_charge to cationic for aminosilicone'); }
    } else if (nameLower.includes('cyclopentasiloxane') || nameLower.includes('cyclomethicone') || nameLower.includes('cyclohexasiloxane')) {
      ing.sub_category = 'Volatile Silicone';
      ing.physicochemical.volatility = 'high';
      modified = true;
    } else if (nameLower.includes('dimethicone copolyol') || nameLower.includes('peg-') || nameLower.includes('ppg-')) {
      ing.sub_category = 'Water-Soluble Silicone';
      ing.physicochemical.water_solubility = 'high';
      modified = true;
    } else {
      ing.sub_category = 'Non-volatile Silicone';
    }

    if ((ing.physicochemical.emolliency || 0) < 0.4) {
      ing.physicochemical.emolliency = Math.max(ing.physicochemical.emolliency || 0, 0.6);
      modified = true;
      messages.push(`Adjusted emolliency for silicone`);
    }
  }

  // --- Rule 3: Proteins / Peptides / Amino Acids ---
  if (nameLower.includes('protein') || nameLower.includes('peptide') || nameLower.includes('keratin') || nameLower.includes('collagen') || nameLower.includes('silk') || nameLower.includes('wheat amino') || nameLower.includes('soy amino')) {
    if (!['Protein', 'Amino Acid'].includes(ing.category)) {
      ing.category = 'Protein';
      modified = true;
      messages.push(`Changed category to Protein`);
    }
    
    if (nameLower.includes('amino acid')) {
      ing.sub_category = 'Amino Acid';
      ing.functional_signals.protein_weight_class = 'amino_acid';
      ing.molecular_weight_da = 150;
    } else if (nameLower.includes('peptide') || nameLower.includes('hydrolyzed')) {
      ing.sub_category = 'Hydrolyzed Protein';
      ing.functional_signals.protein_weight_class = 'hydrolyzed_peptide';
      ing.molecular_weight_da = 1000;
    } else {
      ing.sub_category = 'Whole Protein';
      ing.functional_signals.protein_weight_class = 'whole_protein';
      ing.molecular_weight_da = 50000;
      ing.physicochemical.film_forming_strength = Math.max(ing.physicochemical.film_forming_strength || 0, 0.7);
    }
    modified = true;
    messages.push(`Assigned protein weight class: ${ing.functional_signals.protein_weight_class}`);
  }

  // --- Rule 4: Cationic Conditioning Polymers & Surfactants ---
  if (nameLower.includes('polyquaternium') || nameLower.includes('guar hydroxypropyltrimonium') || nameLower.includes('behentrimonium') || nameLower.includes('cetrimonium') || nameLower.includes('stearamidopropyl dimethylamine')) {
    ing.ionic_charge = 'cationic';
    ing.physicochemical.substantivity = 'high';
    
    if (nameLower.includes('polyquaternium') || nameLower.includes('guar')) {
      ing.category = 'Polymer';
      ing.sub_category = 'Cationic Polymer';
      ing.functional_signals.conditioning_polymer = true;
      ing.functional_signals.heavy_polymer = nameLower.includes('polyquaternium-10') || nameLower.includes('polyquaternium-7') || nameLower.includes('guar');
    } else {
      ing.category = 'Surfactant';
      ing.sub_category = 'Cationic Surfactant';
      ing.functional_signals.conditioning_polymer = false; 
    }
    modified = true;
    messages.push(`Set cationic properties`);
  }

  // --- Rule 5: Alcohols ---
  if (nameLower.endsWith('alcohol')) {
    const fattyAlcohols = ['cetyl alcohol', 'stearyl alcohol', 'cetearyl alcohol', 'behenyl alcohol', 'myristyl alcohol'];
    const dryingAlcohols = ['alcohol denat', 'ethanol', 'isopropyl alcohol', 'sd alcohol', 'propanol', 'propyl alcohol'];
    
    if (fattyAlcohols.some(f => nameLower.includes(f))) {
      ing.category = 'Emollient';
      ing.sub_category = 'Fatty Alcohol';
      ing.functional_signals.fatty_alcohol = true;
      ing.functional_signals.drying_alcohol = false;
      ing.physicochemical.emolliency = Math.max(ing.physicochemical.emolliency || 0, 0.5);
      modified = true;
      messages.push(`Identified as Fatty Alcohol`);
    } else if (dryingAlcohols.some(d => nameLower.includes(d) || nameLower === 'alcohol')) {
      ing.category = 'Solvent';
      ing.sub_category = 'Drying Alcohol';
      ing.functional_signals.drying_alcohol = true;
      ing.functional_signals.fatty_alcohol = false;
      ing.physicochemical.volatility = 'high';
      modified = true;
      messages.push(`Identified as Drying Alcohol`);
    }
  }

  // --- Rule 6: Sulfates & Cleansing ---
  if (nameLower.includes('sulfate') && (nameLower.includes('sodium') || nameLower.includes('ammonium') || nameLower.includes('tea-'))) {
    ing.category = 'Surfactant';
    ing.sub_category = 'Anionic Surfactant';
    ing.functional_signals.sulfate = true;
    ing.physicochemical.cleansing_strength = Math.max(ing.physicochemical.cleansing_strength || 0, 0.8);
    ing.ionic_charge = 'anionic';
    modified = true;
    messages.push(`Identified as Sulfate Anionic Surfactant`);
  }

  // --- Rule 7: Bond Builders ---
  const bondRepairTerms = ['maleic', 'bis-aminopropyl diglycol dimaleate', 'hydroxypropylammonium gluconate'];
  if (bondRepairTerms.some(b => nameLower.includes(b))) {
    if (!ing.functional_signals.bond_repair) {
      ing.functional_signals.bond_repair = { active: true, mechanism: 'covalent_crosslinking', strength: 'high' };
      modified = true;
      messages.push(`Added bond_repair functional signal`);
    } else if (!ing.functional_signals.bond_repair.active) {
      ing.functional_signals.bond_repair.active = true;
      modified = true;
      messages.push(`Activated bond_repair signal`);
    }
  }

  // --- Rule 8: Scalp Actives ---
  const scalpActives = ['salicylic acid', 'zinc pyrithione', 'ketoconazole', 'piroxctone olamine', 'climbazole', 'tea tree', 'peppermint', 'rosemary', 'caffeine', 'niacinamide', 'menthol'];
  if (scalpActives.some(s => nameLower.includes(s))) {
    if (!ing.functional_signals.scalp_active) {
      let type = 'soothing';
      if (nameLower.includes('zinc') || nameLower.includes('ketoconazole') || nameLower.includes('climbazole')) type = 'anti_dandruff';
      if (nameLower.includes('salicylic')) type = 'exfoliating';
      if (nameLower.includes('caffeine') || nameLower.includes('rosemary')) type = 'stimulating';
      
      ing.functional_signals.scalp_active = { active: true, activity_type: type, strength: 'medium', evidence_level: 'well_established' };
      modified = true;
      messages.push(`Added scalp_active functional signal: ${type}`);
    } else if (!ing.functional_signals.scalp_active.active) {
      ing.functional_signals.scalp_active.active = true;
      modified = true;
      messages.push(`Activated scalp_active signal`);
    }
  }

  // --- Rule 9: Sanity Check / Outlier Detection ---
  // --- Rule 10: Specific missing categories fix ---
  if (nameLower.endsWith('diol') && !nameLower.includes('sterol')) {
    ing.category = 'Solvent';
    ing.sub_category = 'Humectant Solvent';
    ing.functional_signals.humectant_type = 'polyol';
    ing.physicochemical.humectant_capacity = 0.4;
    modified = true;
    messages.push('Identified as Diol/Solvent');
  } else if (nameLower.includes('diamine')) {
    ing.category = 'Synthetic';
    ing.sub_category = 'Dye/Colorant';
    modified = true;
    messages.push('Identified as Diamine Dye');
  } else if (nameLower.includes('naphthalate')) {
    ing.category = 'Synthetic';
    ing.sub_category = 'UV Filter/Stabilizer';
    modified = true;
    messages.push('Identified as Naphthalate/UV stabilizer');
  }

  // Missing basic classifications
  if (!ing.category || ing.category === 'Unknown') {
    flag = 'major';
    messages.push('Missing or Unknown category');
  }

  // Impossible physicochemical combos
  const p = ing.physicochemical;
  if (p.cleansing_strength && p.cleansing_strength > 0.5 && ing.category !== 'Surfactant') {
    flag = 'major';
    messages.push(`High cleansing strength (${p.cleansing_strength}) but category is ${ing.category}`);
  }
  if (p.emolliency && p.emolliency > 0.5 && p.cleansing_strength && p.cleansing_strength > 0.5) {
    flag = 'major';
    messages.push('Ingredient claims to be highly emollient AND highly cleansing');
  }

  // General catch-all for weird data
  if (ing.name.length < 2) {
    flag = 'major';
    messages.push('Suspiciously short name');
  }

  // Set the review flag
  if (flag) {
    ing['needs-review'] = flag;
    modified = true;
  } else if (ing['needs-review']) {
    // If it had a boolean true before, upgrade to minor or remove if we are confident.
    // For now, let's just keep existing needs-review if we didn't flag it ourselves, but maybe normalize to 'minor'
    if (ing['needs-review'] === true) {
      ing['needs-review'] = 'minor';
      modified = true;
      messages.push('Normalized legacy true needs-review to minor');
    }
  }

  return { modified, flag, messages };
}

async function runAudit() {
  console.log(`Loading database from ${DB_PATH}...`);
  const rawData = fs.readFileSync(DB_PATH, 'utf8');
  const db: DatabaseV3 = JSON.parse(rawData);

  console.log(`Processing ${db.ingredients.length} ingredients...`);

  let modifiedCount = 0;
  let minorFlagCount = 0;
  let majorFlagCount = 0;
  const modificationsLog: any[] = [];

  for (let i = 0; i < db.ingredients.length; i++) {
    const ing = db.ingredients[i];
    const result = processIngredient(ing);

    if (result.modified) {
      modifiedCount++;
      modificationsLog.push({
        name: ing.name,
        flag: result.flag,
        messages: result.messages
      });
    }

    if (result.flag === 'minor' || ing['needs-review'] === 'minor') minorFlagCount++;
    if (result.flag === 'major' || ing['needs-review'] === 'major') majorFlagCount++;

    if (i > 0 && i % 1000 === 0) {
      console.log(`Processed ${i} / ${db.ingredients.length}...`);
    }
  }

  console.log(`Finished processing. Modified ${modifiedCount} ingredients.`);
  console.log(`Flags: ${minorFlagCount} minor, ${majorFlagCount} major.`);

  // Write the updated database
  console.log(`Writing updated database to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(db, null, 2), 'utf8');

  // Write the report
  const report = {
    timestamp: new Date().toISOString(),
    totalProcessed: db.ingredients.length,
    modifiedCount,
    minorFlagCount,
    majorFlagCount,
    modifications: modificationsLog
  };

  console.log(`Writing audit report to ${REPORT_PATH}...`);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  
  console.log('Done!');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
