# ENGINE_AUDIT.md — Complete Plain-English Audit of newEngine.ts

**Date:** June 2026
**File:** scoring/newEngine.ts (1,682 lines)
**Engine type:** Additive single-pass scoring (replaces earlier multiplicative pipeline)

---

## SECTION 1 — CONSTANTS AND CAPS

**NEGATIVE_COMPAT_SCALE = 5**
Controls: how strongly a negative profile-compatibility score penalises an ingredient
Effect: if an ingredient has a compatibility score of -1 for "low porosity", the penalty is -1 × 5 = -5 points per ingredient

**POSITIVE_COMPAT_SCALE = 1.5**
Controls: how strongly a positive profile-compatibility score rewards an ingredient
Effect: if an ingredient has a compatibility score of +1 for "high porosity", the bonus is +1 × 1.5 = +1.5 points per ingredient (rounded)

**PROTEIN_CONFLICT_CAP = 16**
Controls: maximum score allowed when protein-sensitive hair has protein in the top 30% of the ingredient list (high concentration)
Effect: final score cannot exceed 16

**SILICONE_CONFLICT_CAP = 18**
Controls: maximum score allowed when silicone-avoider hair has non-water-soluble silicone
Effect: final score cannot exceed 18

**SCALP_CONFLICT_CAP = 30**
Controls: maximum score for sensitive scalp + harsh sulfate (without scalp actives to compensate), OR sensitive scalp + formaldehyde releaser, OR chemically treated + harsh sulfate
Effect: final score cannot exceed 30

**MULTIPLE_CONFLICT_CAP = 12**
Controls: maximum score when more than one hard conflict is detected simultaneously
Effect: final score cannot exceed 12, regardless of individual conflict caps

**NON_FUNCTIONAL_CAP = 22**
Controls: maximum score for any product that fails the functional efficacy check AND is not a treatment
Effect: final score capped at 22 for shampoos, co-washes, conditioners, leave-ins, serums, stylers that lack their required functional ingredient class

**MAX_BASE_SCORE = 64**
Controls: the ceiling on the blended base score before any adjustments are applied
Effect: even if the 85/15 blend formula calculates a higher number, the base score will not exceed 64

**ABSOLUTE_CEILING = 84**
Controls: the absolute maximum any formula can ever score, regardless of all bonuses
Effect: final score is clamped to a maximum of 84 after all calculations (the 93-100 "truly exceptional" range is structurally unreachable)

**DISQUALIFICATION_CAP = 22**
Controls: maximum score for any product that fails the product-type qualification gate
Effect: if a formula does not contain the minimum qualifying ingredient for its category, it cannot score above 22 (treatments get a higher cap of 28 — see Step 10b)

---

## SECTION 2 — PIPELINE ORDER

The scoring pipeline runs in a strict single pass. Here is every step in execution order:

**STEP 0: checkProductQualification**
- Reads: ingredient list (resolved hits), product type
- Does: checks if the product contains at least one minimum qualifying ingredient for its category
- Output: { qualified: boolean, reason: string }
- If fails: final score hard-capped at DISQUALIFICATION_CAP (22) or 28 for treatments, applied LAST in the pipeline but conceptually runs first

**STEP 1: checkFunctionalEfficacy**
- Reads: ingredient list, profile
- Does: separate, softer check — does the product have ingredients from the right functional class (not just qualifying, but actually functional)?
- Output: { passed: boolean, reason: string }
- If fails: final score capped at NON_FUNCTIONAL_CAP (22) or 28 for treatments

**STEP 2: detectHardConflicts**
- Reads: ingredient list, profile (sensitivity flags)
- Does: checks for protein sensitivity + protein, silicone sensitivity + non-water-soluble silicone, sensitive scalp + sulfates/formaldehyde releasers, chemically treated + harsh sulfates
- Output: array of HardConflict objects, each with a cap value

**STEP 3: calculateBaseScore**
- Reads: ingredient list, product type
- Does: filters ingredients by the functional class list for the product type, reads each ingredient's database score for that product type, blends the max and average scores
- Output: baseScore (0-64), functionalCount

**STEP 4: calculateProfileAdjustments**
- Reads: functional ingredients only, profile (porosity, density, oiliness, curl pattern, condition)
- Does: for each functional ingredient, looks up its profile compatibility score for each active dimension, scales negative by 5× and positive by 1.5×
- Output: total (capped to [-25, +10]), penalties list, bonuses list

**STEP 5: calculateGoalAlignment**
- Reads: functional ingredients, profile (goal or inferred goal)
- Does: for each functional ingredient, checks if it serves the active goal via tags/categories, awards small per-ingredient bonuses. Also identifies premium ingredients for a separate bonus.
- Output: bonus (capped at +14), bonuses list, premiumBonus (capped at +8)

