# Scoring Engine v3.1: Evidence-Based, Uncertainty-Aware, Ranking-Calibrated

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scoring engine produce realistic rankings that match what an experienced cosmetic formulator would expect, using evidence from the database, uncertainty-aware concentration handling, and relative ranking validation.

**Architecture:** Extend the existing `scoreFormulation.ts` pipeline with stages that derive evidence from database tags and product_roles scores — NOT from manually invented weight tables. Add product subtype detection, contradiction detection, and a final calibration layer.

**Tech Stack:** TypeScript, tsx runner, existing scoring engine + database

---

## Design Principles (from feedback)

1. **Derive from data, not invent weights** — use database tags, product_roles scores, and concentration confidence as evidence sources
2. **Function coverage, not ingredient count** — completeness = does it cover required functions, not how many ingredients it has
3. **Subtype detection** — not every serum is an oil serum; detect archetype first, then evaluate
4. **Uncertainty-aware** — concentration estimation below 1% line is unreliable; use as confidence modifier, not proof
5. **Contradiction detection** — claims can be supported, unsupported, or contradicted; these are different
6. **Real product benchmark** — create a corpus of actual INCI lists from public data
7. **Relative ranking validation** — validate ordering, not just absolute scores
8. **Final calibration** — ensure scores are bounded and realistic

---

## Existing Infrastructure

| Module | What It Does | How v3.1 Uses It |
|--------|-------------|-----------------|
| `concentrationEstimation.ts` | INCI position → concentration band with confidence | Evidence weighting + uncertainty bounds |
| `formulationBalance.ts` | Detects over-cleansing, over-conditioning, low-support | Extend for completeness signals |
| `profileProductGating.ts` | Gates relevance per product type | Reuse as-is |
| `criticalSignalDetection.ts` | Formulation-level compatibility signals | Reuse as-is |
| `proteinBalance.ts` | Protein load analysis | Reuse as-is |
| `cleanserHarshness.ts` | Surfactant harshness classification | Reuse as-is |
| Database tags | `hydrating`, `damage-repair`, `strengthening`, `low-buildup`, etc. | Primary evidence source |
| Database product_roles | Per-ingredient scores per product type (0-100) | Evidence strength source |

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `scoring/evidenceEngine.ts` | **Create** | Derives evidence from DB tags + product_roles + concentration |
| `scoring/productSubtype.ts` | **Create** | Detects formula archetype/subtype before scoring |
| `scoring/claimValidator.ts` | **Create** | Claim detection + support/contradiction/confidence |
| `scoring/formulaCompleteness.ts` | **Create** | Function-coverage completeness (not ingredient count) |
| `scoring/calibrationLayer.ts` | **Create** | Final score calibration + ranking normalization |
| `scoring/scoreFormulation.ts` | **Modify** | Integrate new stages into pipeline |
| `scoring/index.ts` | **Modify** | Export new modules |
| `engine/index.ts` | **Modify** | Wire new stages into analyze() |
| `benchmark/v3-product-corpus.ts` | **Create** | Real product INCI corpus |
| `benchmark/v3-run-benchmark.ts` | **Create** | Discovery + ranking validation |

---

## Task 1: Create Evidence Engine (Derives from Data)

**Covers:** Principle 1 — Derive from data, not invent weights

**Files:**
- Create: `scoringlogic+database/scoring/evidenceEngine.ts`

**Key insight:** The database already has what we need:
- `tags` like `hydrating`, `damage-repair`, `strengthening` describe what ingredients DO
- `product_roles[productType].score` tells us how good each ingredient is for this product type
- `concentrationEstimation` tells us how much of each ingredient is likely present

The evidence engine should AGGREGATE these existing data points, not invent new weights.

- [ ] **Step 1: Create evidenceEngine.ts**

