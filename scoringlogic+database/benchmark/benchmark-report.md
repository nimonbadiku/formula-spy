# Benchmark Diagnostic Report

**Total cases scored:** 2500
**Date:** 2026-06-12T22:59:00.530Z

## 1. Score Distribution

| Bucket | Count | Percentage | Flag |
|--------|-------|------------|------|
| 0–9 | 1 | 0.0% |  |
| 10–19 | 157 | 6.3% |  |
| 20–29 | 67 | 2.7% |  |
| 30–39 | 35 | 1.4% |  |
| 40–49 | 127 | 5.1% |  |
| 50–59 | 206 | 8.2% |  |
| 60–69 | 402 | 16.1% |  |
| 70–79 | 545 | 21.8% |  |
| 80–89 | 334 | 13.4% |  |
| 90–100 | 459 | 18.4% |  |

## 2. Hard Sensitivity Failures

Cases where a hard sensitivity scored >45 despite a direct ingredient conflict:

**Found 192 failures:**

- **C1001** (wavy, low porosity, fine strand, healthy, oily scalp, protein sensitive) → Bond Repair Mask: Score 66.26
- **C1003** (curly, high porosity, coarse strand, damaged, oily scalp, protein sensitive) → Bond Repair Mask: Score 90.83
- **C1026** (straight, med porosity, coarse strand, damaged, oily scalp, silicone avoider) → Sulfate Shampoo: Score 56.7
- **C1036** (curly, high porosity, coarse strand, damaged, oily scalp, protein sensitive) → Volume Shampoo: Score 73.97
- **C1055** (straight, low porosity, med strand, normal, dry scalp, protein sensitive) → Bond Repair Mask: Score 71.07
- **C1062** (coily, low porosity, fine strand, damaged, oily scalp, protein sensitive) → Bond Repair Mask: Score 90.45
- **C1085** (curly, med porosity, fine strand, healthy, oily scalp, protein sensitive) → Bond Repair Mask: Score 70.47
- **C1090** (coily, low porosity, med strand, normal, oily scalp, protein sensitive) → Volume Shampoo: Score 68.19
- **C1123** (straight, low porosity, fine strand, normal, dry scalp, protein sensitive) → Bond Repair Mask: Score 74.27
- **C1124** (wavy, high porosity, med strand, healthy, oily scalp, protein sensitive) → Bond Repair Treatment: Score 72.11
- **C1132** (coily, high porosity, med strand, damaged, oily scalp, protein sensitive) → Protein Treatment Mask: Score 48.98
- **C1144** (coily, low porosity, coarse strand, normal, dry scalp, protein sensitive) → Gentle Sulfate-Free Shampoo: Score 93.98
- **C1164** (coily, high porosity, fine strand, damaged, oily scalp, protein sensitive) → Bond Repair Treatment: Score 93.39
- **C1179** (wavy, med porosity, coarse strand, normal, dry scalp, protein sensitive) → Bond Repair Treatment: Score 67.24
- **C1187** (wavy, high porosity, coarse strand, healthy, dry scalp, protein sensitive) → Gentle Sulfate-Free Shampoo: Score 94.17
- **C1196** (wavy, low porosity, med strand, damaged, dry scalp, silicone avoider) → Silicone Conditioner: Score 58.36
- **C1197** (coily, med porosity, fine strand, normal, normal scalp, protein sensitive) → Deep Conditioning Mask: Score 75.74
- **C1205** (coily, med porosity, coarse strand, normal, oily scalp, protein sensitive) → Volume Shampoo: Score 68.53
- **C1209** (straight, med porosity, coarse strand, normal, normal scalp, protein sensitive) → Bond Repair Mask: Score 65.55
- **C1222** (coily, low porosity, coarse strand, healthy, normal scalp, protein sensitive) → Gentle Sulfate-Free Shampoo: Score 92.09

... and 172 more.


## 3. Over-scoring Patterns

