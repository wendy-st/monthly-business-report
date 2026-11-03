import type { HistoryView } from "./contracts";
import {
  HistoryChange,
  historyValue,
  historyYear,
  historyAmount,
} from "./history-presentation";
import { percent } from "./presentation";

export function HistoryIndicators({ data }: { data: HistoryView }) {
  return (
    <div className="history-dashboard-kpis">
      {[
        ["units", "销量"],
        ["revenue", "销售额"],
        ["profit", "净利润"],
        ["margin", "净利率"],
      ].map(([key, label]) => (
        <div className={`history-dashboard-kpi history-kpi-${key}`} key={key}>
          <div className="history-kpi-label">{label}</div>
          <div className="history-kpi-main">
            <strong>{historyValue(key, data.summary.current[key])}</strong>
            <small>{data.period_label}</small>
          </div>
          <div className="history-kpi-comparison">
            <span>同比</span>
            <span>
              {data.previous_period_label}
              <br />
              {historyValue(key, data.summary.year_ago[key])}
            </span>
            <HistoryChange
              value={data.summary.changes[`${key}_yoy`]}
              points={key === "margin"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryAnnualTable({ data }: { data: HistoryView }) {
  return (
    <div
      className="report-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="年度指标明细"
    >
      <table className="report-table history-annual-table">
        <thead>
          <tr>
            {[
              "年度",
              "销售额",
              "净利润",
              "净利率",
              "销售增长",
              "利润增长",
              "净利率同比",
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...data.annual]
            .sort((left, right) =>
              right.dimensions.year.localeCompare(left.dimensions.year),
            )
            .map((row) => (
              <tr key={row.key}>
                <td>{historyYear(row.dimensions.year, data)}</td>
                <td>{historyAmount(row.current.revenue)}</td>
                <td>{historyAmount(row.current.profit)}</td>
                <td>{percent(row.current.margin)}</td>
                <td>
                  <HistoryChange value={row.changes.revenue_yoy} />
                </td>
                <td>
                  <HistoryChange value={row.changes.profit_yoy} />
                </td>
                <td>
                  <HistoryChange value={row.changes.margin_yoy} points />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {!data.annual.length && (
        <p className="history-empty">当前筛选无匹配年度数据</p>
      )}
    </div>
  );
}