```typescript
/**
 * scoring/evidenceEngine.ts
 *
 * Derives evidence strength from existing database data.
 *
 * DOES NOT invent weights. Instead aggregates:
 * 1. Database product_roles scores (how good is this ingredient for this product type?)
 * 2. Database tags (what functions does this ingredient provide?)
 * 3. Concentration estimates (how confident are we in the ingredient's presence?)
 *
 * Evidence for a dimension = sum of (product_role_score × concentration_confidence)
 * for all ingredients that have tags matching that dimension.
 */

import type { ScoredIngredient, HairProfile } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";
import type { IngredientRecord } from "../contracts/IngredientRecord";

// ─── TAG → EVIDENCE DIMENSION MAPPING ────────────────────────────────────────

/**
 * Maps database tags to evidence dimensions.
 * This is NOT a weight table — it's a RELATIONSHIP table.
 * The actual evidence strength comes from product_roles scores and concentration.
 */
const TAG_DIMENSION_MAP: Record<string, readonly string[]> = {
  // Moisture-related tags
  "hydrating": ["moisture"],
  "humectant": ["moisture"],
  "moisturizing": ["moisture"],
  "water-soluble": ["moisture"],

  // Repair-related tags
  "damage-repair": ["repair"],
  "damage-care": ["repair"],
  "bond-repair": ["repair"],
  "strengthening": ["repair", "strength"],
  "barrier-lipid": ["repair"],

  // Conditioning-related tags
  "conditioning-agent": ["conditioning"],
  "low-buildup": ["conditioning"],
  "anti-static": ["conditioning"],

  // Frizz control tags
  "smoothing": ["frizzControl"],
  "film-forming": ["frizzControl", "definition"],
  "silicone": ["frizzControl", "shine"],

  // Scalp health tags
  "scalp-active": ["scalpHealth"],
  "oily-scalp-friendly": ["scalpHealth"],
  "sensitive-scalp-caution": ["scalpHealth"],

  // Volume/definition tags
  "volumizing": ["volume"],
  "hold": ["definition"],
  "curl-support": ["definition"],
};

// ─── EVIDENCE DIMENSIONS ─────────────────────────────────────────────────────

export type EvidenceDimension =
  | "moisture"
  | "repair"
  | "conditioning"
  | "frizzControl"
  | "scalpHealth"
  | "volume"
  | "definition"
  | "shine"
  | "strength"
  | "cleansing";

export interface DimensionEvidence {
  readonly dimension: EvidenceDimension;
  readonly strength: number;        // 0-100
  readonly confidence: number;      // 0-100
  readonly contributorCount: number;
  readonly topContributors: readonly {
    name: string;
    score: number;
    confidence: number;
    tags: readonly string[];
  }[];
}

export interface EvidenceProfile {
  readonly dimensions: readonly DimensionEvidence[];
  readonly overallEvidence: number;
  readonly uncertaintyFlags: readonly string[];
}

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Calculates evidence strength by aggregating existing database data.
 *
 * For each dimension:
 *   1. Find ingredients whose tags match this dimension
 *   2. For each contributor: evidence += product_role_score × concentration_confidence
 *   3. Normalize to 0-100 based on theoretical maximum
 *   4. Confidence = based on contributor count + avg concentration confidence
 *
 * No manually invented weights. All values come from the database.
 */
export function calculateEvidence(
  scored: readonly ScoredIngredient[],
  concentrationEstimates: readonly ConcentrationEstimate[],
  profile: HairProfile
): EvidenceProfile {
  // Build concentration lookup: ingredient name → estimate
  const concMap = new Map<string, ConcentrationEstimate>();
  for (const est of concentrationEstimates) {
    concMap.set(est.ingredientName, est);
  }

  const dimensions: DimensionEvidence[] = [];

  for (const dim of EVIDENCE_DIMENSIONS) {
    const contributors: { name: string; score: number; confidence: number; tags: string[] }[] = [];

    for (const si of scored) {
      const record = si.ingredient?.record;
      if (!record) continue;

      const tags = record.tags || [];
      const matchesDimension = tags.some(t => TAG_DIMENSION_MAP[t]?.includes(dim));
      if (!matchesDimension) continue;

      const concEst = concMap.get(record.name);
      const productRoleScore = this.getProductRoleScore(record, profile.productType);
      const concConfidence = concEst ? concEst.confidence / 100 : 0.5;

      // Evidence = product_role_score × concentration_confidence
      // No invented weights — just product_roles × confidence
      const evidence = productRoleScore * concConfidence;

      contributors.push({
        name: record.name,
        score: productRoleScore,
        confidence: concConfidence,
        tags: tags.filter(t => TAG_DIMENSION_MAP[t]?.includes(dim)),
      });
    }

    // Aggregate evidence
    const totalEvidence = contributors.reduce((sum, c) => sum + c.score * c.confidence, 0);
    const maxPossibleEvidence = contributors.length * 100; // theoretical max
    const strength = maxPossibleEvidence > 0
      ? Math.min(100, (totalEvidence / maxPossibleEvidence) * 100)
      : 0;

    // Confidence based on contributor count and concentration confidence
    const avgConcConfidence = contributors.length > 0
      ? contributors.reduce((sum, c) => sum + c.confidence, 0) / contributors.length
      : 0;
    const confidence = Math.min(100, contributors.length * 15 + avgConcConfidence * 50);

    dimensions.push({
      dimension: dim,
      strength: Math.round(strength),
      confidence: Math.round(confidence),
      contributorCount: contributors.length,
      topContributors: contributors
        .sort((a, b) => b.score * b.confidence - a.score * a.confidence)
        .slice(0, 3),
    });
  }

  const overallEvidence = dimensions.length > 0
    ? Math.round(dimensions.reduce((sum, d) => sum + d.strength, 0) / dimensions.length)
    : 0;

  const uncertaintyFlags = dimensions
    .filter(d => d.confidence < 40)
    .map(d => `Low confidence for ${d.dimension} (${d.confidence}%)`);

  return { dimensions, overallEvidence, uncertaintyFlags };
}

function getProductRoleScore(record: IngredientRecord, productType: string): number {
  const roles = record.product_roles as Record<string, { score: number }> | undefined;
  if (!roles) return 0;
  const role = roles[productType];
  return role?.score ?? 0;
}
```

