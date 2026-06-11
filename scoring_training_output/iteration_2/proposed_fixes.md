# Proposed Scoring Fixes — Iteration 2

Generated from 5 diagnosed error pattern(s).
Avg absolute error entering this iteration: **16.7**

## protein_overrating (proteinBalance.ts)
**Severity:** high | **Affected cases:** 4 | **Avg error:** +18.85

**Diagnosis:** 4 protein-containing products scored 18.8 points above expected on average. Protein bonus modifiers (DAMAGED_PROTEIN_BONUS, PROTEIN_HUMECTANT_SYNERGY_BONUS) may be too generous or the stacking penalty (PROTEIN_STACK_PENALTY) too weak.

**Proposed fix:** Reduce DAMAGED_PROTEIN_BONUS from 1.20 to 1.12. Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS from 1.06 to 1.03.

**Applied changes:**
- ✅ `proteinBalance.ts`: Reduce DAMAGED_PROTEIN_BONUS: 1.20 → 1.12 (status: applied)
- ✅ `proteinBalance.ts`: Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS: 1.06 → 1.03 (status: applied)

## harsh_surfactant_underrating (cleanserHarshness.ts)
**Severity:** high | **Affected cases:** 6 | **Avg error:** -26.87

**Diagnosis:** 6 shampoos with harsh surfactants scored 26.9 points below expected. STRONG_DRY_SCALP_PENALTY (0.78) or STRONG_DAMAGED_PENALTY (0.82) may be too harsh, reducing even oily-hair profiles unnecessarily.

**Proposed fix:** Raise STRONG_DRY_SCALP_PENALTY from 0.78 to 0.84. Raise STRONG_DAMAGED_PENALTY from 0.82 to 0.87.

**Applied changes:**
- ✅ `cleanserHarshness.ts`: Raise STRONG_DRY_SCALP_PENALTY: 0.78 → 0.84 (status: applied)
- ✅ `cleanserHarshness.ts`: Raise STRONG_DAMAGED_PENALTY: 0.82 → 0.87 (status: applied)

## silicone_overrating (builtupAnalysis.ts)
**Severity:** high | **Affected cases:** 2 | **Avg error:** +19.24

**Diagnosis:** 2 silicone-heavy products scored 19.2 points above expected. Buildup risk penalties for heavy silicones may be insufficient for curly/coily profiles.

**Proposed fix:** In builtupAnalysis.ts: increase buildup score weight for 'Silicone' category ingredients on curlPattern=curly/coily profiles. Consider adding a 0.90 multiplier for 2+ silicones.

**Applied changes:**
- 📋 `builtupAnalysis.ts`: Increase buildup risk for silicones — lower BUILDUP_SILICONE_WEIGHT if present, otherwise documented (status: documented_only)
  - _Note: builtupAnalysis.ts: Add profile-aware multiplier for 2+ silicones on curly/coily hair. Suggested: when curlPattern is curly or coily and siliconeCount >= 2, apply ×0.90 to formulationScore._

## low_porosity_silicone_underrating (advancedProfileModifiers.ts / molecularWeightHeuristics.ts)
**Severity:** high | **Affected cases:** 5 | **Avg error:** -23.27

**Diagnosis:** 5 low-porosity profiles with silicones scored 23.3 points below expected. Low-porosity penalty for silicones may be stacking excessively (molecular weight + buildup + advanced profile = triple penalty).

**Proposed fix:** The MULTI_PENALTY_FLOOR=0.35 in scoreFormulation.ts should catch this. If still underrating, raise MULTI_PENALTY_FLOOR from 0.35 to 0.40 for Silicone category.

**Applied changes:**
- ✅ `scoreFormulation.ts`: Raise MULTI_PENALTY_FLOOR: 0.35 → 0.40 for Silicone category (status: applied)

## scalp_sensitivity_overpenalty (advancedProfileModifiers.ts / cleanserHarshness.ts)
**Severity:** low | **Affected cases:** 15 | **Avg error:** -23.78

**Diagnosis:** 15 sensitive-scalp profiles underrated by 23.8 pts. Scalp sensitivity may be stacking with cleanser harshness penalties.

**Proposed fix:** Ensure MILD_SENSITIVE_SCALP_BONUS (1.08) in cleanserHarshness.ts is actually offsetting the scalp sensitivity penalty from advancedProfileModifiers.ts. Consider adding an explicit cap: max combined scalp penalty = ×0.75.

---
_All changes applied only to copies in `modified_files/`. Original scoring files unchanged._