**STEP 6: calculateCategoryAdjustments**
- Reads: all ingredients, profile
- Does: applies product-type-specific mismatch penalties (co-wash on straight hair, gel on straight hair, heavy leave-in on fine hair, etc.) and sulfate penalties for shampoo/co-wash
- Output: total, penalties list

**STEP 6b: calculateInteractionEffects**
- Reads: all ingredients, profile
- Does: checks 16 specific ingredient-combination rules and product-type/goal mismatches
- Output: total, effects list

**STEP 6b2: calculateNonServingFunctionalPenalty**
- Currently disabled (always returns 0)
- Was intended to penalise functional ingredients that do not serve the product's goal

**STEP 6c: calculateFormulaQualityBonus**
- Currently disabled (always returns 0)
- Was intended to reward well-balanced formulations

**STEP 7: Combine additively**
- Formula: finalScore = baseScore + cappedPenalties + goalAdj.bonus + effectivePremiumBonus + qualityBonus
- cappedPenalties = max(-40, profileAdj.total + categoryAdj.total + interactionEffects.total + nonServingPenalty)
- effectivePremiumBonus = profileAdj.total >= 0 ? goalAdj.premiumBonus : 0 (premium bonus only awarded when profile adjustments are non-negative)
- qualityBonus = 0 (disabled)

**STEP 8: Bond repair on healthy/normal hair cap**
- If the formula contains a bond repair ingredient AND the hair condition is "healthy" or "normal", the score is capped at 50
- Rationale: bond repair is unnecessary for undamaged hair

**STEP 9: Functional efficacy cap**
- If the efficacy check failed: cap at 22 (or 28 for treatments)

**STEP 10: Hard conflict cap**
- If multiple hard conflicts: cap at MULTIPLE_CONFLICT_CAP (12)
- If one hard conflict: cap at that conflict's cap value, further reduced if multiple sensitivity flags are active (×0.6 for 2 flags, ×0.5 for 3 flags)
- If no hard conflicts but efficacy failed: cap at NON_FUNCTIONAL_CAP (22) or 28 for treatments
- Otherwise: no cap applied here

**STEP 10b: Product qualification cap**
- If the qualification gate failed: cap at DISQUALIFICATION_CAP (22) or 28 for treatments
- This is the FINAL hard cap — it overrides everything that came before

**Clamp: finalScore = max(0, min(ABSOLUTE_CEILING, round(finalScore)))**

**STEP 11: Per-ingredient scores**
- Each ingredient gets its database base score for the product type
- These are NOT affected by any of the profile/goal/conflict adjustments

**STEP 12: Subscores**
- Computes average scores for cleansing, conditioning, moisture, protein, scalp compatibility, and derived metrics (buildup, buildup resistance, etc.)

**STEP 13: Warnings**
- Generates warning objects for hard conflicts and efficacy failures for the UI to display

**STEP 14: Formulation trace**
- Each ingredient gets a position weight (1 / (1 + position × 0.3)) and a contribution score
- The position weight decreases as ingredients appear later in the INCI list

**Output:** ScoredFormulation object with formulationScore, ingredients, subscores, warnings, and metadata

---

## SECTION 3 — QUALIFICATION RULES (per product type)

**Shampoo**
Requires ONE of:
- Tag: surfactant, gentle-surfactant, strong-surfactant, or cleansing-agent
- Name contains: sulfate, glucoside, isethionate, sarcosinate, or sulfosuccinate (EXCEPT conditioning quats like behentrimonium, cetrimonium, quaternium, stearamidopropyl)
- Name contains: betaine AND category = Surfactant (to distinguish Cocamidopropyl Betaine from humectant Betaine)
- Category = Surfactant

**Co-wash**
Requires ONE of:
- Tag: conditioning-agent, fatty-alcohol, anti-static, or detangling
- Name contains: behentrimonium, cetrimonium, quaternium, cetyl alcohol, stearyl alcohol, cetearyl alcohol, or behenyl alcohol
- Category = Quat
- Name contains a fatty alcohol (cetyl/stearyl/cetearyl/behenyl alcohol) AND is NOT a drying alcohol

**Rinse-out conditioner / Deep conditioner mask / Mask**
Requires ONE of:
- Tag: conditioning-agent, fatty-alcohol, anti-static, or detangling
- Name contains: behentrimonium, cetrimonium, quaternium, cetyl alcohol, stearyl alcohol, cetearyl alcohol, or behenyl alcohol
- Category = Quat
- Name contains a non-drying fatty alcohol (same list as co-wash)