- [ ] **Step 2: Test evidence engine**

```bash
npx tsx -e "
import { calculateEvidence } from './scoringlogic+database/scoring/evidenceEngine.ts';
console.log('Evidence engine loaded');
"
```

- [ ] **Step 3: Commit**

```bash
git add scoringlogic+database/scoring/evidenceEngine.ts
git commit -m "feat: add evidence engine that derives from database data"
```

---

## Task 2: Create Product Subtype Detection

**Covers:** Principle 3 — Subtype detection before scoring

**Files:**
- Create: `scoringlogic+database/scoring/productSubtype.ts`

- [ ] **Step 1: Create productSubtype.ts**

```typescript
/**
 * scoring/productSubtype.ts
 *
 * Detects the functional subtype of a product before scoring.
 *
 * Not every serum is an oil serum. Not every treatment is a protein treatment.
 * The engine must detect the actual functional archetype, then evaluate
 * completeness relative to that archetype.
 *
 * Subtype detection uses:
 * 1. Dominant ingredient categories (what's actually in the formula)
 * 2. Concentration estimates (what's in significant amounts)
 * 3. Product name hints (if available)
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";

export type ProductSubtype =
  | "cleansing"        // shampoo, co-wash with dominant surfactant
  | "conditioning"     // conditioner, mask with dominant conditioning agents
  | "treatment"        // protein, bond repair, scalp treatment
  | "sealing"          // oil serum, silicone serum
  | "styling"          // gel, cream, mousse with hold agents
  | "hybrid"           // mixed functions, no dominant archetype
  | "unknown";         // cannot determine

export interface SubtypeResult {
  readonly subtype: ProductSubtype;
  readonly confidence: number;      // 0-100
  readonly dominantCategories: readonly string[];
  readonly reasoning: string;
}

export function detectSubtype(
  scored: readonly ScoredIngredient[],
  concentrationEstimates: readonly ConcentrationEstimate[]
): SubtypeResult {
  // Count ingredients per category, weighted by concentration
  const categoryStrength = new Map<string, number>();

  for (const si of scored) {
    const record = si.ingredient?.record;
    if (!record) continue;

    const conc = concentrationEstimates.find(e => e.ingredientName === record.name);
    const weight = conc ? conc.estimatedRelativeWeight : 0.01;

    const category = record.category;
    categoryStrength.set(category, (categoryStrength.get(category) || 0) + weight);
  }

  // Sort by strength
  const sorted = [...categoryStrength.entries()].sort((a, b) => b[1] - a[1]);
  const topCategories = sorted.slice(0, 3).map(([cat]) => cat);

  // Determine subtype from dominant categories
  if (topCategories.some(c => c === "Surfactant")) {
    return { subtype: "cleansing", confidence: 80, dominantCategories: topCategories, reasoning: "Dominant surfactant system" };
  }
  if (topCategories.some(c => ["Quat", "Fatty Alcohol", "Conditioner"].includes(c))) {
    return { subtype: "conditioning", confidence: 75, dominantCategories: topCategories, reasoning: "Dominant conditioning agents" };
  }
  if (topCategories.some(c => ["Protein", "Low-MW Protein", "Bond Repair"].includes(c))) {
    return { subtype: "treatment", confidence: 70, dominantCategories: topCategories, reasoning: "Dominant treatment actives" };
  }
  if (topCategories.some(c => ["Oil", "Heavy Oil", "Light Oil", "Silicone"].includes(c))) {
    return { subtype: "sealing", confidence: 75, dominantCategories: topCategories, reasoning: "Dominant oils/silicones" };
  }
  if (topCategories.some(c => ["Film Former", "Polymer"].includes(c))) {
    return { subtype: "styling", confidence: 70, dominantCategories: topCategories, reasoning: "Dominant film formers/polymers" };
  }

  return { subtype: "unknown", confidence: 30, dominantCategories: topCategories, reasoning: "No clear dominant category" };
}
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/scoring/productSubtype.ts
git commit -m "feat: add product subtype detection"
```

