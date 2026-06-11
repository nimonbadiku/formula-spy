/**
 * interactions/types.ts
 *
 * Type definitions for the interaction detection subsystem.
 *
 * These types define the Phase 4 interaction output contract.
 * They are intentionally separate from engine/shared/types.ts to keep
 * the interaction subsystem isolated from the rest of the pipeline.
 *
 * The engine/index.ts re-exports InteractionFlag and InteractionSeverity
 * from here so all consumers import from a single location.
 */

// ─── SEVERITY ─────────────────────────────────────────────────────────────────

/**
 * Severity levels for interaction flags.
 * Ordered from most to least severe: high → medium → low.
 */
export type InteractionSeverity = "high" | "medium" | "low";

// ─── INTERACTION FLAG ─────────────────────────────────────────────────────────

/**
 * A single interaction flag emitted by the interaction detection engine.
 *
 * Fields:
 *   id                  - Unique rule identifier (matches registry key).
 *   severity            - Severity level: "high" | "medium" | "low".
 *   title               - Short human-readable title for the interaction.
 *   description         - Full explanation of the interaction and its implications.
 *   triggeredBy         - Ingredient names that caused this rule to fire.
 *   affectedIngredients - Ingredient names whose behaviour is affected.
 *
 * Immutability: all fields are readonly. The engine never mutates flags
 * after construction.
 */
export interface InteractionFlag {
    readonly id: string;
    readonly severity: InteractionSeverity;
    readonly title: string;
    readonly description: string;
    readonly triggeredBy: readonly string[];
    readonly affectedIngredients: readonly string[];
}
