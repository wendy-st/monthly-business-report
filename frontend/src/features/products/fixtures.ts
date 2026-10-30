import { overviewFixture } from "../overview/fixtures";

// 全部数据独立合成。这里的样例聚合仅供布局演示，正式开发由后端结果替换。
const examples = [
  {
    listing: "DEMO-A",
    style: "示例款式A",
    site: "US",
    category1: "水鞋",
    category2: "成人水鞋",
    category3: "薄底水鞋",
    weight: 0.4,
    profitWeight: 0.5,
    cost: 23,
    freight: 12,
    refund: 4,
  },
  {
    listing: "DEMO-B",
    style: "示例款式B",
    site: "CA",
    category1: "水鞋",
    category2: "儿童水鞋",
    category3: "厚底水鞋",
    weight: 0.25,
    profitWeight: 0.3,
    cost: 25,
    freight: 15,
    refund: 7,
  },
  {
    listing: "DEMO-C",
    style: "示例款式C",
    site: "US",
    category1: "手套",
    category2: "冬季手套",
    category3: "保暖手套",
    weight: 0.25,
    profitWeight: 0.4,
    cost: 18,
    freight: 11,
    refund: 5,
  },
  {
    listing: "DEMO-D",
    style: "示例款式D · 超长款式名称用于核对换行和固定列展示",
    site: "CA",
    category1: "眼镜",
    category2: "运动眼镜",
    category3: "骑行眼镜",
    weight: 0.1,
    profitWeight: -0.2,
    cost: 35,
    freight: 25,
    refund: 26,
  },
];

export const productFixtures = overviewFixture.groups.flatMap((entry, index) =>
  examples.map((item) => ({
    ...item,
    id: `${index}-${item.listing}`,
    group: entry.group,
    revenue: Number(entry.revenue) * 10000 * item.weight,
    profit: Number(entry.profit) * 10000 * item.profitWeight,
    gross: 100 - item.cost - item.freight,
    status: item.profitWeight > 0 ? "健康盈利" : "费用端问题",
  })),
);

export type Product = (typeof productFixtures)[number];
export type ProductFiltersValue = {
  group: string;
  site: string;
  category1: string;
  category2: string;
  category3: string;
  listing: string;
  style: string;
  result: string;
  search: string;
};
export const initialFilters: ProductFiltersValue = {
  group: "全部",
  site: "全部",
  category1: "全部",
  category2: "全部",
  category3: "全部",
  listing: "全部",
  style: "全部",
  result: "全部",
  search: "",
};

export function filterProducts(filters: ProductFiltersValue) {
  const fields = [
    "group",
    "site",
    "category1",
    "category2",
    "category3",
    "listing",
    "style",
  ] as const;
  return productFixtures.filter(
    (row) =>
      fields.every(
        (key) => filters[key] === "全部" || filters[key] === row[key],
      ) &&
      (filters.result === "全部" ||
        (filters.result === "盈利" ? row.profit > 0 : row.profit < 0)) &&
      `${row.listing} ${row.style}`
        .toLowerCase()
        .includes(filters.search.trim().toLowerCase()),
  );
}

export function previewMatrix(rows: Product[]) {
  return [...new Set(rows.map((row) => row.group))].map((group) => {
    const selected = rows.filter((row) => row.group === group);
    return {
      group,
      revenue: selected.reduce((sum, row) => sum + row.revenue, 0),
      profit: selected.reduce((sum, row) => sum + row.profit, 0),
      count: selected.length,
    };
  });
}

/** 合成记录的展示矩阵，不作为正式财务汇总。 */
export function costMatrixPreview(
  rows: Product[],
  dimension: "group" | "category1" | "category2" | "category3",
) {
  return [...new Set(rows.map((row) => row[dimension]))].map((name) => {
    const selected = rows.filter((row) => row[dimension] === name);
    const revenue = selected.reduce((sum, row) => sum + row.revenue, 0);
    const profit = selected.reduce((sum, row) => sum + row.profit, 0);
    const weighted = (key: "gross" | "cost" | "freight") =>
      selected.reduce((sum, row) => sum + row[key] * row.revenue, 0) / revenue;
    return {
      name,
      revenue,
      profit,
      count: selected.length,
      gross: weighted("gross"),
      cost: weighted("cost"),
      freight: weighted("freight"),
      margin: (profit / revenue) * 100,
    };
  });
}
