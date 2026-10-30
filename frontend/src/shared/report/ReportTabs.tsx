import { Button } from "antd";

/** 原报告按钮式页签；保留方向键、Home/End及选中状态。 */
export function ReportTabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="report-tabs" role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <Button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          type={value === option.value ? "primary" : "default"}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      options.length) %
                    options.length;
            onChange(options[next].value);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              );
            buttons?.[next].focus();
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
