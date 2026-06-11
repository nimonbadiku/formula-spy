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
          productName: defaultProductName(rawInci, productTypeLabel(productType)),
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
          err instanceof Error ? err.message : "Something went wrong during analysis.";
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
        gap: 26,
        textAlign: "center",
      }}
    >
      <div className="analyzing-orb" aria-hidden />
      <div className="stack-12">
        <h1 className="screen-title">Analyzing formula</h1>
        <p className="subtitle">Matching ingredients and scoring for your hair…</p>
      </div>
      <style>{`
        .analyzing-orb {
          width: 92px;
          height: 92px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, var(--blue), var(--green), var(--blue));
          -webkit-mask: radial-gradient(circle at center, transparent 54%, #000 56%);
          mask: radial-gradient(circle at center, transparent 54%, #000 56%);
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