Profile + ingredient combinations consistently scoring too high:

### treatment + high porosity + fine strand

Average score: 93.2 (expected lower)

Examples:

- C2111: curly, high porosity, fine strand, damaged, dry scalp, sensitive scalp + chemically treated + Olaplex Treatment → 100
- C2260: curly, high porosity, fine strand, damaged, dry scalp, chemically treated + Olaplex Treatment → 100
- C2329: coily, high porosity, fine strand, damaged, dry scalp, sensitive scalp + protein sensitive + silicone avoider + Olaplex Treatment → 100
- C2324: curly, high porosity, fine strand, damaged, dry scalp, sensitive scalp + silicone avoider + chemically treated + Bond Repair Treatment → 98.29
- C2261: coily, high porosity, fine strand, damaged, dry scalp, sensitive scalp + protein sensitive + Bond Repair Treatment → 96.28

### treatment + low porosity + fine strand

Average score: 86.3 (expected lower)

Examples:

- C2413: curly, low porosity, fine strand, damaged, dry scalp, sensitive scalp + protein sensitive + chemically treated + Olaplex Treatment → 99.34
- C2449: curly, low porosity, fine strand, damaged, dry scalp, protein sensitive + chemically treated + Olaplex Treatment → 98.17
- C2148: curly, low porosity, fine strand, damaged, dry scalp, protein sensitive + silicone avoider + chemically treated + Bond Repair Treatment → 94.21
- C2293: curly, low porosity, fine strand, damaged, dry scalp, sensitive scalp + protein sensitive + Bond Repair Treatment → 94.16
- C2321: curly, low porosity, fine strand, damaged, oily scalp, sensitive scalp + chemically treated + Bond Repair Treatment → 93.94

### treatment + med porosity + fine strand

Average score: 84.6 (expected lower)

Examples:

- C1586: curly, med porosity, fine strand, damaged, normal scalp, chemically treated + Bond Repair Treatment → 93.5
- C1271: coily, med porosity, fine strand, damaged, dry scalp, silicone avoider + Bond Repair Treatment → 93.44
- C1058: straight, med porosity, fine strand, damaged, normal scalp, protein sensitive + Olaplex Treatment → 92.09
- C1815: curly, med porosity, fine strand, normal, oily scalp, chemically treated + Bond Repair Treatment → 92.03
- C1425: wavy, med porosity, fine strand, healthy, dry scalp, chemically treated + Olaplex Treatment → 92.01

### treatment + high porosity + coarse strand

Average score: 82.8 (expected lower)

Examples:

- C2339: curly, high porosity, coarse strand, damaged, dry scalp, protein sensitive + silicone avoider + Olaplex Treatment → 97.68
- C2123: curly, high porosity, coarse strand, damaged, dry scalp, silicone avoider + chemically treated + Bond Repair Treatment → 96.29
- C2443: coily, high porosity, coarse strand, damaged, oily scalp, sensitive scalp + protein sensitive + chemically treated + Olaplex Treatment → 95.97
- C0687: coily, high porosity, coarse strand, damaged, normal scalp + Olaplex Treatment → 94.55
- C2379: curly, high porosity, coarse strand, damaged, oily scalp, sensitive scalp + chemically treated + Bond Repair Treatment → 94.27

### deep_conditioner_mask + high porosity + fine strand

Average score: 82.8 (expected lower)

Examples:

- C2109: curly, high porosity, fine strand, damaged, dry scalp, protein sensitive + silicone avoider + chemically treated + Bond Repair Mask → 98.35
- C2146: coily, high porosity, fine strand, damaged, dry scalp, protein sensitive + silicone avoider + Bond Repair Mask → 96.87
- C1932: coily, high porosity, fine strand, damaged, dry scalp, chemically treated + Deep Conditioning Mask → 96.84
- C1522: coily, high porosity, fine strand, healthy, dry scalp, chemically treated + Bond Repair Mask → 95.52
- C2292: curly, high porosity, fine strand, damaged, dry scalp, sensitive scalp + chemically treated + Protein Treatment Mask → 94.78


