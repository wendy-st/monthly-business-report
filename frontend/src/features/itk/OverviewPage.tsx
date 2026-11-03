import { useEffect, useState } from "react";
import { Alert, Button, Skeleton } from "antd";
import { useReport } from "../reports/api";
import type { Metric, Options, OverviewView, Scope } from "./contracts";
import { Dates, Field } from "./Controls";
import {
  compositionColors,
  dateChange,
  exportUrl,
  format,
  metricNames,
  params,
  short,
} from "./presentation";
import { OverviewTrend } from "./Charts";
import { OverviewDetails } from "./OverviewDetails";

export function OverviewPage({
  options,
  onExport,
  active,
}: {
  options: Options;
  active: boolean;
  onExport: (kind: "overview", url?: string) => void;
}) {
  const initial: Scope = {
    start: options.start,
    end: options.end,
    site: "US",
    category: "",
    audience: "",
    brand: "",
  };
  const [scope, setScope] = useState(initial);
  const [metric, setMetric] = useState<Metric>("units");
  const [previous, setPrevious] = useState<OverviewView>();
  const [reset, setReset] = useState(0);
  const result = useReport<OverviewView>(`itk/overview?${params(scope)}`);
  useEffect(() => {
    onExport(
      "overview",
      result.data ? exportUrl("overview", result.data.scope) : undefined,
    );
    if (result.data) {
      setPrevious(result.data);
      const brand = result.data.scope.brand;
      setScope((s) => (s.brand === brand ? s : { ...s, brand }));
    }
  }, [result.data, onExport]);
  const data = result.data ?? previous;
  function change(update: Partial<Scope>) {
    setScope({ ...scope, ...update });
  }
  const ranking =
    data?.ranking
      .filter((b) => b[metric] !== null)
      .sort((a, b) => Number(b[metric]) - Number(a[metric]))
      .slice(0, 8) ?? [];
  const largest = Math.max(
    ...ranking.map((b) => Math.abs(Number(b[metric]))),
    1,
  );
  const composition =
    data?.composition
      .filter((c) => c.units !== null && Number(c.units) > 0)
      .sort((a, b) => Number(b.units) - Number(a.units)) ?? [];
  const compositionTotal = composition.reduce(
    (sum, c) => sum + Number(c.units),
    0,
  );
  return (
    <div className="itk-overview">
      <div className="itk-overview-filters">
        <Dates
          scope={scope}
          months={options.months}
          onChange={(field, value) => setScope(dateChange(scope, field, value))}
        />
        <Field
          label="站点"
          value={scope.site}
          options={options.sites}
          onChange={(site) => change({ site })}
        />
        <Field
          label="品类"
          value={scope.category}
          options={options.categories}
          empty="全部品类"
          onChange={(category) => change({ category })}
        />
        <Field
          label="人群"
          value={scope.audience}
          options={options.audiences}
          empty="全部人群"
          onChange={(audience) => change({ audience })}
        />
        <Field
          label="品牌"
          searchable
          value={data?.brands.includes(scope.brand) ? scope.brand : ""}
          options={data?.brands ?? []}
          empty="全部品牌"
          onChange={(brand) => change({ brand })}
        />
        <button
          onClick={() => {
            setScope(initial);
            setMetric("units");
            setReset((n) => n + 1);
          }}
        >
          重置筛选
        </button>
      </div>
      {result.error && (
        <Alert
          type="error"
          title={result.error}
          action={<Button onClick={result.retry}>重试</Button>}
        />
      )}
      {!data && !result.error && <Skeleton active />}
      {data && (
        <div
          aria-busy={!result.data}
          className={!result.data ? "itk-updating" : ""}
        >
          {!result.data && <p role="status">正在更新ITK数据…</p>}
          <div className="itk-scope" aria-live="polite">
            <span>
              {data.scope.site} · {data.scope.start}—{data.scope.end} ·{" "}
              {data.scope.category || "全部品类"}
            </span>
            <span>{format(data.totals.count)}条去重后源记录</span>
          </div>
          <section className="itk-stats" aria-label="大盘统计指标">
            {(["sales", "units", "returns", "rate", "asp"] as Metric[]).map(
              (m) => (
                <article key={m}>
                  <h3>{metricNames[m]}</h3>
                  <div className="itk-stat-value">
                    {format(data.totals[m], m)}
                  </div>
                  <p>
                    {m === "sales"
                      ? `${data.currency} · 原币，未换汇`
                      : m === "asp"
                        ? `${data.currency} · 总销售额 ÷ 总销量`
                        : m === "rate"
                          ? "总退货量 ÷ 总销量"
                          : `按源表${metricNames[m]}求和`}
                  </p>
                </article>
              ),
            )}
          </section>
          <div className="itk-overview-charts">
            <section className="itk-panel itk-chart-panel">
              <div className="itk-panel-head">
                <div>
                  <h3>月度趋势</h3>
                  <p>
                    {metricNames[metric]} ·{" "}
                    {metric === "sales" || metric === "asp"
                      ? data.currency
                      : metric === "rate"
                        ? "%"
                        : "件"}
                  </p>
                </div>
                <Field
                  label="趋势指标"
                  value={metric}
                  options={Object.entries(metricNames).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  onChange={(v) => setMetric(v as Metric)}
                />
              </div>
              {active && <OverviewTrend trend={data.trend} metric={metric} />}
              <div className="itk-legend">
                <span>
                  <i style={{ background: compositionColors[0] }} />
                  {metricNames[metric]}
                </span>
              </div>
            </section>
            <section className="itk-panel">
              <div className="itk-panel-head">
                <div>
                  <h3>品牌排名</h3>
                  <p>前8名 · 点击品牌查看趋势</p>
                </div>
                <span>
                  {metric === "sales" || metric === "asp"
                    ? data.currency
                    : metric === "rate"
                      ? "%"
                      : "件"}
                </span>
              </div>
              <div className="itk-ranking">
                {ranking.map((b, i) => (
                  <button
                    key={b.name}
                    onClick={() => change({ brand: b.name })}
                    title={b.name}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <span className="itk-ranking-name">
                      {b.name}
                      <i
                        style={{
                          width: `${Math.max(0, (Number(b[metric]) / largest) * 100)}%`,
                        }}
                      />
                    </span>
                    <strong>
                      {short(Number(b[metric]), metric === "rate")}
                    </strong>
                  </button>
                ))}
                {!ranking.length && (
                  <p className="itk-empty">当前筛选范围暂无可用数据</p>
                )}
              </div>
            </section>
          </div>
          <section className="itk-panel itk-composition">
            <div className="itk-panel-head">
              <h3>品类占比</h3>
              <span>按品类净销量的正合计计算</span>
            </div>
            <div className="itk-stack">
              {composition.map((c, i) => (
                <div
                  key={c.name}
                  title={`${c.name} ${((Number(c.units) / compositionTotal) * 100).toFixed(1)}%`}
                  style={{
                    width: `${(Number(c.units) / compositionTotal) * 100}%`,
                    background: compositionColors[i % compositionColors.length],
                  }}
                />
              ))}
            </div>
            <div className="itk-composition-legend">
              {composition.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => change({ category: c.name })}
                >
                  <i
                    style={{
                      background:
                        compositionColors[i % compositionColors.length],
                    }}
                  />
                  {c.name}{" "}
                  <strong>
                    {((Number(c.units) / compositionTotal) * 100).toFixed(1)}%
                  </strong>
                </button>
              ))}
              {!composition.length && <p>暂无正销量数据</p>}
            </div>
          </section>
          <OverviewDetails key={reset} data={data} />
        </div>
      )}
    </div>
  );
}
