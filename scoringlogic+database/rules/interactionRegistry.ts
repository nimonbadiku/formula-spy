export const INTERACTION_REGISTRY: Record<string, any> = Object.freeze({

    // ─── Phase 4 declarative interaction rules ────────────────────────────────
    // These rules use simple condition types evaluated by detectInteractions.ts.
    // Condition types: ingredient_present, ingredient_category_present,
    //                  minimum_count, co_occurrence, product_type_match

    silicone_buildup_no_sulfate: Object.freeze({
        id: "silicone_buildup_no_sulfate",
        severity: "high",
        title: "Non-soluble silicone without sulfate cleanser",
        description: "A non-water-soluble silicone is present but no sulfate surfactant is detected. Without a sulfate cleanser, non-soluble silicones accumulate on the hair shaft over repeated use.",
        conditions: Object.freeze([
            Object.freeze({ type: "ingredient_present", ingredientName: "Dimethicone" }),
            Object.freeze({ type: "ingredient_category_present", category: "Surfactant", negate: true }),
        ]),
        triggeredBy: Object.freeze(["Dimethicone"]),
        affectedIngredients: Object.freeze(["Dimethicone"]),
    }),

    humectant_glycerin_present: Object.freeze({
        id: "humectant_glycerin_present",
        severity: "low",
        title: "Humectant detected",
        description: "Glycerin is present in the formulation. Humectants draw moisture from the environment; in very low humidity conditions this may cause dryness.",
        conditions: Object.freeze([
            Object.freeze({ type: "ingredient_present", ingredientName: "Glycerin" }),
        ]),
        triggeredBy: Object.freeze(["Glycerin"]),
        affectedIngredients: Object.freeze(["Glycerin"]),
    }),

    sulfate_and_silicone_co_occurrence: Object.freeze({
        id: "sulfate_and_silicone_co_occurrence",
        severity: "medium",
        title: "Sulfate surfactant co-occurring with silicone",
        description: "A sulfate surfactant and a silicone are both present. The sulfate will strip the silicone on each wash, which may be intentional for buildup prevention but can also increase dryness.",
        conditions: Object.freeze([
            Object.freeze({ type: "co_occurrence", ingredientNames: Object.freeze(["Sodium Lauryl Sulfate", "Dimethicone"]) }),
        ]),
        triggeredBy: Object.freeze(["Sodium Lauryl Sulfate", "Dimethicone"]),
        affectedIngredients: Object.freeze(["Sodium Lauryl Sulfate", "Dimethicone"]),
    }),

    minimum_five_ingredients: Object.freeze({
        id: "minimum_five_ingredients",
        severity: "low",
        title: "Complex formulation detected",
        description: "The formulation contains five or more resolved ingredients. Complex formulations increase the likelihood of ingredient interactions.",
        conditions: Object.freeze([
            Object.freeze({ type: "minimum_count", minimumCount: 5 }),
        ]),
        triggeredBy: Object.freeze([]),
        affectedIngredients: Object.freeze([]),
    }),

    shampoo_silicone_warning: Object.freeze({
        id: "shampoo_silicone_warning",
        severity: "medium",
        title: "Silicone in shampoo format",
        description: "A silicone ingredient is present in a shampoo formulation. Non-volatile silicones in shampoo formats provide limited benefit and may contribute to buildup.",
        conditions: Object.freeze([
            Object.freeze({ type: "product_type_match", productType: "shampoo" }),
            Object.freeze({ type: "ingredient_category_present", category: "Silicone" }),
        ]),
        triggeredBy: Object.freeze([]),
        affectedIngredients: Object.freeze([]),
    }),

    protein_humectant_synergy: Object.freeze({
        id: "protein_humectant_synergy",
        severity: "low",
        title: "Protein and humectant synergy",
        description: "A protein and a humectant are both present. Proteins temporarily fill cuticle gaps while humectants draw in moisture, creating a complementary conditioning effect.",
        conditions: Object.freeze([
            Object.freeze({ type: "ingredient_category_present", category: "Protein" }),
            Object.freeze({ type: "ingredient_category_present", category: "Humectant" }),
        ]),
        triggeredBy: Object.freeze([]),
        affectedIngredients: Object.freeze([]),
    }),
});

export function getInteractionDefinition(id: string) {
    return INTERACTION_REGISTRY[id] || null;
}
