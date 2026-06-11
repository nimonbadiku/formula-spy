# Proposed Scoring Fixes — Iteration 10

Generated from 4 diagnosed error pattern(s).
Avg absolute error entering this iteration: **19.01**

## protein_overrating (proteinBalance.ts)
**Severity:** medium | **Affected cases:** 4 | **Avg error:** +10.79

**Diagnosis:** 4 protein-containing products scored 10.8 points above expected on average. Protein bonus modifiers (DAMAGED_PROTEIN_BONUS, PROTEIN_HUMECTANT_SYNERGY_BONUS) may be too generous or the stacking penalty (PROTEIN_STACK_PENALTY) too weak.

**Proposed fix:** Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS from 1.06 to 1.04.

**Applied changes:**
- ✅ `proteinBalance.ts`: Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS: 1.06 → 1.04 (status: applied)

## harsh_surfactant_underrating (cleanserHarshness.ts)
**Severity:** high | **Affected cases:** 6 | **Avg error:** -27.96

**Diagnosis:** 6 shampoos with harsh surfactants scored 28.0 points below expected. STRONG_DRY_SCALP_PENALTY (0.78) or STRONG_DAMAGED_PENALTY (0.82) may be too harsh, reducing even oily-hair profiles unnecessarily.

**Proposed fix:** Raise STRONG_DRY_SCALP_PENALTY from 0.78 to 0.84. Raise STRONG_DAMAGED_PENALTY from 0.82 to 0.87.

**Applied changes:**
- ✅ `cleanserHarshness.ts`: Raise STRONG_DRY_SCALP_PENALTY: 0.78 → 0.84 (status: applied)
- ✅ `cleanserHarshness.ts`: Raise STRONG_DAMAGED_PENALTY: 0.82 → 0.87 (status: applied)

## low_porosity_silicone_underrating (advancedProfileModifiers.ts / molecularWeightHeuristics.ts)
**Severity:** high | **Affected cases:** 7 | **Avg error:** -31.12

**Diagnosis:** 7 low-porosity profiles with silicones scored 31.1 points below expected. Low-porosity penalty for silicones may be stacking excessively (molecular weight + buildup + advanced profile = triple penalty).

**Proposed fix:** The MULTI_PENALTY_FLOOR=0.35 in scoreFormulation.ts should catch this. If still underrating, raise MULTI_PENALTY_FLOOR from 0.35 to 0.40 for Silicone category.

**Applied changes:**
- ✅ `scoreFormulation.ts`: Raise MULTI_PENALTY_FLOOR: 0.35 → 0.40 for Silicone category (status: applied)

## scalp_sensitivity_overpenalty (advancedProfileModifiers.ts / cleanserHarshness.ts)
**Severity:** low | **Affected cases:** 13 | **Avg error:** -29.23

**Diagnosis:** 13 sensitive-scalp profiles underrated by 29.2 pts. Scalp sensitivity may be stacking with cleanser harshness penalties.

**Proposed fix:** Ensure MILD_SENSITIVE_SCALP_BONUS (1.08) in cleanserHarshness.ts is actually offsetting the scalp sensitivity penalty from advancedProfileModifiers.ts. Consider adding an explicit cap: max combined scalp penalty = ×0.75.

---
_All changes applied only to copies in `modified_files/`. Original scoring files unchanged._