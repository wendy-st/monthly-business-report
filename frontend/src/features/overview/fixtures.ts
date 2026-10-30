import type { Metric } from "../../shared/report/MetricCards";

// 所有金额和数量均为独立合成值，不读取旧报告的真实经营数据。
export const overviewFixture = {
  metrics: [
    {
      title: "净销量（件）",
      value: "12,800",
      previous: "12,000",
      yearAgo: "10,800",
      mom: "↑ 6.7%",
      yoy: "↑ 18.5%",
    },
    {
      title: "净销售额（人民币万元）",
      value: "128.00",
      previous: "120.00",
      yearAgo: "108.00",
      mom: "↑ 6.7%",
      yoy: "↑ 18.5%",
    },
    {
      title: "净利润（人民币万元）",
      value: "19.20",
      previous: "17.10",
      yearAgo: "15.00",
      mom: "↑ 12.3%",
      yoy: "↑ 28.0%",
    },
    {
      title: "净利率",
      value: "15.00%",
      previous: "14.25%",
      yearAgo: "13.89%",
      mom: "↑ 0.75PP",
      yoy: "↑ 1.11PP",
    },
  ] satisfies Metric[],
  groups: [
    { group: "LZF组", revenue: "38.00", profit: "6.80", margin: "17.89%" },
    { group: "HCM组", revenue: "29.00", profit: "4.40", margin: "15.17%" },
    { group: "Ash组", revenue: "19.00", profit: "2.90", margin: "15.26%" },
    {
      group: "KAYO-北美组",
      revenue: "18.00",
      profit: "2.40",
      margin: "13.33%",
    },
    {
      group: "KAYO-欧日组",
      revenue: "14.00",
      profit: "2.00",
      margin: "14.29%",
    },
    { group: "薄底水鞋US", revenue: "10.00", profit: "0.70", margin: "7.00%" },
  ],
  periods: ["2025-09", "2026-08", "2026-09"],
  revenue: [108, 120, 128],
  profit: [15, 17.1, 19.2],
  margin: [13.89, 14.25, 15],
  categories: ["水鞋", "手套", "眼镜", "其他"],
  categoryShares: [56, 24, 16, 4],
  sites: ["US", "CA", "UK", "其他"],
  siteShares: [64, 18, 12, 6],
};

export const groupNames = overviewFixture.groups.map((item) => item.group);

export const diagnosticPreview = {
  costs: [
    "销售成本",
    "头程费用",
    "FBA配送成本",
    "FBA佣金",
    "FBA仓储成本",
    "营销推广费",
    "其他费用",
  ],
};

// 瀑布图的起终点与影响项均为样例，正式拆解必须由后端提供。
export const waterfallFixtures = {
  环比: {
    names: [
      "上期净利",
      "收入影响",
      "销售成本",
      "履约费用",
      "其他费用",
      "本期净利",
    ],
    base: [0, 17.1, 18.6, 18.6, 19.2, 0],
    values: [17.1, 3.2, 1.7, 0.6, 0.0, 19.2],
    labels: ["17.10", "+3.20", "−1.70", "+0.60", "0.00", "19.20"],
    summary: "环比：17.10 + 3.20 − 1.70 + 0.60 + 0.00 = 19.20万元。",
  },
  同比: {
    names: [
      "去年净利",
      "收入影响",
      "销售成本",
      "履约费用",
      "其他费用",
      "本期净利",
    ],
    base: [0, 15, 18.7, 18.7, 19.2, 0],
    values: [15, 6, 2.3, 0.5, 0.0, 19.2],
    labels: ["15.00", "+6.00", "−2.30", "+0.50", "0.00", "19.20"],
    summary: "同比：15.00 + 6.00 − 2.30 + 0.50 + 0.00 = 19.20万元。",
  },
};
