# Product INCI Analyzer 2.0 - Core Scoring Engine Audit

## 1. High-Level Overview

### The Objective
The core objective of the Product INCI Analyzer scoring system is to evaluate cosmetic (specifically hair care) formulations based on their ingredient lists (INCI) and adapt that evaluation to a specific user's physical profile. Rather than delivering a generic "toxic vs. clean" rating, the engine acts as an expert formulator and dermatologist. It calculates a highly personalized **suitability score**, subscores (like conditioning or cleansing efficiency), and risk assessments (like buildup or harshness) tailored to variables such as hair porosity, curl pattern, scalp sensitivity, and chemical treatment history.

### The Conceptual Model of "Score"
The "score" in this project represents **profile compatibility and formulation efficacy**. It is a deterministic, heuristic-driven value mapped on a `[0, 100]` scale. 
- **100** represents an ideal, synergistic formulation that perfectly matches the user's hair needs with no penalties.
- **< 60** usually indicates severe mismatches (e.g., heavy silicones on low-porosity hair, or harsh sulfates on damaged hair).
The final score is not merely an average of ingredient scores; it is an **active-weighted aggregate** that emphasizes the most impactful ingredients while applying systemic formulation-level modifiers (such as overall humectant balance or surfactant interactions).

---

## 2. Architecture of the Scoring Logic

The scoring engine is implemented as a functional, pure-pipeline architecture. State is immutable, and side-effects are strictly forbidden during the scoring phases.

### Data Flow
1. **Input (Raw INCI & Profile)**: The user provides a raw comma-separated string of ingredients and a highly detailed `HairProfile` JSON object.
2. **Preprocessing (Identity Resolution)**: The INCI string is tokenized and resolved against a canonical database. Each string becomes a `ResolvedIngredient` (a hit linked to an `IngredientRecord`, or a miss).
3. **Base Scoring**: Each ingredient hit retrieves a base suitability score depending on the specific product type (e.g., shampoo vs. leave-in conditioner).
4. **Heuristic Pipeline**: A series of pure functions apply profile-aware modifiers to the base score.
5. **Formulation-Level Analysis**: Systemic checks (e.g., buildup risks, total surfactant load, protein balance) emit formulation-wide modifiers and heuristic warnings.
6. **Aggregation**: The active-weighted formulation score is computed, systemic modifiers are applied, and subscores are calculated.
7. **Output**: A comprehensive `AnalysisResult` containing the final score, subscores, warnings, and a fully transparent audit trace (`scoreTrace`).

### Main Modules
- `engine/pipeline/`: Orchestrates the parser and identity resolution.
- `scoring/scoreFormulation.ts`: The main orchestrator of the scoring phase.
- `scoring/scoreIngredient.ts`: Handles base lookup and initial profile modification.
- `scoring/positionWeighting.ts`: Computes positional decay (ingredients higher up the list matter more).
- `scoring/cleanserHarshness.ts`, `scoring/proteinBalance.ts`, `scoring/builtupAnalysis.ts`: Specialized heuristic systems acting as expert rulesets.
- `interactions/`: Phase 4 declarative rules engine for detecting overlapping contraindications.

---

## 3. Mathematical and Logical Foundations

The system relies on a multiplicative and additive modifier model. 

### Base Score & Profile Multipliers
Every ingredient starts with a base score from `0` to `100` based on its `ProductRole`. Modifiers are strictly defined constants applied multiplicatively. For instance:
- `Base Score`: 80
- `STRONG_DRY_SCALP_PENALTY`: `0.78`
- `Adjusted` = `80 * 0.78 = 62.4`

### Position Decay Weighting
Ingredients at the beginning of an INCI list are present in higher concentrations. The engine mathematically simulates this using a logarithmic decay function:
- The first ingredient receives the highest weight.
- A `POSITION_DECAY_FACTOR` (default `0.85` or similar) smoothly decreases the influence of subsequent ingredients.
- To prevent formulations with 50 ingredients from diluting the score to zero, the final score uses an **Active-Weighted formula**:
  `formulationScore = (Top 1 Active * 0.4) + (Top 5 Average * 0.4) + (Support Average * 0.2)`

