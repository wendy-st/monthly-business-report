import { Card, Input, Select } from "antd";
import type { HistoryView } from "./contracts";
import { historyAmount } from "./history-presentation";
import { businessTone } from "./business-presentation";
import { percent } from "./presentation";

const columns = [
  ["site", "站点", "text"],
  ["listing", "LISTING", "text"],
  ["position", "定位", "text"],
  ["month", "最佳月", "text"],
  ["revenue", "最佳月销售额", "amount"],
  ["profit", "最佳月净利润", "amount"],
  ["margin", "最佳月净利率", "rate"],
  ["current_revenue", "本月销售额", "amount"],
  ["current_profit", "本月净利润", "amount"],
  ["current_margin", "本月净利率", "rate"],
  ["revenue_difference", "销售额差值（本月-最佳月）", "difference"],
  ["profit_difference", "净利润差值（本月-最佳月）", "difference"],
] as const;
const sortOptions = [
  { value: "gap_desc", label: "按净利润差距降序" },
  { value: "current_profit_asc", label: "按本月净利润升序" },
  { value: "peak_profit_desc", label: "按历史峰值净利润降序" },
  { value: "listing_asc", label: "按LISTING排序" },
];

export function HistoryPeaks({
  data,
  search,
  sort,
  setSearch,
  setSort,
}: {
  data: HistoryView;
  search: string;
  sort: string;
  setSearch: (value: string) => void;
  setSort: (value: string) => void;
}) {
  const rows = data.best_months
    .filter((row) =>
      [
        row.dimensions.site,
        row.dimensions.listing,
        row.dimensions.position,
      ].some((value) =>
        value?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    )
    .sort((a, b) => {
      if (sort === "listing_asc")
        return a.dimensions.listing.localeCompare(b.dimensions.listing);
      const key =
        sort === "current_profit_asc"
          ? "current_profit"
          : sort === "peak_profit_desc"
            ? "profit"
            : "gap";
      if (a.current[key] == null || b.current[key] == null)
        return Number(a.current[key] == null) - Number(b.current[key] == null);
      return (
        (Number(a.current[key]) - Number(b.current[key])) *
        (sort === "current_profit_asc" ? 1 : -1)
      );
    });
  const inactive = data.excluded.filter((row) =>
    row.dimensions.excluded_reason.includes("销售"),
  );
  return (
    <Card
      size="small"

      className="history-peak-section"
    >
      <div className="history-peak-toolbar">
        <h3>
          逐LISTING历史最佳月与{data.period_end.slice(0, 4)}年
          {Number(data.period_end.slice(5))}月对比
        </h3>
        <label>
          搜索
          <Input
            type="search"
            aria-label="历史最佳月搜索"
            placeholder="搜索站点/LISTING/定位"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          排序
          <Select
            aria-label="历史最佳月排序"
            value={sort}
            onChange={setSort}
            options={sortOptions}
          />
        </label>
      </div>
      <p className="history-source-note">
        显示 {rows.length}{" "}
        个有效LISTING-站点组合。最佳月为该站点下净利润最高的单月，净利润相同时取销售额更高的月份；对比月为{" "}
        {data.period_end}。已排除本年无销售 {inactive.length} 个、停运/废弃{" "}
        {data.excluded.length - inactive.length} 个组合。
      </p>
      <div
        className="report-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="历史最佳月对比"
      >
        <table className="report-table history-peak-table">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {columns.map(([key, , kind]) => (
                  <td
                    key={key}
                    className={
                      kind === "difference"
                        ? businessTone(row.current[key])
                        : ""
                    }
                  >
                    {kind === "text"
                      ? row.dimensions[key] || "—"
                      : kind === "rate"
                        ? percent(row.current[key])
                        : historyAmount(
                            row.current[key],
                            kind === "difference",
                          )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="history-empty">
            当前筛选下无有效LISTING峰值数据，可清除搜索或调整站点/LISTING。
          </p>
        )}
      </div>
      <details className="history-excluded">
        <summary>最佳月排除清单（{data.excluded.length}项）</summary>
        <div
          className="report-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="最佳月排除清单"
        >
          <table className="report-table">
            <thead>
              <tr>
                <th>站点 / LISTING</th>
                <th>定位</th>
                <th>排除原因</th>
              </tr>
            </thead>
            <tbody>
              {data.excluded.map((row) => (
                <tr key={row.key}>
                  <td>
                    {row.dimensions.site}/{row.dimensions.listing}
                  </td>
                  <td>{row.dimensions.position || "—"}</td>
                  <td>{row.dimensions.excluded_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="history-source-note">
        数据源：{data.source_file} / {data.source_sheet}；期间{" "}
        {data.period_start} 至 {data.period_end}
        。口径：净销售额=销售金额+退货金额，净利润=产品净利润；成本占比按源表子项汇总后计算。缺失及无记录显示“—”。
      </p>
    </Card>
  );
}
