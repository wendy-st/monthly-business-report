import { format } from "./presentation";
export function businessAmount(
  value: string | null | undefined,
  signed = false,
) {
  if (value == null) return "—";
  const amount = Number(value);
  const large = Math.abs(amount) >= 10000;
  return `${signed && amount > 0 ? "+" : ""}${(amount / (large ? 10000 : 1)).toFixed(2)}${large ? "万" : ""}`;
}
export function businessPercent(
  value: string | null | undefined,
  signed = false,
) {
  return value == null
    ? "—"
    : `${signed && Number(value) > 0 ? "+" : ""}${(Number(value) * 100).toFixed(1)}%`;
}
export function compareBusinessSites(left: string, right: string) {
  const rank = (site: string) =>
    site === "" ? -1 : site === "US" ? 0 : site === "CA" ? 1 : 2;
  return rank(left) - rank(right) || left.localeCompare(right);
}

export const businessCostLabels: Record<string, string> = {
  purchase: "销售成本",
  freight: "头程运费",
  other_cost: "其他成本",
  delivery: "FBA配送成本",
  quality: "FBA质量成本",
  storage: "FBA仓储成本",
  overseas: "海外仓成本",
  commission: "FBA佣金",
  compensation: "FBA赔偿收入",
  other_platform: "FBA其他站内费用",
  marketing: "营销推广费用",
};
export function businessTone(
  value: string | null | undefined,
  lowerIsBetter = false,
) {
  if (value == null || Number(value) === 0) return "";
  return Number(value) > 0 !== lowerIsBetter
    ? "impact-positive"
    : "impact-negative";
}
function changeArrow(value: number, badge: boolean) {
  if (value === 0) return badge ? "• " : "";
  if (badge) return value > 0 ? "▲ " : "▼ ";
  return value > 0 ? "↑ " : "↓ ";
}
export function BusinessChange({
  value,
  scale = 0.01,
  unit = "pp",
  lowerIsBetter = false,
  arrow = true,
  badge = false,
}: {
  value: string | null | undefined;
  scale?: number;
  unit?: string;
  lowerIsBetter?: boolean;
  arrow?: boolean;
  badge?: boolean;
}) {
  const signed = !arrow || badge;
  const shown =
    value == null || signed ? value : String(Math.abs(Number(value)));
  const amount =
    unit === "万"
      ? businessAmount(shown, signed)
      : `${signed && Number(shown) > 0 ? "+" : ""}${format(shown, unit === "" ? 0 : 1, scale)}${unit}`;
  return (
    <span
      className={`${businessTone(value, lowerIsBetter)}${badge ? " business-change-badge" : ""}`}
    >
      {value == null
        ? "—"
        : `${arrow ? changeArrow(Number(value), badge) : ""}${amount}`}
    </span>
  );
}
export function BusinessRateChange({
  value,
}: {
  value: string | null | undefined;
}) {
  if (value == null) return <>—</>;
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return <>{value}</>;
  return (
    <span className={`${businessTone(String(number))} business-change-badge`}>
      {changeArrow(number, false)}
      {Math.abs(number).toFixed(1)}
      {value.endsWith("pp") ? "PP" : "%"}
    </span>
  );
}
