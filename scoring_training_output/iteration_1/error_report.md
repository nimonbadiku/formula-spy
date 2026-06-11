# Error Report — Iteration 1

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 70 |
| Valid runs | 70 |
| Failed runs | 0 |
| Overrated (actual > expected + 10) | 3 (4.3%) |
| Underrated (actual < expected − 10) | 43 (61.4%) |
| Correct (within ±10) | 24 (34.3%) |
| Avg error (actual − expected) | -16.31 |
| Avg absolute error | 18.45 |
| Max overrate | +13.74 |
| Max underrate | -53.03 |
| Stabilized | ❌ NO |

## Error Distribution by Product Category

| Category | Count | Avg Error |
|----------|-------|-----------|
| mask | 8 | -28.81 |
| shampoo | 10 | -19.93 |
| conditioner | 7 | -17.12 |
| co_wash | 11 | -15.4 |
| serum | 8 | -13.91 |
| gentle_shampoo | 7 | -12.99 |
| styling_gel | 8 | -12.3 |
| leave_in | 11 | -11.12 |

## Error Distribution by Hair Type

| Hair Type | Count | Avg Error |
|-----------|-------|-----------|
| 2B | 5 | -27.06 |
| 4A | 5 | -24.71 |
| 3B | 7 | -21.02 |
| 1B | 3 | -17.67 |
| 1C | 7 | -16.91 |
| 1A | 5 | -16.91 |
| 2A | 8 | -16.14 |
| 4B | 4 | -15.51 |
| 2C | 5 | -14.07 |
| 4C | 5 | -12.79 |
| 3C | 6 | -11.95 |
| 3A | 10 | -8.27 |

## Error Distribution by Porosity

| Porosity | Count | Avg Error |
|----------|-------|-----------|
| low | 23 | -16.74 |
| med | 27 | -16.13 |
| high | 20 | -16.06 |

## Top Overrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_038 | 53 | 66.7 | +13.7 | Clarifying Shampoo #38 | 1A |
| case_062 | 40 | 51.2 | +11.2 | Leave-In Cream #62 | 3B |
| case_015 | 66 | 76.1 | +10.1 | Leave-In Cream #15 | 3A |

## Top Underrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_027 | 89 | 36.0 | -53.0 | Leave-In Conditioner #27 | 1B |
| case_018 | 76 | 32.3 | -43.7 | Moisture Mask #18 | 1A |
| case_004 | 82 | 38.9 | -43.1 | Protein Mask #4 | 3B |
| case_032 | 66 | 24.4 | -41.5 | Repair Shampoo #32 | 4B |
| case_029 | 68 | 27.2 | -40.8 | Moisture Mask #29 | 4C |
| case_048 | 88 | 48.5 | -39.5 | Repair Conditioner #48 | 4A |
| case_068 | 80 | 41.1 | -38.9 | Moisturizing Shampoo #68 | 3A |
| case_063 | 55 | 18.4 | -36.6 | Everyday Conditioner #63 | 1C |
| case_002 | 73 | 37.1 | -35.9 | Moisturizing Shampoo #2 | 2B |
| case_035 | 64 | 29.6 | -34.4 | Hair Serum #35 | 4A |
| case_069 | 64 | 30.4 | -33.6 | Protein Mask #69 | 2A |
| case_025 | 57 | 23.6 | -33.4 | Growth Serum #25 | 3B |
| case_057 | 50 | 17.1 | -32.9 | Edge Control Gel #57 | 1A |
| case_060 | 58 | 26.2 | -31.8 | Hair Serum #60 | 1C |
| case_054 | 62 | 31.7 | -30.3 | Repair Conditioner #54 | 2B |

## Failed Cases

_No failures._