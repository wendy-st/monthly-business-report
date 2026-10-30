import { Card } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import { donutOption, trendOption } from "../../shared/report/chart-options";
import type { FinancialView } from "./contracts";
import { format, plot } from "./presentation";

export function FinancialCharts({ data }: { data: FinancialView }) {
  const rows = data.breakdowns.categories.filter(
    (row) => Number(row.current.revenue) > 0,
  );
  const series = data.series;
  return (
    <div className="overview-chart-grid">
      <Card
        title="核心指标趋势"
        size="small"
        styles={{ header: { marginBottom: 24 } }}
      >
        <ReportChart
          sample={false}
          option={trendOption(
            series.map((row) => row.label),
            series.map((row) => plot(row.current.revenue, 10000)),
            series.map((row) => plot(row.current.profit, 10000)),
            series.map((row) => plot(row.current.margin, 0.01)),
            true,
          )}
          summary={
            series
              .map(
                (row) =>
                  `${row.label}：净销售额${format(row.current.revenue, 2, 10000)}万元，净利润${format(row.current.profit, 2, 10000)}万元。`,
              )
              .join(" ") + "三期比较，非连续月趋势；来源：经营底表。"
          }
        />
      </Card>
      <Card title="一级品类销售额占比" size="small">
        <ReportChart
          sample={false}
          option={donutOption(
            rows.map((row) => row.label),
            rows.map((row) => Number(row.current.revenue)),
            "元",
            `${format(data.summary.current.revenue, 2, 10000)}万`,
            Number(data.summary.current.revenue),
          )}
          summary={
            rows
              .map((row) => {
                const total = Number(data.summary.current.revenue);
                const share =
                  total > 0
                    ? `${((Number(row.current.revenue) / total) * 100).toFixed(2)}%`
                    : "—";
                return `${row.label}：${format(row.current.revenue)}元，占比${share}`;
              })
              .join("；") + "。来源：经营底表；只绘制正收入品类。"
          }
        />
      </Card>
    </div>
  );
}
