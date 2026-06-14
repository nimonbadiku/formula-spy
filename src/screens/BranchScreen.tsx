import { Button } from "@/components/Button";
import type { BranchStep } from "@/lib/quiz";

interface BranchScreenProps {
  readonly branch: BranchStep;
  readonly onDone: () => void;
}

const DOT_COLORS: Record<string, string> = {
  blue: "var(--blue)",
  gray: "rgba(22,43,70,0.3)",
  teal: "var(--green)",
};

const STEP_GAP = 10;
const CIRCLE_SIZE = 28;

export function BranchScreen({ branch, onDone }: BranchScreenProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        paddingTop: 24,
        paddingBottom: 24,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="stack-12">
          <h1 className="screen-title">{branch.title}</h1>
          <p className="subtitle">Try this quick self-test right now.</p>
        </div>

        <div style={{ marginTop: 20, position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: (CIRCLE_SIZE - 1.5) / 2,
              top: CIRCLE_SIZE / 2,
              bottom: CIRCLE_SIZE / 2,
              width: 1.5,
              background: "rgba(22,43,70,0.15)",
              borderRadius: 1,
            }}
          />
          {branch.steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                position: "relative",
                paddingBottom: i < branch.steps.length - 1 ? STEP_GAP : 0,
              }}
            >
              <div
                style={{
                  width: CIRCLE_SIZE,
                  height: CIRCLE_SIZE,
                  flexShrink: 0,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    width: CIRCLE_SIZE,
                    height: CIRCLE_SIZE,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--blue), var(--green))",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
              </div>
              <span style={{ paddingTop: 3, fontSize: 15, lineHeight: 1.5 }}>
                {step}
              </span>
            </div>
          ))}
        </div>

        {branch.results && (
          <div style={{ marginTop: 24 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-soft)",
                marginBottom: 10,
              }}
            >
              What to look for
            </p>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "var(--radius-md)",
                background: "var(--blue-soft)",
                border: "1.5px solid rgba(22,43,70,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {branch.results.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: DOT_COLORS[r.color],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Button fullWidth onClick={onDone}>
          Now I know
        </Button>
      </div>
    </div>
  );
}
