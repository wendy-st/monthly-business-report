import { useMemo, useState } from "react";
import type { OverviewView, Metric } from "./contracts";
import {
  categoryLabel,
  details,
  exportUrl,
  format,
  type SortKey,
} from "./presentation";

const columns: {
  key: SortKey | "site" | "category" | "status";
  label: string;
  sortable?: boolean;
}[] = [
  { key: "month", label: "年月", sortable: true },
  { key: "site", label: "站点" },
  { key: "category", label: "品类 / 人群 / 类型" },
  { key: "brand", label: "品牌", sortable: true },
  { key: "sales", label: "销售额", sortable: true },
  { key: "units", label: "销量", sortable: true },
  { key: "returns", label: "退货量", sortable: true },
  { key: "rate", label: "退货率", sortable: true },
  { key: "asp", label: "平均售价", sortable: true },
  { key: "status", label: "数据情况" },
];
export function OverviewDetails({ data }: { data: OverviewView }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("month");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () => details(data.rows, search, sort, descending),
    [data.rows, search, sort, descending],
  );
  // 筛选由父级传入范围键；搜索、排序及指标选择仍由本页保留。
  const [scopeKey, setScopeKey] = useState(JSON.stringify(data.scope));
  if (scopeKey !== JSON.stringify(data.scope)) {
    setScopeKey(JSON.stringify(data.scope));
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(rows.length / 15));
  return (
    <section className="itk-panel itk-table-panel">
      <div className="itk-panel-head">
        <div>
          <h3>年月 / 站点 / 品类 / 品牌汇总</h3>
          <p>
            {format(rows.length)}个组合 · 金额单位：{data.currency}
          </p>
        </div>
        <div className="itk-table-actions">
          <label>
            搜索品牌或细分品类
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="搜索品牌或细分品类"
            />
          </label>
          <a
            className="itk-button"
            href={exportUrl("overview", data.scope, {
              details: true,
              search,
              sort,
              descending,
            })}
          >
            导出当前明细
          </a>
        </div>
      </div>
      <div
        className="itk-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="ITK概览明细，可横向滚动"
      >
        <table className="itk-detail-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    c.key === sort
                      ? descending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                >
                  {c.sortable ? (
                    <button
                      onClick={() => {
                        setSort(c.key as SortKey);
                        setDescending(c.key === sort ? !descending : true);
                        setPage(1);
                      }}
                    >
                      {c.label}{" "}
                      {c.key === sort ? (descending ? "↓" : "↑") : "↕"}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * 15, page * 15).map((r) => (
              <tr
                key={JSON.stringify([
                  r.month,
                  r.site,
                  r.category,
                  r.audience,
                  r.kind,
                  r.brand,
                ])}
              >
                <td>{r.month}</td>
                <td>{r.site}</td>
                <td title={categoryLabel(r, false)}>
                  {categoryLabel(r, false)}
                </td>
                <td title={r.brand}>{r.brand}</td>
                {(["sales", "units", "returns", "rate", "asp"] as Metric[]).map(
                  (m) => (
                    <td
                      key={m}
                      className={
                        r[m] !== null && Number(r[m]) < 0
                          ? "itk-negative"
                          : m === "rate"
                            ? "itk-rate"
                            : ""
                      }
                    >
                      {format(r[m], m)}
                    </td>
                  ),
                )}
                <td className={r.negative_count ? "itk-negative" : ""}>
                  {r.status}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="itk-empty">
                  暂无符合条件的数据，请调整筛选条件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="itk-pagination">
        <span>
          {rows.length
            ? `${(page - 1) * 15 + 1}–${Math.min(page * 15, rows.length)}`
            : "0"}{" "}
          / {format(rows.length)} 条
        </span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  );
}
