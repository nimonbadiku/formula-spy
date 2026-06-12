import { useRef } from "react";
import "./BottomNav.css";

export type NavTab = "analyze" | "history";

interface BottomNavProps {
  readonly active: NavTab;
  readonly onNavigate: (tab: NavTab) => void;
}

const TABS: { id: NavTab; label: string; icon: JSX.Element }[] = [
  {
    id: "analyze",
    label: "Analyze",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    ),
  },
];

/** Fixed bottom tab bar with sliding indicator. */
export function BottomNav({ active, onNavigate }: BottomNavProps) {
  const activeIndex = TABS.findIndex((t) => t.id === active);

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary"
    >
      <div
        className="bottom-nav__indicator"
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {TABS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            className={`bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
