import type { Amounts } from "./contracts";

export type ProductStyleContext = {
  diagnosis: string;
  basis: string;
  benchmark: string | null;
  local_price: string | null;
  currency: string;
};

export type ProductAnalysis = {
  style_count: number;
  contexts: Record<string, ProductStyleContext>;
  comparisons: Record<string, { values: Amounts; conclusion: string[] }>;
  trends: Record<string, Amounts>;
  rates: Record<string, Record<string, Amounts>>;
  scope_available: boolean;
  scope_note: string;
};
export interface ProductRefundView {
  min_sales: number;
  total_styles: number;
  low_sales_count: number;
  low_sales_share: string | null;
  low_sales_qty_share: string | null;
  missing_sales_count: number;
  statuses: Record<string, "eligible" | "low_sales" | "missing_sales">;
  eligible_keys: string[];
  ranking_keys: string[];
  abnormal_keys: string[];
}
