import type {
  Benchmark,
  BrandSummary,
  ComparisonView,
  Metric,
} from "./contracts";
import { exportUrl, format, points } from "./presentation";
import { ComparisonCharts } from "./Charts";

function PeakCard({
  title,
  peak,
  metric,
  currency,
}: {
  title: string;
  peak: Benchmark | null;
  metric: Metric;
  currency: string;
}) {
  return (
    <article className="itk-benchmark">
      <h3>{title}</h3>
      <div className="itk-benchmark-value">
        {format(peak?.value, metric)}{" "}
        <small>{metric === "sales" ? currency : "件"}</small>
      </div>
      <p>{peak ? `${peak.brand} · ${peak.month}` : "暂无有效正值样本"}</p>
      <div className="itk-benchmark-target">
        {peak?.target == null ? (
          "目标品牌同期无记录"
        ) : (
          <>
            目标同月：{format(peak.target, metric)}
            <br />
            与峰值差距：{format(peak.gap, metric)}
          </>
        )}
      </div>
    </article>
  );
}
function Rank({
  item,
  metric,
}: {
  item: BrandSummary;
  metric: "sales" | "units";
}) {
  const rank = item[`${metric}_rank`];
  return (
    <td className="itk-rank">
      {rank === null ? "—" : `第 ${rank} / ${item[`${metric}_total`]} 名`}
    </td>
  );
}
export function ComparisonResults({ data }: { data: ComparisonView }) {
  const { scope, lowest, summaries } = data;
  return (
    <>
      <div className="itk-scope" aria-live="polite">
        <span>
          {scope.target} · {scope.site} · {scope.category} / {scope.audience} /{" "}
          {scope.kind}
        </span>
        <span>
          目标品牌有记录{summaries[0].months}/{data.months.length}个月，同类样本
          {data.pool.length}个品牌
        </span>
      </div>
      {summaries[0].months === 0 && (
        <p className="itk-warning">目标品牌在所选期间无记录。</p>
      )}
      <div className="itk-benchmarks">
        <PeakCard
          title="单月销量峰值"
          peak={data.units_peak}
          metric="units"
          currency={data.currency}
        />
        <PeakCard
          title="单月销售额峰值"
          peak={data.sales_peak}
          metric="sales"
          currency={data.currency}
        />
        <article className="itk-benchmark">
          <h3>所选竞品中最低同期退货率</h3>
          <div className="itk-benchmark-value">
            {format(lowest?.rate, "rate")}
          </div>
          <p>
            {lowest
              ? `${lowest.brand} · ${scope.start}—${scope.end}`
              : "请勾选有有效退货率的竞品"}
          </p>
          <div className="itk-benchmark-target">
            目标期间：{format(summaries[0].rate, "rate")}
            <br />
            同期差距：{points(data.rate_gap)}
          </div>
          <small>
            {data.selected.length - 1}个竞品已选
            {lowest
              ? `；标杆销量 ${format(lowest.units)}，退货量 ${format(lowest.returns)}`
              : ""}
          </small>
        </article>
      </div>
    </>
  );
}
export function ComparisonTables({ data }: { data: ComparisonView }) {
  return (
    <>
      <ComparisonCharts data={data} />
      <p className="itk-notice">
        销量与销售额峰值、排名取全部同类样本；最低退货率仅取已选竞品的期间退货总量÷销量总量。“同期”指相同筛选期间，正差距表示目标退货率更高。
      </p>
      <section className="itk-panel itk-table-panel">
        <div className="itk-panel-head">
          <div>
            <h3>所选品牌汇总与各自峰值</h3>
            <p>
              {data.scope.start}—{data.scope.end} ·
              按实际有记录月份累计；月份覆盖不同，比较时需结合判断
            </p>
          </div>
          <a className="itk-button" href={exportUrl("comparison", data.scope)}>
            导出月度对比明细
          </a>
        </div>
        <div
          className="itk-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="品牌汇总表，可横向滚动"
        >
          <table>
            <thead>
              <tr>
                {[
                  "品牌",
                  "有记录月份",
                  "期间销量",
                  "销量同类排名",
                  `期间销售额（${data.currency}）`,
                  "销售额同类排名",
                  `平均售价（${data.currency}）`,
                  "期间退货率",
                  "自身月销量峰值",
                  "自身月销售额峰值",
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.summaries.map((s, i) => (
                <tr
                  key={s.brand}
                  className={i === 0 ? "itk-target" : undefined}
                >
                  <td title={s.brand}>
                    {s.brand}
                    {i === 0 ? "（目标）" : ""}
                  </td>
                  <td>
                    {s.months}/{data.months.length}
                  </td>
                  <td>{format(s.units)}</td>
                  <Rank item={s} metric="units" />
                  <td>{format(s.sales, "sales")}</td>
                  <Rank item={s} metric="sales" />
                  <td>{format(s.asp, "asp")}</td>
                  <td>{format(s.rate, "rate")}</td>
                  <td>
                    {format(s.units_peak?.units)}
                    <small>{s.units_peak?.name}</small>
                  </td>
                  <td>
                    {format(s.sales_peak?.sales, "sales")}
                    <small>{s.sales_peak?.name}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="itk-table-footer">
          排名以全部同类样本期间累计计算，相同值并列；退货率不取各月平均。
        </p>
      </section>
    </>
  );
}
