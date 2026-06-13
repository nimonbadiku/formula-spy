/**
 * benchmark/adversarial/contradictory.ts
 *
 * Contradictory formulas — products whose ingredients actively oppose their claims.
 * These should score low due to contradiction detection.
 */

import type { AdversarialCase } from "./waterOnly";

export const CONTRADICTORY_CASES: readonly AdversarialCase[] = [
  {
    name: "Volume Shampoo with Heavy Oils",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Argan Oil, Shea Butter, Coconut Oil, Castor Oil, Fragrance, Sodium Chloride, Citric Acid",
    trick: "Claims volume but has 4 heavy oils that weigh hair down",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55 due to contradictions",
  },
  {
    name: "Oil-Free Conditioner with Oils",
    category: "rinse_out_conditioner",
    inci: "Water, Cetyl Alcohol, Stearyl Alcohol, Argan Oil, Jojoba Oil, Coconut Oil, Behentrimonium Chloride, Fragrance, Phenoxyethanol, Citric Acid",
    trick: "Implies oil-free but has 3 oils",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55 due to contradictions",
  },
  {
    name: "Silicone-Free Serum with Dimethicone",
    category: "serum",
    inci: "Dimethicone, Cyclomethicone, Phenyl Trimethicone, Fragrance",
    trick: "Implies silicone-free but is 100% silicone",
    expectedFormulaQuality: 40,
    passCondition: "Score must be < 50 due to contradictions",
  },
  {
    name: "Gentle Shampoo with SLS",
    category: "shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Fragrance, Sodium Chloride, Citric Acid, Sodium Benzoate",
    trick: "Claims gentle but uses harsh sulfate",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55 due to contradictions",
  },
  {
    name: "Moisture Shampoo with Drying Alcohol",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Alcohol Denat., Fragrance, Sodium Chloride, Citric Acid, Sodium Benzoate",
    trick: "Claims moisture but has drying alcohol",
    expectedFormulaQuality: 45,
    passCondition: "Score must be < 55 due to contradictions",
  },
  {
    name: "Frizz Control Cream with No Sealants",
    category: "styling_product",
    inci: "Water, Cetyl Alcohol, Fragrance, Phenoxyethanol, Citric Acid",
    trick: "Claims frizz control but has no film formers or silicones",
    expectedFormulaQuality: 25,
    passCondition: "Score must be < 35 due to contradictions",
  },
];
