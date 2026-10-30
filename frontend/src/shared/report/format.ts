/** 仅负责展示格式，金额口径与精度由正式接口确定。 */
export function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
