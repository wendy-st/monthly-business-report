import type { FinancialView, MetricRow } from "./contracts";

export type BusinessRow = MetricRow & {
  category: string;
  position: string;
  currency: string;
  prices: Record<string, string | null>;
  revenue_share: string | null;
  deltas: Record<string, string | null>;
  subtotal: boolean;
};
export type BusinessDetails = {
  scope: string;
  site_options: string[];
  listing_options: { site: string; listing: string }[];
  listings: BusinessRow[];
  site_totals: BusinessRow[];
  profit_totals: BusinessRow[];
  loss_totals: BusinessRow[];
  categories: MetricRow[];
  category_total: string | null;
  conversion: Record<string, Record<string, Record<string, string | null>>>;
  conclusions: Record<string, { label: string; detail: string }[]>;
  refund_totals: Record<string, Record<string, string | null>>;
};
export type BusinessView = FinancialView & { business: BusinessDetails };