## 4. Under-scoring Patterns

Compatible combinations scoring too low:

### serum + low porosity + fine strand

Average score: 30.6 (expected higher)

Examples:

- C1499: coily, low porosity, fine strand, damaged, oily scalp, sensitive scalp + Silicone Serum → 10.33
- C1006: wavy, low porosity, fine strand, damaged, dry scalp, silicone avoider + Natural Oil Serum → 10.43
- C1827: straight, low porosity, fine strand, healthy, dry scalp, protein sensitive + Natural Oil Serum → 10.53
- C1785: curly, low porosity, fine strand, healthy, oily scalp, sensitive scalp + Natural Oil Serum → 10.54
- C2020: curly, low porosity, fine strand, damaged, dry scalp, sensitive scalp + Natural Oil Serum → 10.9

### serum + low porosity + coarse strand

Average score: 34.5 (expected higher)

Examples:

- C2038: curly, low porosity, coarse strand, damaged, oily scalp, sensitive scalp + protein sensitive + silicone avoider + Silicone Serum → 6.77
- C1678: straight, low porosity, coarse strand, damaged, oily scalp, sensitive scalp + Natural Oil Serum → 10.59
- C1027: curly, low porosity, coarse strand, healthy, dry scalp, chemically treated + Natural Oil Serum → 10.83
- C1172: coily, low porosity, coarse strand, damaged, oily scalp, silicone avoider + Natural Oil Serum → 11.03
- C2092: curly, low porosity, coarse strand, damaged, oily scalp, chemically treated + Natural Oil Serum → 11.31

### serum + med porosity + coarse strand

Average score: 35.6 (expected higher)

Examples:

- C0377: wavy, med porosity, coarse strand, normal, normal scalp + Natural Oil Serum → 9.97
- C0697: wavy, med porosity, coarse strand, normal, normal scalp + Natural Oil Serum → 9.97
- C0803: wavy, med porosity, coarse strand, normal, oily scalp + Natural Oil Serum → 10.29
- C1461: wavy, med porosity, coarse strand, normal, oily scalp, silicone avoider + Natural Oil Serum → 10.29
- C1741: wavy, med porosity, coarse strand, damaged, oily scalp, silicone avoider + Silicone Serum → 10.46

### serum + high porosity + med strand

Average score: 35.9 (expected higher)

Examples:

- C0808: straight, high porosity, med strand, normal, oily scalp + Natural Oil Serum → 10.1
- C0267: straight, high porosity, med strand, damaged, normal scalp + Natural Oil Serum → 10.17
- C0779: curly, high porosity, med strand, normal, normal scalp + Natural Oil Serum → 10.2
- C1200: curly, high porosity, med strand, normal, dry scalp, silicone avoider + Natural Oil Serum → 10.47
- C0347: straight, high porosity, med strand, damaged, oily scalp + Natural Oil Serum → 10.5

### serum + high porosity + coarse strand

Average score: 36.3 (expected higher)

Examples:

- C2106: curly, high porosity, coarse strand, damaged, oily scalp, silicone avoider + chemically treated + Silicone Serum → 10.05
- C1223: coily, high porosity, coarse strand, normal, oily scalp, silicone avoider + Silicone Serum → 10.06
- C0047: wavy, high porosity, coarse strand, normal, normal scalp + Natural Oil Serum → 10.17
- C0518: straight, high porosity, coarse strand, normal, normal scalp + Natural Oil Serum → 10.17
- C0745: straight, high porosity, coarse strand, normal, normal scalp + Natural Oil Serum → 10.17


## 5. Stacked Sensitivity Failures

Cases with 2+ sensitivities where score doesn't reflect compounded incompatibility:

**Found 85 failures:**

