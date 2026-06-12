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
    </button>
  );
}
