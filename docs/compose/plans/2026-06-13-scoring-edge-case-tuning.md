# Scoring Engine: Documentation Fix + Functional Efficacy Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the benchmark weight table with actual code, then add a Functional Efficacy scoring dimension so products lacking category-appropriate active ingredients are penalized regardless of compatibility.

**Architecture:** Two-phase approach. Phase 1 is doc-only. Phase 2 adds a new scoring layer in the benchmark rule engine that checks minimum functional requirements per product category before profile-specific scoring runs.

**Tech Stack:** TypeScript, tsx runner, existing scoring engine

---

## Phase 1: Documentation Reconciliation

### Task 1: Fix Stale Weight Table

**Covers:** Benchmark report accuracy

**Files:**
- Modify: `scoringlogic+database/benchmark/v2-benchmark-report.md:49-70`

- [ ] **Step 1: Replace §5 weight table with actual code values**

```markdown
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
```

- [ ] **Step 2: Verify consistency with code**

Read `v2-run-benchmark.ts:110-398` and confirm every row in the table matches.

- [ ] **Step 3: Commit**

```bash
git add scoringlogic+database/benchmark/v2-benchmark-report.md
git commit -m "docs: reconcile weight table with actual code values in v2 benchmark report"
```

---

## Phase 2: Functional Efficacy Layer

### Task 2: Define Functional Requirements per Product Category

**Covers:** Efficacy scoring architecture

**Files:**
- Modify: `scoringlogic+database/benchmark/v2-run-benchmark.ts` (add detection helpers + efficacy check)

- [ ] **Step 1: Add functional ingredient detection helpers**

After the existing `hasEmollient` helper (~line 78), add:

```typescript
// ─── FUNCTIONAL EFFICACY HELPERS ─────────────────────────────────────────────

function hasCleansingSurfactant(ingredients: string): boolean {
  return hasIngredient(ingredients,
    "sodium cocoyl isethionate", "cocamidopropyl betaine", "sodium laureth sulfate",
    "sodium lauryl sulfate", "coco-glucoside", "decyl glucoside", "sodium cocoyl glutamate",
    "disodium cocoyl glutamate", "lauryl glucoside", "sodium lauryl sulfoacetate",
    "cocamidopropyl hydroxysultaine", "sodium cocamphoacetate");
}

function hasConditioningAgent(ingredients: string): boolean {
  return hasIngredient(ingredients,
    "behentrimonium chloride", "cetearyl alcohol", "cetyl alcohol", "stearyl alcohol",
    "polyquaternium-10", "polyquaternium-11", "guar hydroxypropyltrimonium chloride",
    "cationic surfactant", "btms");
}

function hasTreatmentActive(ingredients: string): boolean {
  return hasProtein(ingredients) || hasBondBuilder(ingredients) || hasCeramide(ingredients) ||
    hasIngredient(ingredients, "amino acid", "panthenol", "niacinamide", "salicylic acid",
      "tea tree", "biotin", "caffeine", "peppermint");
}

function hasFunctionalSerumIngredient(ingredients: string): boolean {
  return hasIngredient(ingredients,
    "simmondsia chinensis", "argania spinosa", "coconut oil", "castor oil",
    "dimethicone", "cyclomethicone", "phenyl trimethicone", "dimethiconol",
    "amodimethicone", "jojoba oil", "argan oil", "marula oil", "vitamin e",
    "tocopheryl", "squalane");
}
```

- [ ] **Step 2: Add the efficacy check function**

After the helpers, add:

```typescript
interface EfficacyResult {
  passed: boolean;
  penalty: number;
  reason: string;
}

function checkFunctionalEfficacy(cat: string, ingredients: string): EfficacyResult {
  switch (cat) {
    case "shampoo":
    case "co_wash": {
      const hasSurfactant = hasCleansingSurfactant(ingredients);
      if (!hasSurfactant) {
        return { passed: false, penalty: -60, reason: "no cleansing surfactant detected" };
      }
      return { passed: true, penalty: 0, reason: "surfactant present" };
    }
    case "rinse_out_conditioner":
    case "leave_in_conditioner": {
      const hasConditioner = hasConditioningAgent(ingredients) || hasEmollient(ingredients) || hasHumectant(ingredients);
      if (!hasConditioner) {
        return { passed: false, penalty: -55, reason: "no conditioning/emollient/humectant agent detected" };
      }
      return { passed: true, penalty: 0, reason: "conditioning agents present" };
    }
    case "deep_conditioner_mask":
    case "mask": {
      const hasActive = hasConditioningAgent(ingredients) || hasEmollient(ingredients) || hasTreatmentActive(ingredients);
      if (!hasActive) {
        return { passed: false, penalty: -55, reason: "no conditioning/treatment active detected" };
      }
      return { passed: true, penalty: 0, reason: "active agents present" };
    }
    case "serum": {
      const hasFunctional = hasFunctionalSerumIngredient(ingredients);
      if (!hasFunctional) {
        return { passed: false, penalty: -60, reason: "no functional serum ingredient detected" };
      }
      return { passed: true, penalty: 0, reason: "functional ingredients present" };
    }
    case "treatment": {
      const hasActive = hasTreatmentActive(ingredients);
      if (!hasActive) {
        return { passed: false, penalty: -60, reason: "no treatment active detected" };
      }
      return { passed: true, penalty: 0, reason: "treatment actives present" };
    }
    case "styling_product": {
      const hasStyler = hasIngredient(ingredients, "polyquaternium", "pvp", "carbomer",
        "peg-40", "cetearyl alcohol", "behentrimonium", "gel", "mousse");
      if (!hasStyler) {
        return { passed: false, penalty: -50, reason: "no styling agent detected" };
      }
      return { passed: true, penalty: 0, reason: "styling agents present" };
    }
    default:
      return { passed: true, penalty: 0, reason: "unknown category, no check" };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scoringlogic+database/benchmark/v2-run-benchmark.ts
git commit -m "feat: add functional efficacy detection helpers and category checks"
```

