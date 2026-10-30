import { useState } from "react";
import { Card, Empty, Select, Space, Typography } from "antd";
import { MetricCards } from "../../shared/report/MetricCards";
import { ReportChart } from "../../shared/report/ReportChart";
import { donutOption, trendOption } from "../../shared/report/chart-options";
import { formatNumber } from "../../shared/report/format";
import { businessPreview, businessWaterfallPreview } from "./fixtures";

import { ReportTabs } from "../../shared/report/ReportTabs";
import { ProfitBridge } from "../overview/ProfitBridge";
import { BusinessCurrentDetails } from "./BusinessCurrentDetails";
import { HistoryDashboard } from "./HistoryDashboard";

export function BusinessAnalysis({ group }: { group: string }) {
  const [site, setSite] = useState("全部");
  const [listing, setListing] = useState("全部");
  const [tab, setTab] = useState("current");
  const fixture = businessPreview(group, site, listing);
  return (
    <div className="section-stack business-page">
      <ReportTabs
        label="业务分析视图"
        value={tab}
        onChange={setTab}
        options={[
          { value: "current", label: "当月经营概况" },
          { value: "history", label: "近6年LISTING盈收趋势" },
        ]}
      />
      {tab === "current" && (
        <Card size="small" className="business-filters">
          <Space wrap className="business-filter-row">
            <label className="filter-field">
              站点
              <Select
                aria-label="业务组站点"
                value={site}
                onChange={setSite}
                style={{ width: 160, height: 34 }}
                options={["全部", "US", "CA"].map((value) => ({
                  value,
                  label: value === "全部" ? "全部站点" : value,
                }))}
              />
            </label>
            <label className="filter-field">
              LISTING
              <Select
                aria-label="业务组LISTING"
                value={listing}
                onChange={setListing}
                style={{ width: 160, height: 34 }}
                options={["全部", "DEMO-A", "DEMO-B", "DEMO-C", "DEMO-D"].map(
                  (value) => ({
                    value,
                    label: value === "全部" ? "全部LISTING" : value,
                  }),
                )}
              />
            </label>
            <Typography.Text type="secondary">
              合成样例：{group} / {site} / {listing}
            </Typography.Text>
          </Space>
        </Card>
      )}
      {tab === "history" ? (
        <HistoryDashboard group={group} rows={fixture.rows} />
      ) : !fixture.rows.length ? (
        <Empty description="筛选无结果，请调整站点或LISTING" />
      ) : (
        <>
          <Card
            title={<h2 className="section-heading">{group}经营表现</h2>}
            className="business-kpi-panel"
            styles={{ header: { marginBottom: 24 } }}
          >
            <MetricCards metrics={fixture.metrics} caption={group} />
          </Card>
          <div className="overview-chart-grid">
            <Card title="核心指标趋势" size="small">
              <ReportChart
                option={trendOption(
                  ["2025-09", "2026-08", "2026-09"],
                  fixture.revenue,
                  fixture.profit,
                  fixture.margin,
                )}
                summary={`当前小组和筛选范围的三期合成比较。本期销售额${formatNumber(fixture.revenue[2])}万元、净利润${formatNumber(fixture.profit[2])}万元，净利率${formatNumber(fixture.margin[2])}%。`}
              />
            </Card>
            <Card title="三级品类销售额占比" size="small">
              <ReportChart
                option={donutOption(
                  fixture.rows.map((row) => row.category3),
                  fixture.rows.map((row) => row.revenue / 10000),
                  "万元",
                  `${formatNumber(fixture.revenue[2])}万`,
                )}
                summary={fixture.rows
                  .map(
                    (row) =>
                      `${row.category3}：${formatNumber(row.revenue / 10000)}万元`,
                  )
                  .join("；")}
              />
            </Card>
          </div>
          <ProfitBridge
            group
            fixtures={businessWaterfallPreview(fixture.profit[2])}
          />
          <BusinessCurrentDetails rows={fixture.rows} />
        </>
      )}
    </div>
  );
}
