/**
 * engine-bridge/analyze.ts
 *
 * Thin adapter between the Formula Spy UI and the untouched scoring engine.
 *
 * Responsibilities:
 *   - Ensure the database is loaded (delegates to database.ts).
 *   - Call the real engine `analyze()` with the user profile + raw INCI.
 *   - Surface engine errors as plain messages the UI can render.
 *
 * It contains NO scoring logic. All evaluation happens inside the engine.
 */

import { analyze } from "@engine/engine/index";
import type { AnalysisResult, HairProfile } from "@engine/engine/index";
import { loadDatabase } from "./database";

export type { AnalysisResult, HairProfile } from "@engine/engine/index";

export interface RunAnalysisInput {
  readonly rawInci: string;
  readonly profile: HairProfile;
}

/**
 * Runs a single-product analysis through the engine.
 *
 * @throws Error with a human-readable message if input is empty or the engine
 *         rejects the database/profile.
 */
export async function runAnalysis({
  rawInci,
  profile,
}: RunAnalysisInput): Promise<AnalysisResult> {
  const trimmed = rawInci.trim();
  if (!trimmed) {
    throw new Error("Please paste an ingredient list before analyzing.");
  }

  const database = await loadDatabase();
  // The engine is pure and deterministic; it owns all scoring decisions.
  return analyze(trimmed, profile, database);
}
