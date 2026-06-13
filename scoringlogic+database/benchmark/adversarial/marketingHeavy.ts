/**
 * benchmark/adversarial/marketingHeavy.ts
 *
 * Marketing-heavy formulas — products with impressive names but weak formulations.
 * These should not score high despite avoiding conflicts.
 */

import type { AdversarialCase } from "./waterOnly";

export const MARKETING_HEAVY_CASES: readonly AdversarialCase[] = [
  {
    name: "Luxury Repair Serum",
    brand: "FakeBrand",
    category: "serum",
    inci: "Water, Glycerin, Fragrance, Phenoxyethanol, Citric Acid",
    trick: "Claims luxury repair but has no repair ingredients",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
  {
    name: "Professional Strengthening Treatment",
    brand: "FakeBrand",
    category: "treatment",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Fragrance, Phenoxyethanol, Citric Acid",
    trick: "Claims strengthening but has no protein or bond builder",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
  {
    name: "Salon-Quality Moisturizer",
    brand: "FakeBrand",
    category: "leave_in_conditioner",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Fragrance, Sodium Chloride, Citric Acid",
    trick: "Claims moisture but is actually a shampoo base",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
  {
    name: "Advanced Bond Repair Complex",
    brand: "FakeBrand",
    category: "treatment",
    inci: "Water, Glycerin, Hydrolyzed Wheat Protein (0.01%), Fragrance, Phenoxyethanol",
    trick: "Claims bond repair but has trace protein and no bond builder",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
  {
    name: "Premium Scalp Therapy",
    brand: "FakeBrand",
    category: "treatment",
    inci: "Water, Alcohol Denat., Fragrance, Menthol, Phenoxyethanol",
    trick: "Claims scalp therapy but has drying alcohol and no scalp actives",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
  {
    name: "Intensive Hydration Mask",
    brand: "FakeBrand",
    category: "deep_conditioner_mask",
    inci: "Water, Cetyl Alcohol, Fragrance, Phenoxyethanol, Citric Acid",
    trick: "Claims intensive hydration but has no humectants or oils",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
  {
    name: "Volume Boost Shampoo",
    brand: "FakeBrand",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Coconut Oil, Shea Butter, Fragrance, Sodium Chloride, Citric Acid",
    trick: "Claims volume but has heavy oils that weigh hair down",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55",
  },
  {
    name: "Anti-Frizz Smoothing Cream",
    brand: "FakeBrand",
    category: "styling_product",
    inci: "Water, Cetyl Alcohol, Fragrance, Phenoxyethanol, Citric Acid",
    trick: "Claims anti-frizz but has no film formers or silicones",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 25",
  },
];
