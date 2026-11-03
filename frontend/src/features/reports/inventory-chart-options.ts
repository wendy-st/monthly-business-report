import { BASELINE_MONTH } from "./report-month";
import type { EChartsCoreOption } from "echarts/core";
import type { FutureRow, InventoryRow } from "./contracts";
import { tooltipValue } from "../../shared/report/format";
import { inventoryColors, reportColors } from "../../theme/seekway-antd-theme";

const value = (raw: string | null | undefined) =>
  raw == null ? null : Number(raw);

export function turnoverOption(
  rows: InventoryRow[],
  field: string,
  sharedMax: number,
  currentYear = BASELINE_MONTH.slice(0, 4),
): EChartsCoreOption {
  const previousYear = String(Number(currentYear) - 1);
  const series = [
    {
      year: previousYear,
      scope: "所有仓库",
      color: inventoryColors.priorTotal,
    },
    {
      year: previousYear,
      scope: "FBA+海外仓",
      color: inventoryColors.priorFba,
    },
    {
      year: currentYear,
      scope: "所有仓库",
      color: inventoryColors.currentTotal,
    },
    {
      year: currentYear,
      scope: "FBA+海外仓",
      color: inventoryColors.currentFba,
    },
  ];
  return {
    tooltip: { trigger: "axis", valueFormatter: tooltipValue("天") },
    // 原报告：当年在第一行、上年在第二行，图例与绘图区左边界对齐。
    legend: [series[2], series[3], series[0], series[1]].map(
      ({ year, scope, color }, index) => ({
        top: 12 + Math.floor(index / 2) * 22,
        left: 67 + (index % 2) * 190,
        itemWidth: 24,
        itemHeight: 8,
        lineStyle: {
          color,
          width: year === previousYear ? 2.4 : 3.2,
          type: year === previousYear ? [9, 7] : "solid",
        },
        textStyle: { color: inventoryColors.legend, fontSize: 12 },
        data: [`${year} ${scope}`],
      }),
    ),
    grid: { left: 72, right: 34, top: 78, bottom: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: reportColors.textSecondary,
        fontSize: 11,
        margin: 22,
      },
      data: Array.from({ length: 12 }, (_, index) => `${index + 1}月`),
    },
    yAxis: {
      type: "value",
      min: 0,
      max: sharedMax,
      interval: sharedMax / 4,
      axisLabel: {
        color: reportColors.textSecondary,
        fontSize: 11,
        margin: 10,
        formatter: (amount: number) => `${amount.toFixed(1)}天`,
      },
      splitLine: { lineStyle: { color: inventoryColors.grid } },
    },
    series: series.map(({ year, scope, color }) => ({
      name: `${year} ${scope}`,
      type: "line",
      symbol: "circle",
      symbolSize: year === previousYear ? 6 : 8,
      showAllSymbol: true,
      connectNulls: true,
      itemStyle: { color },
      lineStyle: {
        color,
        width: year === previousYear ? 2.4 : 3.2,
        type: year === previousYear ? [9, 7] : "solid",
        cap: "round",
        join: "round",
      },
      label: {
        show: year === currentYear,
        position: scope === "所有仓库" ? "top" : "bottom",
        distance: scope === "所有仓库" ? 5 : 3,
        fontSize: 10,
        color,
        formatter: (params: { value: unknown }) =>
          params.value == null ? "" : `${Number(params.value).toFixed(1)}天`,
      },
      data: Array.from({ length: 12 }, (_, index) =>
        value(
          rows.find(
            (row) =>
              row.dimensions.scope === scope &&
              row.dimensions.month ===
                `${year}-${String(index + 1).padStart(2, "0")}`,
          )?.values[field],
        ),
      ),
    })),
  };
}

export function holdingOption(
  rows: FutureRow[],
  scope: string,
  color: string,
): EChartsCoreOption {
  const selected = rows.filter((row) => row.scope === scope);
  const base = selected.filter((row) => row.scenario === "基础");
  const find = (month: string, scenario: string) =>
    value(
      selected.find((row) => row.month === month && row.scenario === scenario)
        ?.support_days,
    );
  return {
    color: [color, color, color, color],
    tooltip: { trigger: "axis", valueFormatter: tooltipValue("天") },
    grid: { left: 45, right: 28, top: 25, bottom: 30 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: base.map((row) => row.month),
    },
    yAxis: { type: "value", name: "天", min: 0, max: 35 },
    series: [
      {
        name: "较早耗尽（需求+15%）",
        type: "line",
        step: "middle",
        symbol: "none",
        stack: "需求区间",
        areaStyle: { opacity: 0 },
        lineStyle: { type: "dashed", opacity: 0.5 },
        data: base.map((row) => find(row.month, "需求+15%")),
      },
      {
        name: "需求误差区间",
        type: "line",
        step: "middle",
        symbol: "none",
        stack: "需求区间",
        silent: true,
        tooltip: { show: false },
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0.15 },
        data: base.map((row) => {
          const low = find(row.month, "需求+15%");
          const high = find(row.month, "需求-15%");
          return low === null || high === null ? null : high - low;
        }),
      },
      {
        name: "较晚耗尽（需求-15%）",
        type: "line",
        step: "middle",
        symbol: "none",
        lineStyle: { type: "dashed", opacity: 0.5 },
        data: base.map((row) => find(row.month, "需求-15%")),
      },
      {
        name: "基准可覆盖天数",
        type: "line",
        step: "middle",
        symbol: "circle",
        areaStyle: { opacity: 0.24 },
        label: {
          show: true,
          position: "top",
          formatter: (params: { value: unknown }) =>
            params.value == null ? "—" : `${Number(params.value).toFixed(1)}天`,
        },
        data: base.map((row) => value(row.support_days)),
      },
    ],
  };
}
