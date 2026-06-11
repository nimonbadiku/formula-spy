/**
 * data_generator.mjs
 * Generates synthetic hair profiles and product ingredient lists
 * for the scoring engine training loop.
 */

// ── Hair type mapping to engine profile fields ────────────────────────────────
const CURL_TYPE_TO_ENGINE = {
  "1A": { curlPattern: "straight", porosity: "low",  density: "fine" },
  "1B": { curlPattern: "straight", porosity: "low",  density: "med"  },
  "1C": { curlPattern: "straight", porosity: "low",  density: "med"  },
  "2A": { curlPattern: "wavy",     porosity: "low",  density: "med"  },
  "2B": { curlPattern: "wavy",     porosity: "med",  density: "med"  },
  "2C": { curlPattern: "wavy",     porosity: "med",  density: "med"  },
  "3A": { curlPattern: "curly",    porosity: "med",  density: "med"  },
  "3B": { curlPattern: "curly",    porosity: "med",  density: "coarse"},
  "3C": { curlPattern: "curly",    porosity: "high", density: "coarse"},
  "4A": { curlPattern: "coily",    porosity: "high", density: "coarse"},
  "4B": { curlPattern: "coily",    porosity: "high", density: "coarse"},
  "4C": { curlPattern: "coily",    porosity: "high", density: "coarse"},
};

const HAIR_TYPES = Object.keys(CURL_TYPE_TO_ENGINE);
const POROSITIES = ["low", "med", "high"];
const DENSITIES  = ["fine", "med", "coarse"];
const CONDITIONS = ["damaged", "normal", "healthy"];
const OILINESS   = ["dry", "normal", "oily"];
const SCALP_CONDITIONS = ["dry", "oily", "sensitive", "normal"];
const GOALS = [
  "moisture", "repair", "curl definition", "volume",
  "frizz control", "scalp health", "protein treatment", "shine",
];
const PRODUCT_TYPES = [
  "shampoo", "co_wash", "rinse_out_conditioner",
  "deep_conditioner_mask", "leave_in_conditioner",
  "hair_oil_serum", "styling_product",
];

// ── Ingredient pool by category ───────────────────────────────────────────────
const INGREDIENT_POOL = {
  // Surfactants – harsh
  harsh_surfactant: [
    "Sodium Lauryl Sulfate",
    "Sodium Laureth Sulfate",
    "Ammonium Lauryl Sulfate",
    "Ammonium Laureth Sulfate",
    "TEA Lauryl Sulfate",
  ],
  // Surfactants – mild
  mild_surfactant: [
    "Cocamidopropyl Betaine",
    "Sodium Cocoyl Isethionate",
    "Sodium Lauroyl Sarcosinate",
    "Decyl Glucoside",
    "Coco Glucoside",
    "Lauryl Glucoside",
    "Sodium Cocoamphoacetate",
    "Disodium Cocoamphodiacetate",
  ],
  // Humectants
  humectant: [
    "Glycerin",
    "Panthenol",
    "Propylene Glycol",
    "Butylene Glycol",
    "Sorbitol",
    "Honey",
    "Aloe Barbadensis Leaf Juice",
    "Hyaluronic Acid",
    "Sodium PCA",
  ],
  // Proteins
  protein: [
    "Hydrolyzed Keratin",
    "Hydrolyzed Wheat Protein",
    "Hydrolyzed Silk",
    "Hydrolyzed Collagen",
    "Hydrolyzed Quinoa",
    "Hydrolyzed Rice Protein",
    "Hydrolyzed Soy Protein",
  ],
  // Oils
  oil: [
    "Cocos Nucifera Oil",
    "Argania Spinosa Kernel Oil",
    "Ricinus Communis Seed Oil",
    "Olea Europaea Fruit Oil",
    "Helianthus Annuus Seed Oil",
    "Persea Gratissima Oil",
    "Simmondsia Chinensis Seed Oil",
    "Rosa Canina Fruit Oil",
  ],
  // Silicones – non-water-soluble
  heavy_silicone: [
    "Dimethicone",
    "Amodimethicone",
    "Trimethylsilylamodimethicone",
    "Bis-Aminopropyl Dimethicone",
  ],
  // Silicones – volatile/water-soluble
  light_silicone: [
    "Cyclopentasiloxane",
    "Cyclomethicone",
    "Dimethiconol",
    "PEG-12 Dimethicone",
  ],
  // Fatty alcohols
  fatty_alcohol: [
    "Cetyl Alcohol",
    "Stearyl Alcohol",
    "Cetearyl Alcohol",
    "Behenyl Alcohol",
    "Lauryl Alcohol",
  ],
  // Polymers / film formers
  polymer: [
    "Carbomer",
    "Polyquaternium-10",
    "Polyquaternium-11",
    "Polyquaternium-7",
    "Hydroxyethylcellulose",
    "Acrylates Copolymer",
    "VP/VA Copolymer",
  ],
  // Preservatives
  preservative: [
    "Phenoxyethanol",
    "Methylisothiazolinone",
    "Ethylhexylglycerin",
    "Sodium Benzoate",
    "Potassium Sorbate",
    "Caprylyl Glycol",
    "Chlorphenesin",
  ],
  // Base / filler
  base: [
    "Water",
    "Aqua",
    "Citric Acid",
    "Sodium Hydroxide",
    "Fragrance",
    "Parfum",
    "Lactic Acid",
    "Disodium EDTA",
    "Tocopherol",
    "Pantolactone",
    "Sodium Chloride",
  ],
  // Conditioning agents
  conditioning: [
    "Behentrimonium Chloride",
    "Cetrimonium Chloride",
    "Stearamidopropyl Dimethylamine",
    "Quaternium-91",
    "Behentrimonium Methosulfate",
    "Isopropyl Alcohol",
  ],
  // Emollients
  emollient: [
    "Isopropyl Myristate",
    "C12-15 Alkyl Benzoate",
    "Caprylic/Capric Triglyceride",
    "Squalane",
    "Cetyl Esters",
    "Shea Butter",
    "Butyrospermum Parkii Butter",
  ],
};