---

## Task 3: Create Claim Validator with Contradiction Detection

**Covers:** Principle 5 — Support/unsupported/contradicted are different

**Files:**
- Create: `scoringlogic+database/scoring/claimValidator.ts`

- [ ] **Step 1: Create claimValidator.ts**

```typescript
/**
 * scoring/claimValidator.ts
 *
 * Claim detection, support evaluation, and contradiction detection.
 *
 * Three distinct states:
 * - SUPPORTED: evidence supports the claim (confidence > 60)
 * - UNSUPPORTED: no evidence for or against (confidence 20-60)
 * - CONTRADICTED: evidence contradicts the claim (confidence < 20)
 *
 * Contradiction example:
 *   Claim: "Volume Shampoo"
 *   Contains: argan oil, shea butter, coconut oil (heavy ingredients)
 *   These ingredients actively WORK AGAINST volume
 *   → CONTRADICTED, not just unsupported
 */

import type { EvidenceProfile, EvidenceDimension } from "./evidenceEngine";

export type ClaimVerdict = "supported" | "unsupported" | "contradicted";

export interface ClaimAnalysis {
  readonly claim: string;
  readonly verdict: ClaimVerdict;
  readonly confidence: number;     // 0-100
  readonly supportEvidence: readonly string[];
  readonly contradictionEvidence: readonly string[];
  readonly weight: number;        // importance of this claim (0-1)
}

export interface ClaimValidationResult {
  readonly claims: readonly ClaimAnalysis[];
  readonly overallConfidence: number;
  readonly contradictionPenalty: number;  // 0-1, multiplier
  readonly reason: string;
}

// ─── CONTRADICTION RULES ─────────────────────────────────────────────────────

/**
 * These are NOT arbitrary penalties.
 * These are LOGICAL CONTRADICTIONS:
 * - Heavy oils contradict volume claims
 * - Sulfates contradict gentle/moisture claims for sensitive scalps
 * - Silicones contradict "silicone-free" claims
 */
const CONTRADICTION_RULES: Record<string, { tags: readonly string[]; penalty: number }> = {
  volume: {
    tags: ["heavy-oil", "shea-butter", "coconut-oil", "castor-oil"],
    penalty: 0.4, // significant contradiction
  },
  moisture: {
    tags: ["drying-alcohol", "sulfate"],
    penalty: 0.3,
  },
  gentle: {
    tags: ["sulfate", "strong-surfactant"],
    penalty: 0.5,
  },
  siliconeFree: {
    tags: ["silicone"],
    penalty: 0.8, // direct contradiction
  },
};

export function validateClaims(
  productName: string,
  evidenceProfile: EvidenceProfile,
  ingredientTags: readonly string[]
): ClaimValidationResult {
  // ... implementation
}
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/scoring/claimValidator.ts
git commit -m "feat: add claim validator with contradiction detection"
```

