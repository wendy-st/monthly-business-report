import { useState } from "react";
import { Card, Segmented, Select, Table } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import {
  inventoryPreview,
  categoryInventoryPreview,
  turnoverPreview,
} from "./fixtures";
import { formatNumber } from "../../shared/report/format";

export function InventoryTurnover({
  fixture,
  basis,
  onBasisChange,
}: {
  fixture: ReturnType<typeof inventoryPreview>;
  basis: string;
  onBasisChange: (basis: string) => void;
}) {
  const [category, setCategory] = useState("全部一级品类");
  return (
    <>
      <div className="two-col-grid inventory-turnover-grid">
        {["数量", "金额"].map((kind) => (
          <Card
            key={kind}
            title={
              kind === "数量"
                ? "数量周转天数（2025-2026年同期对比）"
                : `金额周转天数（${basis}）`
            }
            size="small"
            extra={
              kind === "金额" ? (
                <Segmented
                  size="small"
                  aria-label="库存金额口径"
                  value={basis}
                  options={["不含头程", "含头程"]}
                  onChange={onBasisChange}
                />
              ) : null
            }
          >
            <ReportChart
              summary={`${kind}周转月度趋势为合成样例，2025虚线、2026实线。`}
              option={{
                tooltip: { trigger: "axis" },
                legend: {
                  top: 10,
                  data: [
                    "2026 所有仓库",
                    "2025 所有仓库",
                    "2026 FBA+海外仓",
                    "2025 FBA+海外仓",
                  ],
                },
                grid: { left: 48, right: 24, top: 72, bottom: 40 },
                xAxis: { type: "category", data: turnoverPreview.months },
                yAxis: { type: "value", name: "天" },
                series: turnoverPreview.series.map((series, index) => ({
                  name: series.name,
                  type: "line",
                  symbol: "circle",
                  symbolSize: 5,
                  lineStyle: { type: index % 2 ? "dashed" : "solid" },
                  data: series.ratios.map((ratio) =>
                    Number(
                      (
                        fixture.days * ratio +
                        (kind === "金额" ? 5 : 0)
                      ).toFixed(1),
                    ),
                  ),
                })),
              }}
            />
          </Card>
        ))}
      </div>
      <Card title="小组库存周转明细（FBA仓+海外仓）" size="small">
        <Table
          rowKey="group"
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
          dataSource={fixture.rows}
          columns={[
            { title: "小组", dataIndex: "group" },
            {
              title: "期末库存数量",
              render: (_, row) => formatNumber(row.quantity * 0.65, 0),
            },
            {
              title: "期末库存金额（万）",
              render: (_, row) => formatNumber((row.amount * 0.65) / 10000),
            },
            ...[
              "本月数量周转",
              "上月数量周转",
              "同期数量周转",
              "本月金额周转",
            ].map((title, index) => ({
              title,
              render: (_: unknown, row: (typeof fixture.rows)[number]) =>
                formatNumber(row.days * 0.6 + index * 5, 1),
            })),
          ]}
        />
      </Card>
      <Card
        title="品类库存周转天数（FBA+海外仓）"
        size="small"
        extra={
          <Select
            value={category}
            aria-label="库存一级品类"
            onChange={setCategory}
            style={{ width: 160 }}
            options={[
              "全部一级品类",
              ...categoryInventoryPreview.map((row) => row.name),
            ].map((value) => ({ value, label: value }))}
          />
        }
      >
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={categoryInventoryPreview
            .filter(
              (row) => category === "全部一级品类" || row.name === category,
            )
            .flatMap((row) => row.children)}
          columns={[
            { title: "三级品类", dataIndex: "name" },
            {
              title: "期末库存数量",
              render: (_, row) => formatNumber(fixture.quantity * row.share, 0),
            },
            {
              title: "数量周转天数",
              render: () => formatNumber(fixture.days * 0.6, 1),
            },
            {
              title: "金额周转天数",
              render: () => formatNumber(fixture.days * 0.6 + 5, 1),
            },
            { title: "环比", render: () => "—" },
            { title: "同比", render: () => "—" },
          ]}
        />
      </Card>
    </>
  );
}
