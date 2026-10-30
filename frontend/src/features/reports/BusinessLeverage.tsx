import type { BasisAnalysis } from "./contracts";
import { format } from "./presentation";
import { FormulaHelp } from "./FormulaHelp";
import {
  businessAmount,
  BusinessChange,
  businessCostLabels,
  businessTone,
  businessPercent,
} from "./business-presentation";

export function BusinessLeverage({ analysis }: { analysis: BasisAnalysis }) {
  const order = Object.keys(businessCostLabels);
  const rows = [...(analysis.business_rows ?? [])].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );
  const impacts = rows
    .map((row) => ({
      ...row,
      profit_impact: analysis.leverage[`impact_${row.key}`],
    }))
    .sort(
      (a, b) =>
        Math.abs(Number(b.profit_impact)) - Math.abs(Number(a.profit_impact)),
    );
  const max = Math.max(
    1,
    ...impacts.map((row) => Math.abs(Number(row.profit_impact))),
  );
  return (
    <div className="business-leverage diagnostic-blocks">
      <section aria-label="业务组费用杠杆">
        <div className="business-analysis-heading">
          <h3>1. 费用杠杆</h3>
          <span>10项成本费用 + 1项赔偿收入</span>
        </div>
        <div
          className="report-table-scroll"
          role="region"
          aria-label="业务组费用杠杆明细"
          tabIndex={0}
        >
          <table className="report-table">
            <thead>
              <tr>
                {[
                  ["收支项目", ""],
                  ["对比期金额", ""],
                  ["本期金额", ""],
                  ["金额变化率", "business_item_change"],
                  ["收入变化率", "sales_change_rate"],
                  ["项目弹性", "expense_elasticity"],
                  ["占比变化", "expense_rate_delta"],
                  ["判断", ""],
                ].map(([label, help]) => (
                  <th key={label}>
                    {label}
                    {help && (
                      <FormulaHelp
                        name={
                          help as
                            | "business_item_change"
                            | "sales_change_rate"
                            | "expense_elasticity"
                            | "expense_rate_delta"
                        }
                        label={`查看${label}计算公式`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    {businessCostLabels[row.key] ?? row.label}
                    {row.key === "compensation" && <small>（收入项）</small>}
                  </td>
                  <td>{businessAmount(row.base)}</td>
                  <td>{businessAmount(row.current)}</td>
                  <td>{businessPercent(row.change_rate, true)}</td>
                  <td>
                    {businessPercent(analysis.leverage.revenue_growth, true)}
                  </td>
                  <td>
                    {row.elasticity == null
                      ? "—"
                      : `${format(row.elasticity)}x`}
                  </td>
                  <td>
                    <BusinessChange
                      value={row.delta}
                      lowerIsBetter={row.key !== "compensation"}
                      arrow={false}
                      unit="PP"
                    />
                  </td>
                  <td
                    className={businessTone(
                      row.delta,
                      row.key !== "compensation",
                    )}
                  >
                    {row.delta === null
                      ? row.reason
                      : Number(row.delta) === 0
                        ? "占比持平"
                        : `${row.key === "compensation" ? "收入贡献" : "费用负担"}${Number(row.delta) > 0 ? "上升" : "下降"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="业务组金额影响拆解">
        <div className="business-analysis-heading">
          <h3>2. 金额影响拆解</h3>
          <span>
            理论金额与本期金额差额
            <FormulaHelp
              name="business_profit_impact"
              label="查看业务组金额影响计算公式"
            />
          </span>
        </div>
        <div className="overview-impact-list">
          {impacts.map((row) => {
            const impact = row.profit_impact;
            const width = (Math.abs(Number(impact)) / max) * 50;
            return (
              <div
                key={row.key}
                className="overview-impact-row"
                data-expense={row.key}
              >
                <div className="overview-impact-label">
                  {businessCostLabels[row.key] ?? row.label}
                  {row.key === "compensation" ? "（收入项）" : ""}
                  <small>
                    理论{" "}
                    {businessAmount(
                      analysis.leverage[`theoretical_amount_${row.key}`],
                    )}{" "}
                    · 本期{" "}
                    {businessAmount(
                      analysis.leverage[`current_amount_${row.key}`],
                    )}
                  </small>
                </div>
                <div className="overview-impact-track" aria-hidden="true">
                  <span
                    className={`overview-impact-bar ${businessTone(impact)}`}
                    style={{
                      left: `${Number(impact) >= 0 ? 50 : 50 - width}%`,
                      width: `${width}%`,
                    }}
                  />
                </div>
                <strong className={businessTone(impact)}>
                  {businessAmount(impact, true)}
                </strong>
              </div>
            );
          })}
        </div>
        <div className="overview-impact-summary">
          {[
            ["scale_impact", "收入规模利润影响", "scale_profit_effect"],
            ["all_cost_impact", "11项收支净影响", "business_items_impact"],
            [
              "profit_change",
              "当前口径净利润变化",
              "business_net_profit_delta",
            ],
          ].map(([key, label, help]) => (
            <div key={key} data-summary={key}>
              <span>
                {label}
                <FormulaHelp
                  name={
                    help as
                      | "scale_profit_effect"
                      | "business_items_impact"
                      | "business_net_profit_delta"
                  }
                  label={`查看${label}计算公式`}
                />
              </span>
              <strong className={businessTone(analysis.leverage[key])}>
                {businessAmount(analysis.leverage[key], true)}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
