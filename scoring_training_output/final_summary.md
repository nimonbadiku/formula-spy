# Scoring Engine Training — Final Summary

**Completed:** 2026-06-11T01:02:33.355Z
**Total iterations run:** 10

## Convergence Table

| Iteration | Avg Abs Error | Overrated | Underrated | Correct % | Stabilized |
|-----------|--------------|-----------|------------|-----------|------------|
| 1 | 18.45 | 3 | 43 | 34.3% | ❌ |
| 2 | 16.7 | 6 | 42 | 31.4% | ❌ |
| 3 | 19.24 | 0 | 55 | 21.4% | ❌ |
| 4 | 18.61 | 3 | 50 | 24.3% | ❌ |
| 5 | 19.5 | 1 | 52 | 24.3% | ❌ |
| 6 | 20.6 | 1 | 49 | 28.6% | ❌ |
| 7 | 18.97 | 3 | 45 | 31.4% | ❌ |
| 8 | 17.94 | 5 | 41 | 34.3% | ❌ |
| 9 | 19.75 | 2 | 53 | 21.4% | ❌ |
| 10 | 19.01 | 4 | 45 | 30.0% | ❌ |

## Final Iteration Results

- Avg absolute error: **19.01**
- Avg error (bias): **-17.32**
- Overrated: **4** (5.7%)
- Underrated: **45** (64.3%)
- Correct: **21** (30.0%)
- Stabilized: **NO ❌**

## Root Cause Summary

- **protein_overrating** (proteinBalance.ts): 4 cases, avg error +10.79 — medium severity
- **harsh_surfactant_underrating** (cleanserHarshness.ts): 6 cases, avg error -27.96 — high severity
- **low_porosity_silicone_underrating** (advancedProfileModifiers.ts / molecularWeightHeuristics.ts): 7 cases, avg error -31.12 — high severity
- **scalp_sensitivity_overpenalty** (advancedProfileModifiers.ts / cleanserHarshness.ts): 13 cases, avg error -29.23 — low severity

## Scoring Modules Requiring Attention

- `proteinBalance.ts`: Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS from 1.06 to 1.04.
- `cleanserHarshness.ts`: Raise STRONG_DRY_SCALP_PENALTY from 0.78 to 0.84. Raise STRONG_DAMAGED_PENALTY from 0.82 to 0.87.
- `advancedProfileModifiers.ts / molecularWeightHeuristics.ts`: The MULTI_PENALTY_FLOOR=0.35 in scoreFormulation.ts should catch this. If still underrating, raise MULTI_PENALTY_FLOOR from 0.35 to 0.40 for Silicone category.
- `advancedProfileModifiers.ts / cleanserHarshness.ts`: Ensure MILD_SENSITIVE_SCALP_BONUS (1.08) in cleanserHarshness.ts is actually offsetting the scalp sensitivity penalty from advancedProfileModifiers.ts. Consider adding an explicit cap: max combined scalp penalty = ×0.75.

## Files in This Output

- `final_dataset.json` — Complete test dataset from final iteration
- `final_engine_results.json` — Engine scores from final iteration
- `final_error_report.md` — Detailed error analysis from final iteration
- `iteration_N/` — Per-iteration outputs (dataset, results, report, diagnosis, fixes, modified_files/)

---
_Training stopped because: maximum iterations (10) reached_