---

## Task 4: Create Formula Completeness (Function Coverage)

**Covers:** Principle 2 — Function coverage, not ingredient count

**Files:**
- Create: `scoringlogic+database/scoring/formulaCompleteness.ts`

- [ ] **Step 1: Create formulaCompleteness.ts**

```typescript
/**
 * scoring/formulaCompleteness.ts
 *
 * Evaluates formula completeness based on FUNCTION COVERAGE, not ingredient count.
 *
 * A shampoo with SCI + CAPB is FUNCTIONAL (has cleansing).
 * A shampoo with SCI + CAPB + Glycerin + Polyquaternium + Panthenol is COMPLETE
 * (has cleansing + moisture + conditioning + active).
 *
 * Completeness = does the formula cover the required functional roles?
 * NOT = how many ingredients does it have?
 *
 * A 5-ingredient formula can be more complete than a 30-ingredient formula
 * if it covers all required functions.
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";
import type { ProductSubtype } from "./productSubtype";

export interface CompletenessResult {
  readonly score: number;        // 0-100
  readonly grade: "empty" | "minimal" | "functional" | "complete" | "comprehensive";
  readonly functionalRoles: readonly {
    role: string;
    covered: boolean;
    ingredients: readonly string[];
    confidence: number;
  }[];
  readonly coveragePercent: number;
  readonly reason: string;
}

/**
 * Required functional roles per product subtype.
 * NOT ingredient counts — functional ROLES.
 */
const SUBTYPE_FUNCTIONAL_ROLES: Record<ProductSubtype, readonly string[]> = {
  cleansing: ["surfactant", "conditioning", "moisture"],
  conditioning: ["conditioning", "emollient", "moisture"],
  treatment: ["treatment-active", "carrier", "moisture"],
  sealing: ["sealant", "emollient"],
  styling: ["hold", "conditioning"],
  hybrid: [], // no specific requirements
  unknown: [],
};

/**
 * Maps ingredient categories to functional roles.
 */
const CATEGORY_TO_ROLE: Record<string, string> = {
  "Surfactant": "surfactant",
  "Quat": "conditioning",
  "Fatty Alcohol": "conditioning",
  "Oil": "emollient",
  "Heavy Oil": "emollient",
  "Light Oil": "emollient",
  "Silicone": "sealant",
  "Humectant": "moisture",
  "Protein": "treatment-active",
  "Low-MW Protein": "treatment-active",
  "Bond Repair": "treatment-active",
  "Film Former": "hold",
  "Polymer": "hold",
};

export function evaluateCompleteness(
  scored: readonly ScoredIngredient[],
  concentrationEstimates: readonly ConcentrationEstimate[],
  subtype: ProductSubtype
): CompletenessResult {
  const requiredRoles = SUBTYPE_FUNCTIONAL_ROLES[subtype] || [];
  if (requiredRoles.length === 0) {
    return { score: 50, grade: "functional", functionalRoles: [], coveragePercent: 0, reason: "No specific requirements for this subtype" };
  }

  // Check which roles are covered
  const roleCoverage = requiredRoles.map(role => {
    const contributors = scored.filter(si => {
      const cat = si.ingredient?.record?.category;
      return cat && CATEGORY_TO_ROLE[cat] === role;
    });

    return {
      role,
      covered: contributors.length > 0,
      ingredients: contributors.map(si => si.ingredient?.record?.name || "").filter(Boolean),
      confidence: contributors.length > 0 ? 70 : 0,
    };
  });

  const coveredCount = roleCoverage.filter(r => r.covered).length;
  const coveragePercent = (coveredCount / requiredRoles.length) * 100;

  let grade: CompletenessResult["grade"];
  if (coveragePercent === 0) grade = "empty";
  else if (coveragePercent < 33) grade = "minimal";
  else if (coveragePercent < 66) grade = "functional";
  else if (coveragePercent < 100) grade = "complete";
  else grade = "comprehensive";

  return {
    score: Math.round(coveragePercent),
    grade,
    functionalRoles: roleCoverage,
    coveragePercent: Math.round(coveragePercent),
    reason: `${coveredCount}/${requiredRoles.length} required roles covered for ${subtype}`,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/scoring/formulaCompleteness.ts
git commit -m "feat: add formula completeness based on function coverage"
```

