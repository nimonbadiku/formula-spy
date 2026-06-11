# Error Report — Iteration 8

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 70 |
| Valid runs | 70 |
| Failed runs | 0 |
| Overrated (actual > expected + 10) | 5 (7.1%) |
| Underrated (actual < expected − 10) | 41 (58.6%) |
| Correct (within ±10) | 24 (34.3%) |
| Avg error (actual − expected) | -14.61 |
| Avg absolute error | 17.94 |
| Max overrate | +28.96 |
| Max underrate | -55.61 |
| Stabilized | ❌ NO |

## Error Distribution by Product Category

| Category | Count | Avg Error |
|----------|-------|-----------|
| gentle_shampoo | 8 | -23.85 |
| mask | 8 | -21.41 |
| leave_in | 11 | -21.39 |
| styling_gel | 12 | -15.77 |
| shampoo | 10 | -13.16 |
| co_wash | 7 | -12.26 |
| conditioner | 6 | -5.46 |
| serum | 8 | +1.78 |

## Error Distribution by Hair Type

| Hair Type | Count | Avg Error |
|-----------|-------|-----------|
| 2C | 6 | -22.64 |
| 2B | 5 | -18.45 |
| 1B | 8 | -17.92 |
| 3A | 7 | -17.71 |
| 2A | 7 | -16.5 |
| 1C | 8 | -14.56 |
| 1A | 6 | -13.85 |
| 3C | 6 | -11.97 |
| 3B | 6 | -11.26 |
| 4C | 5 | -9.45 |
| 4A | 2 | -4.3 |
| 4B | 4 | -4.21 |

## Error Distribution by Porosity

| Porosity | Count | Avg Error |
|----------|-------|-----------|
| med | 24 | -17.48 |
| low | 29 | -15.81 |
| high | 17 | -8.5 |

## Top Overrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_043 | 44 | 73.0 | +29.0 | Clarifying Shampoo #43 | 3C |
| case_008 | 68 | 94.2 | +26.2 | Curl Defining Gel #8 | 4B |
| case_049 | 56 | 73.2 | +17.2 | Deep Conditioning Mask #49 | 4C |
| case_001 | 47 | 59.5 | +12.5 | Everyday Conditioner #1 | 2A |
| case_068 | 59 | 69.0 | +10.0 | Clarifying Shampoo #68 | 4C |

## Top Underrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_059 | 70 | 14.4 | -55.6 | Leave-In Conditioner #59 | 1B |
| case_018 | 78 | 30.6 | -47.4 | Moisturizing Conditioner #18 | 3A |
| case_066 | 86 | 45.0 | -41.0 | Shine Serum #66 | 2A |
| case_062 | 62 | 23.9 | -38.0 | Repair Shampoo #62 | 3C |
| case_021 | 61 | 23.0 | -38.0 | Co-Wash #21 | 4C |
| case_024 | 74 | 38.1 | -35.9 | Clarifying Shampoo #24 | 3A |
| case_003 | 58 | 22.9 | -35.1 | Moisture Mask #3 | 1C |
| case_036 | 62 | 26.9 | -35.1 | Hair Serum #36 | 2A |
| case_026 | 70 | 35.6 | -34.4 | Everyday Conditioner #26 | 3C |
| case_040 | 53 | 19.5 | -33.5 | Everyday Conditioner #40 | 2C |
| case_050 | 64 | 30.8 | -33.2 | Growth Serum #50 | 4C |
| case_053 | 60 | 27.2 | -32.8 | Moisturizing Conditioner #53 | 2C |
| case_037 | 56 | 23.3 | -32.7 | Clarifying Shampoo #37 | 2B |
| case_019 | 58 | 26.4 | -31.6 | Everyday Conditioner #19 | 1B |
| case_015 | 54 | 26.4 | -27.6 | Repair Conditioner #15 | 1B |

## Failed Cases

_No failures._