/**
 * lib/resultSummary.ts
 *
 * Presentation helpers that translate the engine's AnalysisResult into
 * plain-language content for the Overview tab.
 *
 * IMPORTANT: This module does NOT compute or alter any score. It only reads
 * values the engine already produced (summary, subscores, heuristic warnings,
 * interactions) and phrases them for non-expert readers.
 */

import type { AnalysisResult } from "@/engine-bridge/analyze";
import { scoreTier } from "@/theme/tokens";

export interface SummaryHighlight {
  readonly tone: "good" | "warn" | "info";
  readonly text: string;
}

/** A single labelled subscore prepared for display. */
export interface DisplaySubscore {
  readonly label: string;
  readonly value: number;
  readonly hint: string;
}

/** One-line headline describing the overall match. */
export function headlineFor(result: AnalysisResult): string {
  const score = result.summary.formulationScore;
  const tier = scoreTier(score);
  const resolved = result.summary.resolvedCount;
  if (resolved === 0) {
    return "We couldn't recognize the ingredients in this list.";
  }
  switch (tier.label) {
    case "Excellent match":
      return "This formula looks like a strong fit for your hair.";
    case "Good match":
      return "This formula is a solid fit for your hair, with minor trade-offs.";
    case "Fair match":
      return "This formula is workable, but it isn't ideal for your hair.";
    default:
      return "This formula is likely a poor fit for your hair profile.";
  }
}

/**
 * Builds a short list of plain-language highlights from the engine output.
 * Pulls from heuristic warnings, interactions, and unresolved counts.
 */
export function highlightsFor(result: AnalysisResult): SummaryHighlight[] {
  const highlights: SummaryHighlight[] = [];
  const { summary, formulation, interactions } = result;

  // Strongest positive: a high overall score with good recognition.
  if (summary.formulationScore >= 80 && summary.resolvedCount > 0) {
    highlights.push({
      tone: "good",
      text: "The key ingredients align well with your hair's needs.",
    });
  }

  // Interactions flagged by the engine (highest severity first).
  for (const flag of [...interactions].slice(0, 2)) {
    highlights.push({
      tone: flag.severity === "low" ? "info" : "warn",
      text:
        flag.description ||
        flag.title ||
        "An ingredient interaction was detected.",
    });
  }

  // Heuristic warnings emitted during formulation analysis.
  for (const warning of formulation.heuristicWarnings.slice(0, 3)) {
    highlights.push({ tone: "warn", text: warning.reason || warning.label });
  }

  // Honesty about unrecognized ingredients.
  if (summary.unresolvedCount > 0) {
    const noun = summary.unresolvedCount === 1 ? "ingredient" : "ingredients";
    highlights.push({
      tone: "info",
      text: `${summary.unresolvedCount} ${noun} couldn't be matched to our database and were not scored.`,
    });
  }

  if (highlights.length === 0) {
    highlights.push({
      tone: "info",
      text: "No notable risks or interactions were flagged for your profile.",
    });
  }

  return highlights;
}

const SUBSCORE_HINTS: Record<string, string> = {
  conditioning: "How well it softens and detangles.",
  moisture: "Hydration and humectant support.",
  cleansing: "Cleansing strength for this product type.",
  scalpCompatibility: "How gentle it is likely to be on your scalp.",
  protein: "Strengthening protein support.",
  buildupResistance: "How well it resists residue buildup.",
};

/**
 * Selects the most relevant subscores for the Overview tab and labels them.
 * Always returns a stable, readable subset (not all 12 engine subscores).
 */
export function displaySubscores(result: AnalysisResult): DisplaySubscore[] {
  const s = result.summary.subscores;
  return [
    { key: "conditioning", label: "Conditioning", value: s.conditioning },
    { key: "moisture", label: "Moisture", value: s.moisture },
    { key: "cleansing", label: "Cleansing", value: s.cleansing },
    { key: "scalpCompatibility", label: "Scalp comfort", value: s.scalpCompatibility },
    { key: "protein", label: "Protein support", value: s.protein },
    { key: "buildupResistance", label: "Buildup resistance", value: s.buildupResistance },
  ].map((row) => ({
    label: row.label,
    value: row.value,
    hint: SUBSCORE_HINTS[row.key] ?? "",
  }));
}
