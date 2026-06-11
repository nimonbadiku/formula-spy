/**
 * theme/tokens.ts
 *
 * Central design tokens for Formula Spy. Kept in TS so components can read
 * values directly; the same palette is mirrored as CSS variables in global.css.
 */

export const colors = {
  bg: "#f4f7fb",
  bgSoft: "#eef3f9",
  surface: "rgba(255, 255, 255, 0.72)",
  surfaceSolid: "#ffffff",
  border: "rgba(255, 255, 255, 0.65)",
  hairline: "rgba(22, 43, 70, 0.08)",
  text: "#13233b",
  textSoft: "#4a5a72",
  textFaint: "#8493a8",
  blue: "#4f8df9",
  blueSoft: "#eaf2ff",
  green: "#39c2a8",
  greenSoft: "#e6f7f2",
  amber: "#e3a008",
  amberSoft: "#fbf2da",
  red: "#e5645f",
  redSoft: "#fbeceb",
} as const;

/** Maps a 0-100 score to a calm tier color + label. */
export interface ScoreTier {
  readonly label: string;
  readonly color: string;
  readonly soft: string;
}

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return { label: "Excellent match", color: colors.green, soft: colors.greenSoft };
  if (score >= 65) return { label: "Good match", color: colors.blue, soft: colors.blueSoft };
  if (score >= 50) return { label: "Fair match", color: colors.amber, soft: colors.amberSoft };
  return { label: "Poor match", color: colors.red, soft: colors.redSoft };
}
