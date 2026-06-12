import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/Button";
import { OptionCard } from "@/components/OptionCard";
import { useAppStore } from "@/store/appStore";
import type { StoredHairProfile } from "@/store/types";
import {
  QUIZ_STEPS,
  BRANCH_SCREENS,
  draftFromProfile,
  type ChoiceStep,
  type QuizDraft,
  type ToggleStep,
} from "@/lib/quiz";
import { BranchScreen } from "./BranchScreen";

interface QuizScreenProps {
  readonly onDone: () => void;
  readonly onCancel?: () => void;
}

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 80 : -80,
    opacity: 0,
    filter: "blur(8px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -80 : 80,
    opacity: 0,
    filter: "blur(8px)",
  }),
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const BRANCH_EXCLUDED_KEYS = new Set(["curlPattern"]);

export function QuizScreen({ onDone, onCancel }: QuizScreenProps) {
  const profile = useAppStore((s) => s.profile);
  const saveProfile = useAppStore((s) => s.saveProfile);

  const [draft, setDraft] = useState<QuizDraft>(() => draftFromProfile(profile));
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [branchFor, setBranchFor] = useState<ChoiceStep["key"] | null>(null);

  const step = QUIZ_STEPS[stepIndex];
  const isLast = stepIndex === QUIZ_STEPS.length - 1;
  const progress = ((stepIndex + 1) / QUIZ_STEPS.length) * 100;

  const choiceValue = step.kind === "choice" ? draft[step.key] : undefined;
  const canAdvance = step.kind === "toggles" || choiceValue !== undefined;

  const showIDontKnow =
    step.kind === "choice" &&
    !BRANCH_EXCLUDED_KEYS.has(step.key) &&
    BRANCH_SCREENS[step.key] !== undefined;

  function selectChoice(stepDef: ChoiceStep, value: string) {
    setDraft((d) => ({ ...d, [stepDef.key]: value }));
  }

  function toggle(key: ToggleStep["items"][number]["key"]) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  function goNext() {
    if (!canAdvance) return;
    if (!isLast) {
      setDirection(1);
      setStepIndex((i) => i + 1);
      return;
    }
    finish();
  }

  function goBack() {
    if (stepIndex > 0) {
      setDirection(-1);
      setStepIndex((i) => i - 1);
    } else if (onCancel) {
      onCancel();
    }
  }

  function enterBranch() {
    if (step.kind !== "choice") return;
    setDirection(1);
    setBranchFor(step.key);
  }

  function exitBranch() {
    setDirection(-1);
    setBranchFor(null);
  }

  function finish() {
    if (!draft.porosity || !draft.density || !draft.condition || !draft.oiliness || !draft.curlPattern) return;
    const next: StoredHairProfile = {
      porosity: draft.porosity,
      density: draft.density,
      condition: draft.condition,
      oiliness: draft.oiliness,
      curlPattern: draft.curlPattern,
      scalpSensitivity: draft.scalpSensitivity,
      proteinSensitivity: draft.proteinSensitivity,
      siliconeSensitivity: draft.siliconeSensitivity,
      chemicallyTreated: draft.chemicallyTreated,
      updatedAt: new Date().toISOString(),
    };
    saveProfile(next);
    onDone();
  }

  const options =
    step.kind === "choice"
      ? step.options.map((opt) => ({
          key: opt.value,
          label: opt.label,
          description: opt.description,
          selected: choiceValue === opt.value,
          onClick: () => selectChoice(step, opt.value),
        }))
      : step.items.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description,
          selected: draft[item.key],
          onClick: () => toggle(item.key),
        }));

  const contentKey = branchFor ? `branch-${branchFor}` : `step-${stepIndex}`;

  return (
    <div className="stack-24">
      <div className="stack-12">
        <div className="spread">
          <button
            className="btn btn--ghost"
            style={{ marginLeft: -14 }}
            onClick={branchFor ? exitBranch : goBack}
          >
            {stepIndex === 0 && !onCancel && !branchFor ? "" : "← Back"}
          </button>
          {!branchFor && (
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
              {stepIndex + 1} of {QUIZ_STEPS.length}
            </span>
          )}
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 99,
            background: "rgba(22,43,70,0.08)",
            overflow: "hidden",
          }}
        >
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              height: "100%",
              borderRadius: 99,
              background: "linear-gradient(90deg, var(--blue), var(--green))",
            }}
          />
        </div>
      </div>

      <div>
        <AnimatePresence mode="wait" custom={direction}>
          {branchFor ? (
            <motion.div
              key={contentKey}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <BranchScreen
                branch={BRANCH_SCREENS[branchFor]!}
                onDone={exitBranch}
              />
            </motion.div>
          ) : (
            <motion.div
              key={contentKey}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="stack-12">
                <h1 className="screen-title">{step.title}</h1>
                <p className="subtitle" style={{ marginBottom: 20 }}>{step.subtitle}</p>
              </div>

              <div className="stack-12" style={{ minHeight: 404 }}>
                {options.map((opt, i) => (
                  <motion.div
                    key={opt.key}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <OptionCard
                      label={opt.label}
                      description={opt.description}
                      selected={opt.selected}
                      onClick={opt.onClick}
                    />
                  </motion.div>
                ))}
                {showIDontKnow && (
                  <motion.div
                    custom={options.length}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <OptionCard
                      label="I don't know"
                      description="Show me a quick self-test"
                      selected={false}
                      onClick={enterBranch}
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!branchFor && (
        <Button fullWidth onClick={goNext} disabled={!canAdvance}>
          {isLast ? "Save profile" : "Continue"}
        </Button>
      )}
    </div>
  );
}
