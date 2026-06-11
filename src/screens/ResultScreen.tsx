import { useMemo, useState } from "react";
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
  const result = entry.result;
  const tier = scoreTier(result.summary.formulationScore);

  const headline = useMemo(() => headlineFor(result), [result]);
  const highlights = useMemo(() => highlightsFor(result), [result]);
  const subscores = useMemo(() => displaySubscores(result), [result]);
  const rows = useMemo(() => ingredientRows(result), [result]);

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

      <GlassPanel className="stack-16" style={{ textAlign: "center", paddingTop: 28, paddingBottom: 28 }}>
        <ScoreRing score={result.summary.formulationScore} />
        <div className="stack-12">
          <span
            className="result-tier"
            style={{ color: tier.color, background: tier.soft }}
          >
            {tier.label}
          </span>
          <p className="result-headline">{headline}</p>
        </div>
      </GlassPanel>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "overview" ? (
        <div className="stack-24">
          <div className="stack-12">
            <h2 className="section-title">What this means</h2>
            <div className="stack-12">
              {highlights.map((h, i) => (
                <div key={i} className="highlight-row glass" style={{ borderRadius: 18 }}>
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
            <h2 className="section-title">How it scores</h2>
            <GlassPanel className="stack-16">
              {subscores.map((s) => (
                <ScoreBar key={s.label} label={s.label} value={s.value} hint={s.hint} />
              ))}
            </GlassPanel>
          </div>

          <p className="muted disclaimer">
            Scores are tailored to your hair profile and reflect formulation
            fit, not safety. {result.summary.resolvedCount} of{" "}
            {result.summary.resolvedCount + result.summary.unresolvedCount}{" "}
            ingredients were recognized.
          </p>
        </div>
      ) : (
        <div className="stack-12">
          <h2 className="section-title">
            Ingredient breakdown
            <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>
              {" "}· {rows.length} total
            </span>
          </h2>
          {rows.map((row, i) => (
            <div key={`${row.name}-${i}`} className="ingredient-row glass">
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

      <Button fullWidth onClick={onAnalyzeAnother}>
        Analyze another product
      </Button>
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
