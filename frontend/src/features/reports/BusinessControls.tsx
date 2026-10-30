import { FormulaHelp } from "./FormulaHelp";

export function BusinessToggle({
  label,
  value,
  onChange,
  options,
  basis = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  basis?: boolean;
}) {
  return (
    <div
      className={`business-toggle${basis ? " business-basis-toggle" : ""}`}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <span key={option.value}>
          <button
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
          {basis && option.value !== "actual" && (
            <FormulaHelp
              name={
                option.value === "price_adjusted"
                  ? "basis_price_adjusted"
                  : "basis_price_refund_adjusted"
              }
              label={`查看${option.label}口径说明`}
            />
          )}
        </span>
      ))}
    </div>
  );
}
