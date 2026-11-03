import { useReportMonth, comparedMonth } from "./report-month";
import { useState } from "react";
import { Card, Select } from "antd";
import type { BusinessRow } from "./business-contracts";
import { format } from "./presentation";
import { businessPercent, compareBusinessSites } from "./business-presentation";

function ReturnTrend({ row }: { row: BusinessRow }) {
  return ["mom", "yoy"].map((mode, index) => {
    const value = row.deltas[`return_rate_${mode}`];
    const delta = value == null ? null : Number(value);
    const flat =
      delta !== null && Number((Math.abs(delta) * 100).toFixed(1)) === 0;
    return (
      <span
        key={mode}
        className={
          delta === null
            ? "business-missing"
            : flat
              ? ""
              : delta < 0
                ? "impact-positive"
                : "impact-negative"
        }
      >
        {index ? "；同比" : "环比"}
        {delta === null
          ? "不适用"
          : flat
            ? "基本持平"
            : `${delta > 0 ? "上升" : "下降"} ${format(String(Math.abs(delta)), 1, 0.01)}PP`}
      </span>
    );
  });
}

export function BusinessPriceMatrix({ rows }: { rows: BusinessRow[] }) {
  const { month } = useReportMonth();
  const periods = [
    ["year_ago", comparedMonth(month, -12)],
    ["previous", comparedMonth(month, -1)],
    ["current", "本月"],
  ] as const;
  const [sort, setSort] = useState("return");
  const ordered = [...rows].sort((a, b) => {
    const key = sort === "return" ? "return_rate" : "revenue";
    const value = (row: BusinessRow) =>
      row.current[key] == null ? -Infinity : Number(row.current[key]);
    return (
      compareBusinessSites(a.dimensions.site, b.dimensions.site) ||
      value(b) - value(a) ||
      Number(b.current.revenue) - Number(a.current.revenue)
    );
  });
  const sites = [...new Set(ordered.map((row) => row.dimensions.site))];
  return (
    <Card
      className="business-price-panel"
      title="LISTING 平均售价与退货率对照"
      size="small"
      extra={
        <Select
          aria-label="对照表排序"
          value={sort}
          onChange={setSort}
          options={[
            { value: "return", label: "按本月退货率降序" },
            { value: "sales", label: "按销售额降序" },
          ]}
        />
      }
    >
      <div
        className="business-matrix-scroll"
        role="region"
        aria-label="LISTING 平均售价与退货率对照"
        tabIndex={0}
      >
        <table className="business-matrix">
          <thead>
            <tr>
              <th rowSpan={2}>站点 / LISTING</th>
              <th colSpan={3}>月平均售价（原币）</th>
              <th colSpan={3} className="return-divider">
                退货率
              </th>
              <th rowSpan={2} className="trend-divider">
                退货率趋势（环比 / 同比）
              </th>
            </tr>
            <tr>
              {periods.map(([key, label]) => (
                <th
                  key={key}
                  className={key === "current" ? "current-price" : ""}
                >
                  {label}
                </th>
              ))}
              {periods.map(([key, label], index) => (
                <th
                  key={key}
                  className={
                    index === 0
                      ? "return-divider"
                      : key === "current"
                        ? "current-return"
                        : ""
                  }
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.flatMap((site) => {
              const siteRows = ordered.filter(
                (row) => row.dimensions.site === site,
              );
              return [
                <tr className="business-matrix-site" key={site}>
                  <td colSpan={7}>
                    {site} 站点 · {siteRows[0].currency}
                  </td>
                  <td>{siteRows.length} 个LISTING</td>
                </tr>,
                ...siteRows.map((row) => (
                  <tr key={row.key}>
                    <td className="business-matrix-listing">
                      {site}/{row.dimensions.listing}
                    </td>
                    {periods.map(([key]) => (
                      <td
                        key={key}
                        className={`${key === "current" ? "current-price" : ""} ${row.prices[key] == null ? "business-missing" : ""}`}
                      >
                        {format(row.prices[key])}
                      </td>
                    ))}
                    {periods.map(([key], index) => (
                      <td
                        key={key}
                        className={`${index === 0 ? "return-divider" : key === "current" ? "current-return" : ""} ${row[key].return_rate == null ? "business-missing" : ""}`}
                      >
                        {businessPercent(row[key].return_rate)}
                      </td>
                    ))}
                    <td className="business-return-trend trend-divider">
                      <ReturnTrend row={row} />
                    </td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="business-empty">当前范围无匹配LISTING</p>
        )}
      </div>
      <p className="business-calculation-note">
        核算逻辑：原币毛销售额 = 销售金额 ÷ 当月站点汇率；月平均售价 =
        原币毛销售额 ÷ 毛销量。按站点 + LISTING +
        币种计算，不含退货退款影响。退货率趋势：环比变化 = 本月退货率 -
        上月退货率，同比变化 = 本月退货率 -
        去年同期退货率；下降表示改善，上升表示需关注。
      </p>
    </Card>
  );
}