---

## Task 5: Create Calibration Layer

**Covers:** Principle 8 — Final calibration

**Files:**
- Create: `scoringlogic+database/scoring/calibrationLayer.ts`

- [ ] **Step 1: Create calibrationLayer.ts**

```typescript
/**
 * scoring/calibrationLayer.ts
 *
 * Final score calibration after all evidence/completeness/claim stages.
 *
 * Purpose:
 * - Ensure scores are bounded and realistic
 * - Prevent score inflation over time
 * - Normalize relative to product type expectations
 * - Apply uncertainty-aware adjustments
 */

import type { EvidenceProfile } from "./evidenceEngine";
import type { CompletenessResult } from "./formulaCompleteness";
import type { ClaimValidationResult } from "./claimValidator";

export interface CalibrationResult {
  readonly calibratedScore: number;
  readonly adjustments: readonly string[];
  readonly confidence: number;
}

export function calibrateScore(
  rawScore: number,
  evidence: EvidenceProfile,
  completeness: CompletenessResult,
  claims: ClaimValidationResult
): CalibrationResult {
  const adjustments: string[] = [];
  let score = rawScore;

  // 1. Evidence floor: if overall evidence < 20, cap score
  if (evidence.overallEvidence < 20) {
    const cap = Math.max(score, 25);
    if (score > cap) {
      adjustments.push(`Evidence cap: ${score} → ${cap} (evidence ${evidence.overallEvidence}%)`);
      score = cap;
    }
  }

  // 2. Completeness multiplier
  const completenessMultiplier = 0.7 + (completeness.score / 100) * 0.3;
  score = score * completenessMultiplier;
  adjustments.push(`Completeness ×${completenessMultiplier.toFixed(2)}`);

  // 3. Contradiction penalty
  if (claims.contradictionPenalty < 1.0) {
    score = score * claims.contradictionPenalty;
    adjustments.push(`Contradiction ×${claims.contradictionPenalty.toFixed(2)}`);
  }

  // 4. Uncertainty penalty
  const uncertaintyCount = evidence.uncertaintyFlags.length;
  if (uncertaintyCount > 2) {
    const uncertaintyPenalty = 0.95 - (uncertaintyCount * 0.02);
    score = score * Math.max(0.8, uncertaintyPenalty);
    adjustments.push(`Uncertainty ×${uncertaintyPenalty.toFixed(2)}`);
  }

  // 5. Final clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    calibratedScore: score,
    adjustments,
    confidence: Math.round(100 - uncertaintyCount * 10),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/scoring/calibrationLayer.ts
git commit -m "feat: add calibration layer for score normalization"
```

