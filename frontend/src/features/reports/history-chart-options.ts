import type { EChartsCoreOption } from "echarts/core";
import type { HistoryView, MetricRow } from "./contracts";
import { reportColors as colors } from "../../theme/seekway-antd-theme";
import { tooltipValue } from "../../shared/report/format";
import { plot } from "./presentation";
import { historyYear } from "./history-presentation";

export function historyTrend(
  rows: MetricRow[],
  data: HistoryView,
): EChartsCoreOption {
  const labels = rows.map((row) =>
    row.dimensions.year
      ? historyYear(row.dimensions.year, data)
      : row.label.replace("-Q", "Q"),
  );
  const amounts = rows.flatMap((row) =>
    ["revenue", "profit"].flatMap((key) =>
      row.current[key] == null ? [] : [Number(row.current[key]) / 10000],
    ),
  );
  const rates = rows.flatMap((row) =>
    row.current.margin == null ? [] : [Number(row.current.margin) * 100],
  );
  const amountMin = Math.min(0, ...amounts);
  const amountMax = Math.max(1, ...amounts);
  const amountRange = amountMax - amountMin;
  const rateMin = rates.length ? Math.min(...rates) : 0;
  const rateMax = rates.length ? Math.max(...rates) : 1;
  const rateRange = Math.max(1, rateMax - rateMin);
  const bottom = rows.length > 10 ? 76 : 56;
  // 与350px画布及绘图区一致，用实际比例坐标避让右侧的利润标签。
  const plotHeight = 350 - 64 - bottom;
  const amountTop = amountMax + amountRange * 0.18;
  const amountBottom = amountMin < 0 ? amountMin - amountRange * 0.12 : 0;
  const amountY = (value: number) =>
    64 + ((amountTop - value) / (amountTop - amountBottom)) * plotHeight;
  const rateTop = rateMax + rateRange * 0.15;
  const rateBottom = rateMin - rateRange * 0.15;
  const rateY = (value: number) =>
    64 + ((rateTop - value) / (rateTop - rateBottom)) * plotHeight;
  return {
    tooltip: { trigger: "axis", renderMode: "richText" },
    color: [colors.primary, colors.historyProfit, colors.historyLine],
    backgroundColor: colors.tableHead,
    grid: { left: 76, right: 76, top: 64, bottom },
    legend: { top: 10, left: 72, itemWidth: 10, itemHeight: 10 },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { rotate: rows.length > 10 ? 40 : 0, fontSize: 10 },
    },
    yAxis: [
      {
        type: "value",
        axisLabel: {
          formatter: (v: number) => `${v.toFixed(2)}万`,
          fontSize: 10,
        },
        splitNumber: 4,
        min: amountBottom,
        max: amountTop,
        splitLine: { lineStyle: { color: colors.chartGrid } },
      },
      { type: "value", show: false, min: rateBottom, max: rateTop },
    ],
    series: [
      ...["revenue", "profit"].map((key, index) => ({
        name: index ? "净利润" : "销售额",
        type: "bar",
        barMaxWidth: 27,
        barGap: "12%",
        data: rows.map((row, rowIndex) => {
          const value = plot(row.current[key], 10000);
          const previousProfit = plot(
            rows[rowIndex - 1]?.current.profit,
            10000,
          );
          let offset = 0;
          if (index === 0 && value != null && previousProfit != null) {
            const labelY = amountY(value) + (value < 0 ? 12 : -12);
            const previousY =
              amountY(previousProfit) + (previousProfit < 0 ? 12 : -12);
            if (Math.abs(labelY - previousY) < 22)
              offset = previousY - labelY - 24;
          }
          return {
            value,
            label: {
              position: Number(row.current[key]) < 0 ? "bottom" : "top",
              offset: [index ? 2 : -2, offset],
            },
          };
        }),
        tooltip: { valueFormatter: tooltipValue("万") },
        label: {
          show: true,
          position: "top",
          // 两项金额向各自柱子的外侧对齐，白色描边保持跨线时可读。
          align: index ? "left" : "right",
          offset: [index ? 2 : -2, 0],
          fontSize: 11,
          fontWeight: 800,
          textBorderColor: colors.container,
          textBorderWidth: 3,
          color: index ? colors.historyProfit : colors.primary,
          formatter: (p: { value: unknown }) =>
            p.value == null ? "" : `${Number(p.value).toFixed(2)}万`,
        },
      })),
      {
        name: "净利率",
        type: "line",
        yAxisIndex: 1,
        symbol: "circle",
        symbolSize: 7,
        data: rows.map((row) => {
          const value = plot(row.current.margin, 0.01);
          const profit = plot(row.current.profit, 10000);
          let offset = -18;
          if (value != null && profit != null) {
            const profitLabelY = amountY(profit) + (profit < 0 ? 12 : -12);
            const rateLabelY = rateY(value) - 32;
            if (Math.abs(rateLabelY - profitLabelY) < 22)
              offset -= 24 + rateLabelY - profitLabelY;
          }
          return { value, label: { offset: [8, offset] } };
        }),
        tooltip: { valueFormatter: tooltipValue("%") },
        label: {
          show: true,
          position: "top",
          align: "left",
          offset: [8, -18],
          fontSize: 10,
          fontWeight: 800,
          textBorderColor: colors.container,
          textBorderWidth: 3,
          color: colors.warning,
          formatter: (p: { value: unknown }) =>
            p.value == null ? "" : `${Number(p.value).toFixed(2)}%`,
        },
      },
    ],
  };
}

