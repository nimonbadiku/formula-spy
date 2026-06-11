import { useAppStore } from "@/store/appStore";
import type { HistoryEntry } from "@/store/types";
import { scoreTier } from "@/theme/tokens";
import { productTypeLabel } from "@/lib/productTypes";
import { formatDateTime } from "@/lib/format";
import "./HistoryScreen.css";

interface HistoryScreenProps {
  readonly onOpen: (entry: HistoryEntry) => void;
}

/** Lists all locally saved analyses, newest first. */
export function HistoryScreen({ onOpen }: HistoryScreenProps) {
  const history = useAppStore((s) => s.history);
  const removeHistoryEntry = useAppStore((s) => s.removeHistoryEntry);

  return (
    <div className="stack-24">
      <div>
        <div className="eyebrow">Formula Spy</div>
        <h1 className="screen-title" style={{ marginTop: 4 }}>
          Product history
        </h1>
      </div>

      {history.length === 0 ? (
        <div className="history-empty glass">
          <div className="history-empty__icon" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <h2 className="section-title" style={{ textAlign: "center" }}>
            No analyses yet
          </h2>
          <p className="subtitle" style={{ textAlign: "center" }}>
            Products you analyze will be saved here so you can revisit their
            scores anytime.
          </p>
        </div>
      ) : (
        <div className="stack-12">
          {history.map((entry) => {
            const tier = scoreTier(entry.score);
            return (
              <div key={entry.id} className="history-card glass">
                <button
                  className="history-card__body"
                  onClick={() => onOpen(entry)}
                >
                  <span
                    className="history-card__score"
                    style={{ color: tier.color, background: tier.soft }}
                  >
                    {Math.round(entry.score)}
                  </span>
                  <span className="history-card__text">
                    <span className="history-card__name">{entry.productName}</span>
                    <span className="history-card__meta">
                      {productTypeLabel(entry.productType)} · {formatDateTime(entry.createdAt)}
                    </span>
                  </span>
                </button>
                <button
                  className="history-card__delete"
                  aria-label="Delete analysis"
                  onClick={() => removeHistoryEntry(entry.id)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