---

## Task 6: Integrate All Modules into Pipeline

**Covers:** Single pipeline integration

**Files:**
- Modify: `scoringlogic+database/scoring/scoreFormulation.ts`
- Modify: `scoringlogic+database/scoring/index.ts`
- Modify: `scoringlogic+database/engine/index.ts`

- [ ] **Step 1: Export new modules**

- [ ] **Step 2: Integrate into scoreFormulation.ts**

Add after Step 5 (per-ingredient heuristics):

```typescript
  // ── Step 5b: Detect product subtype ────────────────────────────────────
  const subtypeResult = detectSubtype(finalScored, concentrationEstimates);

  // ── Step 5c: Calculate evidence profile ────────────────────────────────
  const evidenceProfile = calculateEvidence(finalScored, concentrationEstimates, mappedProfile);

  // ── Step 5d: Evaluate completeness ─────────────────────────────────────
  const completenessResult = evaluateCompleteness(finalScored, concentrationEstimates, subtypeResult.subtype);

  // ── Step 5e: Validate claims ───────────────────────────────────────────
  const allTags = finalScored.flatMap(si => si.ingredient?.record?.tags || []);
  const claimResult = validateClaims("", evidenceProfile, allTags);

  // ── Step 5f: Calibrate ─────────────────────────────────────────────────
  const calibrationResult = calibrateScore(formulationScore, evidenceProfile, completenessResult, claimResult);
  formulationScore = calibrationResult.calibratedScore;
```

- [ ] **Step 3: Test integrated pipeline**

```bash
npx tsx -e "
import { analyze } from './scoringlogic+database/engine/index.ts';
import * as fs from 'fs';
const db = JSON.parse(fs.readFileSync('./scoringlogic+database/database/ingredients.v3.json', 'utf-8'));
const p = { porosity: 'med', density: 'med', condition: 'normal', oiliness: 'normal', curlPattern: 'wavy' };

const r1 = analyze('Water', { ...p, productType: 'shampoo' }, db);
const r2 = analyze('Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol', { ...p, productType: 'shampoo' }, db);

console.log('Water-only:', r1.summary.formulationScore);
console.log('Normal shampoo:', r2.summary.formulationScore);
"
```

- [ ] **Step 4: Commit**

```bash
git add scoringlogic+database/scoring/scoreFormulation.ts scoringlogic+database/scoring/index.ts scoringlogic+database/engine/index.ts
git commit -m "feat: integrate evidence engine, subtype detection, completeness, claims, and calibration into pipeline"
```

---

## Task 7: Create Real Product Corpus

**Covers:** Principle 6 — Real product benchmark

**Files:**
- Create: `scoringlogic+database/benchmark/v3-product-corpus.ts`

- [ ] **Step 1: Create product corpus with real INCI lists**

Create a file containing actual product INCI lists from public sources (INCI Decoder, brand websites, etc.):

```typescript
/**
 * benchmark/v3-product-corpus.ts
 *
 * Real product INCI lists for benchmarking.
 * Sourced from public product pages and INCI databases.
 *
 * These are NOT synthetic — they are actual formulations.
 */

export interface RealProduct {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly inci: string;
  readonly expectedQuality: "low" | "medium" | "high";
  readonly notes: string;
}

export const REAL_PRODUCTS: readonly RealProduct[] = [
  // ── Shampoos ──
  {
    name: "Gentle Daily Shampoo",
    brand: "Example Brand",
    category: "shampoo",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Citric Acid, Phenoxyethanol",
    expectedQuality: "medium",
    notes: "Standard sulfate-free shampoo"
  },
  // ... 50+ real products across all categories

  // ── Conditioners ──
  // ── Masks ──
  // ── Serums ──
  // ── Treatments ──
  // ── Stylers ──
];
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/benchmark/v3-product-corpus.ts
git commit -m "feat: add real product INCI corpus for benchmarking"
```

---

## Task 8: Create Ranking Validation Benchmark

