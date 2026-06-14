# Scoring Architecture v3.2 — Final

> This document defines the scoring engine architecture. Implementation begins only after this document is approved.

---

## 1. Scoring Model: Three Distinct Scores

The engine produces three separate scores. They are NOT averaged into a single number.

### Formula Quality (0-100)
**What it measures:** How well is this product formulated FOR ITS CATEGORY?

- Does it contain functional ingredients for its type?
- Are those ingredients in meaningful positions (above the 1% line)?
- Is the formulation balanced and complete?
- Does it avoid contradictions?

**Independent of user profile.** A clarifying shampoo scores high on formula quality even for a dry-hair user.

**Score bands:**
```
0-20  = Non-functional (water-only, no actives)
20-40 = Functional but poor (minimal ingredients, weak formulation)
40-60 = Average commercial formula (meets basic requirements)
60-80 = Good formula (well-balanced, functional, complete)
80-90 = Excellent formula (strong actives, well-designed)
90-100 = Exceptional formula (optimal for its category)
```

### Profile Compatibility (0-100)
**What it measures:** How well does this product fit THIS specific user's hair?

- Does the product type match the user's needs?
- Are the ingredients appropriate for the user's porosity, density, condition?
- Does it avoid the user's sensitivities?
- Does it address the user's specific concerns?

**Independent of formula quality.** A mediocre moisturizing shampoo is more compatible with dry hair than an excellent clarifying shampoo.

**Score bands:**
```
0-20  = Actively harmful (triggers sensitivity, wrong product type)
20-40 = Poor fit (multiple incompatibilities)
40-60 = Acceptable fit (some matches, some mismatches)
60-80 = Good fit (addresses main needs, minor gaps)
80-90 = Excellent fit (well-matched to profile)
90-100 = Perfect fit (designed for this exact profile)
```

### Recommendation Score (0-100)
**What it measures:** Should we recommend this product to this user?

Derived from Formula Quality and Profile Compatibility using a weighted function that depends on user context (sensitivity status, goal priority, etc.).

---

## 2. Percentile Calibration Is Monitoring Only

Percentile calibration does NOT determine scores. It is used for:

- **Benchmark reporting:** Where does this product sit relative to others?
- **Distribution analysis:** Is the score distribution realistic?
- **Inflation detection:** Are scores drifting upward over time?

Formula Quality remains an evidence-based absolute score. A product can score 90+ because it is objectively excellent, even if the database contains mostly weak formulas.

Percentile data is collected during benchmarking and stored for reference, but never used to adjust production scores.

---

## 3. Tag Reliability: Audit-Based, Not Permanently Hardcoded

### Tag Audit Results (192 unique tags)

**Tier 1 — Very High (1.0): Scientific foundation**
- `surfactant`, `anionic-surfactant`, `amphoteric-surfactant`, `nonionic-surfactant`
- `sulfate`, `sulfate-free`, `mild-cleanser`, `foam-booster`, `strong-surfactant`
- `silicone`, `water-soluble-silicone`, `non-volatile-silicone`, `volatile-silicone`
- `protein`, `hydrolyzed-protein`, `low-mw-protein`, `high-mw-protein`
- `drying-alcohol`, `fatty-alcohol`
- `bond-repair`
- `preservative`, `chelator`, `ph-adjuster`
- `emulsifier`, `thickener`, `rheology-modifier`
- `humectant`, `occlusive`, `emollient`

**Tier 2 — High (0.8): Generally accurate functional descriptors**
- `conditioning-agent`, `conditioning`, `conditioning-polymer`
- `film-former`, `hold`, `styling`
- `hydrating`, `moisturizing` (when paired with humectant/emollient evidence)
- `damage-repair`, `damage-care`, `repair-support`
- `strengthening`, `strength`
- `low-buildup`, `buildup-risk`
- `scalp-active`, `scalp-support`
- `anti-static`, `antistatic`
- `detangling`, `slip`
- `sealant`, `water-soluble`

