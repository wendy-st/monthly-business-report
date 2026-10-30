import type { Metric } from "../../shared/report/MetricCards";
import type { Amounts, MetricRow } from "./contracts";

export function plot(
  value: string | null | undefined,
  scale = 1,
): number | null {
  return value === null || value === undefined ? null : Number(value) / scale;
}

// 数值转换仅供显示与绘图；正式利润、筛选合计和比较由后端提供。
export function format(
  value: string | null | undefined,
  digits = 2,
  scale = 1,
): string {
  if (value === null || value === undefined) return "—";
  return (Number(value) / scale).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
export function percent(value: string | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${format(value, 2, 0.01)}%`;
}
export function metrics(row: MetricRow): Metric[] {
  return [
    ["units", "净销量（件）", 1, 0],
    ["revenue", "净销售额（人民币万元）", 10000, 2],
    ["profit", "净利润（人民币万元）", 10000, 2],
    ["margin", "净利率", 0.01, 2],
  ].map(([key, title, scale, digits]) => {
    const name = String(key);
    const show = (values: Amounts) =>
      name === "margin"
        ? percent(values[name])
        : format(values[name], Number(digits), Number(scale));
    return {
      title: String(title),
      value: show(row.current),
      previous: show(row.previous),
      yearAgo: show(row.year_ago),
      mom: row.changes[`${name}_mom`] ?? "—",
      yoy: row.changes[`${name}_yoy`] ?? "—",
    };
  });
}