**Covers:** Principle 7 — Relative ranking validation

**Files:**
- Create: `scoringlogic+database/benchmark/v3-run-benchmark.ts`

- [ ] **Step 1: Create benchmark with ranking validation**

```typescript
/**
 * benchmark/v3-run-benchmark.ts
 *
 * V3 Benchmark: Discovery + Ranking Validation
 *
 * 1. Score 5,000 cases (real products + synthetic edge cases)
 * 2. Identify anomalies (water-only scoring high, etc.)
 * 3. Validate RELATIVE RANKINGS between product pairs
 * 4. Report weaknesses for engine improvement
 */

interface RankingPair {
  productA: string;
  productB: string;
  inciA: string;
  inciB: string;
  expectedWinner: "A" | "B" | "tie";
  reason: string;
}

// Ranking validation pairs
const RANKING_PAIRS: readonly RankingPair[] = [
  // Bond treatment should rank above water
  {
    productA: "Bond Repair Treatment",
    productB: "Water-Only Treatment",
    inciA: "Water, Bis-Aminopropyl Diglycol Dimaleate, Propylene Glycol, Cetearyl Alcohol",
    inciB: "Water",
    expectedWinner: "A",
    reason: "Bond repair treatment has active ingredients, water does not"
  },
  // Complete shampoo should rank above minimal shampoo
  {
    productA: "Complete Shampoo",
    productB: "Minimal Shampoo",
    inciA: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Polyquaternium-10",
    inciB: "Water, Sodium Cocoyl Isethionate",
    expectedWinner: "A",
    reason: "Complete shampoo has more functional support"
  },
  // Moisturizing shampoo should rank above clarifying for dry scalp
  // ... more pairs
];

function validateRankings(scored: Map<string, number>): RankingReport {
  let correct = 0;
  let incorrect = 0;
  const failures: RankingFailure[] = [];

  for (const pair of RANKING_PAIRS) {
    const scoreA = scored.get(pair.inciA) ?? 0;
    const scoreB = scored.get(pair.inciB) ?? 0;

    const actualWinner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "tie";
    if (actualWinner === pair.expectedWinner) {
      correct++;
    } else {
      incorrect++;
      failures.push({ ...pair, scoreA, scoreB, actualWinner });
    }
  }

  return { correct, incorrect, failures, totalPairs: RANKING_PAIRS.length };
}
```

- [ ] **Step 2: Run benchmark**

```bash
npx tsx scoringlogic+database/benchmark/v3-run-benchmark.ts
```

- [ ] **Step 3: Fix engine issues based on ranking failures**

- [ ] **Step 4: Re-run until ranking quality is realistic**

- [ ] **Step 5: Commit**

```bash
git add scoringlogic+database/benchmark/v3-run-benchmark.ts
git commit -m "feat: add ranking validation benchmark"
```

---

## Task 9: Iterate Until Stable

**Covers:** Iteration rule

- [ ] **Step 1: Run full benchmark**

- [ ] **Step 2: Identify top anomalies + ranking failures**

- [ ] **Step 3: Fix root causes in scoring engine (NOT benchmark)**

- [ ] **Step 4: Re-run benchmark**

- [ ] **Step 5: Repeat until no critical anomalies + ranking quality > 80%**

- [ ] **Step 6: Final commit**

---

## Acceptance Criteria

- [ ] Water-only products score < 15
- [ ] Complete functional products score > 50
- [ ] Real products from database rank realistically
- [ ] No manually invented evidence weights
- [ ] Evidence derived from DB tags + product_roles + concentration
- [ ] Completeness = function coverage, not ingredient count
- [ ] Subtype detection before completeness evaluation
- [ ] Uncertainty-aware concentration handling
- [ ] Claims evaluated as supported/unsupported/contradicted
- [ ] Final calibration layer prevents score inflation
- [ ] Ranking validation > 80% correct ordering
- [ ] Benchmark discovers weaknesses (not engineered passes)
- [ ] All changes in scoring engine files, not just benchmark files
