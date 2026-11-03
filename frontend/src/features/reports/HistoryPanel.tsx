import { Alert, Button, Card, Empty, Select, Skeleton } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { ReportChart } from "../../shared/report/ReportChart";
import { query, useReport } from "./api";
import type { Filters, HistoryView } from "./contracts";
import { HistoryFilters, type HistorySelection } from "./HistoryFilters";
import { HistoryIndicators, HistoryAnnualTable } from "./HistoryIndicators";
import { HistoryBreakdown } from "./HistoryBreakdown";
import { HistoryPeaks } from "./HistoryPeaks";
import { historyTrend } from "./history-chart-options";
import { historyCostTrend } from "./history-cost-options";
import { historyCosts, historyAmount } from "./history-presentation";
import { percent } from "./presentation";

export function HistoryPanel({ filters }: { filters: Filters }) {
  const [selection, setSelection] = useState<HistorySelection>({
    years: ["2026"],
    site: filters.site || "",
    listing: filters.listing || "",
    yearBasis: "calendar",
    periodScope: "full",
  });
  const { site, listing, years, yearBasis, periodScope } = selection;
  const [cost, setCost] = useState<keyof typeof historyCosts>("delivery");
  const [peakSearch, setPeakSearch] = useState("");
  const [peakSort, setPeakSort] = useState("gap_desc");
  const request = useReport<HistoryView>(
    `history?${query({ group: filters.group || "", site, listing, years: years.join(","), year_basis: yearBasis, period_scope: periodScope })}`,
  );
  const data = request.data;
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (data && panel.current)
      panel.current.style.setProperty(
        "--history-content-height",
        `${panel.current.offsetHeight}px`,
      );
  }, [data]);
  const subject = listing || `${filters.group || "全部业务"}组`;
  return (
    <div
      ref={panel}
      className="history-dashboard section-stack"
      // 切换筛选时保留布局高度，避免加载占位收起长页后把滚动位置重置到顶部。
      style={{
        minHeight:
          !data && !request.error ? "var(--history-content-height)" : undefined,
      }}
    >
      <div className="history-dashboard-intro">
        <h2>{subject}近6年LISTING盈收管理看板</h2>
        <p className="history-source-note">
          {yearBasis === "fiscal" ? "财务年度" : "自然年度"} ·
          {{ full: "全年", h1: "上半年", h2: "下半年" }[periodScope]} ·
          {site || "全部站点"} · 对比年份{" "}
          {years.map((year) => data?.year_labels[year] || year).join("、")}；
          {data
            ? `数据期间 ${data.period_start} 至 ${data.period_end}。`
            : "读取历史期间中。"}
        </p>
        <p className="history-source-note">
          第1—4、7区随“趋势LISTING”和年份筛选；第5—6区按站点＋LISTING拆解。有效LISTING范围沿用原报告，不随年度口径变化；历史最佳月与报告当月的比较独立展示。
        </p>
      </div>
      <HistoryFilters
        data={data}
        value={selection}
        onChange={(update) =>
          setSelection((current) => ({ ...current, ...update }))
        }
      />
      {request.error && (
        <Alert
          type="error"
          title={request.error}
          action={<Button onClick={request.retry}>重试</Button>}
        />
      )}
      {!data && !request.error && <Skeleton active paragraph={{ rows: 10 }} />}
      {data && (
        <>
          <HistoryIndicators data={data} />
          {(
            [
              [
                yearBasis === "fiscal"
                  ? "1. 财务年度趋势（近6年）"
                  : "1. 年度趋势（近6年）",
                data.annual,
              ],
              ["2. 季度趋势（最近12个季度）", data.quarterly],
              ["3. 月度趋势（最近24个月）", data.monthly],
            ] as const
          ).map(([title, rows]) => (
            <Card key={title} size="small">
              <h3>{title}</h3>
              <div
                className="history-chart-grid history-trend-scroll"
                role="region"
                aria-label={`${title}图表`}
                tabIndex={0}
              >
                {rows.length ? (
                  <div style={{ minWidth: rows.length * 132 + 152 }}>
                    <ReportChart
                      sample={false}
                      option={historyTrend(rows, data)}
                      summary={rows
                        .map(
                          (row) =>
                            `${row.label}净销售额${historyAmount(row.current.revenue)}，净利润${historyAmount(row.current.profit)}，净利率${percent(row.current.margin)}`,
                        )
                        .join("；")}
                    />
                  </div>
                ) : (
                  <Empty description="当前筛选无匹配趋势数据" />
                )}
              </div>
            </Card>
          ))}
          <Card size="small">
            <h3>
              4. 关键指标明细（
              {periodScope === "full"
                ? "年度"
                : periodScope === "h1"
                  ? "上半年"
                  : "下半年"}
              ）
            </h3>
            <HistoryAnnualTable data={data} />
            <p className="history-source-note">
              *
              首年从实际起始月开始；YTD为所选期间尚未完结的累计。年度同比按上一年度相同月份范围比较，增长率分母取基数绝对值；净利率变化以百分点（pp）表示。
            </p>
          </Card>
          <HistoryBreakdown data={data} />
          <Card size="small">
            <div className="history-cost-toolbar">
              <h3>7. 成本费用项占比趋势</h3>
              <label>
                成本费用项
                <Select
                  virtual={false}
                  aria-label="历史成本费用项"
                  value={cost}
                  onChange={setCost}
                  options={Object.entries(historyCosts).map(
                    ([value, label]) => ({ value, label }),
                  )}
                />
              </label>
            </div>
            {data.cost_trends.length ? (
              <ReportChart
                sample={false}
                option={historyCostTrend(data, cost)}
                summary={`${historyCosts[cost]}占净销售额，按源表子项有符号汇总后取绝对值。${data.cost_trends.map((row) => `${row.label}：${historyAmount(row.current[cost])} / ${percent(row.current[`${cost}_rate`])}`).join("；")}`}
              />
            ) : (
              <Empty description="当前筛选无成本占比数据" />
            )}
          </Card>
          <HistoryPeaks
            data={data}
            search={peakSearch}
            sort={peakSort}
            setSearch={setPeakSearch}
            setSort={setPeakSort}
          />
          <p className="history-source-note">
            {data.source_note} 金额为人民币；金额、比例保留两位小数。
            历史指标与当月经营重算口径分别核算。
          </p>
        </>
      )}
    </div>
  );
}
