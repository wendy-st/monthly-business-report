import type { HistoryView } from "./contracts";
import { businessAmount, businessTone } from "./business-presentation";
import { format, percent } from "./presentation";

export const historyCosts = {
  purchase: "销售成本",
  freight: "头程运费",
  delivery: "FBA配送成本",
  storage: "FBA仓储成本",
  commission: "FBA佣金",
  marketing: "营销推广费",
} as const;

export function historyAmount(
  value: string | null | undefined,
  signed = false,
) {
  if (value == null) return "—";
  const text = businessAmount(value, signed);
  return Math.abs(Number(value)) >= 10000 ? text : `${text}元`;
}

export function HistoryChange({
  value,
  points = false,
}: {
  value: string | null | undefined;
  points?: boolean;
}) {
  if (value == null) return <>—</>;
  const number = Number(value);
  return (
    <span className={`history-change ${businessTone(value)}`}>
      {number > 0 ? "↑ +" : number < 0 ? "↓ " : ""}
      {format(value, 2, 0.01)}
      {points ? "pp" : "%"}
    </span>
  );
}

export function historyYear(year: string, data: HistoryView) {
  if (data.year_labels[year]) return data.year_labels[year];
  return `${year}年${year === data.period_end.slice(0, 4) && !data.period_end.endsWith("12") ? "YTD" : year === data.period_start.slice(0, 4) && !data.period_start.endsWith("01") ? "*" : ""}`;
}

export const historyValue = (key: string, value: string | null | undefined) =>
  key === "units"
    ? format(value, 0)
    : key === "margin"
      ? percent(value)
      : historyAmount(value);
