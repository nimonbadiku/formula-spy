/**
 * benchmark/adversarial/waterOnly.ts
 *
 * Water-only formulas — the simplest adversarial cases.
 * These should score very low on formula quality.
 */

export interface AdversarialCase {
  readonly name: string;
  readonly category: string;
  readonly inci: string;
  readonly trick: string;
  readonly expectedFormulaQuality: number; // max expected score
  readonly passCondition: string;
}

export const WATER_ONLY_CASES: readonly AdversarialCase[] = [
  {
    name: "Water-Only Shampoo",
    category: "shampoo",
    inci: "Water",
    trick: "Pure water marketed as shampoo",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Conditioner",
    category: "rinse_out_conditioner",
    inci: "Water",
    trick: "Pure water marketed as conditioner",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Serum",
    category: "serum",
    inci: "Water",
    trick: "Pure water marketed as serum",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Treatment",
    category: "treatment",
    inci: "Water",
    trick: "Pure water marketed as treatment",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Mask",
    category: "deep_conditioner_mask",
    inci: "Water",
    trick: "Pure water marketed as mask",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Leave-In",
    category: "leave_in_conditioner",
    inci: "Water",
    trick: "Pure water marketed as leave-in",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Styler",
    category: "styling_product",
    inci: "Water",
    trick: "Pure water marketed as styler",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
  {
    name: "Water-Only Co-Wash",
    category: "co_wash",
    inci: "Water",
    trick: "Pure water marketed as co-wash",
    expectedFormulaQuality: 15,
    passCondition: "Score must be < 20",
  },
];
