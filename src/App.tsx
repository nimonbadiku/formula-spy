import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { HistoryEntry } from "@/store/types";
import { BottomNav } from "@/components/BottomNav";
import { QuizScreen } from "@/screens/QuizScreen";
import { PasteScreen } from "@/screens/PasteScreen";
import { AnalyzingScreen } from "@/screens/AnalyzingScreen";
import { ResultScreen } from "@/screens/ResultScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { WelcomeScreen } from "@/screens/WelcomeScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import type { ProductType } from "@/lib/productTypes";

/**
 * Navigation model. The app is a small state machine rather than a URL router,
 * which keeps the single-flow mobile experience predictable.
 */
export type Route =
  | { name: "welcome" }
  | { name: "quiz" }
  | { name: "analyze" }
  | { name: "analyzing"; rawInci: string; productType: ProductType }
  | { name: "result"; entry: HistoryEntry }
  | { name: "history" }
  | { name: "profile" };

export function App() {
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.profile);

  const [route, setRoute] = useState<Route>({ name: "welcome" });

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Once hydrated, decide the initial screen exactly once.
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    if (!hydrated || bootstrapped) return;
    setBootstrapped(true);
    setRoute(profile ? { name: "analyze" } : { name: "welcome" });
  }, [hydrated, bootstrapped, profile]);

  const activeTab = useMemo(() => {
    if (route.name === "history") return "history";
    if (route.name === "analyze") return "analyze";
    if (route.name === "profile") return "profile";
    return null;
  }, [route]);

  const showTabs =
    route.name === "analyze" || route.name === "history" || route.name === "profile";

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="app-main" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main" key={route.name}>
        {route.name === "welcome" && (
          <WelcomeScreen onStart={() => setRoute({ name: "quiz" })} />
        )}

        {route.name === "quiz" && (
          <QuizScreen
            onDone={() => setRoute({ name: "analyze" })}
            onCancel={profile ? () => setRoute({ name: "analyze" }) : undefined}
          />
        )}

        {route.name === "analyze" && (
          <PasteScreen
            onAnalyze={(rawInci, productType) =>
              setRoute({ name: "analyzing", rawInci, productType })
            }
            onEditProfile={() => setRoute({ name: "quiz" })}
          />
        )}

        {route.name === "analyzing" && (
          <AnalyzingScreen
            rawInci={route.rawInci}
            productType={route.productType}
            onComplete={(entry) => setRoute({ name: "result", entry })}
            onError={() => setRoute({ name: "analyze" })}
          />
        )}

        {route.name === "result" && (
          <ResultScreen
            entry={route.entry}
            onBack={() => setRoute({ name: "analyze" })}
            onAnalyzeAnother={() => setRoute({ name: "analyze" })}
          />
        )}

        {route.name === "history" && (
          <HistoryScreen onOpen={(entry) => setRoute({ name: "result", entry })} />
        )}

        {route.name === "profile" && (
          <ProfileScreen onEditProfile={() => setRoute({ name: "quiz" })} />
        )}
      </main>

      {showTabs && activeTab && (
        <BottomNav
          active={activeTab}
          onNavigate={(tab) => {
            if (tab === "analyze") setRoute({ name: "analyze" });
            else if (tab === "history") setRoute({ name: "history" });
            else if (tab === "profile") setRoute({ name: "profile" });
          }}
        />
      )}
    </div>
  );
}
