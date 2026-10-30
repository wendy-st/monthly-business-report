import { Card, Empty, Typography } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import { formatNumber } from "../../shared/report/format";
import { type Product } from "./fixtures";

import { ProductMatrix } from "./ProductMatrix";

export function ProductDiagnostics({ rows }: { rows: Product[] }) {
  const losses = rows
    .filter((row) => row.profit < 0)
    .sort((a, b) => a.profit - b.profit)
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
        <ProductMatrix rows={rows} />
        <Card title="毛利率 × 净利率诊断" size="small">
          {rows.length ? (
            <ReportChart
              summary={`当前${rows.length}条合成记录。横轴毛利率，纵轴净利率，单位%；数值见下方款式明细。`}
              option={{
                tooltip: { trigger: "item", formatter: "{b}" },
                grid: { left: 25, right: 25, top: 45, bottom: 30 },
                xAxis: {
                  type: "value",
                  name: "毛利率%",
                  nameLocation: "middle",
                  nameGap: 20,
                  min: -200,
                  max: 100,
                  axisLabel: { show: false },
                  axisTick: { show: false },
                  splitLine: { show: false },
                  axisLine: {
                    onZero: true,
                    lineStyle: { type: "dashed", color: "#cbd5e1" },
                  },
                },
                yAxis: {
                  type: "value",
                  name: "净利率",
                  min: -100,
                  max: 100,
                  axisLabel: { show: false },
                  axisTick: { show: false },
                  splitLine: { show: false },
                  axisLine: {
                    show: true,
                    onZero: true,
                    lineStyle: { type: "dashed", color: "#cbd5e1" },
                  },
                },
                legend: { top: 0, data: ["盈利", "亏损"] },
                series: ["盈利", "亏损"].map((name) => ({
                  name,
                  type: "scatter",
                  symbol: name === "盈利" ? "circle" : "triangle",
                  symbolSize: 12,
                  data: rows
                    .filter((row) =>
                      name === "盈利" ? row.profit >= 0 : row.profit < 0,
                    )
                    .map((row) => ({
                      name: `${row.group} / ${row.style}`,
                      value: [
                        row.gross,
                        Number(((row.profit / row.revenue) * 100).toFixed(2)),
                      ],
                    })),
                })),
              }}
            />
          ) : (
            <Empty description="筛选无结果" />
          )}
        </Card>
        <Card title="亏损款式 TOP10" size="small">
          {losses.length ? (
            <ol className="ranking-list">
              {losses.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong title={row.style}>{row.style}</strong>
                    <br />
                    <Typography.Text type="secondary">
                      {row.group} · {row.site}/{row.listing}
                    </Typography.Text>
                  </div>
                  <span className="loss-track">
                    <i
                      style={{
                        width: `${Math.abs(row.profit / losses[0].profit) * 100}%`,
                      }}
                    />
                  </span>
                  <Typography.Text type="danger">
                    {formatNumber(row.profit / 10000)}万元
                  </Typography.Text>
                </li>
              ))}
            </ol>
          ) : (
            <Empty description="当前筛选没有亏损款式" />
          )}
        </Card>
      </div>
    </>
  );
}
