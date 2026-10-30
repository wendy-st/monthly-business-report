import { reportColors } from "../../theme/seekway-antd-theme";
import type { EChartsCoreOption } from "echarts/core";

const grid = { left: 76, right: 76, top: 52, bottom: 56 };

export function trendOption(
  periods: string[],
  revenue: (number | null)[],
  profit: (number | null)[],
  margin: (number | null)[],
  readableLabels = false,
): EChartsCoreOption {
  const rates = margin.map((value) =>
    value === null ? null : Number(value.toFixed(2)),
  );
  const availableRates = rates.filter(
    (value): value is number => value !== null,
  );
  return {
    tooltip: { trigger: "axis" },
    color: [reportColors.primary, reportColors.info, reportColors.warning],
    legend: {
      top: 10,
      left: 76,
      itemWidth: 10,
      itemHeight: 10,
      data: ["净销售额", "净利润", "净利率"],
    },
    grid,
    xAxis: { type: "category", data: periods },
    yAxis: [
      {
        type: "value",
        axisLabel: { formatter: "{value}万", fontSize: 11 },
        splitNumber: 4,
        splitLine: { lineStyle: { color: reportColors.chartGrid } },
      },
      {
        type: "value",
        min: availableRates.length ? Math.min(...availableRates) : undefined,
        max: availableRates.length ? Math.max(...availableRates) : undefined,
        axisLabel: {
          formatter: (value: number) => `${value.toFixed(2)}%`,
          fontSize: 11,
        },
        splitNumber: 4,
        interval:
          readableLabels &&
          Math.max(...availableRates) > Math.min(...availableRates)
            ? (Math.max(...availableRates) - Math.min(...availableRates)) / 3
            : undefined,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "净销售额",
        type: "bar",
        data: revenue,
        barMaxWidth: 34,
        barGap: "0%",
        label: {
          show: true,
          position: "top",
          formatter: (params: { value?: unknown }) =>
            `${Number(params.value).toFixed(2)}万`,
          color: reportColors.primary,
          fontSize: 11,
        },
      },
      {
        name: "净利润",
        type: "bar",
        data: profit,
        barMaxWidth: 34,
        barGap: "0%",
        label: {
          show: true,
          // 短利润柱紧贴收入柱，标签移至右上方，避免文字落入蓝色柱体。
          position: readableLabels ? ["100%", "0%"] : "top",
          align: readableLabels ? "left" : "center",
          verticalAlign: "bottom",
          offset: readableLabels ? [6, -4] : undefined,
          formatter: (params: { value?: unknown }) =>
            `${Number(params.value).toFixed(2)}万`,
          color: reportColors.info,
          fontSize: 11,
        },
      },
      {
        name: "净利率",
        type: "line",
        yAxisIndex: 1,
        data: rates.map((value) => ({
          value,
          label:
            readableLabels && value === Math.min(...availableRates)
              ? { position: "top", offset: [0, -30] }
              : undefined,
        })),
        symbol: "circle",
        symbolSize: 7,
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          fontSize: 11,
          color: reportColors.warning,
        },
      },
    ],
  };
}

export function donutOption(
  names: string[],
  values: number[],
  unit = "%",
  totalLabel = "",
  salesTotal?: number,
): EChartsCoreOption {
  const share = (value: number) =>
    salesTotal !== undefined && salesTotal > 0
      ? `${((value / salesTotal) * 100).toFixed(2)}%`
      : "—";
  return {
    tooltip: {
      trigger: "item",
      formatter:
        salesTotal === undefined
          ? undefined
          : (params: { name?: string; value?: unknown }) =>
              `${params.name}\n${share(Number(params.value))} / ${(Number(params.value) / 10000).toFixed(2)}万`,
      renderMode: "richText",
      valueFormatter: (value: unknown) =>
        `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${unit}`,
    },
    color: [
      reportColors.primary,
      reportColors.info,
      reportColors.warning,
      reportColors.chartPurple,
      reportColors.chartRed,
    ],
    legend: {
      orient: "vertical",
      right: 0,
      top: "14%",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        fontSize: 11,
        lineHeight: salesTotal === undefined ? 12 : 17,
      },
      data: names,
      formatter: (name: string) => {
        const value = values[names.indexOf(name)];
        const amount =
          unit === "元"
            ? `${(value / 10000).toFixed(2)}万`
            : `${value.toFixed(2)}${unit}`;
        return `${name}\n${salesTotal === undefined ? amount : `${share(value)} / ${amount}`}`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["28%", "62%"],
        center: salesTotal === undefined ? ["43%", "46%"] : ["34%", "48%"],
        label: {
          show: false,
          position: "center",
          rich: {
            title: {
              fontSize: 13,
              fontWeight: "bold",
              color: reportColors.text,
              lineHeight: 22,
            },
            amount: {
              fontSize: 12,
              color: reportColors.textSecondary,
              lineHeight: 20,
            },
          },
        },
        itemStyle: { borderWidth: 2, borderColor: reportColors.container },
        data: names.map((name, index) => ({
          name,
          value: values[index],
          label: {
            show: index === 0,
            formatter: `{title|销售额}\n{amount|${totalLabel}}`,
          },
        })),
      },
    ],
  };
}

export function barsOption(
  names: string[],
  values: number[],
  unit: string,
  seriesName: string,
): EChartsCoreOption {
  return {
    tooltip: { trigger: "axis" },
    legend: { data: [seriesName] },
    grid,
    xAxis: { type: "category", data: names },
    yAxis: { type: "value", name: unit },
    series: [{ name: seriesName, type: "bar", data: values, barMaxWidth: 40 }],
  };
}
