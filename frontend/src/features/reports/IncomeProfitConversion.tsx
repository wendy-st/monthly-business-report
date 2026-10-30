import type { BasisAnalysis } from "./contracts";
import { format, percent } from "./presentation";

const bases = [
  ["actual", "实际"],
  ["price_adjusted", "剔价"],
  ["price_refund_adjusted", "剔价剔退款"],
] as const;

function change(current: string | null, base: string | null): string {
  if (current === null || base === null || Number(base) <= 0) return "—";
  return `${((Number(current) / Number(base) - 1) * 100).toFixed(1)}%`;
}

/** 净回款始终展示实际经营口径；三种弹性分别取对应后端分析结果。 */
export function IncomeProfitConversion({
  analyses,
  activeBasis,
  changes,
}: {
  analyses: BasisAnalysis[];
  activeBasis: string;
  changes?: Record<string, Record<string, string | null>>;
}) {
  const actual = analyses.find((item) => item.basis === "actual");
  return (
    <section className="income-profit-section" aria-label="收入与利润转化">
      <div className="conversion-heading">
        <h3>1. 收入与利润转化</h3>
        <span>平台净回款额与三种口径利润弹性</span>
      </div>
      <div className="income-profit-grid">
        <div className="platform-receivable">
          <span>平台净回款额（经营口径）</span>
          <strong>
            {format(actual?.leverage.platform_receivable, 2, 10000)}万
          </strong>
          <small>
            净利润 {format(actual?.current.profit, 2, 10000)}万 · 回款转化率{" "}
            {percent(actual?.leverage.conversion)}
          </small>
          <small>
            销售收入扣减平台费用及营销推广费用，加回FBA赔偿；不含销售成本、头程及海外仓。不等同银行实收。
          </small>
        </div>
        {bases.map(([basis, label]) => {
          const item = analyses.find((row) => row.basis === basis);
          const elasticity = item?.leverage.profit_elasticity;
          const available = elasticity !== null && elasticity !== undefined;
          const missing = item?.rows
            .filter((row) => row.current === null || row.base === null)
            .map((row) => row.label);
          const reason = missing?.length
            ? `${missing.join("、")}金额不完整，无法计算该口径利润弹性。`
            : "两期收入、利润须为正，且收入变化绝对值至少1%；缺失时不可计算。";
          return (
            <div
              key={basis}
              className={`elasticity-item ${activeBasis === basis ? "active" : ""}`}
              data-basis={basis}
            >
              <span>{label}利润弹性</span>
              <strong>{available ? `${format(elasticity)}x` : "—"}</strong>
              <small>
                {item && available
                  ? `收入 ${changes ? (changes[basis]?.revenue ?? "—") : change(item.current.revenue, item.base.revenue)} · 利润 ${changes ? (changes[basis]?.profit ?? "—") : change(item.current.profit, item.base.profit)}`
                  : reason}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
