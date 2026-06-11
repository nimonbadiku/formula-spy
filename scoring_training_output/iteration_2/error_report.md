# Error Report — Iteration 2

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 70 |
| Valid runs | 70 |
| Failed runs | 0 |
| Overrated (actual > expected + 10) | 6 (8.6%) |
| Underrated (actual < expected − 10) | 42 (60.0%) |
| Correct (within ±10) | 22 (31.4%) |
| Avg error (actual − expected) | -12.9 |
| Avg absolute error | 16.7 |
| Max overrate | +26.46 |
| Max underrate | -56.9 |
| Stabilized | ❌ NO |

## Error Distribution by Product Category

| Category | Count | Avg Error |
|----------|-------|-----------|
| co_wash | 8 | -19.54 |
| shampoo | 10 | -15.63 |
| leave_in | 10 | -15.48 |
| gentle_shampoo | 10 | -15.24 |
| mask | 6 | -14.1 |
| conditioner | 9 | -12.01 |
| styling_gel | 8 | -6.41 |
| serum | 9 | -4.39 |

## Error Distribution by Hair Type

| Hair Type | Count | Avg Error |
|-----------|-------|-----------|
| 2B | 6 | -22.96 |
| 1C | 4 | -21.62 |
| 3A | 5 | -20.78 |
| 2C | 6 | -17.71 |
| 3C | 7 | -14.56 |
| 2A | 8 | -13.66 |
| 1A | 8 | -13.25 |
| 3B | 5 | -10.33 |
| 4B | 7 | -10.31 |
| 1B | 4 | -9.35 |
| 4C | 7 | +1.62 |
| 4A | 3 | -0.59 |

## Error Distribution by Porosity

| Porosity | Count | Avg Error |
|----------|-------|-----------|
| med | 22 | -18.16 |
| low | 24 | -14.13 |
| high | 24 | -6.86 |

## Top Overrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_015 | 52 | 78.5 | +26.5 | Repair Shampoo #15 | 4C |
| case_042 | 49 | 74.4 | +25.4 | Repair Shampoo #42 | 4C |
| case_067 | 56 | 79.7 | +23.7 | Moisture Mask #67 | 3C |
| case_002 | 30 | 44.8 | +14.8 | Curl Defining Gel #2 | 1A |
| case_022 | 76 | 88.6 | +12.6 | Moisture Mask #22 | 4B |
| case_025 | 54 | 64.9 | +10.9 | Conditioning Co-Wash #25 | 3B |

## Top Underrated Cases

| Case ID | Expected | Actual | Error | Product | Hair Type |
|---------|----------|--------|-------|---------|-----------|
| case_069 | 90 | 33.1 | -56.9 | Clarifying Shampoo #69 | 3C |
| case_039 | 63 | 21.6 | -41.4 | Clarifying Shampoo #39 | 2B |
| case_023 | 62 | 21.8 | -40.2 | Everyday Conditioner #23 | 2C |
| case_027 | 62 | 24.4 | -37.6 | Moisturizing Shampoo #27 | 1A |
| case_036 | 58 | 21.7 | -36.3 | Protein Mask #36 | 1C |
| case_033 | 88 | 57.2 | -30.8 | Everyday Conditioner #33 | 4B |
| case_070 | 62 | 35.0 | -27.0 | Co-Wash #70 | 3A |
| case_058 | 54 | 27.1 | -26.9 | Leave-In Conditioner #58 | 3A |
| case_043 | 58 | 31.5 | -26.5 | Protein Mask #43 | 2A |
| case_045 | 61 | 34.5 | -26.5 | Styling Cream #45 | 2A |
| case_020 | 82 | 55.7 | -26.3 | Leave-In Conditioner #20 | 2B |
| case_055 | 74 | 48.9 | -25.1 | Moisturizing Shampoo #55 | 3A |
| case_048 | 58 | 33.0 | -25.0 | Leave-In Cream #48 | 1A |
| case_064 | 71 | 46.5 | -24.5 | Leave-In Cream #64 | 2B |
| case_011 | 58 | 33.8 | -24.2 | Curl Defining Gel #11 | 3B |

## Failed Cases

_No failures._