import type { CategoryOption, Metric, Row, Scope } from "./contracts";

export const metricNames: Record<Metric, string> = {
  sales: "销售额",
  units: "销量",
  returns: "退货量",
  rate: "退货率",
  asp: "平均售价",
};
export const colors = [
  "#087f72",
  "#4d78b4",
  "#cf8640",
  "#936da9",
  "#b95367",
  "#647d53",
  "#639eaa",
  "#a3905c",
];
export const compositionColors = [
  "#087f72",
  "#e58b2b",
  "#4d78b4",
  "#936da9",
  "#b95367",
  "#8b8f35",
  "#3198ae",
  "#a66e43",
];
export function color(index: number) {
  return colors[index] ?? `hsl(${(index * 137.5 + 15) % 360},45%,43%)`;
}
export function format(
  value: string | number | null | undefined,
  metric: Metric = "units",
) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (metric === "rate") return `${(number * 100).toFixed(2)}%`;
  const digits = metric === "sales" || metric === "asp" ? 2 : 0;
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
export function short(value: number, rate = false): string {
  if (rate) return `${Number((value * 100).toFixed(1))}%`;
  return Math.abs(value) >= 1e8
    ? `${(value / 1e8).toFixed(1)}亿`
    : Math.abs(value) >= 1e4
      ? `${(value / 1e4).toFixed(1)}万`
      : format(value);
}
export function points(value: string | null) {
  if (value === null) return "—";
  const n = Number(value) * 100;
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}个百分点`;
}
export function categoryKey(value: CategoryOption) {
  return JSON.stringify([value.category, value.audience, value.kind]);
}
export function categoryLabel(value: CategoryOption, full = true) {
  return [
    value.category,
    ...(full || value.audience !== "未标注" ? [value.audience] : []),
    ...(full || value.kind !== value.category ? [value.kind] : []),
  ].join(" / ");
}
export function params(scope: Scope | Record<string, unknown>) {
  const result = new URLSearchParams();
  Object.entries(scope).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      result.set(
        key,
        Array.isArray(value) ? JSON.stringify(value) : String(value),
      );
  });
  return result.toString();
}
export function exportUrl(
  kind: "overview" | "comparison",
  scope: Scope,
  extra: Record<string, unknown> = {},
) {
  return `/api/itk/${kind}.csv?${params({ ...scope, ...extra })}`;
}
export function dateChange<T extends Scope>(
  scope: T,
  field: "start" | "end",
  value: string,
): T {
  const next = { ...scope, [field]: value };
  if (next.start > next.end) next[field === "start" ? "end" : "start"] = value;
  return next;
}
export type SortKey = "month" | "brand" | Metric;
export function details(
  rows: Row[],
  search: string,
  sort: SortKey,
  descending: boolean,
) {
  const query = search.trim().toLocaleLowerCase();
  const compareText = (a: string, b: string) => a.localeCompare(b, "zh-CN");
  return rows
    .filter((r) =>
      `${r.brand} ${categoryLabel(r, false)}`
        .toLocaleLowerCase()
        .includes(query),
    )
    .sort((a, b) => {
      const x = a[sort],
        y = b[sort];
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      const first =
        sort === "brand" || sort === "month"
          ? compareText(x, y)
          : Number(x) - Number(y);
      return (
        (descending ? -first : first) ||
        compareText(a.site, b.site) ||
        compareText(categoryLabel(a, false), categoryLabel(b, false)) ||
        compareText(a.brand, b.brand)
      );
    });
}
