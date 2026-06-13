# V2 Benchmark Diagnostic Report

**Total cases scored:** 5000
**Iterations:** 1
**Date:** 2026-06-13T00:14:12.357Z

## 1. Score Distribution

| Bucket | Count | Percentage | Flag |
|--------|-------|------------|------|
| 0–9 | 332 | 6.6% |  |
| 10–19 | 554 | 11.1% |  |
| 20–29 | 504 | 10.1% |  |
| 30–39 | 281 | 5.6% |  |
| 40–49 | 220 | 4.4% |  |
| 50–59 | 435 | 8.7% |  |
| 60–69 | 683 | 13.7% |  |
| 70–79 | 730 | 14.6% |  |
| 80–89 | 494 | 9.9% |  |
| 90–100 | 452 | 9.0% |  |

## 2. Final Error Counts vs Thresholds

| Category | Count | Threshold | Status |
|----------|-------|-----------|--------|
| Hard sensitivity failures | 0 | <20 | ✅ PASS |
| Stacked sensitivity failures | 0 | <15 | ✅ PASS |
| Scalp oiliness blind spots | 19 | <30 | ✅ PASS |
| Strand thickness blind spots | 29 | <30 | ✅ PASS |
| Serum under-scoring | 0 | <10 | ✅ PASS |
| Treatment over-scoring (protein sensitive) | 0 | <10 | ✅ PASS |

## 3. Rule Strengthening Across Iterations

| Iteration | Rules Changed | Adjustments |
|-----------|---------------|-------------|
| 1 (initial) | Baseline | Applied 7 rules |

## 4. Top 3 Remaining Edge Case Risks

**Found 5 edge cases near thresholds:**

- C02242: coily, low porosity, coarse strand, normal, dry scalp, brittle, lacks_definition, goal: frizz_control, sensitive scalp + Lightweight Serum → 39.79
- C02808: curly, med porosity, coarse strand, damaged, normal scalp, lacks_definition, frizzy, goal: scalp_health, sensitive scalp + Lightweight Serum → 39.77
- C03164: curly, low porosity, coarse strand, healthy, dry scalp, tangled, lacks_definition, goal: frizz_control, sensitive scalp + Lightweight Serum → 37.73
- C03178: curly, med porosity, coarse strand, damaged, oily scalp, frizzy, limp, goal: volume, sensitive scalp + Lightweight Serum → 35.7
- C04032: coily, low porosity, coarse strand, damaged, oily scalp, dull, brittle, limp, goal: definition, sensitive scalp + protein sensitive + chemically treated + Lightweight Serum → 35.59

## 5. Final Recommended Scoring Weight Table

| Rule | Condition | Adjustment | Notes |
|------|-----------|------------|-------|
| Rule 1 | Hard sensitivity conflict | ×0.4 multiplier, cap at 40 | Protein/Silicone/Sulfate conflicts |
| Rule 2 | Each stacked conflict beyond 1st | -10 per conflict | Additive after base, before Rule 1 |
| Rule 3a | Fine strand + heavy butter/oil (excl. serums) | ×0.3 multiplier | Weight mismatch |
| Rule 3b | Coarse strand + lightweight (excl. serums) | ×0.4 multiplier | Insufficient conditioning |
| Rule 4a | Oily scalp + moisturising shampoo/co-wash | -35 | Scalp product mismatch |
| Rule 4b | Dry scalp + clarifying/sulfate shampoo | -38 | Scalp stripping risk |
| Rule 5 | Low porosity + silicone/butter | ×1.5 buildup penalty (-8 effective) | Amplified buildup |
| Rule 6a | Natural oil serum + high porosity/coarse | +45 | Beneficial seal |
| Rule 6b | Natural oil serum + med porosity/thickness | +35 | Moderate seal benefit |
| Rule 6c | Natural oil serum + other profiles | +25 | Baseline serum benefit |
| Rule 6d | Protein/bond treatment + protein sensitive | Cap at 35 | Hard conflict |
| Rule 7a | Moisture goal + drying alcohol | -8 | Goal conflict |
| Rule 7b | Volume goal + heavy butters | -10 | Goal conflict |
| Rule 7c | Damage repair + no protein/bond/ceramide | -10 | Goal unmet |
| Rule 7d | Scalp health + fragrance | -8 | Irritant risk |
| Rule 7e | Growth + buildup ingredients | -8 | Follicle clogging |
| Rule 7f | Frizz control + no humectant/sealant | -8 | Ineffective formula |
| Bonus | Moisture goal + humectant + emollient | +5 | Goal served |
| Bonus | Damage repair + protein/bond builder | +8 | Goal served |
| Bonus | Scalp health + active ingredients | +7 | Goal served |

## Summary Statistics

- **Average score:** 53.4
- **Median score:** 60.8
- **Min score:** 0
- **Max score:** 100
- **Error cases:** 0