**Leave-in conditioner**
Requires ONE of:
- Tag: humectant, hydrating
- Name contains: glycerin, aloe, panthenol, hyaluronic, or sodium PCA
- Tag: lightweight-emollient or emollient
- Name contains: argan, jojoba, or almond
- Tag: conditioning-agent or fatty-alcohol
- Name contains: behentrimonium, cetrimonium, cetyl alcohol, or cetearyl alcohol

**Hair oil serum / Serum**
Requires ONE of:
- Tag: emollient, silicone, or scalp-active
- Name contains: oil, butter, dimethicone, silicone, cyclomethicone, squalane, squalene, or glyceride
- Name contains: niacinamide, salicylic, zinc PCA, or retinol

**Styling product**
Requires ONE of:
- Tag: film-former, hold-agent, or structurant
- Name contains: carbomer, PVP, polyvinylpyrrolidone, hydroxyethylcellulose, hydroxypropyl methylcellulose, polyquaternium, acrylate, wax, or cera
- Name contains: shea butter or mango butter

**Treatment**
Requires ONE of:
- Tag: bond-builder, protein, or scalp-active
- Name contains: hydrolyzed, keratin, ceramide, salicylic, zinc pyrithione, ketoconazole, niacinamide, maleic acid, mineral oil, petrolatum, or shea butter
- Category = Protein or Bond Repair

**Unknown product types**
No qualification gate applied (always qualified)

---

## SECTION 4 — BASE SCORE CALCULATION

**Step 1: Identify functional ingredients**
Each product type has a functional class list (see Section 11). Only ingredients whose classification matches at least one class in the list are considered "functional."

**Step 2: Read database scores**
For each functional ingredient, the engine reads the ingredient's `product_roles[productType].score` value from the ingredient database. If the product type is "treatment", it looks up "deep_conditioner_mask" instead. If "serum", it looks up "hair_oil_serum".

**Step 3: Blend formula**
The base score uses an 85/15 weighted blend:
- 85% of the maximum database score among all functional ingredients
- 15% of the average database score across all functional ingredients
- Formula: blended = maxScore × 0.85 + avgScore × 0.15

**Step 4: Formulation cap**
A minimum-functionality cap is applied based on how many functional ingredients exist:
- 1 functional ingredient: base score capped at 42
- 2 functional ingredients: base score capped at 56
- 3+ functional ingredients: base score capped at 64 (MAX_BASE_SCORE)

**Step 5: Final base score**
baseScore = min(formulationCap, round(blended))

The rationale: a single great ingredient cannot produce a world-class formula. Complexity matters.

---

## SECTION 5 — HARD CONFLICT DETECTION

Hard conflicts are absolute safety/sensitivity violations. They are detected BEFORE scoring and applied as hard caps AFTER all adjustments.

**Conflict 1: Protein sensitivity + protein ingredient**
- Trigger: profile.proteinSensitivity = true AND any ingredient classified as "protein"
- Position-based severity:
  - Protein in top 30% of ingredients (high concentration): cap = 16 (PROTEIN_CONFLICT_CAP)
  - Protein in 30-60% of ingredients (moderate): cap = 20
  - Protein in bottom 40%: no hard conflict (but a -30 category penalty is applied — see Section 6)
- Only the FIRST protein found determines the severity

**Conflict 2: Silicone sensitivity + non-water-soluble silicone**
- Trigger: profile.siliconeSensitivity = true AND any ingredient with category = "Silicone" or name containing dimethicone, cyclopentasiloxane, or dimethiconol, EXCEPT water-soluble silicones (tagged "low-buildup", or name contains "amodimethicone" or "peg")
- Cap = 18 (SILICONE_CONFLICT_CAP)

**Conflict 3: Sensitive scalp + harsh sulfate**
- Trigger: profile.scalpSensitivity = true AND any ingredient name contains sodium lauryl sulfate, sodium laureth sulfate, ammonium lauryl sulfate, or ammonium laureth sulfate
- Exception: if a scalp-active ingredient is present, this conflict is NOT triggered (the scalp actives "compensate")
- Cap = 30 (SCALP_CONFLICT_CAP)

**Conflict 4: Sensitive scalp + formaldehyde releaser**
- Trigger: profile.scalpSensitivity = true AND any ingredient name contains DMDM hydantoin, imidazolidinyl urea, diazolidinyl urea, quaternium-15, sodium hydroxymethylglycinate, or bronopol
- Cap = 30 (SCALP_CONFLICT_CAP)