// ── Deterministic pseudo-random generator ─────────────────────────────────────
function seededRand(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN(arr, n, rand) {
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// ── Profile generator ─────────────────────────────────────────────────────────
export function generateProfiles(count = 60, seed = 42) {
  const rand = seededRand(seed);
  const profiles = [];

  for (let i = 0; i < count; i++) {
    const hairType = pick(HAIR_TYPES, rand);
    const baseFields = CURL_TYPE_TO_ENGINE[hairType];
    const scalpCondition = pick(SCALP_CONDITIONS, rand);
    const condition = pick(CONDITIONS, rand);

    // Map scalp condition → oiliness
    let oiliness;
    if (scalpCondition === "oily") oiliness = "oily";
    else if (scalpCondition === "dry") oiliness = "dry";
    else oiliness = pick(OILINESS, rand);

    // Map scalp condition → scalpSensitivity
    const scalpSensitivity = scalpCondition === "sensitive" ? true : rand() < 0.15;

    const productType = pick(PRODUCT_TYPES, rand);
    const goals = pickN(GOALS, Math.floor(rand() * 3) + 1, rand);

    profiles.push({
      id: `profile_${String(i + 1).padStart(3, "0")}`,
      hairType,
      scalpCondition,
      goals,
      engineProfile: {
        porosity: baseFields.porosity,
        density: baseFields.density,
        condition,
        oiliness,
        productType,
        curlPattern: baseFields.curlPattern,
        scalpSensitivity,
        proteinSensitivity: rand() < 0.12,
        siliconeSensitivity: rand() < 0.18,
        chemicallyTreated: rand() < 0.25,
      },
    });
  }
  return profiles;
}

// ── Product generator ─────────────────────────────────────────────────────────
const PRODUCT_CATEGORIES = {
  shampoo: {
    required: ["base", "harsh_surfactant"],
    optional: ["mild_surfactant", "humectant", "protein", "preservative", "conditioning"],
    avoid: ["heavy_silicone"],
  },
  gentle_shampoo: {
    required: ["base", "mild_surfactant"],
    optional: ["humectant", "protein", "preservative", "conditioning", "fatty_alcohol"],
    avoid: ["harsh_surfactant", "heavy_silicone"],
  },
  co_wash: {
    required: ["base", "fatty_alcohol", "conditioning"],
    optional: ["humectant", "protein", "oil", "preservative", "light_silicone", "mild_surfactant"],
    avoid: ["harsh_surfactant"],
  },
  conditioner: {
    required: ["base", "fatty_alcohol", "conditioning"],
    optional: ["humectant", "protein", "oil", "preservative", "light_silicone", "heavy_silicone", "polymer"],
    avoid: [],
  },
  mask: {
    required: ["base", "fatty_alcohol", "conditioning", "protein"],
    optional: ["humectant", "oil", "preservative", "polymer", "emollient"],
    avoid: ["harsh_surfactant"],
  },
  serum: {
    required: ["oil", "emollient"],
    optional: ["light_silicone", "heavy_silicone", "preservative", "humectant"],
    avoid: ["harsh_surfactant", "harsh_surfactant"],
  },
  leave_in: {
    required: ["base", "humectant", "conditioning"],
    optional: ["protein", "light_silicone", "oil", "preservative", "fatty_alcohol", "polymer"],
    avoid: ["harsh_surfactant"],
  },
  styling_gel: {
    required: ["base", "polymer"],
    optional: ["humectant", "preservative", "conditioning", "light_silicone", "protein"],
    avoid: ["harsh_surfactant", "heavy_silicone", "oil"],
  },
};

const CATEGORY_TO_PRODUCT_TYPE = {
  shampoo: "shampoo",
  gentle_shampoo: "shampoo",
  co_wash: "co_wash",
  conditioner: "rinse_out_conditioner",
  mask: "deep_conditioner_mask",
  serum: "hair_oil_serum",
  leave_in: "leave_in_conditioner",
  styling_gel: "styling_product",
};

function buildIngredientList(categoryKey, rand) {
  const spec = PRODUCT_CATEGORIES[categoryKey];
  const chosen = [];

  // Always include water/base first (position matters for INCI scoring)
  chosen.push("Water");

  // Required categories
  for (const cat of spec.required) {
    if (cat === "base") continue; // already added water
    const pool = INGREDIENT_POOL[cat] || [];
    if (pool.length > 0) {
      const ing = pick(pool, rand);
      if (!chosen.includes(ing)) chosen.push(ing);
    }
  }

  // Optional categories – pick 4-8 randomly
  const numOptional = 4 + Math.floor(rand() * 5);
  const optCats = [...spec.optional].sort(() => rand() - 0.5).slice(0, numOptional);
  for (const cat of optCats) {
    const pool = (INGREDIENT_POOL[cat] || []).filter(
      (ing) => !(spec.avoid || []).some((a) => INGREDIENT_POOL[a]?.includes(ing))
    );
    if (pool.length > 0) {
      const ing = pick(pool, rand);
      if (!chosen.includes(ing)) chosen.push(ing);
    }
  }

  // Fill to 20-35 ingredients with base fillers
  const targetCount = 20 + Math.floor(rand() * 16);
  const fillerPool = [
    ...INGREDIENT_POOL.base,
    ...INGREDIENT_POOL.preservative,
    ...INGREDIENT_POOL.emollient,
  ].filter((f) => !chosen.includes(f));

  const shuffledFillers = [...fillerPool].sort(() => rand() - 0.5);
  for (const f of shuffledFillers) {
    if (chosen.length >= targetCount) break;
    chosen.push(f);
  }

  return chosen;
}

export function generateProducts(count = 60, seed = 99) {
  const rand = seededRand(seed);
  const categoryKeys = Object.keys(PRODUCT_CATEGORIES);
  const products = [];
  const categoryNames = [
    "Clarifying Shampoo", "Moisturizing Shampoo", "Repair Shampoo",
    "Co-Wash", "Conditioning Co-Wash",
    "Everyday Conditioner", "Moisturizing Conditioner", "Repair Conditioner",
    "Deep Conditioning Mask", "Protein Mask", "Moisture Mask",
    "Hair Serum", "Shine Serum", "Growth Serum",
    "Leave-In Conditioner", "Leave-In Cream",
    "Curl Defining Gel", "Styling Cream", "Edge Control Gel",
  ];

  for (let i = 0; i < count; i++) {
    const categoryKey = pick(categoryKeys, rand);
    const productType = CATEGORY_TO_PRODUCT_TYPE[categoryKey];
    const ingredients = buildIngredientList(categoryKey, rand);
    const nameBase = pick(categoryNames, rand);

    products.push({
      id: `product_${String(i + 1).padStart(3, "0")}`,
      name: `${nameBase} #${i + 1}`,
      category: categoryKey,
      productType,
      inci: ingredients.join(", "),
      ingredientList: ingredients,
      highlights: {
        proteins: ingredients.filter((ing) => INGREDIENT_POOL.protein.includes(ing)),
        humectants: ingredients.filter((ing) => INGREDIENT_POOL.humectant.includes(ing)),
        harshSurfactants: ingredients.filter((ing) => INGREDIENT_POOL.harsh_surfactant.includes(ing)),
        silicones: ingredients.filter((ing) =>
          INGREDIENT_POOL.heavy_silicone.includes(ing) || INGREDIENT_POOL.light_silicone.includes(ing)
        ),
        oils: ingredients.filter((ing) => INGREDIENT_POOL.oil.includes(ing)),
      },
    });
  }
  return products;
}

// ── Expected score calculator ─────────────────────────────────────────────────
/**
 * Computes a domain-expert expected score (1–100) for a (profile, product) pair.
 * Based on cosmetic science heuristics:
 *   - Ingredient suitability for hair type / porosity
 *   - Harshness vs scalp condition
 *   - Protein/moisture balance
 *   - Silicone compatibility
 *   - Product type match
 *   - Formulation quality
 */
export function computeExpectedScore(profile, product) {
  const ep = profile.engineProfile;
  const h = product.highlights;
  let score = 55; // neutral baseline

  // ── Product-type match bonus/penalty ──────────────────────────────────────
  if (product.productType === ep.productType) {
    score += 12;
  } else {
    score -= 8;
  }

  // ── Humectant scoring ──────────────────────────────────────────────────────
  const humCount = h.humectants.length;
  if (humCount >= 2) score += 8;
  else if (humCount === 1) score += 4;

  // High-porosity needs moisture most
  if (ep.porosity === "high" && humCount >= 1) score += 5;
  if (ep.porosity === "low" && humCount >= 3) score -= 3; // too much moisture pull

  // ── Protein scoring ────────────────────────────────────────────────────────
  const protCount = h.proteins.length;
  if (ep.proteinSensitivity) {
    // protein-sensitive: penalize proteins hard
    score -= protCount * 8;
  } else if (ep.engineProfile?.condition === "damaged" || ep.condition === "damaged") {
    // damaged hair benefits from proteins
    if (protCount === 1) score += 7;
    else if (protCount === 2) score += 10;
    else if (protCount >= 3) score += 5; // stacking risk
  } else {
    // normal/healthy hair
    if (protCount === 1) score += 3;
    else if (protCount >= 3) score -= 5; // protein overload risk
  }

  // ── Harsh surfactant scoring ───────────────────────────────────────────────
  const harshCount = h.harshSurfactants.length;
  if (product.category === "shampoo" || product.category === "gentle_shampoo") {
    if (harshCount === 0 && product.category === "shampoo") {
      score -= 5; // shampoo without cleanser
    } else if (harshCount === 1) {
      if (ep.oiliness === "dry") score -= 8;
      else if (ep.oiliness === "oily") score += 5;
      if (ep.scalpSensitivity) score -= 6;
      if (ep.chemicallyTreated) score -= 7;
      if (ep.porosity === "low") score += 3; // low porosity needs strong cleansing
    } else if (harshCount >= 2) {
      score -= 10;
      if (ep.oiliness === "dry") score -= 5;
      if (ep.scalpSensitivity) score -= 8;
    }
  } else {
    // Non-shampoo with harsh surfactants = bad
    score -= harshCount * 12;
  }

  // ── Silicone scoring ───────────────────────────────────────────────────────
  const silCount = h.silicones.length;
  if (ep.siliconeSensitivity) {
    score -= silCount * 10;
  } else if (ep.porosity === "low") {
    // Low porosity: silicones block moisture absorption
    score -= silCount * 6;
  } else if (ep.curlPattern === "curly" || ep.curlPattern === "coily") {
    // Curly/coily: non-water-soluble silicones cause buildup
    score -= silCount * 4;
  } else {
    // Straight/wavy: silicones generally beneficial
    score += Math.min(silCount, 2) * 3;
  }

  // ── Oil scoring ────────────────────────────────────────────────────────────
  const oilCount = h.oils.length;
  if (ep.density === "fine") {
    score -= oilCount * 4; // oils weigh down fine hair
  } else if (ep.porosity === "high") {
    score += Math.min(oilCount, 2) * 5; // high porosity benefits from sealing oils
  } else {
    score += Math.min(oilCount, 2) * 2;
  }

  // ── Scalp compatibility ────────────────────────────────────────────────────
  if (ep.scalpSensitivity) {
    const hasPreservative = product.ingredientList.includes("Methylisothiazolinone");
    if (hasPreservative) score -= 8;
  }

  // ── Moisture/protein balance ───────────────────────────────────────────────
  if (protCount >= 1 && humCount >= 1) {
    score += 5; // balanced
  } else if (protCount >= 2 && humCount === 0) {
    score -= 6; // protein-heavy without moisture
  }

  // ── Formulation quality ────────────────────────────────────────────────────
  const totalCount = product.ingredientList.length;
  if (totalCount >= 20) score += 3; // well-developed formula
  if (totalCount >= 30) score += 2; // complex formulation

  // Clamp to [15, 97]
  score = Math.max(15, Math.min(97, Math.round(score)));
  return score;
}

// ── Test case generator ───────────────────────────────────────────────────────
export function generateTestCases(profiles, products) {
  const cases = [];
  // Pair each profile with a product whose productType matches, plus some mismatches
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const product = products[i % products.length];
    const expectedScore = computeExpectedScore(profile, product);
    cases.push({
      id: `case_${String(i + 1).padStart(3, "0")}`,
      profileId: profile.id,
      productId: product.id,
      profile,
      product,
      expectedScore,
    });
  }
  return cases;
}