**Tier 3 — Medium (0.5): Context-dependent**
- `smoothing`, `shine`, `lightweight`
- `volumizing`, `volume-risk`
- `curl-support`, `texturizer`
- `color-treated`, `color-protection`
- `clarifying`, `cleansing`
- `peptide`, `vitamin`, `amino-acid`

**Tier 4 — Low (0.2): Marketing-heavy or origin-based**
- `botanical`, `botanical-extract`, `extract`, `plant-extract`
- `marine`, `mineral`, `inorganic`
- `natural-derived`, `natural`
- `ferment`, `postbiotic`, `fermented`
- `essential-oil`, `seed-oil`
- `antioxidant`

**Tier 5 — Ignore (0.0): Pure marketing**
- `needs-review` (912 ingredients — flag for manual review, not used in scoring)
- `safety` (vague, no scientific basis)
- `functional` (too generic)

**Unknown tags:** Surface for review, do not silently assign 0.3. Log to a "tags-needing-review" list.

---

## 4. Formula Completeness: Functional Coverage, Not Ingredient Count

Completeness answers: "Does the formula adequately cover the functional needs of its category?"

It does NOT answer: "How many ingredients does it have?"

### Subtype Detection First

Before evaluating completeness, detect the functional subtype:

| Subtype | Detection Method | Required Functions |
|---------|-----------------|-------------------|
| Cleansing | Dominant surfactant category | Surfactant system |
| Conditioning | Dominant conditioning agents | Conditioning agents |
| Treatment | Dominant protein/bond/ceramide | Treatment actives |
| Sealing | Dominant oils/silicones | Sealants/emollients |
| Styling | Dominant film formers/polymers | Hold agents |
| Hybrid | No dominant category | None specific |

### Completeness Evaluation

For each required function:
1. Check if ANY ingredient covers this function (binary: covered/not covered)
2. Check if the covering ingredient is above the 1% line (confidence modifier)
3. Check if there are multiple options for this function (completeness bonus, NOT quantity bonus)

**Completeness = (functions covered / functions required) × 100**

A shampoo with surfactant + conditioning + preservation = complete (3/3 = 100%)
A shampoo with surfactant only = functional but incomplete (1/3 = 33%)

---

## 5. Concentration Estimation: Confidence Modifier, Not Proof

INCI position tells us LIKELY concentration, not ACTUAL concentration.

**Usage rule:** Concentration estimation modifies CONFIDENCE, not SCORE.

Example:
- Hydrolyzed Keratin at position #4 → confidence increases for "repair" evidence
- Hydrolyzed Keratin at position #40 → confidence decreases for "repair" evidence

Neither proves repair efficacy by itself. The ingredient's `product_roles` score determines the evidence strength. Concentration modifies how confident we are in that evidence.

**Below the 1% line (position 8+):** Treat as uncertain. Evidence exists but confidence is low.

---

## 6. Claim Validation: Explicit Claims Only

### Claim Detection Confidence Levels

**Explicit claim (confidence 0.9-1.0):**
- "Repair Shampoo" — explicit repair claim
- "Bond Repair Treatment" — explicit bond repair claim
- "Maximum Strength Reconstructor" — explicit strength claim

**Implied claim (confidence 0.5-0.8):**
- "Volume Shampoo" — implied volume claim
- "Curl Cream" — implied definition claim
- "Scalp Treatment" — implied scalp health claim

**Category expectation (confidence 0.3-0.5):**
- "Shampoo" — expects cleansing
- "Conditioner" — expects conditioning
- "Serum" — expects sealing/treatment

**No claim (confidence < 0.3):**
- "Hair Product" — too vague
- Generic names without functional descriptors

### Claim Validation Logic

1. Detect claims with confidence levels
2. Only validate claims with confidence > 0.5
3. Check for SUPPORT (evidence matches claim)
4. Check for CONTRADICTION (evidence actively opposes claim)
5. Return verdict: supported / unsupported / contradicted

