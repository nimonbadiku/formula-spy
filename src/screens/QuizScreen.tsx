import { useEffect, useRef, useState } from "react";
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
  const [animDir, setAnimDir] = useState<"out-left" | "in-right" | "out-right" | "in-left" | "">("");
  const timerRef = useRef(0);

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
      setAnimDir("out-left");
      clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setStepIndex((i) => i + 1);
        setAnimDir("in-right");
        clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setAnimDir(""), 250);
      }, 200);
      return;
    }
    finish();
  }

  function goBack() {
    if (stepIndex > 0) {
      setAnimDir("out-right");
      clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setStepIndex((i) => i - 1);
        setAnimDir("in-left");
        clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setAnimDir(""), 250);
      }, 200);
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

  const animClass = animDir ? `quiz-${animDir}` : "";

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

      <div className={`quiz-step-content ${animClass}`}>
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

      <Button fullWidth onClick={goNext} disabled={!canAdvance}>
        {isLast ? "Save profile" : "Continue"}
      </Button>

      <style>{`
        .quiz-step-content {
          animation: quiz-fade-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .quiz-out-left {
          animation: quiz-slide-out-left 0.2s ease forwards;
        }
        .quiz-in-right {
          animation: quiz-slide-in-right 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .quiz-out-right {
          animation: quiz-slide-out-right 0.2s ease forwards;
        }
        .quiz-in-left {
          animation: quiz-slide-in-left 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes quiz-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes quiz-slide-out-left {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-40px); }
        }
        @keyframes quiz-slide-in-right {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes quiz-slide-out-right {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(40px); }
        }
        @keyframes quiz-slide-in-left {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