- **C2003** (protein sensitive + silicone avoider + chemically treated) → Silicone Conditioner: Score 60.26
- **C2013** (sensitive scalp + protein sensitive) → Bond Repair Mask: Score 93.66
- **C2015** (protein sensitive + silicone avoider + chemically treated) → Daily Conditioner: Score 90.78
- **C2021** (sensitive scalp + protein sensitive + chemically treated) → Lightweight Leave-In: Score 93.79
- **C2022** (protein sensitive + silicone avoider + chemically treated) → Protein Shampoo: Score 53.15
- **C2023** (sensitive scalp + protein sensitive + chemically treated) → Bond Repair Mask: Score 94.62
- **C2026** (protein sensitive + silicone avoider + chemically treated) → Sulfate Shampoo: Score 51.87
- **C2039** (sensitive scalp + protein sensitive + chemically treated) → Protein Treatment Mask: Score 53.92
- **C2043** (sensitive scalp + protein sensitive) → Spray Leave-In: Score 83.64
- **C2054** (protein sensitive + silicone avoider + chemically treated) → Spray Leave-In: Score 95.55
- **C2056** (sensitive scalp + protein sensitive + chemically treated) → Daily Conditioner: Score 93.59
- **C2061** (sensitive scalp + protein sensitive) → Bond Repair Mask: Score 92.75
- **C2064** (protein sensitive + silicone avoider + chemically treated) → Silicone Conditioner: Score 64.52
- **C2068** (protein sensitive + chemically treated) → Bond Repair Mask: Score 93.04
- **C2085** (sensitive scalp + protein sensitive + silicone avoider) → Protein Treatment Mask: Score 51.4

## 6. Scalp Oiliness Blind Spots

Cases where scalp oiliness wasn't reflected in score for shampoo/co-wash:

**Found 113 blind spots:**

- C0003: curly, med porosity, med strand, damaged, oily scalp + Gentle Co-Wash → 68.33
- C0035: coily, med porosity, coarse strand, damaged, oily scalp + Gentle Co-Wash → 71.13
- C0059: straight, med porosity, coarse strand, damaged, oily scalp + Gentle Co-Wash → 63.04
- C0063: wavy, high porosity, coarse strand, damaged, oily scalp + Gentle Co-Wash → 70.11
- C0093: coily, med porosity, med strand, normal, oily scalp + Moisturizing Co-Wash → 57.82
- C0107: straight, high porosity, coarse strand, damaged, oily scalp + Moisturizing Shampoo → 89.53
- C0167: wavy, med porosity, med strand, damaged, oily scalp + Gentle Co-Wash → 63
- C0170: curly, high porosity, med strand, normal, oily scalp + Moisturizing Co-Wash → 62.94
- C0186: curly, med porosity, coarse strand, normal, oily scalp + Moisturizing Co-Wash → 55.95
- C0190: wavy, med porosity, coarse strand, normal, oily scalp + Gentle Co-Wash → 59.73

## 7. Strand Thickness Blind Spots

Cases where strand thickness was ignored despite weight mismatch:

**Found 119 blind spots:**

- C0104: wavy, high porosity, coarse strand, normal, oily scalp + Lightweight Serum → 40.65
- C0212: curly, med porosity, coarse strand, normal, oily scalp + Lightweight Serum → 42.13
- C0748: wavy, high porosity, coarse strand, damaged, oily scalp + Lightweight Serum → 43.83
- C0814: wavy, high porosity, coarse strand, normal, oily scalp + Lightweight Serum → 40.65
- C0817: curly, med porosity, coarse strand, normal, oily scalp + Lightweight Serum → 42.13
- C1023: coily, high porosity, fine strand, healthy, oily scalp, protein sensitive + Curl Cream → 69.53
- C1031: straight, low porosity, fine strand, normal, dry scalp, sensitive scalp + Deep Conditioning Mask → 59.17
- C1033: wavy, med porosity, fine strand, healthy, normal scalp, chemically treated + Moisturizing Co-Wash → 65.95
- C1054: straight, high porosity, fine strand, normal, dry scalp, protein sensitive + Moisturizing Shampoo → 94.26
- C1059: straight, med porosity, coarse strand, healthy, dry scalp, sensitive scalp + Lightweight Serum → 41.21