---

## 7. Double-Count Prevention

### Audit: Information Flow

```
Database (tags, product_roles, category)
    ↓
Per-Ingredient Scoring (product_roles score × profile modifier)
    ↓
Scored Ingredients (finalScore per ingredient)
    ↓
Concentration Estimation (position → band → confidence)
    ↓
Evidence Engine (uses scored ingredients × concentration confidence)
    ↓
Completeness Check (uses evidence profile)
    ↓
Claim Validation (uses evidence profile)
    ↓
Calibration (uses all outputs)
```

**Rule:** Each stage reads outputs of prior stages, never re-reads raw database data.

**Exception:** The evidence engine reads `tags` from ingredient records, but uses `finalScore` from scored ingredients (not `product_roles` directly). This is acceptable because tags are identity facts, not scores.

---

## 8. Confidence Reporting

Every score includes a confidence level:

```typescript
interface ScoredResult {
  formulaQuality: number;      // 0-100
  profileCompatibility: number; // 0-100
  recommendation: number;       // 0-100
  confidence: {
    formulaQuality: number;     // 0-100
    profileCompatibility: number; // 0-100
    overall: "high" | "medium" | "low";
  };
}
```

**Confidence decreases when:**
- Concentration estimates are uncertain (ingredients below 1% line)
- Category classification is uncertain (subtype detection confidence < 50%)
- Claim detection is uncertain (claim confidence < 0.5)
- Evidence is conflicting (supportive and contradictory evidence present)
- Few ingredients contribute to a dimension (< 3 contributors)

**Confidence increases when:**
- Multiple ingredients support the same dimension
- Ingredients are in high-confidence positions (above 1% line)
- Evidence is consistent (no contradictions)
- Subtype detection is clear (confidence > 70%)

---

## 9. Benchmark: Discovery, Not Engineering

### Benchmark Structure

```
benchmark/
  v3-product-corpus.ts          # Real product INCI lists
  v3-adversarial/               # Attempts to fool the engine
    water-only.ts               # Water-only formulas
    marketing-heavy.ts          # Marketing > substance
    trace-active.ts             # Actives at position #40+
    contradictory.ts            # Claims that contradict ingredients
  v3-ranking-suites/            # Pairwise comparison validation
    formula-quality.ts          # A should beat B (independent of profile)
    profile-recommendation.ts   # A should beat B (for specific profile)
  v3-run-benchmark.ts           # Main benchmark runner
```

### Benchmark Rules

1. **Benchmark must be able to fail.** If every threshold passes, the benchmark is useless.
2. **Benchmark discovers anomalies.** It reports problems, not solutions.
3. **Ranking validation is primary.** Absolute scores are secondary.
4. **Real products are primary.** Synthetic cases are edge-case stress tests only.
5. **Adversarial cases must fail.** If water-only scores > 20, the engine is wrong.

---

## 10. Implementation Sequence

1. Audit and finalize tag reliability (update `tagReliability.ts`)
2. Implement subtype detection (`productSubtype.ts`)
3. Implement evidence engine using scored ingredients (`evidenceEngine.ts`)
4. Implement completeness check (`formulaCompleteness.ts`)
5. Implement claim validation with contradiction detection (`claimValidator.ts`)
6. Implement confidence reporting (`confidenceCalculator.ts`)
7. Integrate all into `scoreFormulation.ts`
8. Create real product corpus
9. Create adversarial benchmark suite
10. Create ranking validation suites
11. Run benchmark and iterate

---

## 11. Success Criteria

The engine succeeds when:

1. A cosmetic chemist would agree with the rankings
2. Water-only products score < 20 on formula quality
3. Real products rank in realistic order
4. Formula quality is independent of user profile
5. Profile compatibility is independent of formula quality
6. No double-counting detected in audit
7. Every score includes confidence level
8. Benchmark discovers real weaknesses (not engineered passes)
9. Adversarial cases are caught
10. Unknown tags are surfaced for review
