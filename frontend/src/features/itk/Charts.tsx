import type { EChartsCoreOption } from "echarts/core";
import { ReportChart } from "../../shared/report/ReportChart";
import type { ComparisonView, Metric, NamedMetrics } from "./contracts";
import { color, format, metricNames, short } from "./presentation";

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function axes(months: string[], metric: Metric): EChartsCoreOption {
  return {
    grid: { left: 62, right: 24, top: 20, bottom: 35 },
    xAxis: {
      type: "category",
      data: months,
      boundaryGap: false,
      axisLabel: { hideOverlap: true, showMinLabel: true, showMaxLabel: true },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      min: ({ min }: { min: number }) => Math.min(0, min),
      max: ({ min, max }: { min: number; max: number }) =>
        Math.max(0, max) + (Math.max(0, max) - Math.min(0, min) || 1) * 0.13,
      axisLabel: {
        formatter: (value: number) => short(value, metric === "rate"),
      },
      splitLine: { lineStyle: { color: "#e1e8e5" } },
    },
  };
}
function chartTooltip(
  months: string[],
  series: { brand: string; points: (NamedMetrics | null)[] }[],
  metric: Metric,
  lowest?: string,
) {
  return {
    trigger: "axis",
    confine: true,
    backgroundColor: "#142f2c",
    borderWidth: 0,
    textStyle: { color: "#fff" },
    extraCssText:
      "max-width:340px;max-height:65vh;overflow:auto;white-space:normal;pointer-events:auto",
    enterable: true,
    formatter: (parameters: unknown) => {
      const list = parameters as { dataIndex: number }[];
      const index = list[0]?.dataIndex ?? 0;
      return (
        `<strong>${escape(months[index] ?? "")}</strong><br/>` +
        series
          .map(
            (item, i) =>
              `<span style="color:${color(i)}">●</span> ${escape(item.brand)}${item.brand === lowest ? "（最低竞品）" : ""}：${format(item.points[index]?.[metric], metric)}`,
          )
          .join("<br/>")
      );
    },
  };
}
export function ComparisonCharts({ data }: { data: ComparisonView }) {
  return (
    <>
      <div className="itk-legend" aria-label="对比品牌图例">
        {data.selected.map((b, i) => (
          <span key={b}>
            <i style={{ background: color(i) }} />
            {b}
            {i === 0 ? "（目标）" : ""}
          </span>
        ))}
      </div>
      <div className="itk-compare-charts">
        {(["units", "sales", "rate"] as const).map((metric) => {
          const peak =
            metric === "units"
              ? data.units_peak
              : metric === "sales"
                ? data.sales_peak
                : null;
          const lowest = metric === "rate" ? data.lowest?.brand : undefined;
          const lines = data.series.map((s, i) => ({
            name: s.brand,
            type: "line",
            data: s.points.map((p) =>
              p?.[metric] == null ? null : Number(p[metric]),
            ),
            connectNulls: false,
            showSymbol: true,
            symbol: "circle",
            symbolSize: i === 0 ? 6.4 : 4,
            itemStyle: { color: color(i), opacity: i === 0 ? 1 : 0.85 },
            lineStyle: {
              color: color(i),
              width: i === 0 ? 3 : s.brand === lowest ? 2.3 : 1.7,
              type: s.brand === lowest ? [6, 5] : "solid",
            },
            z: i === 0 ? 10 : 2,
            ...(i === 0 && peak
              ? {
                  markLine: {
                    silent: true,
                    symbol: "none",
                    label: { show: false },
                    lineStyle: { type: "dashed", color: "#8c8075" },
                    data: [{ yAxis: Number(peak.value) }],
                  },
                }
              : {}),
          }));
          const option = {
            ...axes(data.months, metric),
            tooltip: chartTooltip(data.months, data.series, metric, lowest),
            series: lines,
          };
          const note = peak
            ? `全样本单月峰值：${peak.brand} · ${peak.month} · ${format(peak.value, metric)}`
            : metric === "rate" && data.lowest
              ? `虚线：${data.lowest.brand}各月实际退货率；所选期间最低竞品退货率${format(data.lowest.rate, "rate")}`
              : metric === "rate"
                ? "勾选有效竞品后展示最低退货率竞品虚线。"
                : "暂无有效正值样本";
          const summary = data.series
            .map(
              (s) =>
                `${s.brand}：${data.months.map((m, i) => `${m} ${format(s.points[i]?.[metric], metric)}`).join("；")}`,
            )
            .join("。 ");
          const valid = data.series.some((s) =>
            s.points.some((p) => p?.[metric] != null),
          );
          return (
            <section className="itk-panel itk-chart-panel" key={metric}>
              <div className="itk-panel-head">
                <h3>月度{metricNames[metric]}对比</h3>
                <span>
                  {metric === "sales"
                    ? data.currency
                    : metric === "rate"
                      ? "%"
                      : "件"}
                </span>
              </div>
              {valid ? (
                <ReportChart option={option} summary={summary} sample={false} />
              ) : (
                <p className="itk-empty">所选期间暂无可用数据</p>
              )}
              <p className="itk-chart-note">{note}</p>
            </section>
          );
        })}
      </div>
    </>
  );
}
export function OverviewTrend({
  trend,
  metric,
}: {
  trend: NamedMetrics[];
  metric: Metric;
}) {
  if (!trend.some((p) => p[metric] !== null))
    return <p className="itk-empty">当前筛选范围暂无可用数据</p>;
  const months = trend.map((p) => p.name);
  const option: EChartsCoreOption = {
    ...axes(months, metric),
    tooltip: chartTooltip(
      months,
      [{ brand: metricNames[metric], points: trend }],
      metric,
    ),
    series: [
      {
        type: "line",
        data: trend.map((p) => (p[metric] === null ? null : Number(p[metric]))),
        connectNulls: false,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: color(0), width: 2.5 },
        itemStyle: { color: color(0) },
      },
    ],
  };
  return (
    <ReportChart
      option={option}
      sample={false}
      summary={trend
        .map((p) => `${p.name}：${format(p[metric], metric)}`)
        .join("；")}
    />
  );
}
