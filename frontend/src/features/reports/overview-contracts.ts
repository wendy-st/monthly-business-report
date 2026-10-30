import type { MetricRow } from "./contracts";

export type OverviewRow = MetricRow & {
  revenue_share: string | null;
  profit_share: string | null;
  bar_ratio: string | null;
  deltas: Record<string, string | null>;
};
export type OverviewDetails = {
  conversion: Record<string, Record<string, Record<string, string | null>>>;
  conclusions: Record<string, { label: string; detail: string }[]>;
  groups: OverviewRow[];
  sites: OverviewRow[];
  total: OverviewRow | null;
  categories: OverviewRow[];
  sales_top10: OverviewRow[];
  loss_top10: OverviewRow[];
  shops: OverviewRow[];
  shop_totals: Record<string, OverviewRow>;
};
