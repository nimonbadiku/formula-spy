import { normalizeProductType } from "../utils/normalizeProductType";

export const PRODUCT_MODELS: Record<string, any> = Object.freeze({
    default: Object.freeze({
        topShare: 0.62,
        topWeights: Object.freeze([0.2, 0.15, 0.11, 0.09, 0.07]),
        tailDecay: 0.88,
        confidenceBase: 70,
        bands: Object.freeze({ very_high: 0.2, high: 0.12, medium_high: 0.07, medium: 0.035, low: 0.012 })
    }),
    rinse_off: Object.freeze({
        topShare: 0.66,
        topWeights: Object.freeze([0.22, 0.16, 0.12, 0.09, 0.07]),
        tailDecay: 0.86,
        confidenceBase: 70,
        bands: Object.freeze({ very_high: 0.22, high: 0.13, medium_high: 0.07, medium: 0.035, low: 0.012 })
    }),
    shampoo: Object.freeze({
        topShare: 0.68,
        topWeights: Object.freeze([0.23, 0.17, 0.12, 0.09, 0.07]),
        tailDecay: 0.85,
        confidenceBase: 72,
        bands: Object.freeze({ very_high: 0.23, high: 0.13, medium_high: 0.065, medium: 0.03, low: 0.01 })
    }),
    conditioner: Object.freeze({
        topShare: 0.63,
        topWeights: Object.freeze([0.2, 0.15, 0.11, 0.09, 0.08]),
        tailDecay: 0.88,
        confidenceBase: 73,
        bands: Object.freeze({ very_high: 0.2, high: 0.12, medium_high: 0.06, medium: 0.03, low: 0.01 })
    }),
    mask: Object.freeze({
        topShare: 0.61,
        topWeights: Object.freeze([0.19, 0.15, 0.11, 0.09, 0.07]),
        tailDecay: 0.9,
        confidenceBase: 71,
        bands: Object.freeze({ very_high: 0.19, high: 0.11, medium_high: 0.055, medium: 0.028, low: 0.01 })
    }),
    leave_in: Object.freeze({
        topShare: 0.6,
        topWeights: Object.freeze([0.19, 0.14, 0.11, 0.09, 0.07]),
        tailDecay: 0.9,
        confidenceBase: 76,
        bands: Object.freeze({ very_high: 0.18, high: 0.105, medium_high: 0.055, medium: 0.026, low: 0.009 })
    }),
    styling: Object.freeze({
        topShare: 0.58,
        topWeights: Object.freeze([0.18, 0.14, 0.1, 0.085, 0.075]),
        tailDecay: 0.91,
        confidenceBase: 74,
        bands: Object.freeze({ very_high: 0.17, high: 0.1, medium_high: 0.05, medium: 0.024, low: 0.008 })
    }),
    oil_serum: Object.freeze({
        topShare: 0.76,
        topWeights: Object.freeze([0.32, 0.18, 0.11, 0.08, 0.07]),
        tailDecay: 0.82,
        confidenceBase: 78,
        bands: Object.freeze({ very_high: 0.28, high: 0.16, medium_high: 0.08, medium: 0.035, low: 0.012 })
    })
});

export interface ConcentrationResult {
    ingredientId: string | null;
    ingredient: string;
    position: number;
    estimatedWeight: number;
    concentrationBand: string;
    confidence: number;
}

export function estimateConcentration(ingredient: any, position: number, totalIngredients: number, productType = "default", options: any = {}): ConcentrationResult {
    const total = normalizeTotal(totalIngredients);
    const index = normalizePosition(position);
    const model = resolveModel(productType, options.model);
    const weights = getPositionWeights(total, model);
    const estimatedWeight = weights[index] || 0;

    return {
        ingredientId: getIngredientId(ingredient),
        ingredient: getIngredientName(ingredient),
        position: index + 1,
        estimatedWeight: round(estimatedWeight, 6),
        concentrationBand: getConcentrationBand(estimatedWeight, model),
        confidence: estimateConfidence(index, total, productType, model, options)
    };
}

