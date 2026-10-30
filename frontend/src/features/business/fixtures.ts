import { productFixtures } from "../products/fixtures";
import { formatNumber } from "../../shared/report/format";
import type { Metric } from "../../shared/report/MetricCards";

// 只聚合合成记录供界面交互；正式接口接入后不复用此演示计算。
export function businessPreview(group: string, site: string, listing: string) {
  const rows = productFixtures.filter(
    (row) =>
      row.group === group &&
      (site === "全部" || row.site === site) &&
      (listing === "全部" || row.listing === listing),
  );
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0) / 10000;
  const profit = rows.reduce((sum, row) => sum + row.profit, 0) / 10000;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const metrics: Metric[] = [
    {
      title: "净销量（件）",
      value: formatNumber(revenue * 100, 0),
      previous: formatNumber(revenue * 92, 0),
      yearAgo: formatNumber(revenue * 85, 0),
      mom: "↑ 8.7%",
      yoy: "↑ 17.6%",
    },
    {
      title: "净销售额（人民币万元）",
      value: formatNumber(revenue),
      previous: formatNumber(revenue * 0.92),
      yearAgo: formatNumber(revenue * 0.85),
      mom: "↑ 8.7%",
      yoy: "↑ 17.6%",
    },
    {
      title: "净利润（人民币万元）",
      value: formatNumber(profit),
      previous: formatNumber(profit * 0.9),
      yearAgo: formatNumber(profit * 0.8),
      mom: profit >= 0 ? "↑ 11.1%" : "样例亏损",
      yoy: profit >= 0 ? "↑ 25.0%" : "样例亏损",
    },
    {
      title: "净利率",
      value: `${formatNumber(margin)}%`,
      previous: `${formatNumber((margin * 0.9) / 0.92)}%`,
      yearAgo: `${formatNumber((margin * 0.8) / 0.85)}%`,
      mom: `${formatNumber(margin - (margin * 0.9) / 0.92)}PP`,
      yoy: `${formatNumber(margin - (margin * 0.8) / 0.85)}PP`,
    },
  ];
  return {
    rows,
    metrics,
    revenue: [revenue * 0.85, revenue * 0.92, revenue],
    profit: [profit * 0.8, profit * 0.9, profit],
    margin: [(margin * 0.8) / 0.85, (margin * 0.9) / 0.92, margin],
  };
}

export const historyFixtures = {
  年度: {
    periods: ["2021", "2022", "2023", "2024", "2025", "2026年截至9月"],
    revenue: [18, 21, 25, 29, 32, 38],
    profit: [2, 3, 3.8, 4.1, 5.1, 6.8],
    margin: [11.1, 14.3, 15.2, 14.1, 15.9, 17.9],
  },
  季度: {
    periods: ["2025Q2", "2025Q3", "2025Q4", "2026Q1", "2026Q2", "2026Q3"],
    revenue: [9, 10, 11, 12, 13, 13],
    profit: [1, 1.5, 1.6, 2, 2.3, 2.5],
    margin: [11.1, 15, 14.5, 16.7, 17.7, 19.2],
  },
  月度: {
    periods: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
    revenue: [28, 31, 33, 36, 35, 38],
    profit: [3.5, 4, 4.5, 5, 6, 6.8],
    margin: [12.5, 12.9, 13.6, 13.9, 17.1, 17.9],
  },
};

export function businessWaterfallPreview(profit: number) {
  const bridge = (ratio: number) => {
    const previous = profit * ratio;
    const change = profit - previous;
    return {
      names: [
        "对比期净利",
        "收入影响",
        "销售成本",
        "履约费用",
        "其他费用",
        "本期净利",
      ],
      base: [0, previous, previous + change, previous + change, profit, 0],
      values: [previous, change, 0, 0, 0, profit],
      labels: [previous, change, 0, 0, 0, profit].map((value) =>
        formatNumber(value),
      ),
      summary: `小组当前筛选范围的合成净利润${formatNumber(profit)}万元。分项仅演示，不构成正式归因。`,
    };
  };
  return { 环比: bridge(0.9), 同比: bridge(0.8) };
}
