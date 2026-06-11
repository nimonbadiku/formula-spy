import "./BottomNav.css";

export type NavTab = "analyze" | "history" | "profile";

interface BottomNavProps {
  readonly active: NavTab;
  readonly onNavigate: (tab: NavTab) => void;
}

const ITEMS: { id: NavTab; label: string; icon: JSX.Element }[] = [
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "analyze",
    label: "Analyze",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
];

/** Fixed bottom tab bar for the two primary destinations. */
export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav glass" aria-label="Primary">
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            className={`bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
