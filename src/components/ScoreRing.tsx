import { useEffect, useState } from "react";
import { scoreTier } from "@/theme/tokens";

interface ScoreRingProps {
  /** Score in [0, 100]. */
  readonly score: number;
  readonly size?: number;
}

/**
 * Animated circular score gauge. The arc length and color reflect the
 * engine's formulation score. Purely presentational.
 */
export function ScoreRing({ score, size = 184 }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const rounded = Math.round(clamped);
  const tier = scoreTier(clamped);

  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        margin: "0 auto",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(22, 43, 70, 0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tier.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: size * 0.3,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: "var(--text)",
          }}
        >
          {rounded}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 4 }}>
          out of 100
        </div>
      </div>
    </div>
  );
}
