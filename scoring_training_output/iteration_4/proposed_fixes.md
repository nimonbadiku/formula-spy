# Proposed Scoring Fixes — Iteration 4

Generated from 4 diagnosed error pattern(s).
Avg absolute error entering this iteration: **18.61**

## harsh_surfactant_underrating (cleanserHarshness.ts)
**Severity:** high | **Affected cases:** 6 | **Avg error:** -28.75

**Diagnosis:** 6 shampoos with harsh surfactants scored 28.8 points below expected. STRONG_DRY_SCALP_PENALTY (0.78) or STRONG_DAMAGED_PENALTY (0.82) may be too harsh, reducing even oily-hair profiles unnecessarily.

**Proposed fix:** Raise STRONG_DRY_SCALP_PENALTY from 0.78 to 0.84. Raise STRONG_DAMAGED_PENALTY from 0.82 to 0.87.

**Applied changes:**
- ✅ `cleanserHarshness.ts`: Raise STRONG_DRY_SCALP_PENALTY: 0.78 → 0.84 (status: applied)
- ✅ `cleanserHarshness.ts`: Raise STRONG_DAMAGED_PENALTY: 0.82 → 0.87 (status: applied)

## silicone_overrating (builtupAnalysis.ts)
**Severity:** medium | **Affected cases:** 2 | **Avg error:** +12.39

**Diagnosis:** 2 silicone-heavy products scored 12.4 points above expected. Buildup risk penalties for heavy silicones may be insufficient for curly/coily profiles.

**Proposed fix:** In builtupAnalysis.ts: increase buildup score weight for 'Silicone' category ingredients on curlPattern=curly/coily profiles. Consider adding a 0.90 multiplier for 2+ silicones.

**Applied changes:**
- 📋 `builtupAnalysis.ts`: Increase buildup risk for silicones — lower BUILDUP_SILICONE_WEIGHT if present, otherwise documented (status: documented_only)
  - _Note: builtupAnalysis.ts: Add profile-aware multiplier for 2+ silicones on curly/coily hair. Suggested: when curlPattern is curly or coily and siliconeCount >= 2, apply ×0.90 to formulationScore._

## low_porosity_silicone_underrating (advancedProfileModifiers.ts / molecularWeightHeuristics.ts)
**Severity:** high | **Affected cases:** 5 | **Avg error:** -20.59

**Diagnosis:** 5 low-porosity profiles with silicones scored 20.6 points below expected. Low-porosity penalty for silicones may be stacking excessively (molecular weight + buildup + advanced profile = triple penalty).

**Proposed fix:** The MULTI_PENALTY_FLOOR=0.35 in scoreFormulation.ts should catch this. If still underrating, raise MULTI_PENALTY_FLOOR from 0.35 to 0.40 for Silicone category.

**Applied changes:**
- ✅ `scoreFormulation.ts`: Raise MULTI_PENALTY_FLOOR: 0.35 → 0.40 for Silicone category (status: applied)

## scalp_sensitivity_overpenalty (advancedProfileModifiers.ts / cleanserHarshness.ts)
**Severity:** low | **Affected cases:** 16 | **Avg error:** -25.74

**Diagnosis:** 16 sensitive-scalp profiles underrated by 25.7 pts. Scalp sensitivity may be stacking with cleanser harshness penalties.

**Proposed fix:** Ensure MILD_SENSITIVE_SCALP_BONUS (1.08) in cleanserHarshness.ts is actually offsetting the scalp sensitivity penalty from advancedProfileModifiers.ts. Consider adding an explicit cap: max combined scalp penalty = ×0.75.

---
_All changes applied only to copies in `modified_files/`. Original scoring files unchanged._