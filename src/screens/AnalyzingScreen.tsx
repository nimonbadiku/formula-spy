import { useEffect, useRef, useState } from "react";
import { runAnalysis, type HairProfile } from "@/engine-bridge/analyze";
import { useAppStore } from "@/store/appStore";
import type { HistoryEntry } from "@/store/types";
import type { ProductType } from "@/lib/productTypes";
import { defaultProductName, makeId } from "@/lib/format";
import { productTypeLabel } from "@/lib/productTypes";
import { Button } from "@/components/Button";

interface AnalyzingScreenProps {
  readonly rawInci: string;
  readonly productType: ProductType;
  readonly productName: string;
  readonly onComplete: (entry: HistoryEntry) => void;
  readonly onError: () => void;
}

/**
 * Loading + execution screen. Loads the database (cached after first run),
 * calls the untouched engine, saves the result to history, then hands the
 * entry back to the router.
 */
export function AnalyzingScreen({
  rawInci,
  productType,
  productName,
  onComplete,
  onError,
}: AnalyzingScreenProps) {
  const profile = useAppStore((s) => s.profile);
  const addHistoryEntry = useAppStore((s) => s.addHistoryEntry);
  const [error, setError] = useState<string | null>(null);
  // Guards against React 18 StrictMode double-invocation in development, so we
  // never run the engine or write history twice for a single request.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!profile) {
      setError("Please complete your hair profile first.");
      return;
    }

    const engineProfile: HairProfile = {
      porosity: profile.porosity,
      density: profile.density,
      condition: profile.condition,
      oiliness: profile.oiliness,
      productType,
      curlPattern: profile.curlPattern,
      scalpSensitivity: profile.scalpSensitivity,
      proteinSensitivity: profile.proteinSensitivity,
      siliconeSensitivity: profile.siliconeSensitivity,
      chemicallyTreated: profile.chemicallyTreated,
    };

    const startedAt = Date.now();

    runAnalysis({ rawInci, profile: engineProfile })
      .then((result) => {
        const entry: HistoryEntry = {
          id: makeId(),
          productName:
            productName ||
            defaultProductName(rawInci, productTypeLabel(productType)),
          productType,
          rawInci,
          score: result.summary.formulationScore,
          createdAt: new Date().toISOString(),
          result,
        };
        addHistoryEntry(entry);
        // Keep the loader visible briefly so the transition feels intentional.
        const elapsed = Date.now() - startedAt;
        const delay = Math.max(0, 650 - elapsed);
        window.setTimeout(() => onComplete(entry), delay);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong during analysis.";
        setError(message);
      });
    // No cleanup-based cancellation: startedRef already ensures the work runs
    // exactly once, and the request must finish even across a StrictMode remount.
  }, [profile, productType, rawInci, addHistoryEntry, onComplete]);

  if (error) {
    return (
      <div className="stack-24" style={{ paddingTop: 60, textAlign: "center" }}>
        <div className="stack-12">
          <h1 className="screen-title">We hit a snag</h1>
          <p className="subtitle">{error}</p>
        </div>
        <Button fullWidth variant="secondary" onClick={onError}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        textAlign: "center",
      }}
    >
      <div className="analyzing-container" aria-hidden>
        <div className="analyzing-orb" />
        <div className="analyzing-ring" />
        <div className="analyzing-dot analyzing-dot--1" />
        <div className="analyzing-dot analyzing-dot--2" />
        <div className="analyzing-dot analyzing-dot--3" />
      </div>
      <div className="stack-12">
        <h1 className="screen-title">Analyzing formula</h1>
        <p className="subtitle">
          Matching ingredients and scoring for your hair…
        </p>
      </div>
      <style>{`
        .analyzing-container {
          position: relative;
          width: 120px;
          height: 120px;
        }
        .analyzing-orb {
          position: absolute;
          inset: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--blue), var(--green));
          box-shadow:
            0 0 40px rgba(79, 141, 249, 0.4),
            0 0 80px rgba(57, 194, 168, 0.2);
          animation: orb-pulse 2s ease-in-out infinite;
        }
        .analyzing-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 3px solid transparent;
          border-top-color: var(--blue);
          border-right-color: var(--green);
          animation: spin 1.2s linear infinite;
        }
        .analyzing-dot {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--blue);
          animation: orbit 2s linear infinite;
        }
        .analyzing-dot--1 {
          background: var(--blue);
          animation-delay: 0s;
        }
        .analyzing-dot--2 {
          background: var(--green);
          animation-delay: -0.66s;
        }
        .analyzing-dot--3 {
          background: linear-gradient(135deg, var(--blue), var(--green));
          animation-delay: -1.33s;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes orbit {
          0% {
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(0deg) translateX(52px) scale(1);
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(360deg) translateX(52px) scale(0.6);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
