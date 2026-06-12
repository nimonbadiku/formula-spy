import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { HistoryEntry } from "@/store/types";
import { BottomNav } from "@/components/BottomNav";
import { QuizScreen } from "@/screens/QuizScreen";
import { PasteScreen } from "@/screens/PasteScreen";
import { AnalyzingScreen } from "@/screens/AnalyzingScreen";
import { ResultScreen } from "@/screens/ResultScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { WelcomeScreen } from "@/screens/WelcomeScreen";
import type { ProductType } from "@/lib/productTypes";

/**
 * Navigation model. The app is a small state machine rather than a URL router,
 * which keeps the single-flow mobile experience predictable.
 */
export type Route =
  | { name: "welcome" }
  | { name: "quiz" }
  | { name: "analyze" }
  | {
      name: "analyzing";
      rawInci: string;
      productType: ProductType;
      productName: string;
    }
  | { name: "result"; entry: HistoryEntry }
  | { name: "history" };

export function App() {
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.profile);

  const [route, setRoute] = useState<Route>({ name: "welcome" });
  const [displayRoute, setDisplayRoute] = useState<Route>({ name: "welcome" });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef(0);

  const navigate = useCallback((next: Route) => {
    if (isTransitioning) return;
    if (next.name === displayRoute.name) {
      setRoute(next);
      setDisplayRoute(next);
      return;
    }
    setIsTransitioning(true);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setRoute(next);
      setDisplayRoute(next);
      setIsTransitioning(false);
    }, 200);
  }, [isTransitioning, displayRoute.name]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Once hydrated, decide the initial screen exactly once.
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    if (!hydrated || bootstrapped) return;
    setBootstrapped(true);
    const initial: Route = profile ? { name: "analyze" } : { name: "welcome" };
    setRoute(initial);
    setDisplayRoute(initial);
  }, [hydrated, bootstrapped, profile]);

  const activeTab = useMemo(() => {
    if (displayRoute.name === "history") return "history";
    if (displayRoute.name === "analyze") return "analyze";
    return null;
  }, [displayRoute]);

  const showTabs = displayRoute.name === "analyze" || displayRoute.name === "history";

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="app-main" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className={`app-main ${isTransitioning ? "app-main--exit" : ""}`} key={displayRoute.name}>
        {displayRoute.name === "welcome" && (
          <WelcomeScreen onStart={() => navigate({ name: "quiz" })} />
        )}

        {displayRoute.name === "quiz" && (
          <QuizScreen
            onDone={() => navigate({ name: "analyze" })}
            onCancel={profile ? () => navigate({ name: "analyze" }) : undefined}
          />
        )}

        {displayRoute.name === "analyze" && (
          <PasteScreen
            onAnalyze={(rawInci, productType, productName) =>
              navigate({ name: "analyzing", rawInci, productType, productName })
            }
            onEditProfile={() => navigate({ name: "quiz" })}
          />
        )}

        {displayRoute.name === "analyzing" && (
          <AnalyzingScreen
            rawInci={displayRoute.rawInci}
            productType={displayRoute.productType}
            productName={displayRoute.productName}
            onComplete={(entry) => navigate({ name: "result", entry })}
            onError={() => navigate({ name: "analyze" })}
          />
        )}

        {displayRoute.name === "result" && (
          <ResultScreen
            entry={displayRoute.entry}
            onBack={() => navigate({ name: "analyze" })}
            onAnalyzeAnother={() => navigate({ name: "analyze" })}
          />
        )}

        {displayRoute.name === "history" && (
          <HistoryScreen
            onOpen={(entry) => navigate({ name: "result", entry })}
          />
        )}
      </main>

      {showTabs && activeTab && (
        <BottomNav
          active={activeTab}
          onNavigate={(tab) => {
            if (tab === "analyze") navigate({ name: "analyze" });
            else if (tab === "history") navigate({ name: "history" });
          }}
        />
      )}
    </div>
  );
}
