/**
 * lib/quiz.ts
 *
 * Declarative definition of the hair quiz. Each single-choice step maps to a
 * field on StoredHairProfile; the boolean steps map to the sensitivity flags.
 */

import type { StoredHairProfile } from "@/store/types";

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description: string;
}

export interface ChoiceStep {
  readonly kind: "choice";
  readonly key: "porosity" | "density" | "condition" | "oiliness" | "curlPattern";
  readonly title: string;
  readonly subtitle: string;
  readonly options: readonly ChoiceOption<string>[];
}

export interface ToggleItem {
  readonly key:
    | "scalpSensitivity"
    | "proteinSensitivity"
    | "siliconeSensitivity"
    | "chemicallyTreated";
  readonly label: string;
  readonly description: string;
}

export interface ToggleStep {
  readonly kind: "toggles";
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly ToggleItem[];
}

export type QuizStep = ChoiceStep | ToggleStep;

export const QUIZ_STEPS: readonly QuizStep[] = [
  {
    kind: "choice",
    key: "curlPattern",
    title: "What's your curl pattern?",
    subtitle: "This shapes how products coat and weigh down your hair.",
    options: [
      { value: "straight", label: "Straight", description: "Little to no wave (Type 1)" },
      { value: "wavy", label: "Wavy", description: "Loose S-shaped waves (Type 2)" },
      { value: "curly", label: "Curly", description: "Defined spirals or ringlets (Type 3)" },
      { value: "coily", label: "Coily", description: "Tight coils or zig-zags (Type 4)" },
    ],
  },
  {
    kind: "choice",
    key: "porosity",
    title: "How porous is your hair?",
    subtitle: "Porosity is how easily your hair absorbs and holds moisture.",
    options: [
      { value: "low", label: "Low porosity", description: "Water beads up; products sit on top" },
      { value: "med", label: "Medium porosity", description: "Absorbs and holds moisture well" },
      { value: "high", label: "High porosity", description: "Soaks up water fast, dries quickly" },
    ],
  },
  {
    kind: "choice",
    key: "density",
    title: "How thick is each strand?",
    subtitle: "This is the width of an individual hair, not how much you have.",
    options: [
      { value: "fine", label: "Fine", description: "Thin strands, easily weighed down" },
      { value: "med", label: "Medium", description: "Average strand thickness" },
      { value: "coarse", label: "Coarse", description: "Thick, sturdy strands" },
    ],
  },
  {
    kind: "choice",
    key: "condition",
    title: "What condition is your hair in?",
    subtitle: "Be honest about damage from heat, color, or wear.",
    options: [
      { value: "healthy", label: "Healthy", description: "Strong, smooth, minimal breakage" },
      { value: "normal", label: "Normal", description: "Generally fine, some dryness or frizz" },
      { value: "damaged", label: "Damaged", description: "Brittle, split ends, breakage" },
    ],
  },
  {
    kind: "choice",
    key: "oiliness",
    title: "How oily is your scalp?",
    subtitle: "Think about how your roots feel a day after washing.",
    options: [
      { value: "dry", label: "Dry", description: "Tight or flaky, rarely greasy" },
      { value: "normal", label: "Balanced", description: "Comfortable, neither dry nor oily" },
      { value: "oily", label: "Oily", description: "Greasy roots soon after washing" },
    ],
  },
  {
    kind: "toggles",
    title: "A few sensitivities",
    subtitle: "Toggle anything that applies. You can leave them all off.",
    items: [
      {
        key: "scalpSensitivity",
        label: "Sensitive scalp",
        description: "Prone to irritation, itching, or redness",
      },
      {
        key: "proteinSensitivity",
        label: "Protein sensitive",
        description: "Hair feels stiff or straw-like after protein",
      },
      {
        key: "siliconeSensitivity",
        label: "Avoid silicones",
        description: "You prefer to steer clear of silicones",
      },
      {
        key: "chemicallyTreated",
        label: "Chemically treated",
        description: "Colored, bleached, relaxed, or permed",
      },
    ],
  },
];

export interface BranchResult {
  readonly label: string;
  readonly color: "blue" | "gray" | "teal";
}

export interface BranchStep {
  readonly title: string;
  readonly steps: readonly string[];
  readonly results?: readonly BranchResult[];
}

export const BRANCH_SCREENS: Partial<Record<ChoiceStep["key"], BranchStep>> = {
  porosity: {
    title: "Find out your porosity",
    steps: [
      "Take a clean strand of hair — no product on it",
      "Drop it into a glass of room temperature water",
      "Wait 2–3 minutes",
    ],
    results: [
      { label: "Floats = low porosity", color: "blue" },
      { label: "Sinks slowly = medium", color: "blue" },
      { label: "Sinks fast = high", color: "blue" },
    ],
  },
  density: {
    title: "Find out your strand thickness",
    steps: [
      "Roll a single hair between your thumb and finger",
      "Compare it to a piece of sewing thread",
    ],
    results: [
      { label: "Thinner than thread = fine", color: "blue" },
      { label: "Similar to thread = medium", color: "blue" },
      { label: "Thicker than thread = coarse", color: "blue" },
    ],
  },
  condition: {
    title: "Check your hair condition",
    steps: [
      "Take a small section of hair and hold it taut",
      "Run your fingers down the strand from root to tip",
      "Feel if the strand is smooth or rough",
      "Check the ends for splits",
    ],
    results: [
      { label: "Smooth and strong = healthy", color: "blue" },
      { label: "Slightly rough = normal", color: "blue" },
      { label: "Rough with splits = damaged", color: "blue" },
    ],
  },
  oiliness: {
    title: "Test your scalp oiliness",
    steps: [
      "Wait until the day after washing your hair",
      "Press a tissue firmly against your roots for 10 seconds",
      "Check if the tissue shows oil marks",
    ],
    results: [
      { label: "No oil = dry", color: "blue" },
      { label: "Light sheen = balanced", color: "blue" },
      { label: "Visible oil = oily", color: "blue" },
    ],
  },
};

/** Default working answers used while the quiz is in progress. */
export type QuizDraft = {
  porosity?: StoredHairProfile["porosity"];
  density?: StoredHairProfile["density"];
  condition?: StoredHairProfile["condition"];
  oiliness?: StoredHairProfile["oiliness"];
  curlPattern?: StoredHairProfile["curlPattern"];
  scalpSensitivity: boolean;
  proteinSensitivity: boolean;
  siliconeSensitivity: boolean;
  chemicallyTreated: boolean;
};

export function draftFromProfile(profile: StoredHairProfile | null): QuizDraft {
  return {
    porosity: profile?.porosity,
    density: profile?.density,
    condition: profile?.condition,
    oiliness: profile?.oiliness,
    curlPattern: profile?.curlPattern,
    scalpSensitivity: profile?.scalpSensitivity ?? false,
    proteinSensitivity: profile?.proteinSensitivity ?? false,
    siliconeSensitivity: profile?.siliconeSensitivity ?? false,
    chemicallyTreated: profile?.chemicallyTreated ?? false,
  };
}