---

### Task 3: Integrate Efficacy Check into Rule Engine

**Covers:** Efficacy scoring integration

**Files:**
- Modify: `scoringlogic+database/benchmark/v2-run-benchmark.ts:102-108` (applyRules function)

- [ ] **Step 1: Add efficacy check as the FIRST rule in applyRules**

Insert immediately after `const cat = c.product.category;` (line 108), before Rule 1:

```typescript
  // ── RULE 0: Functional efficacy gate ──
  const efficacy = checkFunctionalEfficacy(cat, ing);
  if (!efficacy.passed) {
    score += efficacy.penalty;
    rules.push({
      rule: "Rule 0: Functional efficacy",
      applied: true,
      penalty: efficacy.penalty,
      reason: efficacy.reason,
    });
  } else {
    rules.push({
      rule: "Rule 0: Functional efficacy",
      applied: false,
      penalty: 0,
      reason: efficacy.reason,
    });
  }
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/benchmark/v2-run-benchmark.ts
git commit -m "feat: integrate functional efficacy gate as Rule 0 in scoring engine"
```

---

### Task 4: Add Water-Only Test Cases

**Covers:** Efficacy benchmark validation

**Files:**
- Modify: `scoringlogic+database/benchmark/v2-generate-cases.ts` (add water-only products to templates)

- [ ] **Step 1: Add water-only product templates**

In the `PRODUCT_TEMPLATES` array, add these entries:

```typescript
  // ── WATER-ONLY PRODUCTS (efficacy edge cases) ──
  { category: "shampoo", subcategory: "water-only", name: "Water-Only Shampoo", ingredients: "Water" },
  { category: "rinse_out_conditioner", subcategory: "water-only", name: "Water-Only Conditioner", ingredients: "Water" },
  { category: "deep_conditioner_mask", subcategory: "water-only", name: "Water-Only Mask", ingredients: "Water" },
  { category: "serum", subcategory: "water-only", name: "Water-Only Serum", ingredients: "Water" },
  { category: "treatment", subcategory: "water-only", name: "Water-Only Treatment", ingredients: "Water" },
  { category: "leave_in_conditioner", subcategory: "water-only", name: "Water-Only Leave-In", ingredients: "Water" },
  { category: "co_wash", subcategory: "water-only", name: "Water-Only Co-Wash", ingredients: "Water" },
```

- [ ] **Step 2: Commit**

```bash
git add scoringlogic+database/benchmark/v2-generate-cases.ts
git commit -m "feat: add water-only product templates for efficacy edge case testing"
```

---

### Task 5: Run Full Benchmark and Analyze

**Covers:** Validation of efficacy layer

**Files:**
- Read: `scoringlogic+database/benchmark/v2-benchmark-report.md` (generated output)

- [ ] **Step 1: Run the benchmark**

```bash
npx tsx scoringlogic+database/benchmark/v2-run-benchmark.ts
```

- [ ] **Step 2: Verify water-only products score extremely low**

Check that water-only shampoo/conditioner/serum/treatment all score below 20.

- [ ] **Step 3: Verify all 6 thresholds still pass**

- [ ] **Step 4: Report results**

Record:
- All 6 threshold counts
- Average, median, min, max
- Bucket distribution
- Water-only product scores (should be <20)
- Top 5 closest-to-threshold cases
- Any regressions

- [ ] **Step 5: Commit report**

```bash
git add scoringlogic+database/benchmark/v2-benchmark-report.md
git commit -m "benchmark: v2 results with functional efficacy layer"
```

---

## Acceptance Criteria

- [ ] Weight table in §5 matches actual code exactly
- [ ] Water-only shampoo scores < 20
- [ ] Water-only conditioner scores < 20
- [ ] Water-only serum scores < 20
- [ ] Water-only treatment scores < 20
- [ ] All 6 thresholds pass (no regressions)
- [ ] No bucket exceeds 25%
- [ ] Average score remains in 45–60 range
