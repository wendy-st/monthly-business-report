import { Card, Empty } from "antd";
import type { BusinessView } from "./business-contracts";
import { ReportChart } from "../../shared/report/ReportChart";
import { donutOption, trendOption } from "../../shared/report/chart-options";
import { format, plot } from "./presentation";

export function BusinessCharts({ data }: { data: BusinessView }) {
  const rows = data.business.categories;
  const series = data.series;
  return (
    <div className="overview-chart-grid business-charts">
      <Card title="核心指标趋势" size="small">
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
                  `${row.label}：销售额${format(row.current.revenue, 2, 10000)}万元，净利润${format(row.current.profit, 2, 10000)}万元。`,
              )
              .join(" ") + "来源：经营底表；三期比较。"
          }
        />
      </Card>
      <Card title="三级品类销售额占比" size="small">
        {rows.length ? (
          <ReportChart
            sample={false}
            option={donutOption(
              rows.map((row) => row.label),
              rows.map((row) => Number(row.current.revenue)),
              "元",
              `${format(data.business.category_total, 2, 10000)}万`,
              Number(data.business.category_total),
            )}
            summary={
              rows
                .map(
                  (row) =>
                    `${row.label}：${format(row.current.revenue, 2, 10000)}万元`,
                )
                .join("；") + "。来源：经营底表；按正销售额降序取前8项。"
            }
          />
        ) : (
          <Empty description="当前范围无正销售额品类" />
        )}
      </Card>
    </div>
  );
}
