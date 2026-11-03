/** 仅负责展示格式，金额口径与精度由正式接口确定。 */
export function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 单位和绘图缩放由图表显式传入；只格式化提示文字，不改动原始数据。 */
export function tooltipValue(unit: string, scale = 1, digits = 2) {
  return (value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number)
      ? `${formatNumber(number / scale, digits)}${unit}`
      : "—";
  };
}
