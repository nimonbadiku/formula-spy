/**
 * store/types.ts
 *
 * App-level domain types. These are distinct from the engine types: the engine
 * owns HairProfile/AnalysisResult; the app stores the user's quiz answers and a
 * lightweight history of past analyses.
 */

import type { AnalysisResult, HairProfile } from "@/engine-bridge/analyze";

/**
 * The persisted hair profile. This is a superset of the engine's HairProfile:
 * it always carries the full set of fields the quiz collects. productType is
 * NOT stored here because it is chosen per-analysis (per product), not once.
 */
export interface StoredHairProfile {
  readonly porosity: HairProfile["porosity"];
  readonly density: HairProfile["density"];
  readonly condition: HairProfile["condition"];
  readonly oiliness: HairProfile["oiliness"];
  readonly curlPattern: NonNullable<HairProfile["curlPattern"]>;
  readonly scalpSensitivity: boolean;
  readonly proteinSensitivity: boolean;
  readonly siliconeSensitivity: boolean;
  readonly chemicallyTreated: boolean;
  /** When the profile was created or last updated (ISO 8601). */
  readonly updatedAt: string;
}

/** A single saved analysis in the user's history. */
export interface HistoryEntry {
  readonly id: string;
  /** User-facing product label (optional, falls back to a generated name). */
  readonly productName: string;
  readonly productType: HairProfile["productType"];
  readonly rawInci: string;
  readonly score: number;
  readonly createdAt: string;
  /** The full engine result, stored so the detail view needs no recompute. */
  readonly result: AnalysisResult;
}
