/**
 * IngredientRecord
 *
 * The shape of a single ingredient entry as read from database/ingredients.json.
 *
 * Ownership: database/ingredients.json is the sole authority for all fields
 * defined here. These fields are identity facts — they describe what an
 * ingredient IS. They are read-only to all code outside the database layer.
 *
 * Scope boundary:
 * - The recognition subsystem reads these fields to build lookup indexes.
 * - The recognition subsystem does NOT derive new fields from these fields.
 * - Enrichment fields (functional_roles, molecular_properties, behaviors, etc.)
 *   are NOT part of this contract. They are owned by the enrichment subsystem.
 *
 * The index signature `[key: string]: unknown` allows downstream code to access
 * additional fields (e.g., product_roles, notes) without this contract needing
 * to enumerate them. Recognition treats all non-identity fields as opaque.
 */

export interface IngredientRecord {
  /**
   * Primary display name of the ingredient.
   * This is the canonical name used for all lookup indexing.
   * Example: "Glycerin", "Cetearyl Alcohol", "Polyquaternium-10"
   */
  readonly name: string;

  /**
   * Broad classification category.
   * Example: "Amino Acid", "Humectant", "Surfactant"
   *
   * Recognition reads this field only for index construction (e.g., grouping).
   * Recognition must NOT map this field to behavioral properties.
   */
  readonly category: string;

  /**
   * Descriptive tags associated with the ingredient.
   * Example: ["water-soluble", "low-buildup", "hydrating"]
   *
   * Recognition reads these only to build synonym indexes if a tag is also
   * an alias. Recognition must NOT interpret tags to derive functional roles,
   * solubility, residue levels, or any other behavioral property.
   */
  readonly tags: readonly string[];

  /**
   * Known synonyms, trade names, and INCI variants for this ingredient.
   * These are indexed in synonymToCanonical during index construction.
   * Example: ["Glycerol", "Glycerine", "Propane-1,2,3-triol"]
   */
  readonly aliases: readonly string[];

  /**
   * Human-readable description of the ingredient.
   * Informational only. Not used for lookup.
   */
  readonly notes?: string;

  /**
   * Molecular weight in daltons.
   * An identity fact stored in the database. Not derived by recognition.
   */
  readonly molecular_weight_da?: number | null;

  /**
   * Ionic character of the ingredient.
   * Example: "amphoteric", "cationic", "anionic", "nonionic"
   * An identity fact stored in the database. Not derived by recognition.
   */
  readonly ionic_charge?: string;

  /**
   * Depth to which the ingredient penetrates the hair fiber.
   * Example: "cortical", "surface", "medullary"
   * An identity fact stored in the database. Not derived by recognition.
   */
  readonly penetration_depth?: string;

  /**
   * All other fields (product_roles, low, med, high, fine, oily, etc.)
   * are present in the database record but are opaque to the recognition
   * subsystem. Downstream subsystems access them directly from this record.
   */
  readonly [key: string]: unknown;
}
