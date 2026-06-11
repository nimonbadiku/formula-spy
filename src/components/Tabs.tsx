import "./Tabs.css";

export interface TabItem {
  readonly id: string;
  readonly label: string;
}

interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
}

/** Segmented tab control used to switch between Overview and Ingredients. */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={`tabs__item ${isActive ? "tabs__item--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
