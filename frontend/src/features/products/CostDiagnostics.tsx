import { Card, Empty, Table } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import type { Product } from "./fixtures";

import { CostMatrix } from "./ProductMatrix";
import { CostRateComparison } from "./CostRateComparison";

export function CostDiagnostics({ rows }: { rows: Product[] }) {
  const visible = rows.slice(0, 10);
  return (
    <>
      <h2 className="section-heading">
        <span>
          二、产品成本与毛利诊断
          <small>
            成本变化拆成退款影响与非退款影响，避免把退款造成的占比变化误判为采购或头程异常。
          </small>
        </span>
      </h2>
      <CostMatrix rows={rows} dimension="group" title="产品毛利成本矩阵" />
      <CostMatrix
        rows={rows}
        dimension="category2"
        title="二级品类产品毛利成本矩阵"
      />
      <CostMatrix
        rows={rows}
        dimension="category3"
        title="三级品类产品毛利成本矩阵"
      />
      <div className="three-col-grid cost-comparison-grid">
        <CostRateComparison rows={rows} />
        <Card title="三项成本同屏对照" size="small">
          {visible.length ? (
            <ReportChart
              summary="各款式销售成本率、头程费率和其他成本率的合成对照；前两项数值见上表，其他成本率均为0%。"
              option={{
                tooltip: { trigger: "axis" },
                legend: { data: ["销售成本率", "头程费率", "其他成本率"] },
                grid: { left: 48, right: 24, top: 48, bottom: 40 },
                xAxis: {
                  type: "category",
                  data: visible.map((row) => row.listing),
                },
                yAxis: { type: "value", name: "%" },
                series: [
                  {
                    name: "销售成本率",
                    type: "bar",
                    data: visible.map((row) => row.cost),
                  },
                  {
                    name: "头程费率",
                    type: "bar",
                    data: visible.map((row) => row.freight),
                  },
                  {
                    name: "其他成本率",
                    type: "bar",
                    data: visible.map(() => 0),
                  },
                ],
              }}
            />
          ) : (
            <Empty description="筛选无结果" />
          )}
        </Card>
        <Card title="当前筛选款式退款率 TOP10" size="small">
          <Table
            rowKey="id"
            size="small"
            dataSource={[...rows]
              .sort((a, b) => b.refund - a.refund)
              .slice(0, 10)}
            pagination={false}
            scroll={{ x: 300 }}
            columns={[
              { title: "款式", dataIndex: "style", ellipsis: true },
              { title: "站点", dataIndex: "site" },
              {
                title: "退款率",
                dataIndex: "refund",
                align: "right",
                render: (value: number) => `${value.toFixed(2)}%`,
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
