# Error Report — Iteration 4

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 70 |
| Valid runs | 70 |
| Failed runs | 0 |
| Overrated (actual > expected + 10) | 3 (4.3%) |
| Underrated (actual < expected − 10) | 50 (71.4%) |
| Correct (within ±10) | 17 (24.3%) |
| Avg error (actual − expected) | -17.24 |
| Avg absolute error | 18.61 |
| Max overrate | +13.77 |
| Max underrate | -53.27 |
| Stabilized | ❌ NO |

## Error Distribution by Product Category

| Category | Count | Avg Error |
|----------|-------|-----------|
| mask | 10 | -25.34 |
| shampoo | 9 | -19.58 |
| styling_gel | 5 | -19.45 |
| conditioner | 9 | -19.04 |
| co_wash | 7 | -17.81 |
| leave_in | 10 | -16.88 |
| gentle_shampoo | 11 | -14.36 |
| serum | 9 | -6.39 |

## Error Distribution by Hair Type

| Hair Type | Count | Avg Error |
|-----------|-------|-----------|
| 4C | 8 | -24.59 |
| 1B | 3 | -21.8 |
| 2A | 3 | -20.95 |
| 2C | 4 | -20.36 |
| 4A | 9 | -17.75 |
| 3A | 7 | -17.58 |
| 2B | 8 | -16.86 |
| 4B | 5 | -16.62 |
| 3C | 9 | -16.19 |
| 1C | 2 | -15.23 |
| 1A | 7 | -12.06 |
| 3B | 5 | -7.86 |

## Error Distribution by Porosity

| Porosity | Count | Avg Error |
|----------|-------|-----------|
| high | 31 | -18.88 |
| low | 15 | -16.21 |
| med | 24 | -15.78 |

## Top Overrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_015 | 48 | 61.8 | +13.8 | Everyday Conditioner #15 | 3B |
| case_060 | 61 | 74.0 | +13.0 | Deep Conditioning Mask #60 | 3C |
| case_041 | 38 | 49.0 | +11.0 | Shine Serum #41 | 1A |

## Top Underrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_006 | 94 | 40.7 | -53.3 | Moisture Mask #6 | 3C |
| case_050 | 76 | 37.1 | -38.9 | Edge Control Gel #50 | 4C |
| case_068 | 60 | 21.8 | -38.2 | Edge Control Gel #68 | 4C |
| case_062 | 70 | 32.5 | -37.5 | Repair Shampoo #62 | 3C |
| case_010 | 67 | 30.9 | -36.1 | Edge Control Gel #10 | 1B |
| case_025 | 72 | 37.4 | -34.6 | Repair Conditioner #25 | 2B |
| case_055 | 51 | 16.7 | -34.3 | Shine Serum #55 | 3C |
| case_020 | 68 | 34.3 | -33.8 | Moisturizing Conditioner #20 | 3A |
| case_013 | 68 | 35.9 | -32.1 | Edge Control Gel #13 | 4A |
| case_021 | 59 | 28.0 | -31.0 | Everyday Conditioner #21 | 4C |
| case_065 | 64 | 33.0 | -31.0 | Growth Serum #65 | 2A |
| case_014 | 59 | 28.3 | -30.7 | Shine Serum #14 | 2B |
| case_026 | 55 | 24.5 | -30.5 | Moisture Mask #26 | 1A |
| case_052 | 74 | 47.8 | -26.2 | Leave-In Cream #52 | 4A |
| case_070 | 69 | 43.5 | -25.5 | Moisturizing Conditioner #70 | 4C |

## Failed Cases

_No failures._