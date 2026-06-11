import "./OptionCard.css";

interface OptionCardProps {
  readonly label: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}

/** Selectable card used throughout the hair quiz for single-choice answers. */
export function OptionCard({
  label,
  description,
  selected,
  onClick,
}: OptionCardProps) {
  return (
    <button
      type="button"
      className={`option-card ${selected ? "option-card--selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="option-card__label">{label}</span>
      {description && (
        <span className="option-card__desc">{description}</span>
      )}
      <span className="option-card__check" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