## 8. Recommended Fixes

- When **protein-sensitive profile + hydrolyzed protein ingredients**, adjust score by approximately **-25 points** because Protein sensitivity should trigger a significant penalty when protein ingredients are present
- When **silicone-sensitive profile + dimethicone/cyclomethicone ingredients**, adjust score by approximately **-30 points** because Silicone avoidance is a hard constraint; presence of non-water-soluble silicones should heavily penalize
- When **sensitive scalp + SLES/SLS surfactants**, adjust score by approximately **-20 points** because Strong sulfates on sensitive scalp cause irritation; should be penalized more aggressively
- When **fine strand + heavy butters (shea, mango)**, adjust score by approximately **-10 points** because Fine hair gets weighed down easily; heavy ingredients should reduce score
- When **oily scalp + heavy moisturizing shampoo**, adjust score by approximately **-8 points** because Oily scalp needs cleansing, not more moisture; heavy shampoos should be penalized
- When **dry scalp + sulfate-heavy shampoo**, adjust score by approximately **-15 points** because Sulfates strip natural oils; dry scalp needs gentler cleansing
- When **low porosity + heavy silicones/butters**, adjust score by approximately **-12 points** because Low porosity hair can't absorb heavy ingredients; they sit on top and cause buildup
- When **high porosity + lightweight only formula**, adjust score by approximately **-8 points** because High porosity hair needs heavier moisture; too-light formulas don't provide enough conditioning
- When **damaged hair + no repair ingredients (protein, bonds)**, adjust score by approximately **-10 points** because Damaged hair needs repair support; formulas without it miss a critical need
- When **chemically treated + strong surfactants**, adjust score by approximately **-12 points** because Chemically treated hair is more fragile; strong surfactants cause further damage

## 9. Top 5 Priority Fixes

Ranked by impact on scoring accuracy:

### 1. Hard sensitivity penalty multiplier

**Impact:** Affects ~15% of cases with protein/silicone/scalp sensitivities

When a hard sensitivity conflict exists (protein-sensitive + protein ingredient, silicone-avoider + silicone), apply a multiplicative penalty of 0.4–0.6x to the final score, not just a subtractive modifier. This ensures sensitive profiles never score above 45 when conflicts exist.

### 2. Stacked sensitivity additive penalty

**Impact:** Affects ~8% of edge cases with 2+ sensitivities

Each additional sensitivity beyond the first should add an incremental penalty of -8 to -12 points. Currently, stacked sensitivities may only trigger a single penalty, under-weighting the compounded incompatibility.

### 3. Strand thickness weight matching

**Impact:** Affects ~20% of cases with fine or coarse strands

Fine strand hair should receive a -8 to -12 penalty for products containing heavy butters (shea, mango) above position 5 in the INCI list. Coarse strand hair should receive a -5 to -8 penalty for ultra-lightweight formulas that can't provide adequate conditioning.

### 4. Scalp oiliness category gating

**Impact:** Affects ~25% of shampoo/co-wash cases

Oily scalp profiles should receive a -10 penalty for moisturizing shampoos with heavy oils. Dry scalp profiles should receive a -12 penalty for clarifying/stripping shampoos with SLES/SLS. This is currently under-weighted in the scoring.

### 5. Low porosity buildup amplification

**Impact:** Affects ~15% of low porosity cases

Low porosity hair is particularly prone to buildup from silicones and heavy emollients. Apply a 1.5x multiplier to the buildup penalty when profile.porosity === 'low' and silicones/butters are present.


## Summary Statistics

- **Average score:** 68.2
- **Median score:** 72.65
- **Min score:** 6.77
- **Max score:** 100
- **Standard deviation:** 22.2
- **Error cases:** 0