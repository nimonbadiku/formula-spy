import { scoreBarColor } from "@/theme/tokens";

interface ScoreBarProps {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
}

/** Horizontal labelled meter for a single subscore in [0, 100]. */
export function ScoreBar({ label, value, hint }: ScoreBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  const color = scoreBarColor(pct);
  return (
    <div style={{ width: "100%" }}>
      <div className="spread" style={{ marginBottom: 7 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {Math.round(pct)}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 99,
          background: "rgba(22, 43, 70, 0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 99,
            background: color,
            transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
      {hint && (
        <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6, lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
