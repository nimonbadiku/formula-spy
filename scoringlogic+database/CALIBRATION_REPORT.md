# Autonomous Calibration Report

## Current Status: 16/48 pass (33%)

## What's Working (16 passing scenarios)
| ID | Score | Target | Category |
|----|-------|--------|----------|
| S01 | 55 | 58 | SLS shampoo |
| S02 | 75 | 74 | Gentle shampoo |
| S05 | 8 | 8 | Water only |
| S08 | 15 | 19 | Protein sensitive + keratin |
| C03 | 66 | 71 | Lightweight conditioner |
| C06 | 21 | 16 | Two proteins, protein sensitive |
| C07 | 77 | 80 | Rich conditioner coily |
| L04 | 25 | 21 | Protein sensitive leave-in |
| SR04 | 58 | 63 | Silicone serum straight |
| T05 | 65 | 69 | Hot oil coily |
| T07 | 77 | 77 | Triple protein damaged |
| E01 | 56 | 55 | SLS oily scalp |
| E03 | 18 | 22 | Stacked conflicts |
| E04 | 69 | 65 | Gentle shampoo curly |

## Root Causes of Remaining 32 Failures

### 1. Evidence Engine Structural Ceiling (affects 15+ scenarios)
The evidence normalization (`evidenceEngine.ts`) caps conditioner/leave-in/styling scores because:
- Concentration confidence defaults to 0.5 (50%)
- Position penalty is 0.3 for ingredients below 1% line
- Even with FIX A (top+avg weighting), evidence maxes at ~60-70% for simple formulas
- Calibration applies ×0.85 at 50% evidence

**Affected:** C01 (-8), C05 (-17), L01 (-20), L03 (-19), L05 (-17), ST01 (-20), ST03 (-16), ST05 (-14), SR01 (-9), E05 (-20), E02 (-17)

### 2. Profile Modifier Too Weak (affects 10+ scenarios)
The `COMPAT_SCALE = 0.15` in `scoreIngredient.ts` limits profile modifiers to ±15% range. For scenarios where profile incompatibility should reduce scores by 50-70%, this is insufficient.

**Affected:** C02 (+29), C04 (+29), L02 (+38), T06 (+31), SR02 (+30), ST04 (+29), CW02 (+48)

### 3. CSDS Signal Gaps (affects 5+ scenarios)
- Protein sensitivity modifier (0.45) not strong enough for T02 (+20)
- Silicone sensitivity modifier (0.72) not strong enough for C02 (+29)
- No CSDS signal for "heavy ingredients on fine hair"
- Bond repair on healthy hair not penalized enough (T04 +39)

### 4. Efficacy Gate Issues (affects 3 scenarios)
- SR05: serum efficacy gate may not detect scalp actives as functional serum ingredients
- S07: shampoo efficacy passes but scalp_health evidence dimension has no contributors
- S03: harshness penalty too aggressive (-15)

## Engine Changes Made
1. `evidenceEngine.ts` — FIX A: top+avg weighting for overall evidence
2. `calibrationLayer.ts` — FIX B: gentler evidence scaling curve
3. `criticalSignalDetection.ts` — FIX C: protein sensitivity fires with 1 protein
4. `formulationBalance.ts` — co_wash removed from cleansing product check
5. `formulationCoherence.ts` — co_wash removed from cleansing coherence check
6. `functionalEfficacy.ts` — co_wash uses conditioning agents, not surfactants; HEC recognized as styling agent
7. `profileProductGating.ts` — co_wash removed from CLEANSING_PRODUCT_TYPES
8. `database/ingredients.v3.json` — BTMC and BTMS categories corrected to "Quat"

## Database Changes Made
46 ingredients calibrated across 6 rounds. Key base scores:
- Water: 0 (all product types)
- SLS: 72 (shampoo)
- SLES: 75 (shampoo)
- CAPB: 50 (shampoo)
- BTMC: 95 (rinse_out_conditioner), 88 (co_wash)
- Cetearyl Alcohol: 92 (rinse_out_conditioner), 85 (co_wash)
- Glycerin: 88 (leave_in), 62 (co_wash)
- Panthenol: 85 (leave_in), 65 (co_wash)

## Assessment
Reaching 95% (46/48) accuracy requires fundamental changes to:
1. The evidence engine's normalization formula (not just weighting)
2. The profile modifier scale (COMPAT_SCALE from 0.15 to ~0.40)
3. New CSDS signals for heavy-on-fine and scalp-active scenarios
4. Product-type-specific calibration curves in the calibration layer

These changes would affect the entire scoring pipeline and risk regressions on the 16 currently passing scenarios. The current architecture was designed for a different scoring model (the old collapsed 0-10 system) and the new engine's features (evidence, CSDS, calibration) interact in ways that make isolated calibration extremely difficult.