export function historyQuadrant(data: HistoryView): EChartsCoreOption {
  const points = data.listings
    .filter(
      (row) => Number(row.current.revenue) > 0 && row.current.margin != null,
    )
    .slice(0, 25);
  const maxProfit = Math.max(
    1,
    ...points.map((row) => Math.abs(Number(row.current.profit))),
  );
  const splitX = plot(data.quadrant.margin, 0.01),
    splitY = plot(data.quadrant.revenue, 10000);
  return {
    grid: { left: 75, right: 40, top: 45, bottom: 55 },
    tooltip: {
      renderMode: "richText",
      trigger: "item",
      formatter: (p: { data?: { name: string; value: number[] } }) => {
        if (!p.data) return "";
        const [margin, revenue, profit] = p.data.value;
        return `${p.data.name}\n销售额  ${revenue.toFixed(2)}万\n净利润  ${profit.toFixed(2)}万\n净利率  ${margin.toFixed(2)}%`;
      },
    },
    xAxis: {
      type: "value",
      name: "净利率",
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(2)}%`,
        fontSize: 10,
      },
    },
    yAxis: {
      type: "value",
      name: "销售额",
      min: 0,
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(2)}万`,
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: colors.chartGrid } },
    },
    graphic: [
      {
        type: "text",
        left: "15%",
        top: 15,
        style: {
          text: "高销售 / 低净利率",
          fill: colors.primary,
          fontSize: 10,
        },
      },
      {
        type: "text",
        right: 15,
        top: 15,
        style: {
          text: "高销售 / 高净利率",
          fill: colors.success,
          fontSize: 10,
        },
      },
      {
        type: "text",
        left: "15%",
        bottom: 10,
        style: { text: "低销售 / 低净利率", fill: colors.danger, fontSize: 10 },
      },
      {
        type: "text",
        right: 15,
        bottom: 10,
        style: {
          text: "低销售 / 高净利率",
          fill: colors.warning,
          fontSize: 10,
        },
      },
    ],
    series: [
      {
        type: "scatter",
        data: points.map((row) => ({
          name: `${row.dimensions.site}:${row.dimensions.listing}`,
          value: [
            plot(row.current.margin, 0.01),
            plot(row.current.revenue, 10000),
            plot(row.current.profit, 10000),
          ],
          symbolSize:
            12 +
            Math.sqrt(Math.abs(Number(row.current.profit)) / maxProfit) * 24,
          itemStyle: {
            color:
              Number(row.current.profit) < 0
                ? colors.danger
                : Number(row.current.margin) >= Number(data.quadrant.margin)
                  ? colors.success
                  : colors.primary,
            opacity: 0.68,
          },
        })),
        label: { show: true, position: "right", formatter: "{b}", fontSize: 9 },
        labelLayout: { hideOverlap: true },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: colors.textSecondary, type: "dashed" },
          data: [
            ...(splitX == null ? [] : [{ xAxis: splitX }]),
            ...(splitY == null ? [] : [{ yAxis: splitY }]),
          ],
        },
      },
    ],
  };
}
