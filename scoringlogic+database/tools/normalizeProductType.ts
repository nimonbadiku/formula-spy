export const CANONICAL_PRODUCT_TYPES = Object.freeze(new Set([
    "shampoo",
    "conditioner",
    "mask",
    "leave_in",
    "styling",
    "oil_serum",
    "rinse_off",
    "treatment",
    "default"
]));

export const PRODUCT_TYPE_ALIASES: Record<string, string> = Object.freeze({
    cleanser: "shampoo",
    clarifying_shampoo: "shampoo",
    co_wash: "shampoo",
    cowash: "shampoo",

    rinse_out: "rinse_off",
    rinse_off: "rinse_off",
    rinse_out_conditioner: "conditioner",

    deep_conditioner: "mask",
    deep_conditioner_mask: "mask",
    treatment_mask: "mask",

    leavein: "leave_in",
    leave_on: "leave_in",
    leave_in_conditioner: "leave_in",
    cream: "leave_in",
    mist: "leave_in",

    gel: "styling",
    mousse: "styling",
    hairspray: "styling",
    spray: "styling",
    styler: "styling",
    styling_product: "styling",
    pomade: "styling",
    wax: "styling",

    oil: "oil_serum",
    serum: "oil_serum",
    hair_oil_serum: "oil_serum",

    bond_repair: "treatment",
    treatment: "treatment"
});

export function normalizeProductType(value?: string | null, fallback = "default"): string {
    const key = String(value || fallback)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!key) return fallback;

    const resolved = PRODUCT_TYPE_ALIASES[key] || key;

    if (CANONICAL_PRODUCT_TYPES.has(resolved)) {
        return resolved;
    }

    return fallback;
}
