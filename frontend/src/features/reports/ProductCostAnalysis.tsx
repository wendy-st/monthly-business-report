import { Card, Segmented } from "antd";
import type { ProductAnalysis } from "./product-contracts";
import { format, percent } from "./presentation";

const costs = [
  ["purchase", "销售成本"],
  ["freight", "头程费用"],
  ["other_cost", "其他成本"],
];
const periods = [
  ["year_ago", "去年同期"],
  ["previous", "上月"],
  ["current", "本月"],
];

function points(value: string | null | undefined) {
  return value == null
    ? "—"
    : `${Number(value) >= 0 ? "+" : ""}${format(value, 2, 0.01)}pp`;
}

export function ProductCostRates({
  data,
  comparison,
  onChange,
}: {
  data: ProductAnalysis;
  comparison: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card title="三项成本率对比" size="small">
      <Segmented
        aria-label="成本比较期间"
        size="small"
        value={comparison}
        onChange={onChange}
        options={[
          { label: "环比", value: "mom" },
          { label: "同比", value: "yoy" },
        ]}
      />
      {data.scope_available ? (
        costs.map(([key, label]) => {
          const values = data.rates[comparison]?.[key];
          return (
            <section className="product-cost-block" key={key}>
              <strong>{label}</strong>
              <div className="product-cost-line">
                <span>{comparison === "mom" ? "上月" : "去年同期"}</span>
                <span>{percent(values?.base)}</span>
              </div>
              <div className="product-cost-line">
                <span>本月</span>
                <span>{percent(values?.current)}</span>
              </div>
              <div className="product-rate-bridge">
                {[
                  ["actual", "实际变化"],
                  ["standardization", "标准化差额"],
                  ["adjusted", "剔价变化"],
                  ["refund", "退款影响"],
                  ["restored", "剔价剔退款变化"],
                ].map(([field, title]) => (
                  <div className="product-cost-line" key={field}>
                    <span>{title}</span>
                    <strong title={values?.reason ?? ""}>
                      {points(values?.[field])}
                    </strong>
                  </div>
                ))}
              </div>
              {values?.reason && <p className="sample-note">{values.reason}</p>}
            </section>
          );
        })
      ) : (
        <p>{data.scope_note}</p>
      )}
      <p className="sample-note">
        实际＝标准化差额＋剔价变化；剔价＝退款影响＋剔价剔退款变化。按同站点、LISTING标准售价还原后汇总金额，再计算成本率；—不能视为零变化。
      </p>
    </Card>
  );
}

export function ProductCostTrends({ data }: { data: ProductAnalysis }) {
  return (
    <Card title="三项成本同屏对照" size="small">
      {data.scope_available ? (
        <>
          <p className="sample-note">
            {data.style_count}个本期款式 · 三期同时展示，各项独立刻度
          </p>
          {costs.map(([key, label]) => {
            const values = data.trends[key];
            const unit = key === "other_cost" ? "元" : "元/件";
            const digits = key === "other_cost" ? 2 : 4;
            const numbers = periods.flatMap(([field]) =>
              values[field] == null ? [] : [Number(values[field])],
            );
            const min = Math.min(0, ...numbers),
              max = Math.max(0, ...numbers),
              span = max - min || 1;
            const position = (value: number) => ((value - min) / span) * 100;
            const zero = position(0);
            return (
              <section className="product-cost-block" key={key}>
                <strong>
                  {label}
                  <small className="sample-note">
                    {" "}
                    ·{" "}
                    {key === "other_cost"
                      ? "实际金额（元）"
                      : "账面平均单位成本（元/件）"}
                  </small>
                </strong>
                {periods.map(([field, title]) => {
                  const value = values[field],
                    end = value == null ? zero : position(Number(value));
                  return (
                    <div className="product-trend-row" key={field}>
                      <span>{title}</span>
                      <span
                        className={`product-trend-track period-${field}`}
                        aria-hidden="true"
                      >
                        <em style={{ left: `${zero}%` }} />
                        {value != null && (
                          <i
                            style={{
                              left: `${Math.min(zero, end)}%`,
                              width: `${Math.max(0.4, Math.abs(end - zero))}%`,
                            }}
                          />
                        )}
                      </span>
                      <strong>
                        {value == null
                          ? values[field + "_reason"]
                          : format(value, digits)}
                      </strong>
                    </div>
                  );
                })}
                <div className="product-trend-changes">
                  {[
                    ["mom", "环比"],
                    ["yoy", "同比"],
                  ].map(([field, title]) => (
                    <div key={field}>
                      <span>{title} </span>
                      <strong>
                        {values[field + "_delta"] == null
                          ? "不可比"
                          : `${Number(values[field + "_delta"]) >= 0 ? "+" : ""}${format(values[field + "_delta"], digits)}${unit}`}
                      </strong>
                      <small>
                        {values[field + "_change"] == null
                          ? "增幅不适用"
                          : percent(values[field + "_change"])}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <p className="sample-note">
            销售成本、头程＝该期净成本÷净销量；其他成本直接比较金额。无记录与分母不可比单独注明。
          </p>
        </>
      ) : (
        <p>{data.scope_note}</p>
      )}
    </Card>
  );
}

export function ProductCostConclusion({
  data,
  comparison,
}: {
  data: ProductAnalysis;
  comparison: string;
}) {
  return (
    <aside className="product-cost-conclusion" aria-label="成本分析结论">
      <strong>
        成本分析结论 · {comparison === "mom" ? "环比" : "同比"} ·{" "}
        {data.style_count}个款式
      </strong>
      {data.scope_available ? (
        <>
          {data.comparisons[comparison]?.conclusion.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="sample-note">
            数量与单位成本影响按逐款账面净成本、净销量计算后相加；退款成本冲回已含在实际净成本中，退款扣减收入不重复并入成本增量。单位成本趋势与实际成本归因采用同一账面口径，剔价剔退款变化见左侧成本率对比。单位成本变化不直接等于采购价或运价上涨，也不直接认定为可避免损失。
          </p>
        </>
      ) : (
        <p>{data.scope_note}</p>
      )}
    </aside>
  );
}