**Conflict 5: Chemically treated + harsh sulfate**
- Trigger: profile.chemicallyTreated = true AND any ingredient name contains sodium lauryl sulfate or ammonium lauryl sulfate
- Cap = 30 (SCALP_CONFLICT_CAP)

**Stacking behavior:**
- If more than one hard conflict is detected, the score is capped at MULTIPLE_CONFLICT_CAP (12)
- If exactly one hard conflict, its individual cap applies, but is further reduced by sensitivity flag stacking:
  - 3 sensitivity flags active (scalp + protein + silicone): cap reduced to 50% of original
  - 2 sensitivity flags active: cap reduced to 60% of original
  - 1 sensitivity flag: full original cap

---

## SECTION 6 — PROFILE ADJUSTMENTS

Profile adjustments are calculated ONLY for functional ingredients (those matching the product type's functional class list). They use the ingredient's `profile_compatibility` database values, scaled by the NEGATIVE_COMPAT_SCALE (5×) or POSITIVE_COMPAT_SCALE (1.5×).

**Active dimensions checked:**
- porosity_low, porosity_med, porosity_high
- density_fine, density_coarse
- oiliness_dry, oiliness_oily
- curl_curly, curl_coily
- condition_damaged

**How it works:**
For each functional ingredient, for each active dimension (e.g., if profile.porosity === "low", then "porosity_low" is active):
1. Read the ingredient's profile_compatibility score for that dimension
2. If negative: multiply by 5 (harsh penalty)
3. If positive: multiply by 1.5 (gentle bonus)
4. Collect all penalties and bonuses

**Total cap:** The sum of all penalties and bonuses is capped to the range [-25, +10].

This means:
- Even if 10 ingredients all penalise low porosity, the total profile penalty cannot exceed -25
- Even if many ingredients are perfect matches, the total profile bonus cannot exceed +10
- Negative compatibility scores are 3.3× stronger than positive ones (5× vs 1.5×)

**Note:** There are no explicit per-attribute rules like "low porosity = -5." Instead, the engine reads each ingredient's pre-calculated compatibility scores from the database. The system is data-driven, not rule-driven for this step.

---

## SECTION 7 — GOAL ALIGNMENT

The active goal is either explicitly set by the user (profile.goal) or inferred from the profile if not set. Goal alignment only applies to functional ingredients for the product type.

**Goal inference rules (when no goal is specified):**
- Oily scalp → scalp-health
- Damaged hair → damage-repair
- Fine hair → volume
- Curly/coily + dry → frizz-control
- Curly/coily (not dry) → definition
- Default → moisture

**Per-goal bonuses:**

| Goal | Ingredient trigger | Bonus |
|------|-------------------|-------|
| moisture | Tag: humectant, hydrating; Category: Humectant | +2 |
| moisture | Tag: sealant, occlusive | +3 |
| volume | Tag: volumizing, lightweight | +3 |
| volume | Tag: heavy, occlusive; Category: Heavy Oil | -2 (penalty) |
| damage-repair | Tag: bond-repair; Category: Bond Repair | +4 |
| damage-repair | Category: Protein; Tag: protein | +2 |
| scalp-health | Tag: scalp-active; Category: Scalp Active | +3 |
| frizz-control | Tag: humectant, sealant, occlusive | +2 |
| frizz-control | Tag: smoothing, slip | +2 |
| definition | Tag: hold, structurant; Name: carbomer, pvp, polyvinylpyrrolidone; Category: Film Former, Polymer | +3 |
| growth | Tag: scalp-active; Name: caffeine, biotin | +3 |
| shine | Tag: smoothing, slip, shine | +2 |
| shine | Category: Silicone; Tag: silicone | +3 |
| shine | Tag: oil; Category: Oil | +2 |

**Goal bonus cap:** All goal bonuses combined are capped at +14.

**Premium ingredient bonus (separate, uncapped by goalAdj):**
- Bond-repair tag: +4 (if name contains ceramide, hyaluronic, or bis-aminopropyl)
- Niacinamide: +3
- Premium bonus total capped at +8
- Only awarded when profile adjustments are non-negative (penalties suppress premium bonus)

---

## SECTION 8 — CATEGORY ADJUSTMENTS

Category adjustments are product-type-specific mismatch penalties applied after profile adjustments. They apply to ALL ingredients, not just functional ones.

| Rule | Trigger | Penalty |
|------|---------|---------|
| Co-wash on straight/fine hair | productType = co_wash AND (curlPattern = straight OR density = fine) | -20 |
| Drying alcohol (normal) | Any ingredient classified as "drying-alcohol" | -12 |
| Drying alcohol (sensitive scalp) | Any drying-alcohol + scalpSensitivity = true | -18 |
| Heavy styler on fine/low porosity | productType = styling AND density = fine AND porosity = low AND (heavy-emollient class or "butter" tag) | -20 |
| Heavy leave-in on fine hair (volume goal) | productType = leave_in AND density = fine AND (heavy-emollient/butter/heavy-oil) AND goal = volume | -28 |
| Heavy leave-in on fine hair (other goals) | productType = leave_in AND density = fine AND (heavy-emollient/butter/heavy-oil) AND goal != volume | -18 |
| Heavy leave-in on med/low porosity (3+ heavy) | productType = leave_in AND (porosity = low OR med) AND density != fine AND 3+ heavy oils/butters | -22 |
| Gel styler on straight hair | productType = styling AND curlPattern = straight AND has gel ingredients (carbomer, acrylates, xanthan, Film Former, Polymer) | -30 |
| Mousse on straight hair (volume goal) | productType = styling AND curlPattern = straight AND has PVP/polyvinylpyrrolidone AND goal = volume | -3 |
| Mousse on straight hair (other goals) | productType = styling AND curlPattern = straight AND has PVP/polyvinylpyrrolidone AND goal != volume | -8 |
| Heavy treatment on low porosity | productType = treatment AND porosity = low AND (heavy-emollient or butter) | -15 |
| Low porosity + heavy oils (per ingredient, up to 3) | porosity = low AND ingredient is heavy (heavy-oil/butter/castor/mineral oil/petrolatum/coconut/argan/jojoba) | -8 each (or -12 if serum) |
| Sulfate on dry scalp (1st harsh) | productType = shampoo/co_wash AND oiliness = dry AND has strong-surfactant/sulfate | -6 (or -8 if scalp-sensitive) |
| Sulfate on dry scalp (2nd harsh) | Same conditions, second sulfate ingredient | -8 |
| Sulfate on oily scalp (heavy ingredient) | productType = shampoo/co_wash AND oiliness = oly AND has heavy/butter tag | -8 |
| Sulfate on normal scalp | productType = shampoo/co_wash AND oiliness = normal AND has strong-surfactant/sulfate | -6 |
| Surfactant balance (dry, non-sensitive) | productType = shampoo/co_wash AND oiliness = dry AND NOT scalp-sensitive AND exactly 1 harsh + has moderate/gentle surfactant | +9 (bonus, not penalty) |
| Trace protein on sensitive hair (bottom 40%) | proteinSensitivity = true AND protein ingredient at position ratio > 0.6 | -30 |
| Water-soluble silicone on silicone avoider | siliconeSensitivity = true AND water-soluble silicone present (amodimethicone, PEG-dimethicone, etc.) | -16 |

---

## SECTION 9 — INTERACTION EFFECTS

There are 16 interaction effects (numbered 1 through 17, with 16 out of order). These check specific ingredient-combination patterns.

**INTERACTION 1 — Hygral fatigue risk (leave-in + high porosity)**
- Trigger: productType = leave_in_conditioner AND porosity = high
- If 3+ humectants AND 0 sealants: -22
- If 2+ humectants AND 0 sealants: -8

**INTERACTION 2 — Coconut oil + protein sensitivity**
- Trigger: proteinSensitivity = true AND ingredient name contains "coconut oil" or "cocos nucifera"
- If in top 50% of ingredients (high concentration): -18
- If in bottom 50%: -10

**INTERACTION 3 — Protein stacking (even without sensitivity)**
- Trigger: proteinSensitivity = false AND 3+ protein ingredients
- Penalty: -(excess protein count × 8) where excess = count - 2
- Example: 3 proteins = -8, 4 proteins = -16

**INTERACTION 4 — Protein + humectant synergy (bonus)**
- Trigger: condition = damaged AND proteinSensitivity = false AND has protein AND has humectant (or glycerin/panthenol)
- Bonus: +6

**INTERACTION 5 — Fragrance compounding on sensitive scalp**
- Trigger: scalpSensitivity = true AND 3+ fragrance components (including linalool, limonene, citronellol, geraniol, eugenol)
- Penalty: -(excess × 4) where excess = count - 1

**INTERACTION 6 — Drying alcohol offset by humectants (bonus)**
- Trigger: has drying-alcohol
- If 4+ humectants: +8 (strong offset)
- If 2-3 humectants: +4 (moderate offset)

**INTERACTION 7 — Scalp actives used as leave-in for moisture goal**
- Trigger: productType = leave_in_conditioner AND goal = moisture
- If 2+ scalp-actives AND 0 conditioning agents: -10

**INTERACTION 8 — Treatment with no repair actives for damage-repair goal**
- Trigger: productType = treatment AND goal = damage-repair
- If 0 protein and 0 bond-builder ingredients: -24

**INTERACTION 9 — Goal misalignment: scalp actives for moisture/frizz goal**
- If active goal is moisture or frizz-control:
  - 2+ scalp-actives AND ≤1 humectant: -11
  - productType = treatment AND 2+ scalp-actives: -22 (category mismatch)

**INTERACTION 9b — Styling product on coily hair with conditioning agents (bonus)**
- Trigger: productType = styling AND curlPattern = coily
- If 2+ conditioning-agent or heavy-emollient: +10

**INTERACTION 9c — Mousse with drying alcohol for volume goal (bonus)**
- Trigger: productType = styling AND goal = volume AND has PVP/polyvinylpyrrolidone AND has drying-alcohol
- Bonus: +8 (alcohol aids quick-dry hold, which is functional for mousse)

**INTERACTION 10 — Multiple scalp actives synergy (bonus)**
- Trigger: goal = scalp-health
- If 3+ scalp actives: +4
- If 2 scalp actives: +2

**INTERACTION 11 — Charge conflict (anionic + cationic in rinse-off)**
- Trigger: productType = shampoo OR co_wash
- If has harsh anionic (SLS/SLES/ALS/ALES) AND strong cationic (behentrimonium chloride/methosulfate, cetrimonium chloride): -15

**INTERACTION 12 — Drying alcohol vs moisture/frizz goal**
- Trigger: has drying-alcohol AND (goal = moisture OR frizz-control)
- Rinse-off products (rinse-out, deep mask, co-wash, shampoo): -10
- Leave-on products: -18

**INTERACTION 13 — Treatment with no actives for wrong goal**
- Trigger: productType = treatment AND goal is NOT damage-repair AND goal is NOT scalp-health
- If 0 protein, 0 bond-builder, 0 scalp-active: -12

**INTERACTION 14 — Gentle surfactant + humectant shampoo (bonus)**
- Trigger: productType = shampoo
- If has gentle-surfactant AND no harsh-surfactant AND 2+ humectants: +5

**INTERACTION 15 — Protein in leave-in conditioner (buildup risk)**
- Trigger: productType = leave_in_conditioner
- If any protein present: -6

**INTERACTION 16 — Rinse-out conditioner ideal formula (bonus)**
- Trigger: productType = rinse_out_conditioner
- If has conditioning-agent AND has protein AND 3+ humectants: +6

**INTERACTION 17 — Serum with humectants (wrong formulation)**
- Trigger: productType = hair_oil_serum or serum
- If 2+ humectants: -4

---

## SECTION 10 — STACKING AND COMPOUNDING

All adjustments are **additive, not multiplicative**. There are no multiplier chains. The formula is:

```
finalScore = baseScore + cappedPenalties + goalAdj.bonus + effectivePremiumBonus + qualityBonus
```

Where:
- `cappedPenalties = max(-40, profileAdj.total + categoryAdj.total + interactionEffects.total + nonServingPenalty)`
- The penalty floor is -40 (penalties cannot drag the score below baseScore - 40)
- The premium bonus is suppressed when profile adjustments are negative
- qualityBonus is always 0 (disabled)

**Floors and ceilings:**
- Profile adjustments: capped to [-25, +10]
- Goal bonuses: capped at +14
- Premium bonus: capped at +8
- Total penalties: floored at -40
- Final score: clamped to [0, 84]

**Sensitivity flag stacking (hard conflicts only):**
- 3 sensitivity flags (scalp + protein + silicone): each hard conflict cap reduced to 50%
- 2 sensitivity flags: each hard conflict cap reduced to 60%
- 1 sensitivity flag: full original cap
- This multiplier is applied AFTER the individual conflict cap, BEFORE the final clamp

**Key interaction:** If penalties total -50, only -40 is applied. If penalties total -30 and goal bonus is +14 and premium is +8, the net adjustment is -30 + 14 + 8 = -8.

---

## SECTION 11 — FUNCTIONAL CLASS LISTS

These lists determine which ingredients are considered "functional" for each product type. Only functional ingredients receive profile adjustments and count toward the base score blend.

**Shampoo:**
harsh-surfactant, gentle-surfactant, moderate-surfactant, humectant, scalp-active

**Co-wash:**
conditioning-agent, fatty-alcohol, lightweight-emollient, humectant, surfactant, gentle-surfactant

**Rinse-out conditioner:**
conditioning-agent, fatty-alcohol, lightweight-emollient, heavy-emollient, humectant, protein, bond-builder

**Deep conditioner / Mask:**
conditioning-agent, fatty-alcohol, heavy-emollient, lightweight-emollient, humectant, protein, bond-builder, ceramide

**Leave-in conditioner:**
conditioning-agent, fatty-alcohol, lightweight-emollient, humectant

**Hair oil serum / Serum:**
lightweight-emollient, heavy-emollient, silicone, scalp-active, humectant, protein

**Styling product:**
styling-agent, fatty-alcohol, wax, humectant

**Treatment:**
protein, bond-builder, conditioning-agent, scalp-active, humectant, heavy-emollient, lightweight-emollient, wax, fatty-alcohol

---

## SECTION 12 — CALIBRATION AND CAPS

Every cap applied at the end of the pipeline, in order:

| Cap | Value | When applied |
|-----|-------|-------------|
| Bond repair on healthy/normal | 50 | Has bond-repair ingredient AND condition = healthy or normal |
| Functional efficacy cap (non-treatment) | 22 | Product fails efficacy check |
| Functional efficacy cap (treatment) | 28 | Treatment fails efficacy check |
| Hard conflict cap (protein, high conc.) | 16 | Protein-sensitive + protein in top 30% |
| Hard conflict cap (protein, mod conc.) | 20 | Protein-sensitive + protein in 30-60% |
| Hard conflict cap (silicone) | 18 | Silicone-sensitive + non-water-soluble silicone |
| Hard conflict cap (scalp/chemical) | 30 | Sensitive scalp + sulfate/formaldehyde, or chemically treated + harsh sulfate |
| Hard conflict cap (multiple) | 12 | More than one hard conflict detected |
| Sensitivity stacking (2 flags) | ×0.6 | 2 sensitivity flags active on single conflict |
| Sensitivity stacking (3 flags) | ×0.5 | 3 sensitivity flags active on single conflict |
| Product qualification cap (non-treatment) | 22 | Product fails qualification gate |
| Product qualification cap (treatment) | 28 | Treatment fails qualification gate |
| ABSOLUTE_CEILING | 84 | Always applied as final clamp |
| Floor | 0 | Always applied as final clamp |

**Note:** There is no "soft compression" logic. Scores are not gradually compressed near the ceiling. The ceiling is a hard clamp at 84.

**Scoring formula summary:**
```
cappedPenalties = max(-40, profileAdj.total + categoryAdj.total + interactionEffects.total)
effectivePremiumBonus = profileAdj.total >= 0 ? goalAdj.premiumBonus : 0
finalScore = baseScore + cappedPenalties + goalAdj.bonus + effectivePremiumBonus
finalScore = min(bondRepairCap, finalScore)         // Step 8
finalScore = min(efficacyCap, finalScore)            // Step 9
finalScore = min(conflictCap, finalScore)            // Step 10
finalScore = min(qualificationCap, finalScore)       // Step 10b
finalScore = max(0, min(84, round(finalScore)))     // Clamp
```

---

## SECTION 13 — KNOWN GAPS AND ISSUES

**GAP 1: Leave-in functional class is narrow — excludes protein and heavy-emollient**
The leave-in functional class list only includes: conditioning-agent, fatty-alcohol, lightweight-emollient, humectant. It excludes protein and heavy-emollient. This means a leave-in with a protein ingredient gets NO base score contribution from it, NO profile adjustments for it, yet still gets the -6 interaction penalty (Interaction 15). The protein is penalised without being counted as functional. This creates an asymmetric penalty — the ingredient hurts the score but never helps it.

**GAP 2: Treatment functional class is very broad**
The treatment functional class includes 9 classes: protein, bond-builder, conditioning-agent, scalp-active, humectant, heavy-emollient, lightweight-emollient, wax, fatty-alcohol. This is so broad that almost any formula with any conditioning ingredient will pass. The qualification gate for treatment is also lenient (only needs protein, bond-builder, scalp-active, or common emollients). This means a formula that is really a conditioner can easily masquerade as a treatment and get a different (potentially higher) score.

**GAP 3: Bond repair cap of 50 on healthy/normal hair may be too aggressive**
If a user has healthy hair and selects a product containing a bond builder (even incidentally, like a leave-in with bis-aminopropyl dimethicone), the entire score is capped at 50. This is a hard cap with no nuance — a 10/100 formula with a trace bond builder gets the same cap as a 90/100 formula with a trace bond builder. The cap does not consider concentration or whether the bond builder is a primary functional ingredient.

**GAP 4: Surfactant balance bonus (+9) only fires for dry, non-sensitive scalps**
The +9 bonus for "single harsh sulfate + moderate/gentle surfactant" only applies when oiliness = "dry" AND scalpSensitivity = false. For oily or normal scalps, having a balanced surfactant system gets no bonus. This seems like a miss — a well-balanced shampoo should be rewarded regardless of scalp oiliness.

**GAP 5: Interaction 16 (rinse-out ideal formula) requires 3+ humectants**
The bonus for an ideal rinse-out conditioner formula requires conditioning-agent + protein + 3+ humectants. Most real-world conditioners have 1-2 humectants. This means the bonus is almost unreachable for typical formulas.

**GAP 6: No soft compression near ceiling**
Scores are hard-clamped at 84. There is no gradual compression (e.g., scores above 70 get 50% credit for additional bonuses). This means a formula that scores 70 and one that scores 84 can differ by only a few small adjustments, even though 84 represents the theoretical maximum.

**GAP 7: Non-serving functional penalty and formula quality bonus are both disabled**
Both calculateNonServingFunctionalPenalty and calculateFormulaQualityBonus return 0. These were intended to widen the scoring range (penalise kitchen-sink formulas, reward well-targeted ones). Without them, the scoring range is narrower than intended.

**GAP 8: readBaseScore returns 0 for missing product roles**
If an ingredient does not have a score entry for the requested product type (or the "treatment" → "deep_conditioner_mask" fallback), it returns 0. This means an ingredient that IS functionally relevant but has no database score for that product type contributes nothing to the base score, even though it may receive profile adjustments and goal bonuses. This can lead to contradictory scoring where an ingredient is "good" (profile + goal) but contributes 0 to the base.

**GAP 9: Goal inference does not consider protein sensitivity**
If a user has protein-sensitive hair, the goal inference does not default to any protein-avoidant goal. It still infers "damage-repair" for damaged hair, which then BONUSES protein ingredients (Interaction 4 gives +6 for protein + humectant on damaged hair). This means the inferred goal can work against the user's sensitivity.

**GAP 10: Interaction 12 (drying alcohol + moisture goal) can double-penalise**
Drying alcohol already gets a category adjustment penalty (-12 or -18 for sensitive scalp). Interaction 12 adds another -10 or -18 on top of that. Total penalty for drying alcohol in a moisture-goal product: -22 to -36. This is very aggressive — a single drying alcohol ingredient can destroy a formula's score through two separate penalty paths.

**GAP 11: Sensitivity stacking multiplier uses ALL sensitivity flags, not just the relevant one**
When calculating the effective cap for a hard conflict, the engine counts ALL sensitivity flags (scalp, protein, silicone). If a user is protein-sensitive and silicone-sensitive, but the hard conflict is only for protein, the cap is reduced to 60% even though the silicone sensitivity is irrelevant to this particular conflict. This over-penalises.

**GAP 12: Subscore aliases create redundancy**
computeSubscores sets repairSupport = protein, smoothing = conditioning, lightweightFeel = buildupResistance, curlSupport = moisture. These are duplicate references, not independent calculations. This means the UI shows four identical pairs of subscores, which adds confusion without information.

**GAP 13: Position weight in formulation trace is cosmetic only**
The position weight formula (1 / (1 + position × 0.3)) in the trace is purely cosmetic — it is NOT used in the actual scoring. The base score blend uses max/average of all functional ingredients regardless of position. This could mislead someone reading the trace into thinking position matters.

---

## SECTION 14 — SUMMARY STATS

| Metric | Count |
|--------|-------|
| Total constants defined | 10 |
| Total pipeline steps | 14 (Steps 0-14, excluding cosmetic trace) |
| Product qualification checks | 8 (shampoo, co-wash, conditioner×3, leave-in, serum, styler, treatment) |
| Functional efficacy checks | 8 (same categories) |
| Hard conflict types | 5 (protein, silicone, scalp+sulfate, scalp+formaldehyde, chemical+treated) |
| Interaction effects | 16 (numbered 1-17, with 16 out of order) |
| Category adjustment rules | 14 |
| Goal types | 8 (moisture, volume, damage-repair, scalp-health, frizz-control, definition, growth, shine) |
| Profile adjustment dimensions | 10 (3 porosity + 2 density + 2 oiliness + 2 curl + 1 condition) |
| Functional class lists | 8 product types |
| Total scoring rules (approximate) | ~65 distinct rules |
| Lines dedicated to scoring logic | ~1,400 (functions + constants) |
| Lines dedicated to infrastructure | ~280 (types, exports, trace, subscores, buildBreakdown) |
| Disabled features | 2 (non-serving penalty, formula quality bonus) |

---

*End of audit. All values verified against the current code in newEngine.ts (1,682 lines) as of June 2026.*
