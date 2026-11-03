export type Value = string | null;
export type Metric = "sales" | "units" | "returns" | "rate" | "asp";
export interface Metrics {
  sales: Value;
  units: Value;
  returns: Value;
  rate: Value;
  asp: Value;
  count: number;
  sales_count: number;
  units_count: number;
  returns_count: number;
  negative_count: number;
  fallback_count: number;
}
export interface Row extends Metrics {
  month: string;
  site: string;
  currency: string;
  category: string;
  audience: string;
  kind: string;
  brand: string;
  status: string;
}
export interface Scope {
  start: string;
  end: string;
  site: string;
  category: string;
  audience: string;
  brand: string;
}
export interface ComparisonScope extends Scope {
  target: string;
  kind: string;
  peers?: string[];
}
export interface Options {
  months: string[];
  sites: string[];
  categories: string[];
  audiences: string[];
  start: string;
  end: string;
  row_count: number;
  source_count: number;
  negative_count: number;
  reference_metadata: boolean;
}
export interface NamedMetrics extends Metrics {
  name: string;
}
export interface OverviewView {
  scope: Scope;
  currency: string;
  brands: string[];
  totals: Metrics;
  trend: NamedMetrics[];
  ranking: NamedMetrics[];
  composition: NamedMetrics[];
  rows: Row[];
}
export interface CategoryOption {
  category: string;
  audience: string;
  kind: string;
}
export interface BrandSummary extends Metrics {
  brand: string;
  months: number;
  units_rank: number | null;
  sales_rank: number | null;
  units_total: number;
  sales_total: number;
  units_peak: NamedMetrics | null;
  sales_peak: NamedMetrics | null;
}
export interface Benchmark {
  brand: string;
  month: string;
  value: string;
  target: Value;
  gap: Value;
}
export interface ComparisonView {
  scope: ComparisonScope;
  currency: string;
  sites: string[];
  categories: CategoryOption[];
  months: string[];
  pool: BrandSummary[];
  selected: string[];
  summaries: BrandSummary[];
  series: { brand: string; points: (NamedMetrics | null)[] }[];
  units_peak: Benchmark | null;
  sales_peak: Benchmark | null;
  lowest: BrandSummary | null;
  rate_gap: Value;
}
