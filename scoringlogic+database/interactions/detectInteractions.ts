/**
 * interactions/detectInteractions.ts
 *
 * Deterministic interaction detection engine.
 *
 * Responsibilities:
 *   - Accept a ScoredFormulation and a HairProfile.
 *   - Evaluate every declarative rule in INTERACTION_REGISTRY independently.
 *   - Emit InteractionFlag entries for every rule that triggers.
 *   - Never mutate ingredients or alter scores.
 *   - Return a stable, sorted array of InteractionFlag.
 *
 * Supported condition types:
 *   - ingredient_present          : a named ingredient exists in resolved list
 *   - ingredient_category_present : at least one ingredient of a category exists
 *   - minimum_count               : resolved ingredient count >= minimumCount
 *   - co_occurrence               : all named ingredients are simultaneously present
 *   - product_type_match          : profile.productType equals the rule's productType
 *
 * Sort order (stable across runs):
 *   1. severity: high → medium → low
 *   2. rule id: lexicographic ascending
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No recursion, no cyclic execution, no mutation, no randomness.
 *   - Rules sourced exclusively from INTERACTION_REGISTRY.
 *   - No inline rules.
 *   - No fuzzy matching, no ML, no heuristics outside the registry.
 *   - Unresolved ingredients are ignored (only resolved hits participate).
 *   - Duplicate rule IDs are impossible by registry key uniqueness.
 */

import { INTERACTION_REGISTRY } from "../rules/interactionRegistry";
import type { ScoredFormulation, HairProfile } from "../engine/shared/types";
import type { InteractionFlag, InteractionSeverity } from "./types";

// ─── SEVERITY SORT ORDER ──────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InteractionSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

// ─── EVALUATION CONTEXT ───────────────────────────────────────────────────────

/**
 * Pre-computed lookup structures derived from the scored formulation.
 * Built once per detectInteractions() call; never mutated.
 */
interface EvalContext {
    /** Set of resolved canonical ingredient names (case-sensitive). */
    readonly resolvedNames: ReadonlySet<string>;
    /** Set of resolved ingredient categories (case-sensitive). */
    readonly resolvedCategories: ReadonlySet<string>;
    /** Total count of resolved ingredients. */
    readonly resolvedCount: number;
    /** The product type from the hair profile. */
    readonly productType: string;
}

function buildEvalContext(
    formulation: ScoredFormulation,
    profile: HairProfile
): EvalContext {
    const names = new Set<string>();
    const categories = new Set<string>();

    for (const si of formulation.ingredients) {
        const record = si.ingredient.record;
        if (typeof record.name === "string") {
            names.add(record.name);
        }
        if (typeof record.category === "string") {
            categories.add(record.category);
        }
    }

    return {
        resolvedNames: names,
        resolvedCategories: categories,
        resolvedCount: formulation.ingredients.length,
        productType: profile.productType,
    };
}

// ─── CONDITION EVALUATORS ─────────────────────────────────────────────────────

/**
 * Evaluates a single condition object against the evaluation context.
 * Returns true if the condition passes, false otherwise.
 * Unknown condition types always return false (fail-safe).
 */
function evaluateCondition(condition: any, ctx: EvalContext): boolean {
    if (!condition || typeof condition.type !== "string") return false;

    switch (condition.type) {
        case "ingredient_present": {
            const name = condition.ingredientName;
            if (typeof name !== "string") return false;
            const present = ctx.resolvedNames.has(name);
            return condition.negate === true ? !present : present;
        }

        case "ingredient_category_present": {
            const category = condition.category;
            if (typeof category !== "string") return false;
            const present = ctx.resolvedCategories.has(category);
            return condition.negate === true ? !present : present;
        }

        case "minimum_count": {
            const min = condition.minimumCount;
            if (typeof min !== "number") return false;
            return ctx.resolvedCount >= min;
        }

        case "co_occurrence": {
            const names = condition.ingredientNames;
            if (!Array.isArray(names) || names.length === 0) return false;
            for (const name of names) {
                if (typeof name !== "string") return false;
                if (!ctx.resolvedNames.has(name)) return false;
            }
            return true;
        }

        case "product_type_match": {
            const pt = condition.productType;
            if (typeof pt !== "string") return false;
            return ctx.productType === pt;
        }

        default:
            return false;
    }
}

/**
 * Evaluates all conditions for a rule.
 * A rule triggers only when ALL its conditions pass.
 * Rules with no conditions array or an empty conditions array do NOT trigger.
 */
function evaluateRule(rule: any, ctx: EvalContext): boolean {
    if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) {
        return false;
    }
    for (const condition of rule.conditions) {
        if (!evaluateCondition(condition, ctx)) return false;
    }
    return true;
}

// ─── FLAG BUILDER ─────────────────────────────────────────────────────────────

/**
 * Constructs an InteractionFlag from a triggered rule definition.
 * All fields are read from the rule; no values are invented.
 */
function buildFlag(rule: any): InteractionFlag {
    return {
        id: String(rule.id),
        severity: rule.severity as InteractionSeverity,
        title: String(rule.title),
        description: String(rule.description),
        triggeredBy: Array.isArray(rule.triggeredBy)
            ? (rule.triggeredBy as readonly string[])
            : [],
        affectedIngredients: Array.isArray(rule.affectedIngredients)
            ? (rule.affectedIngredients as readonly string[])
            : [],
    };
}

// ─── SORT COMPARATOR ─────────────────────────────────────────────────────────

/**
 * Stable comparator for InteractionFlag.
 * Primary: severity (high=0, medium=1, low=2).
 * Secondary: id lexicographic ascending.
 */
function compareFlags(a: InteractionFlag, b: InteractionFlag): number {
    const severityDiff =
        (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (severityDiff !== 0) return severityDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Detects interaction flags for a scored formulation.
 *
 * Evaluates every rule in INTERACTION_REGISTRY that has a `conditions` array
 * (Phase 4 declarative rules). Legacy rules without a `conditions` array are
 * skipped silently.
 *
 * @param formulation - The scored formulation from the scoring step.
 * @param profile     - The user's hair profile.
 * @returns           - A sorted, deduplicated array of InteractionFlag.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function detectInteractions(
    formulation: ScoredFormulation,
    profile: HairProfile
): readonly InteractionFlag[] {
    // Build evaluation context once — O(n) over resolved ingredients.
    const ctx = buildEvalContext(formulation, profile);

    // Collect triggered flags. Registry key order is deterministic (insertion order).
    const triggered: InteractionFlag[] = [];
    const seenIds = new Set<string>();

    for (const key of Object.keys(INTERACTION_REGISTRY)) {
        const rule = INTERACTION_REGISTRY[key];

        // Skip legacy rules that use triggerConditions instead of conditions.
        if (!rule || !Array.isArray(rule.conditions)) continue;

        // Skip rules without a valid severity (not a Phase 4 rule).
        const severity = rule.severity;
        if (severity !== "high" && severity !== "medium" && severity !== "low") continue;

        // Evaluate the rule.
        if (!evaluateRule(rule, ctx)) continue;

        // Deduplicate by rule id (registry keys are unique, but guard anyway).
        const id = String(rule.id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        triggered.push(buildFlag(rule));
    }

    // Sort: high → medium → low, then by id ascending.
    triggered.sort(compareFlags);

    return triggered;
}
