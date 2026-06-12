import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { OptionCard } from "@/components/OptionCard";
import { useAppStore } from "@/store/appStore";
import type { StoredHairProfile } from "@/store/types";
import {
  QUIZ_STEPS,
  draftFromProfile,
  type ChoiceStep,
  type QuizDraft,
  type ToggleStep,
} from "@/lib/quiz";

interface QuizScreenProps {
  readonly onDone: () => void;
  readonly onCancel?: () => void;
}

export function QuizScreen({ onDone, onCancel }: QuizScreenProps) {
  const profile = useAppStore((s) => s.profile);
  const saveProfile = useAppStore((s) => s.saveProfile);

  const [draft, setDraft] = useState<QuizDraft>(() => draftFromProfile(profile));
  const [stepIndex, setStepIndex] = useState(0);
  const [animDir, setAnimDir] = useState<"next" | "back" | "">("");

  const step = QUIZ_STEPS[stepIndex];
  const isLast = stepIndex === QUIZ_STEPS.length - 1;
  const progress = ((stepIndex + 1) / QUIZ_STEPS.length) * 100;

  const choiceValue = step.kind === "choice" ? draft[step.key] : undefined;
  const canAdvance = step.kind === "toggles" || choiceValue !== undefined;

  function selectChoice(stepDef: ChoiceStep, value: string) {
    setDraft((d) => ({ ...d, [stepDef.key]: value }));
  }

  function toggle(key: ToggleStep["items"][number]["key"]) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  function goNext() {
    if (!canAdvance) return;
    if (!isLast) {
      setAnimDir("next");
      setStepIndex((i) => i + 1);
      return;
    }
    finish();
  }

  function goBack() {
    if (stepIndex > 0) {
      setAnimDir("back");
      setStepIndex((i) => i - 1);
    } else if (onCancel) {
      onCancel();
    }
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

  const enterClass = animDir === "next" ? "quiz-enter-right" : animDir === "back" ? "quiz-enter-left" : "";

  return (
    <div className="stack-24">
      <div className="stack-12">
        <div className="spread">
          <button
            className="btn btn--ghost"
            style={{ marginLeft: -14 }}
            onClick={goBack}
          >
            {stepIndex === 0 && !onCancel ? "" : "← Back"}
          </button>
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
            {stepIndex + 1} of {QUIZ_STEPS.length}
          </span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 99,
            background: "rgba(22,43,70,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: 99,
              background: "linear-gradient(90deg, var(--blue), var(--green))",
              transition: "width 0.35s ease",
            }}
          />
        </div>
      </div>

      <div style={{ overflow: "hidden" }}>
        <div key={stepIndex} className={`quiz-step-content ${enterClass}`}>
          <div className="stack-12">
            <h1 className="screen-title">{step.title}</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>{step.subtitle}</p>
          </div>

          {step.kind === "choice" ? (
            <div className="stack-12">
              {step.options.map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  description={opt.description}
                  selected={choiceValue === opt.value}
                  onClick={() => selectChoice(step, opt.value)}
                />
              ))}
            </div>
          ) : (
            <div className="stack-12">
              {step.items.map((item) => (
                <OptionCard
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  selected={draft[item.key]}
                  onClick={() => toggle(item.key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Button fullWidth onClick={goNext} disabled={!canAdvance}>
        {isLast ? "Save profile" : "Continue"}
      </Button>

      <style>{`
        .quiz-step-content {
          animation: quiz-enter 0.22s ease-out forwards;
        }
        .quiz-exit-left {
          animation: quiz-exit-left 0.18s ease-in forwards;
        }
        .quiz-exit-right {
          animation: quiz-exit-right 0.18s ease-in forwards;
        }
        @keyframes quiz-enter-right {
          from { opacity: 0; transform: translateX(32px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes quiz-enter-left {
          from { opacity: 0; transform: translateX(-32px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes quiz-exit-left {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-32px); }
        }
        @keyframes quiz-exit-right {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(32px); }
        }
      `}</style>
    </div>
  );
}
