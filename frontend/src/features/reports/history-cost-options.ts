import type { EChartsCoreOption } from "echarts/core";
import type { HistoryView } from "./contracts";
import { reportColors as colors } from "../../theme/seekway-antd-theme";
import { tooltipValue } from "../../shared/report/format";
import { plot } from "./presentation";
import {
  historyAmount,
  historyYear,
  historyCosts,
} from "./history-presentation";

export function historyCostTrend(
  data: HistoryView,
  cost: keyof typeof historyCosts,
): EChartsCoreOption {
  const years = [
    ...new Set(data.cost_trends.map((row) => row.dimensions.analysis_year)),
  ].sort();
  const palette = [
    colors.historyLine,
    colors.warning,
    colors.success,
    colors.primary,
    colors.info,
    colors.danger,
    colors.chartPurple,
  ];
  return {
    color: palette,
    grid: { left: 72, right: 35, top: 55, bottom: 45 },
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      formatter: (items: { data: { name: string; value: number | null } }[]) =>
        items
          .filter((item) => item.data.value != null)
          .map(
            (item) =>
              `${item.data.name} / ${Number(item.data.value).toFixed(2)}%`,
          )
          .join("\n"),
    },
    legend: { top: 10, left: 72 },
    xAxis: {
      type: "category",
      data: data.month_order.map((month) => `${month}月`),
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(2)}%`,
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: colors.chartGrid } },
    },
    series: years.map((year) => ({
      name: historyYear(year, data),
      type: "line",
      connectNulls: false,
      symbolSize: 7,
      tooltip: { valueFormatter: tooltipValue("%") },
      data: data.month_order.map((month) => {
        const row = data.cost_trends.find(
          (item) =>
            item.dimensions.analysis_year === year &&
            Number(item.dimensions.month.slice(5)) === month,
        );
        return {
          value: plot(row?.current[`${cost}_rate`], 0.01),
          name: row
            ? `${row.dimensions.month} ${historyCosts[cost]} ${historyAmount(row.current[cost] == null ? null : String(Math.abs(Number(row.current[cost]))))}`
            : "",
        };
      }),
      label: {
        show: true,
        position: "top",
        fontSize: 10,
        formatter: (p: { value: unknown }) =>
          p.value == null ? "" : `${Number(p.value).toFixed(2)}%`,
      },
      labelLayout: { hideOverlap: true },
    })),
  };
}