### Key Heuristic Formulas
1. **Cleanser Harshness Stack Penalty**: Multiple strong sulfates compound damage non-linearly. The engine applies a `STRONG_SURFACTANT_STACK_PENALTY` (`0.90`) to every strong surfactant after the first.
2. **Multi-Penalty Soft Floor**: A critical mathematical safeguard. If an ingredient (e.g., heavy silicone) gets hit by molecular weight penalties (`0.85`), buildup penalties (`0.80`), and negligible concentration weight (`0.40`), the raw multiplier drops to `0.272`. A `MULTI_PENALTY_FLOOR` of `0.35` kicks in to prevent the score from collapsing entirely while retaining a strong penalty signal.
3. **Profile Compatibility Modifier**: A final, systemic multiplier applied directly to the formulation score. Critical mismatches (e.g., single-bond repair on severely damaged hair) apply macroscopic fractional multipliers.
4. **Soft Compression**: Scores above `90` are gently compressed (slope `10/60` or `10/45`) to map mathematically into a strict `[0, 100]` bound while preserving the relative distance between top-tier products.

---

## 4. Database and Data Model

The backbone of the engine is `database/ingredients.v3.json`, strictly enforced by `database/schema/ingredient.schema.json`.

### Schema Highlights
- **`IngredientRecord`**: The canonical entity. Requires `name`, `category`, specific profile compatibility flags (`low`, `med`, `high` porosity; `fine`, `oily`), `tags`, and physical properties (`molecular_weight_da`, `ionic_charge`, `penetration_depth`).
- **`ProductRoles`**: Pre-computed baseline suitability scores. Dimethicone might score `80` in a `deep_conditioner_mask` but `20` in a `shampoo`. 
- **Flags**: Profile flags (`g` = good, `b` = bad/avoid, `n` = neutral) dictate early-stage multipliers before complex heuristics run.

### Tightly Coupled Nature
The scoring heuristics strictly rely on standard INCI naming, strict category strings (e.g., `"Silicone"`, `"Surfactant"`), and tags (e.g., `"sulfate"`). If the DB lacks `molecular_weight_da` for a protein, the `molecularWeightHeuristics.ts` silently falls back to a neutral `1.0` multiplier, implicitly assuming the data structure is complete.

---

## 5. Configuration and Tunable Parameters

The system eschews external `.env` configs in favor of strongly-typed, immutable constants located directly at the top of heuristic files. This ensures pure, deterministic execution.

- **`cleanserHarshness.ts`**:
  - `STRONG_DRY_SCALP_PENALTY` = 0.78
  - `STRONG_LOW_POROSITY_BONUS` = 1.05
  - `STRONG_SURFACTANT_STACK_PENALTY` = 0.90
- **`scoreFormulation.ts`**:
  - `MULTI_PENALTY_FLOOR` = 0.35 (Activates only for Silicone/Film Former categories).
- **`molecularWeightHeuristics.ts`**:
  - `MW_LOW_THRESHOLD_DA` = 1000
  - `MW_HIGH_THRESHOLD_DA` = 3000
  - `MW_HEAVY_SILICONE_THRESHOLD_DA` = 100000

*Tuning Impact:* Altering `MULTI_PENALTY_FLOOR` from `0.35` to `0.50` would dramatically raise the score of cheap, silicone-heavy drugstore masks, flattening the curve between premium and low-tier products.

---

## 6. Execution Flow

When `analyze()` is invoked in `engine/index.ts`:

1. **Initialization**: Validates DB version. Tokenizes raw INCI string.
2. **Identity Resolution**: `resolveIngredients` builds lookup indexes and matches string tokens to `IngredientRecord`s.
3. **Scoring Invocation**: `scoreFormulation(resolved, profile)` takes over.
4. **Hit/Miss Partitioning**: Unknown ingredients are logged but don't crash the system.
5. **Concentration Estimation**: Calculates "1% line" boundaries to estimate relative weights.
6. **Ingredient Scoring Loop**: For each resolved ingredient, `scoreIngredient` fetches the base role score. The loop cascades through:
   - `applyMolecularWeightHeuristics`
   - `applyHumectantEnvironment`
   - `applyProteinModifier`
   - `applyCleanserHarshnessModifier`
   - `applyAdvancedProfileModifiers`
7. **Formulation-Level Logic**: `analyzeSurfactantLoad` and `analyzeFormulationBalance` look at the entire array of scored ingredients to emit global modifiers.
8. **Aggregation**: The active-weighted score is calculated. Global modifiers are multiplied in.
9. **Final Output**: `AnalysisResult` is constructed containing `formulationScore`, discrete subscores (e.g. `cleansingEfficiency`), and the exhaustive `scoreTrace` detailing every mathematical operation applied.

---

## 7. Concrete Examples

### Scenario 1: Basic Hydrating Shampoo
**Input**: `"Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin"`
**Profile**: `productType: shampoo`, `oiliness: normal`, `porosity: med`, `condition: normal`

