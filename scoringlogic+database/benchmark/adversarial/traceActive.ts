/**
 * benchmark/adversarial/traceActive.ts
 *
 * Trace-active formulas — products with active ingredients at negligible concentrations.
 * These should not score high because the actives are below the 1% line.
 */

import type { AdversarialCase } from "./waterOnly";

export const TRACE_ACTIVE_CASES: readonly AdversarialCase[] = [
  {
    name: "Bond Repair with Trace Active",
    category: "treatment",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance, Bis-Aminopropyl Diglycol Dimaleate, Phenoxyethanol, Citric Acid",
    trick: "Bond repair ingredient at position #6 (below 1% line)",
    expectedFormulaQuality: 40,
    passCondition: "Score must be < 50",
  },
  {
    name: "Protein Treatment with Trace Protein",
    category: "treatment",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance, Hydrolyzed Keratin, Phenoxyethanol, Citric Acid",
    trick: "Protein at position #6 (below 1% line)",
    expectedFormulaQuality: 40,
    passCondition: "Score must be < 50",
  },
  {
    name: "Scalp Treatment with Trace Active",
    category: "treatment",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance, Salicylic Acid, Phenoxyethanol, Citric Acid",
    trick: "Salicylic acid at position #6 (below 1% line)",
    expectedFormulaQuality: 40,
    passCondition: "Score must be < 50",
  },
  {
    name: "Moisture Shampoo with Trace Humectant",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance, Glycerin, Citric Acid, Sodium Benzoate",
    trick: "Glycerin at position #6 (below 1% line)",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55",
  },
  {
    name: "Repair Mask with Trace Protein",
    category: "deep_conditioner_mask",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Fragrance, Hydrolyzed Rice Protein, Phenoxyethanol, Citric Acid",
    trick: "Protein at position #7 (well below 1% line)",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55",
  },
  {
    name: "Volume Shampoo with Trace Volumizer",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance, Polyquaternium-10, Citric Acid, Sodium Benzoate",
    trick: "Polyquaternium-10 at position #6 (below 1% line)",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55",
  },
];
