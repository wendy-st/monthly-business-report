import { Card } from "antd";
import type { HistoryView } from "./contracts";
import { ReportChart } from "../../shared/report/ReportChart";
import { historyQuadrant } from "./history-chart-options";
import { historyAmount } from "./history-presentation";
import { businessTone } from "./business-presentation";
import { percent } from "./presentation";

export function HistoryBreakdown({ data }: { data: HistoryView }) {
  const sales = data.insights.sales,
    profit = data.insights.profit,
    weak = data.insights.weak;
  const identity = (row: typeof sales) =>
    row ? `${row.dimensions.site}:${row.dimensions.listing}` : "—";
  return (
    <>
      <div className="history-dashboard-grid">
        <Card size="small">
          <h3>5. LISTING业务拆解（{data.period_label}）</h3>
          <div
            className="report-table-scroll history-listing-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="LISTING业务拆解"
          >
            <table className="report-table">
              <thead>
                <tr>
                  {[
                    "站点",
                    "LISTING",
                    "销售额",
                    "销售占比",
                    "净利润",
                    "利润占比",
                    "净利率",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.listings.map((row) => (
                  <tr key={row.key}>
                    <td>{row.dimensions.site}</td>
                    <td>
                      <strong>{row.dimensions.listing}</strong>
                    </td>
                    <td>{historyAmount(row.current.revenue)}</td>
                    <td>{percent(row.current.revenue_share)}</td>
                    <td className={businessTone(row.current.profit)}>
                      {historyAmount(row.current.profit)}
                    </td>
                    <td>{percent(row.current.profit_share)}</td>
                    <td>{percent(row.current.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.listings.length && (
              <p className="history-empty">当前筛选无有效LISTING数据</p>
            )}
          </div>
        </Card>
        <Card size="small">
          <h3>6. LISTING盈利能力象限（{data.period_label}，销售额Top25）</h3>
          {data.listings.length ? (
            <ReportChart
              sample={false}
              option={historyQuadrant(data)}
              summary={`横轴净利率，纵轴销售额；以Top25的加权净利率及销售额排序中间位置分界，气泡大小表示净利润绝对值。${data.listings
                .slice(0, 25)
                .map(
                  (row) =>
                    `${row.dimensions.site}/${row.dimensions.listing}：销售额${historyAmount(row.current.revenue)}，净利润${historyAmount(row.current.profit)}，净利率${percent(row.current.margin)}`,
                )
                .join("；")}`}
            />
          ) : (
            <p className="history-empty">无可评估的盈利象限数据</p>
          )}
        </Card>
      </div>
      <div className="history-insight-grid">
        <div className="history-insight-card">
          <strong>洞察：</strong>
          {sales
            ? `${data.period_label}，销售规模最高为 ${identity(sales)}（${historyAmount(sales.current.revenue)}）；净利润贡献最高为 ${identity(profit)}（${historyAmount(profit?.current.profit)}）。`
            : "当前筛选无有效LISTING数据。"}
        </div>
        <div className="history-insight-card history-warning">
          <strong>预警：</strong>
          {weak
            ? `${identity(weak)} 净利率最低（${percent(weak.current.margin)}），建议优先复核定价、促销与履约费用。`
            : "无可评估数据。"}
        </div>
      </div>
    </>
  );
}
