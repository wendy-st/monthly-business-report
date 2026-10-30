import { useState } from "react";
import { Card, Empty, Segmented, Table, Typography } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import { reportColors } from "../../theme/seekway-antd-theme";
import type { BasisAnalysis, FinancialView, MetricRow } from "./contracts";
import { CostDiagnostics } from "./CostDiagnostics";
import { ProductDetails } from "./ProductDetails";
import { format, percent } from "./presentation";

function Matrix({
  rows,
  title,
  cost = false,
}: {
  rows: MetricRow[];
  title: string;
  cost?: boolean;
}) {
  const fields = cost
    ? [
        "gross_margin",
        "purchase_rate",
        "freight_rate",
        "other_cost_rate",
        "margin",
      ]
    : ["revenue", "gross_margin", "profit", "margin"];
  const names: Record<string, string> = {
    revenue: "销售额（万元）",
    profit: "净利润（万元）",
    gross_margin: "毛利率",
    purchase_rate: "销售成本率",
    freight_rate: "头程费率",
    other_cost_rate: "其他成本率",
    margin: "净利率",
  };
  return (
    <Card title={title} size="small" className="cost-matrix-card">
      <div className="report-table-scroll">
        <table className="report-table product-matrix">
          <thead>
            <tr>
              <th>范围</th>
              {fields.map((key) => (
                <th key={key}>{names[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((row) => row.record_count > 0)
              .map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  {fields.map((key) => (
                    <td
                      key={key}
                      className={
                        (key === "purchase_rate" &&
                          Number(row.current[key]) > 0.45) ||
                        (key === "freight_rate" &&
                          Number(row.current[key]) > 0.15)
                          ? "cost-heat"
                          : ""
                      }
                    >
                      {key === "revenue" || key === "profit"
                        ? format(row.current[key], 2, 10000)
                        : percent(row.current[key])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ProductDashboard({
  data,
  costs,
}: {
  data: FinancialView;
  costs?: BasisAnalysis[];
}) {
  const [dimension, setDimension] = useState("groups");
  const rows = data.breakdowns.styles.filter((row) => row.record_count > 0);
  const losses = [...rows]
    .filter(
      (row) => row.current.profit !== null && Number(row.current.profit) < 0,
    )
    .sort(
      (left, right) =>
        Number(left.current.profit) - Number(right.current.profit),
    )
    .slice(0, 10);
  const refunds = [...rows]
    .filter((row) => row.current.refund_rate !== null)
    .sort(
      (left, right) =>
        Number(right.current.refund_rate) - Number(left.current.refund_rate),
    )
    .slice(0, 10);
  return (
    <>
      <h2 className="section-heading">
        <span>
          一、最终盈亏结果
          <small>毛利判断产品成本，净利判断费用后的最终结果。</small>
        </span>
      </h2>
      <div className="three-col-grid">
        <div>
          <Segmented
            size="small"
            aria-label="盈利矩阵维度"
            value={dimension}
            onChange={setDimension}
            options={[
              { value: "groups", label: "小组" },
              { value: "categories", label: "一级品类" },
            ]}
          />
          <Matrix title="盈利矩阵" rows={data.breakdowns[dimension]} />
        </div>
        <Card title="毛利率 × 净利率诊断" size="small">
          <ReportChart
            sample={false}
            summary={`当前${rows.length}条本期款式，横轴毛利率，纵轴净利率，单位%。来源：经营底表。`}
            option={{
              tooltip: { trigger: "item", formatter: "{b}" },
              color: [reportColors.primary, reportColors.chartRed],
              legend: { data: ["盈利", "亏损"] },
              grid: { left: 48, right: 20, top: 44, bottom: 44 },
              xAxis: { type: "value", name: "毛利率%" },
              yAxis: { type: "value", name: "净利率%" },
              series: ["盈利", "亏损"].map((name) => ({
                name,
                type: "scatter",
                symbol: name === "盈利" ? "circle" : "triangle",
                symbolSize: 8,
                data: rows
                  .filter(
                    (row) =>
                      row.current.profit !== null &&
                      row.current.gross_margin !== null &&
                      row.current.margin !== null &&
                      Number(row.current.profit) >= 0 === (name === "盈利"),
                  )
                  .map((row) => ({
                    name: row.label,
                    value: [
                      Number(row.current.gross_margin) * 100,
                      Number(row.current.margin) * 100,
                    ],
                  })),
              })),
            }}
          />
        </Card>
        <Card title="亏损款式 TOP10" size="small">
          {losses.length ? (
            <ol className="ranking-list">
              {losses.map((row) => (
                <li key={row.key}>
                  <div>
                    <strong title={row.label}>{row.dimensions.style}</strong>
                    <Typography.Text type="secondary">
                      {row.dimensions.group} · {row.dimensions.site}/
                      {row.dimensions.listing}
                    </Typography.Text>
                  </div>
                  <span className="loss-track">
                    <i
                      style={{
                        width: `${Math.abs(Number(row.current.profit) / Number(losses[0].current.profit)) * 100}%`,
                      }}
                    />
                  </span>
                  <Typography.Text type="danger">
                    {format(row.current.profit, 2, 10000)}万
                  </Typography.Text>
                </li>
              ))}
            </ol>
          ) : (
            <Empty description="当前范围没有亏损款式" />
          )}
        </Card>
      </div>
      <h2 className="section-heading">
        <span>
          二、产品成本与毛利诊断
          <small>成本率与利润均由后端按当前范围核算。</small>
        </span>
      </h2>
      <Matrix title="产品毛利成本矩阵" rows={data.breakdowns.groups} cost />
      <Matrix
        title="二级品类产品毛利成本矩阵"
        rows={data.breakdowns.category2}
        cost
      />
      <Matrix
        title="三级品类产品毛利成本矩阵"
        rows={data.breakdowns.category3}
        cost
      />
      <div className="three-col-grid cost-comparison-grid">
        <Card title="三项成本率对比" size="small">
          <table className="report-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>本期</th>
                <th>环比期</th>
                <th>同比期</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["purchase_rate", "销售成本率"],
                ["freight_rate", "头程费率"],
                ["other_cost_rate", "其他产品成本率"],
              ].map(([key, title]) => (
                <tr key={key}>
                  <td>{title}</td>
                  <td>{percent(data.summary.current[key])}</td>
                  <td>{percent(data.summary.previous[key])}</td>
                  <td>{percent(data.summary.year_ago[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="三项成本同屏对照" size="small">
          <ReportChart
            sample={false}
            summary="三期采购、头程与其他成本金额，来源：经营底表。"
            option={{
              tooltip: { trigger: "axis" },
              legend: { data: ["采购", "头程", "其他成本"] },
              grid: { left: 55, right: 15, top: 50, bottom: 45 },
              xAxis: { type: "category", data: ["本期", "环比期", "同比期"] },
              yAxis: { type: "value", name: "人民币万元" },
              series: [
                ["purchase", "采购"],
                ["freight", "头程"],
                ["other_cost", "其他成本"],
              ].map(([key, name]) => ({
                name,
                type: "bar",
                data: [
                  data.summary.current,
                  data.summary.previous,
                  data.summary.year_ago,
                ].map((values) =>
                  values[key] === null ? null : Number(values[key]) / 10000,
                ),
              })),
            }}
          />
        </Card>
        <Card title="款式退款率 TOP10" size="small">
          <Table<MetricRow>
            rowKey="key"
            size="small"
            dataSource={refunds}
            pagination={false}
            scroll={{ x: 320 }}
            columns={[
              { title: "款式", render: (_, row) => row.dimensions.style },
              { title: "站点", render: (_, row) => row.dimensions.site },
              {
                title: "退款率",
                align: "right",
                render: (_, row) => percent(row.current.refund_rate),
              },
            ]}
          />
        </Card>
      </div>
      {costs && <CostDiagnostics data={costs} />}
      <h2 className="section-heading">三、款式盈利与成本明细</h2>
      <ProductDetails rows={rows} />
    </>
  );
}
