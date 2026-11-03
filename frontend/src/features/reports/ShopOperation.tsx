import { monthLabel, comparedMonth, useReportMonth } from "./report-month";
import { useState } from "react";
import { Card, Table } from "antd";
import type { TableColumnsType } from "antd";
import type { OverviewDetails, OverviewRow } from "./overview-contracts";
import {
  OverviewChange,
  overviewAmount,
  profitClass,
} from "./overview-presentation";
import { format } from "./presentation";

function comparisonColumns(
  comparison: "mom" | "yoy",
): TableColumnsType<OverviewRow> {
  const fields = [
    ["销量增减", "units", "units", false],
    ["销量增减率", "units", "rate", true],
    ["销售额增减", "revenue", "amount", false],
    ["销售额增减率", "revenue", "rate", true],
    ["净利润增减", "profit", "amount", false],
    ["净利率变动（pp）", "margin", "points", false],
  ] as const;
  return fields.map(([title, key, kind, rate]) => ({
    title,
    align: "right",
    width: kind === "points" ? 108 : 90,
    className: `overview-shop-${comparison}`,
    onHeaderCell: () => ({
      style: { background: `var(--report-color-shop-${comparison}-head)` },
    }),
    render: (_, row) => (
      <OverviewChange
        value={(rate ? row.changes : row.deltas)[`${key}_${comparison}`]}
        kind={kind}
      />
    ),
  }));
}

/** 筛选仅选择后端已计算好的店铺行及同范围小计。 */
export function ShopOperation({ data }: { data: OverviewDetails }) {
  const { month } = useReportMonth();
  const [site, setSite] = useState("");
  const rows = data.shops.filter(
    (row) => !site || row.dimensions.site === site,
  );
  const total = data.shop_totals[site];
  const columns: TableColumnsType<OverviewRow> = [
    {
      title: "店铺",
      fixed: "left",
      width: 130,
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-current-head)" },
      }),
      render: (_, row) => row.dimensions.shop ?? row.label,
    },
    {
      title: "本月销量",
      align: "right",
      width: 80,
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-current-head)" },
      }),
      render: (_, row) => format(row.current.units, 0),
    },
    {
      title: "本月销售额",
      align: "right",
      width: 90,
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-current-head)" },
      }),
      render: (_, row) => overviewAmount(row.current.revenue),
    },
    {
      title: "本月净利润",
      align: "right",
      width: 90,
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-current-head)" },
      }),
      onCell: (row) => ({ className: profitClass(row.current.profit) }),
      render: (_, row) => overviewAmount(row.current.profit),
    },
    {
      title: "本月净利率",
      align: "right",
      width: 80,
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-current-head)" },
      }),
      render: (_, row) =>
        row.current.margin == null
          ? "—"
          : `${format(row.current.margin, 1, 0.01)}%`,
    },
    {
      title: `环比${monthLabel(comparedMonth(month, -1))}`,
      className: "overview-shop-mom",
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-mom-head)" },
      }),
      children: comparisonColumns("mom"),
    },
    {
      title: `同比${monthLabel(comparedMonth(month, -12))}`,
      className: "overview-shop-yoy",
      onHeaderCell: () => ({
        style: { background: "var(--report-color-shop-yoy-head)" },
      }),
      children: comparisonColumns("yoy"),
    },
  ];
  return (
    <Card
      title="店铺经营"
      size="small"
      className="overview-shops"
      extra={
        <select
          aria-label="店铺站点"
          value={site}
          onChange={(event) => setSite(event.target.value)}
        >
          <option value="">全部站点</option>
          {Object.keys(data.shop_totals)
            .filter(Boolean)
            .map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
        </select>
      }
    >
      <Table<OverviewRow>
        aria-label="店铺经营"
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={total ? [...rows, total] : rows}
        columns={columns}
        rowClassName={(row) =>
          row.key.startsWith("total") ? "overview-total-row" : ""
        }
        scroll={{ x: 1586, y: 330 }}
        locale={{ emptyText: "该站点本期无店铺记录" }}
      />
    </Card>
  );
}
