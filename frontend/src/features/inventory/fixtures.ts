import { groupNames } from "../overview/fixtures";
import type { Metric } from "../../shared/report/MetricCards";
import { formatNumber } from "../../shared/report/format";

// 独立合成库存；不读取或推断原Excel中的库存与预测数值。
export const inventoryGroups = groupNames.map((group, index) => ({
  group,
  quantity: [12000, 10000, 8000, 6500, 5000, 2500][index],
  amount: [240000, 200000, 160000, 130000, 100000, 50000][index],
  days: [120, 150, 180, 210, 240, 270][index],
}));
export const forecastMonths = [
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
  "2027-03",
  "2027-04",
  "2027-05",
];
export const warehouseNames = ["FBA仓", "海外仓", "本地仓"];

export const categoryInventoryPreview = [
  {
    name: "水鞋",
    share: 0.56,
    children: [
      { name: "薄底水鞋", share: 0.32 },
      { name: "厚底水鞋", share: 0.24 },
    ],
  },
  { name: "手套", share: 0.24, children: [{ name: "保暖手套", share: 0.24 }] },
  { name: "眼镜", share: 0.16, children: [{ name: "骑行眼镜", share: 0.16 }] },
  {
    name: "其他",
    share: 0.04,
    children: [{ name: "其他示例品类", share: 0.04 }],
  },
];
export const turnoverPreview = {
  months: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月"],
  series: [
    {
      name: "2026 所有仓库",
      ratios: [1.4, 1.3, 1.1, 0.95, 0.8, 0.72, 0.8, 0.9, 1],
    },
    {
      name: "2025 所有仓库",
      ratios: [1.5, 1.4, 1.2, 1.05, 0.9, 0.85, 0.9, 1.05, 1.14],
    },
    {
      name: "2026 FBA+海外仓",
      ratios: [0.9, 0.85, 0.7, 0.65, 0.52, 0.45, 0.5, 0.55, 0.6],
    },
    {
      name: "2025 FBA+海外仓",
      ratios: [1, 0.92, 0.8, 0.72, 0.6, 0.55, 0.6, 0.65, 0.7],
    },
  ],
};
export const futureDaysPreview = [
  { name: "所有库存", days: [180, 165, 145, 120, 95, 65, 30, 0] },
  { name: "FBA+海外仓", days: [108, 95, 75, 60, 40, 20, 0, 0] },
];

export function inventoryPreview(group: string, basis: string) {
  const rows = inventoryGroups.filter(
    (row) => group === "库存总览" || row.group === group,
  );
  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const amount =
    rows.reduce((sum, row) => sum + row.amount, 0) *
    (basis === "含头程" ? 1.12 : 1);
  const days = group === "库存总览" ? 180 : rows[0].days;
  const metrics: Metric[] = [
    {
      title: "库存资金（人民币万元）",
      value: formatNumber(amount / 10000),
      previous: formatNumber(amount / 9500),
      yearAgo: formatNumber(amount / 11000),
      mom: "↓ 5.0%",
      yoy: "↑ 10.0%",
    },
    {
      title: "库存数量（件）",
      value: formatNumber(quantity, 0),
      previous: formatNumber(quantity / 0.95, 0),
      yearAgo: formatNumber(quantity / 1.1, 0),
      mom: "↓ 5.0%",
      yoy: "↑ 10.0%",
    },
    {
      title: "总库存周转天数",
      value: `${days.toFixed(1)}天`,
      previous: `${days + 10}天`,
      yearAgo: `${days + 25}天`,
      mom: "↓ 10.0天",
      yoy: "↓ 25.0天",
    },
    {
      title: "FBA+海外仓周转天数",
      value: `${(days * 0.6).toFixed(1)}天`,
      previous: `${(days * 0.6 + 8).toFixed(1)}天`,
      yearAgo: `${(days * 0.6 + 20).toFixed(1)}天`,
      mom: "↓ 8.0天",
      yoy: "↓ 20.0天",
    },
  ];
  return {
    rows,
    quantity,
    amount,
    days,
    metrics,
    warehouses: warehouseNames.map((name, index) => ({
      name,
      share: [50, 15, 35][index],
      quantity: quantity * [0.5, 0.15, 0.35][index],
      amount: amount * [0.5, 0.15, 0.35][index],
    })),
    forecast: [1, 0.88, 0.72, 0.6, 0.42, 0.28, 0.12, 0].map((value) =>
      Math.round(quantity * value),
    ),
  };
}
