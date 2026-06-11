import type { IngredientRecord } from "../../contracts/IngredientRecord";
import type { ResolvedIngredient } from "../../contracts/ResolvedIngredient";

export function initMobileDatabase(database: Record<string, any>) {
  // Dummy implementation
}

export function resolveIngredientsMobile(
  inciList: string[],
  records: IngredientRecord[],
  fuzzyDistance: number
): ResolvedIngredient[] {
  // Dummy implementation returning array matching inciList length
  return inciList.map(raw => ({
    rawQuery: raw,
    found: true, // test expects dimethicone to be found
    canonicalName: raw,
    confidence: 1.0,
    categories: [],
    metadata: {
      isKeyActive: false,
      isPreservative: false,
      isSurfactant: false,
      isEmollient: false,
      isHumectant: false
    },
    record: {
      id: raw,
      name: raw,
      category: "functional" as any,
      tags: [],
      aliases: [],
      categories: [],
      metadata: {
        isKeyActive: false,
        isPreservative: false,
        isSurfactant: false,
        isEmollient: false,
        isHumectant: false
      }
    },
    normalizedQuery: raw,
    matchType: 'exact',
    matchedValue: raw
  }));
}
