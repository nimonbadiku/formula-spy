export const INGREDIENT_CATEGORIES = {
  SURFACTANT: 'surfactant',
  PROTEIN: 'protein',
  HUMECTANT: 'humectant',
  SILICONE: 'silicone',
  OIL: 'oil',
  FATTY_ALCOHOL: 'fatty_alcohol',
  CATIONIC: 'cationic',
  PRESERVATIVE: 'preservative'
} as const;

export function isCategory(ingredient: any, category: string): boolean {
  // Safe optional chaining short-circuits if ingredient or record is missing
  if (!ingredient?.record?.category) return false;
  return ingredient.record.category.trim().toLowerCase() === category.toLowerCase();
}

export function hasTag(ingredient: any, tag: string): boolean {
  // Safe optional chaining guarantees array checking doesn't throw a TypeError
  if (!ingredient?.record?.tags || !Array.isArray(ingredient.record.tags)) return false;
  const normalizedTag = tag.trim().toLowerCase().replace('_', '-');
  return ingredient.record.tags.some((t: string) => {
    return t?.trim().toLowerCase().replace('_', '-') === normalizedTag;
  });
}
