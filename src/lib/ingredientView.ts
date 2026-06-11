/**
 * lib/ingredientView.ts
 *
 * Maps the engine's scored ingredients into a flat, display-ready list for the
 * Ingredients tab. Reads engine output only; computes no scores.
 */

import type { AnalysisResult } from "@/engine-bridge/analyze";

export interface IngredientRow {
  readonly name: string;
  readonly category: string;
  readonly score: number | null;
  readonly resolved: boolean;
  readonly note: string;
}

interface RecordLike {
  readonly name?: string;
  readonly category?: string;
  readonly notes?: string;
}

/**
 * Returns one row per ingredient in the original list order: resolved
 * ingredients first carry their final score; unresolved ones are marked.
 */
export function ingredientRows(result: AnalysisResult): IngredientRow[] {
  const resolved: IngredientRow[] = result.formulation.ingredients.map((scored) => {
    const record = scored.ingredient.record as RecordLike;
    return {
      name: record.name ?? scored.ingredient.rawQuery,
      category: record.category ?? "Ingredient",
      score: Math.round(scored.finalScore),
      resolved: true,
      note: typeof record.notes === "string" ? record.notes : "",
    };
  });

  const unresolved: IngredientRow[] = result.formulation.unresolved.map((miss) => ({
    name: miss.rawQuery,
    category: "Not recognized",
    score: null,
    resolved: false,
    note: "We couldn't match this ingredient to our database, so it wasn't scored.",
  }));

  return [...resolved, ...unresolved];
}
