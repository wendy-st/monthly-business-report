import type { EChartsCoreOption } from "echarts/core";
import type { Step } from "./contracts";
import { reportColors } from "../../theme/seekway-antd-theme";
import { format } from "./presentation";

/** 金额来自后端；这里只将累计余额转换为悬浮柱位置，允许跨越零线。 */
export function waterfallOption(
  steps: Step[],
  comparison: string,
): EChartsCoreOption {
  const labels: Record<string, string> = {
    对比期净利润: comparison === "mom" ? "上月净利润" : "同期净利润",
    本期净利润: "当前净利润",
    头程费用: "头程运费",
    其他产品成本: "其他成本",
    FBA配送: "FBA配送成本",
    FBA质量: "FBA质量成本",
    FBA仓储: "FBA仓储成本",
    海外仓费用: "海外仓成本",
    其他站内: "FBA其他站内费用",
    营销推广: "营销推广费",
  };
  let balance = 0;
  const bases: number[] = [];
  const balances: number[] = [];
  const values = steps.map((step) => {
    const amount = Number(step.amount) / 10000;
    const start = step.kind === "total" ? 0 : balance;
    balance = step.kind === "total" ? amount : balance + amount;
    bases.push(Math.min(start, balance));
    balances.push(balance);
    const color =
      step.kind === "total"
        ? reportColors.waterfallTotal
        : amount >= 0
          ? reportColors.success
          : reportColors.chartRed;
    return {
      value: Math.abs(balance - start),
      itemStyle: { color, borderRadius: 3 },
      label: {
        color,
        formatter: `${step.kind === "change" && amount > 0 ? "+" : ""}${format(step.amount, 2, 10000)}万`,
      },
    };
  });
  const minimum = Math.min(0, ...balances);
  const maximum = Math.max(0, ...balances);
  const padding = (maximum - minimum) * 0.12 || 1;
  return {
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      formatter: (params: { dataIndex: number } | { dataIndex: number }[]) => {
        const index = Array.isArray(params)
          ? params[0].dataIndex
          : params.dataIndex;
        return `${steps[index].label}\n${format(steps[index].amount, 2, 10000)}万`;
      },
    },
    legend: {
      top: 10,
      left: 78,
      itemWidth: 10,
      itemHeight: 10,
      selectedMode: false,
      data: ["净利润", "抬高利润", "压低利润"],
    },
    grid: { left: 78, right: 32, top: 54, bottom: 76 },
    xAxis: {
      type: "category",
      data: steps.map((step) => labels[step.label] ?? step.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: reportColors.border } },
      axisLabel: {
        interval: 0,
        fontSize: 11,
        lineHeight: 14,
        color: reportColors.text,
        formatter: (name: string) =>
          name.length > 6 ? `${name.slice(0, 6)}\n${name.slice(6)}` : name,
      },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      min: minimum - padding,
      max: maximum + padding,
      interval: (maximum - minimum + padding * 2) / 4,
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(2)}万`,
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: reportColors.chartGrid } },
    },
    series: [
      {
        name: "基底",
        type: "bar",
        stack: "profit",
        stackStrategy: "all",
        data: bases,
        itemStyle: { color: "transparent" },
        silent: true,
        tooltip: { show: false },
        emphasis: { disabled: true },
      },
      {
        name: "净利润",
        type: "bar",
        stack: "profit",
        stackStrategy: "all",
        data: values,
        barMaxWidth: 62,
        itemStyle: { color: reportColors.waterfallTotal },
        label: {
          show: true,
          position: "top",
          distance: 6,
          fontSize: 11,
          fontWeight: "bold",
        },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { type: "dashed", color: reportColors.border, width: 1 },
          data: balances
            .slice(0, -1)
            .map((value, index) => [
              { coord: [index, value] },
              { coord: [index + 1, value] },
            ]),
        },
      },
      {
        name: "抬高利润",
        type: "bar",
        stack: "profit",
        data: [],
        itemStyle: { color: reportColors.success },
      },
      {
        name: "压低利润",
        type: "bar",
        stack: "profit",
        data: [],
        itemStyle: { color: reportColors.chartRed },
      },
    ],
  };
}