export function estimateConcentrations(ingredients: any[], productType = "default", options: any = {}): ConcentrationResult[] {
    const list = Array.isArray(ingredients) ? ingredients : [];
    return list.map((ingredient, index) => estimateConcentration(ingredient, index, list.length, productType, options));
}

export function getPositionWeights(totalIngredients: number, model = PRODUCT_MODELS.default): number[] {
    const total = normalizeTotal(totalIngredients);
    if (!total) return [];

    const topWeights = Array.from(model.topWeights || PRODUCT_MODELS.default.topWeights).map((value: any) => Math.max(0, Number(value) || 0));
    const topShare = clamp(Number(model.topShare), 0.1, 0.95);

    if (total <= topWeights.length) {
        return normalizeWeights(topWeights.slice(0, total));
    }

    const normalizedTop = normalizeWeights(topWeights).map((value) => value * topShare);
    const tailCount = total - normalizedTop.length;
    const decay = clamp(Number(model.tailDecay), 0.5, 0.99);
    const tailRaw = Array.from({ length: tailCount }, (_, index) => Math.pow(decay, index));
    const tail = normalizeWeights(tailRaw).map((value) => value * (1 - topShare));

    return normalizeWeights(normalizedTop.concat(tail));
}

export function getConcentrationBand(weight: number, model = PRODUCT_MODELS.default): string {
    const bands = model.bands || PRODUCT_MODELS.default.bands;
    const value = Number(weight) || 0;
    if (value >= bands.very_high) return "very_high";
    if (value >= bands.high) return "high";
    if (value >= bands.medium_high) return "medium_high";
    if (value >= bands.medium) return "medium";
    if (value >= bands.low) return "low";
    return "trace";
}

export function estimateConfidence(position: number, total: number, productType: string, model: any, options: any): number {
    let confidence = Number(model.confidenceBase) || PRODUCT_MODELS.default.confidenceBase;

    confidence -= Math.min(30, Math.max(0, position - 4) * 1.35);
    if (total > 50) confidence -= 4;
    if (total > 500) confidence -= 8;
    if (total > 2500) confidence -= 12;
    if (!PRODUCT_MODELS[normalizeProductType(productType)]) confidence -= 7;
    if (options.hasDeclaredPercentages === true) confidence += 10;

    return Math.round(clamp(confidence, 18, 94));
}

function resolveModel(productType: string, overrideModel: any) {
    const normalized = normalizeProductType(productType);
    const base = PRODUCT_MODELS[normalized] || PRODUCT_MODELS.default;
    if (!overrideModel || typeof overrideModel !== "object") return base;
    return { ...base, ...overrideModel };
}

function normalizeWeights(values: number[]): number[] {
    const cleaned = values.map((value) => Math.max(0, Number(value) || 0));
    const total = cleaned.reduce((sum, value) => sum + value, 0);
    return total ? cleaned.map((value) => value / total) : cleaned.map(() => 0);
}

function normalizeTotal(value: any): number {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizePosition(value: any): number {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : Math.max(0, Number.isFinite(number) ? number : 0);
}

function getIngredientId(ingredient: any): string | null {
    const item = unwrapIngredient(ingredient);
    if (!item || typeof item !== "object") return null;
    const identity = item.identity || {};
    return item.id || identity.inci_name || identity.name || item.name || null;
}

function getIngredientName(ingredient: any): string {
    const item = unwrapIngredient(ingredient);
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const identity = item.identity || {};
    return identity.name || identity.inci_name || item.name || item.id || "";
}

function unwrapIngredient(value: any): any {
    return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "ingredient") ? value.ingredient : value;
}

function clamp(value: number, min: number, max: number): number {
    const number = Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function round(value: number,: number places = 4): number {
    const factor = Math.pow(10, places);
    return Math.round((Number(value) || 0) * factor) / factor;
}
