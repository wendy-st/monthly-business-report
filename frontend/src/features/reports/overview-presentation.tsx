import { format } from "./presentation";

export function overviewAmount(
  value: string | null | undefined,
  signed = false,
) {
  if (value == null) return "—";
  const large = Math.abs(Number(value)) >= 10000;
  return `${signed && Number(value) > 0 ? "+" : ""}${format(value, 2, large ? 10000 : 1)}${large ? "万" : ""}`;
}

export function profitClass(value: string | null | undefined) {
  if (value == null || Number(value) === 0) return "";
  return Number(value) > 0
    ? "overview-profit-positive"
    : "overview-profit-negative";
}

/** 仅格式化后端已给出的变化值，不在浏览器核算差额或增长率。 */
export function OverviewChange({
  value,
  kind = "rate",
}: {
  value: string | null | undefined;
  kind?: "rate" | "amount" | "units" | "points";
}) {
  if (value == null) return <>—</>;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return <>{value}</>;
  const content =
    kind === "amount"
      ? overviewAmount(value, true)
      : kind === "units"
        ? `${numeric > 0 ? "+" : ""}${format(value, 0)}`
        : kind === "points"
          ? `${numeric > 0 ? "+" : ""}${format(value, 1, 0.01)}pp`
          : `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}${value.endsWith("pp") ? "pp" : "%"}`;
  return (
    <span
      className={`overview-change ${numeric > 0 ? "impact-positive" : numeric < 0 ? "impact-negative" : ""}`}
    >
      {numeric > 0 ? "↑ " : numeric < 0 ? "↓ " : ""}
      {content}
    </span>
  );
}
