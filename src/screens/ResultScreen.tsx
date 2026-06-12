import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreRing } from "@/components/ScoreRing";
import { ScoreBar } from "@/components/ScoreBar";
import { Tabs } from "@/components/Tabs";
import { Button } from "@/components/Button";
import { GlassPanel } from "@/components/GlassPanel";
import type { HistoryEntry } from "@/store/types";
import { scoreTier } from "@/theme/tokens";
import { productTypeLabel } from "@/lib/productTypes";
import {
  displaySubscores,
  headlineFor,
  highlightsFor,
} from "@/lib/resultSummary";
import { ingredientRows } from "@/lib/ingredientView";
import "./ResultScreen.css";

interface ResultScreenProps {
  readonly entry: HistoryEntry;
  readonly onBack: () => void;
  readonly onAnalyzeAnother: () => void;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "ingredients", label: "Ingredients" },
] as const;

const TONE_COLOR: Record<string, string> = {
  good: "var(--green)",
  warn: "var(--amber, #e3a008)",
  info: "var(--blue)",
};

/** Result view: overall score first, then Overview / Ingredients tabs. */
export function ResultScreen({ entry, onBack, onAnalyzeAnother }: ResultScreenProps) {
  const [tab, setTab] = useState<string>("overview");
  const [tabAnimating, setTabAnimating] = useState(false);
  const [displayTab, setDisplayTab] = useState("overview");
  const tabTimerRef = useRef(0);
  const result = entry.result;
  const tier = scoreTier(result.summary.formulationScore);

  const headline = useMemo(() => headlineFor(result), [result]);
  const highlights = useMemo(() => highlightsFor(result), [result]);
  const subscores = useMemo(() => displaySubscores(result), [result]);
  const rows = useMemo(() => ingredientRows(result), [result]);

  function handleTabChange(id: string) {
    if (id === tab || tabAnimating) return;
    setTabAnimating(true);
    clearTimeout(tabTimerRef.current);
    tabTimerRef.current = window.setTimeout(() => {
      setTab(id);
      setDisplayTab(id);
      setTabAnimating(false);
    }, 180);
  }

  return (
    <div className="stack-24">
      <div className="spread">
        <button className="btn btn--ghost" style={{ marginLeft: -14 }} onClick={onBack}>
          ← Back
        </button>
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          {productTypeLabel(entry.productType)}
        </span>
      </div>

      <GlassPanel style={{ textAlign: "center", paddingTop: 16, paddingBottom: 28, display: "flex", flexDirection: "column", minHeight: 320 }}>
        <ScoreRing score={result.summary.formulationScore} />
        <div style={{ flex: 1 }} />
        <div>
          <span
            className="result-tier"
            style={{ color: tier.color, background: tier.soft }}
          >
            {tier.label}
          </span>
          <p className="result-headline">{headline}</p>
        </div>
      </GlassPanel>

      <Tabs tabs={TABS} active={tab} onChange={handleTabChange} />

      <div className={`result-tab-content ${tabAnimating ? "result-tab-fade-out" : ""}`}>
        {displayTab === "overview" ? (
          <div className="stack-24">
            <div className="stack-12">
              <h2 className="section-title result-stagger" style={{ animationDelay: "0ms" }}>What this means</h2>
              <div className="stack-12">
                {highlights.map((h, i) => (
                  <div key={i} className="highlight-row glass result-stagger" style={{ borderRadius: 18, animationDelay: `${60 + i * 60}ms` }}>
                    <span
                      className="highlight-dot"
                      style={{ background: TONE_COLOR[h.tone] ?? "var(--blue)" }}
                    />
                    <p>{h.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="stack-16">
              <h2 className="section-title result-stagger" style={{ animationDelay: `${60 + highlights.length * 60}ms` }}>How it scores</h2>
              <GlassPanel className="stack-16">
                {subscores.map((s, i) => (
                  <div key={s.label} className="result-stagger" style={{ animationDelay: `${120 + highlights.length * 60 + i * 50}ms` }}>
                    <ScoreBar label={s.label} value={s.value} hint={s.hint} />
                  </div>
                ))}
              </GlassPanel>
            </div>

            <p className="muted disclaimer result-stagger" style={{ animationDelay: `${120 + highlights.length * 60 + subscores.length * 50}ms` }}>
              Scores are tailored to your hair profile and reflect formulation
              fit, not safety. {result.summary.resolvedCount} of{" "}
              {result.summary.resolvedCount + result.summary.unresolvedCount}{" "}
              ingredients were recognized.
            </p>
          </div>
        ) : (
          <div className="stack-12">
            <h2 className="section-title result-stagger" style={{ animationDelay: "0ms" }}>
              Ingredient breakdown
              <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>
                {" "}· {rows.length} total
              </span>
            </h2>
            {rows.map((row, i) => (
              <div key={`${row.name}-${i}`} className="ingredient-row glass result-stagger" style={{ animationDelay: `${40 + i * 35}ms` }}>
                <div className="ingredient-row__main">
                  <div className="ingredient-row__name">{row.name}</div>
                  <div className="ingredient-row__cat">{row.category}</div>
                  {row.note && row.resolved && (
                    <p className="ingredient-row__note">{row.note}</p>
                  )}
                </div>
                <IngredientScore score={row.score} resolved={row.resolved} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Button fullWidth onClick={onAnalyzeAnother}>
        Analyze another product
      </Button>

      <style>{`
        .result-tab-content {
          animation: result-tab-in 0.25s ease forwards;
        }
        .result-tab-fade-out {
          animation: result-tab-out 0.18s ease forwards;
        }
        .result-stagger {
          opacity: 0;
          animation: result-fade-up 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes result-tab-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes result-tab-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes result-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function IngredientScore({
  score,
  resolved,
}: {
  score: number | null;
  resolved: boolean;
}) {
  if (!resolved || score === null) {
    return <span className="ingredient-row__badge ingredient-row__badge--unknown">—</span>;
  }
  const tier = scoreTier(score);
  return (
    <span
      className="ingredient-row__badge"
      style={{ color: tier.color, background: tier.soft }}
    >
      {score}
    </span>
  );
}
