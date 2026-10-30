import { Table } from "antd";
import type { BasisAnalysis } from "./contracts";
import { FormulaHelp } from "./FormulaHelp";
import { format } from "./presentation";
import { overviewAmount as amount } from "./overview-presentation";

const labels: Record<string, string> = {
  delivery: "FBA配送成本",
  quality: "FBA质量成本",
  storage: "FBA仓储成本",
  marketing: "营销推广费用",
};
function signed(
  value: string | null | undefined,
  scale: number,
  suffix: string,
  digits = 1,
) {
  return value == null
    ? "—"
    : `${Number(value) > 0 ? "+" : ""}${format(value, digits, scale)}${suffix}`;
}
function tone(value: string | null | undefined, lowerIsBetter = false) {
  if (value == null || Number(value) === 0) return "";
  return Number(value) > 0 !== lowerIsBetter
    ? "impact-positive"
    : "impact-negative";
}

/** 公司总览只列七项费用；其他经营项目单独承接剩余利润变化。 */
export function OverviewLeverage({ analysis }: { analysis: BasisAnalysis }) {
  const rows = analysis.rows.filter((row) => row.overview_expense);
  const indicators = analysis.leverage;
  const impacts = [...rows].sort(
    (a, b) =>
      Math.abs(Number(b.profit_impact)) - Math.abs(Number(a.profit_impact)),
  );
  const maxAbs = Math.max(
    1,
    ...impacts.map((row) => Math.abs(Number(row.profit_impact))),
  );
  const basis = {
    actual: "实际",
    price_adjusted: "剔价",
    price_refund_adjusted: "剔价剔退款",
  }[analysis.basis];
  const summary = [
    {
      key: "scale_impact",
      label: "收入规模利润影响",
      help: "scale_profit_effect",
    },
    {
      key: "seven_cost_impact",
      label: "7项费用合计",
      help: "seven_cost_impact",
    },
    {
      key: "other_profit_impact",
      label: "其他经营项目",
      help: "other_profit_impact",
    },
    { key: "profit_change", label: "净利润变化", help: "net_profit_delta" },
  ] as const;
  return (
    <div className="overview-leverage">
      <section aria-label="费用杠杆">
        <div className="overview-analysis-heading">
          <h3>2. 费用杠杆</h3>
          <span>{basis}口径：收入变化率 vs 各项费用变化率</span>
        </div>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 980 }}
          columns={[
            {
              title: "费用项目",
              render: (_, row) => labels[row.key] ?? row.label,
            },
            {
              title: "对比期费用",
              align: "right",
              render: (_, row) => amount(row.base),
            },
            {
              title: "本期费用",
              align: "right",
              render: (_, row) => amount(row.current),
            },
            {
              title: (
                <span>
                  费用变化率
                  <FormulaHelp
                    name="expense_change_rate"
                    label="查看费用变化率计算公式"
                  />
                </span>
              ),
              align: "right",
              render: (_, row) => signed(row.change_rate, 0.01, "%"),
            },
            {
              title: (
                <span>
                  收入变化率
                  <FormulaHelp
                    name="sales_change_rate"
                    label="查看收入变化率计算公式"
                  />
                </span>
              ),
              align: "right",
              render: () => signed(indicators.revenue_growth, 0.01, "%"),
            },
            {
              title: (
                <span>
                  费用弹性
                  <FormulaHelp
                    name="expense_elasticity"
                    label="查看费用弹性计算公式"
                  />
                </span>
              ),
              align: "right",
              render: (_, row) =>
                row.elasticity == null ? "—" : `${format(row.elasticity)}x`,
            },
            {
              title: (
                <span>
                  费用率变化
                  <FormulaHelp
                    name="expense_rate_delta"
                    label="查看费用率变化计算公式"
                  />
                </span>
              ),
              align: "right",
              render: (_, row) => (
                <span className={tone(row.delta, true)}>
                  {signed(row.delta, 0.01, "pp")}
                </span>
              ),
            },
            {
              title: "判断",
              align: "right",
              render: (_, row) => (
                <span className={tone(row.delta, true)}>
                  {row.delta === null
                    ? "—"
                    : Number(row.delta) > 0
                      ? "费用负担上升"
                      : Number(row.delta) < 0
                        ? "费用负担下降"
                        : "费用负担持平"}
                </span>
              ),
            },
          ]}
        />
      </section>
      <section aria-label="金额影响拆解">
        <div className="overview-analysis-heading">
          <h3>3. 金额影响拆解</h3>
          <span>
            {basis}口径：理论费用与实际费用差额
            <FormulaHelp
              name="profit_impact"
              label="查看金额影响拆解计算公式"
            />
          </span>
        </div>
        <div className="overview-impact-list">
          {impacts.map((row) => {
            const impact = row.profit_impact;
            const width =
              impact === null ? 0 : (Math.abs(Number(impact)) / maxAbs) * 50;
            return (
              <div
                key={row.key}
                className="overview-impact-row"
                data-expense={row.key}
              >
                <div className="overview-impact-label">
                  {labels[row.key] ?? row.label}
                  <small>
                    理论 {amount(row.theoretical_amount)} · 实际{" "}
                    {amount(row.current)}
                  </small>
                </div>
                <div className="overview-impact-track" aria-hidden="true">
                  <span
                    className={`overview-impact-bar ${tone(impact)}`}
                    style={{
                      left: `${Number(impact) >= 0 ? 50 : 50 - width}%`,
                      width: `${width}%`,
                    }}
                  />
                </div>
                <strong className={tone(impact)}>{amount(impact, true)}</strong>
              </div>
            );
          })}
        </div>
        <div className="overview-impact-summary">
          {summary.map((item) => (
            <div key={item.key} data-summary={item.key}>
              <span>
                {item.label}
                <FormulaHelp
                  name={item.help}
                  label={`查看${item.label}计算公式`}
                />
              </span>
              <strong>{amount(indicators[item.key], true)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
