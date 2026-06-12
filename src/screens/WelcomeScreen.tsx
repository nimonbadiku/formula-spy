import { Button } from "@/components/Button";
import { GlassPanel } from "@/components/GlassPanel";

interface WelcomeScreenProps {
  readonly onStart: () => void;
}

const STEPS = [
  { n: "1", title: "Build your hair profile", text: "A quick quiz tailors every score to your hair." },
  { n: "2", title: "Paste an ingredient list", text: "Drop in the INCI list from any one product." },
  { n: "3", title: "See how it fits you", text: "Get a clear score and a plain-language breakdown." },
];

/** First-run landing screen shown before the required hair quiz. */
export function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  return (
    <div className="stack-24 welcome-screen" style={{ paddingTop: 24 }}>
      <div style={{ textAlign: "center" }} className="stack-16">
        <div
          aria-hidden
          className="welcome-icon"
          style={{
            width: 76,
            height: 76,
            margin: "0 auto",
            borderRadius: 22,
            background: "linear-gradient(135deg, var(--blue), var(--green))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 36px -16px rgba(79,141,249,0.7)",
          }}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#fff" strokeWidth="2.4" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="stack-12">
          <h1 className="screen-title welcome-title" style={{ fontSize: 30 }}>
            Formula Spy
          </h1>
          <p className="subtitle welcome-subtitle">
            Understand what's really in your hair care, scored for your hair.
          </p>
        </div>
      </div>

      <GlassPanel className="stack-16 welcome-steps">
        {STEPS.map((step, i) => (
          <div key={step.n} className="row welcome-step" style={{ gap: 14, alignItems: "flex-start", animationDelay: `${200 + i * 100}ms` }}>
            <div
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 10,
                background: "var(--blue-soft)",
                color: "var(--blue)",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              {step.n}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15.5 }}>{step.title}</div>
              <p className="subtitle" style={{ fontSize: 14 }}>
                {step.text}
              </p>
            </div>
          </div>
        ))}
      </GlassPanel>

      <div className="welcome-cta">
        <Button fullWidth onClick={onStart}>
          Build my hair profile
        </Button>
      </div>

      <style>{`
        .welcome-icon {
          opacity: 0;
          animation: welcome-pop 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s forwards;
        }
        .welcome-title {
          opacity: 0;
          animation: welcome-fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards;
        }
        .welcome-subtitle {
          opacity: 0;
          animation: welcome-fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s forwards;
        }
        .welcome-step {
          opacity: 0;
          animation: welcome-fade-up 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .welcome-cta {
          opacity: 0;
          animation: welcome-fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s forwards;
        }
        @keyframes welcome-pop {
          0% { opacity: 0; transform: scale(0.6); }
          60% { transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes welcome-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