- **Water**: Baseline score applied. Neutral.
- **Sodium Laureth Sulfate (SLES)**: Tagged as anionic/sulfate. `classifySurfactantHarshness` identifies it as `"strong"`. Since scalp is normal, no penalty is applied. Base score remains intact.
- **Cocamidopropyl Betaine (CAPB)**: Identified as `"mild"`. No penalty.
- **Glycerin**: Humectant. Boosts the moisture subscore.
- **Final Formulation**: Standard active-weighted score (~80s). No stacking warnings emitted because there is only one strong surfactant.

### Scenario 2: Harsh Shampoo on Dry, Damaged Hair
**Input**: `"Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate"`
**Profile**: `productType: shampoo`, `oiliness: dry`, `condition: damaged`

- **Sodium Lauryl Sulfate (SLS)**: `"strong"` surfactant.
  - *Heuristic 1*: `profile.oiliness === "dry"` -> Penalty `×0.78` (`STRONG_DRY_SCALP_PENALTY`).
  - *Heuristic 2*: `profile.condition === "damaged"` -> Penalty `×0.82` (`STRONG_DAMAGED_PENALTY`).
- **Sodium Laureth Sulfate (SLES)**: `"strong"` surfactant.
  - *Heuristic 1 & 2*: Same dry/damaged penalties applied.
  - *Heuristic 3*: `analyzeSurfactantLoad` sees this is the *second* strong surfactant. Applies `STRONG_SURFACTANT_STACK_PENALTY` (`×0.90`).
- **Result**: Both ingredients' scores collapse. A formulation warning `surfactant_load_stacking` is emitted. The active-weighted final score plummets to < 50.

### Scenario 3: Heavy Silicones on Low Porosity Hair
**Input**: `"Water, Dimethicone, Amodimethicone"`
**Profile**: `productType: leave_in_conditioner`, `porosity: low`

- **Dimethicone**: Category: `"Silicone"`.
  - MW Heuristic checks weight (often > 100k Da). Emits heavy silicone penalty (`×0.85`).
  - Buildup Heuristic sees `"low"` porosity. Low porosity hair accumulates heavy silicones quickly. Penalty (`×0.80`).
- **Score Protection**: The combined penalty `0.85 × 0.80 = 0.68`. Since it does not drop below `0.35` (`MULTI_PENALTY_FLOOR`), the math remains. If a third penalty applied and dropped it to `0.25`, the floor would catch it at `0.35`.

---

## 8. Limitations and Assumptions

1. **The 1% Line Assumption**: The system estimates concentrations based on industry conventions (ingredients < 1% can be listed in any order). While highly sophisticated, it is ultimately a heuristic guess. Unorthodox INCI listings can skew the active-weighted calculation.
2. **Binary Categorization**: Ingredients must be mapped to discrete categories. Hybrid ingredients (e.g., a surfactant that also heavily conditions) rely on manual tuning in the JSON DB to reflect dual roles, which limits flexibility if the DB is unmaintained.
3. **Missing Data Fallbacks**: If `molecular_weight_da` is missing for a heavy polymer in the database, the engine defaults to treating it neutrally. The scoring logic assumes a highly mature, heavily audited dataset.
4. **No Side-Effects Design**: Because the engine is completely pure, it cannot dynamically query external databases for unknown ingredients during runtime. Unresolved ingredients are simply logged and assigned `0` points, inherently dragging down formulation confidence.

---

## 9. Refactoring Notes (Standalone Extraction)

To cleanly extract the core scoring engine from the broader project context into `movetothisfolder`:

1. **Folder Preservation**: `scoring/`, `engine/`, `analysis/`, `contracts/`, `interactions/`, `rules/`, and `database/` were moved identically to preserve relative pathing. `identity/recognition/` was also extracted as it represents the fundamental preprocessing step converting strings to Database Records.
2. **V2 Deprecation Removed**: `engine/v2/` contained older architectural remnants and experimental subsystems (intent classifiers, explanation generators) that were not imported by the main `engine/index.ts`. It was fully stripped.
3. **Type Cleanup**: In `engine/shared/types.ts`, an outdated import to the now-removed `v2/productTypeDetection` module was refactored to `any` to ensure the type-checker passes without requiring legacy files.
4. **Standalone Verification**: A self-contained `test.ts` was written, proving the system can intake a raw string, successfully parse, resolve against `ingredients.v3.json`, and run the entire 7-phase formulation heuristic pipeline without external dependencies. 

The resulting folder represents the pure mathematical heart of the INCI Analyzer, fully capable of production deployment as a serverless function or isolated microservice.
