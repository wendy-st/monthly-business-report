import { Alert, Card, Select, Space, Spin, Table } from "antd";
import { useState } from "react";
import { ReportChart } from "../../shared/report/ReportChart";
import { trendOption } from "../../shared/report/chart-options";
import { query, useReport } from "./api";
import type { Filters, HistoryView, MetricRow } from "./contracts";
import { ReportTable } from "./ReportTable";
import { format, plot } from "./presentation";

function HistoryChart({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <Card title={title} size="small">
      <ReportChart
        sample={false}
        option={trendOption(
          rows.map((row) => row.label),
          rows.map((row) => plot(row.current.revenue, 10000)),
          rows.map((row) => plot(row.current.profit, 10000)),
          rows.map((row) => plot(row.current.margin, 0.01)),
        )}
        summary={rows
          .map(
            (row) =>
              `${row.label}净销售额${format(row.current.revenue)}元，净利润${format(row.current.profit)}元`,
          )
          .join("；")}
      />
    </Card>
  );
}

export function HistoryPanel({ filters }: { filters: Filters }) {
  const [years, setYears] = useState(["2026"]);
  const [site, setSite] = useState(filters.site || "");
  const [listing, setListing] = useState(filters.listing || "");
  const request = useReport<HistoryView>(
    `history?${query({ group: filters.group || "", site, listing, years: years.join(",") })}`,
  );
  if (request.error)
    return (
      <Alert
        type="error"
        title={request.error}
        action={<button onClick={request.retry}>重试</button>}
      />
    );
  if (!request.data)
    return (
      <Spin tip="读取历史结果表">
        <div className="history-chart-grid" />
      </Spin>
    );
  const data = request.data;
  return (
    <div className="section-stack">
      <Space wrap>
        <Select
          aria-label="历史站点"
          value={site}
          style={{ minWidth: 140 }}
          onChange={(value) => {
            setSite(value);
            setListing("");
          }}
          options={[
            { value: "", label: "全部站点" },
            ...data.options.site.map((value) => ({ value, label: value })),
          ]}
        />
        <Select
          aria-label="历史LISTING"
          value={listing}
          style={{ minWidth: 170 }}
          onChange={setListing}
          options={[
            { value: "", label: "全部LISTING" },
            ...data.options.listing.map((value) => ({ value, label: value })),
          ]}
        />
        <span>历史年份</span>
        <Select
          mode="multiple"
          aria-label="历史年份"
          value={years}
          style={{ minWidth: 260 }}
          onChange={(next) => {
            if (next.length) setYears(next);
          }}
          options={data.years.map((year) => ({
            value: year,
            label: `${year}年`,
          }))}
        />
      </Space>
      <p className="sample-note">{data.source_note}</p>
      <div className="history-chart-grid">
        <HistoryChart title="年度经营趋势" rows={data.annual} />
        <HistoryChart title="最近12季度" rows={data.quarterly} />
        <HistoryChart title="最近24个月" rows={data.monthly} />
      </div>
      <ReportTable title="年度指标明细" rows={data.annual} />
      <ReportTable title="LISTING业务拆解" rows={data.listings} />
      <Card title="历史最佳月与当前差距" size="small">
        <p className="sample-note">
          按单月净利润最大选择，同利润再比销售额；排除本年累计销售金额非正、停运和废弃组合。默认按距最佳月利润差距降序。
        </p>
        <Table
          rowKey="key"
          size="small"
          dataSource={data.best_months}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 900 }}
          columns={[
            { title: "站点 / LISTING", dataIndex: "label" },
            {
              title: "定位",
              render: (_, row) => row.dimensions.position || "—",
            },
            { title: "最佳月", render: (_, row) => row.dimensions.month },
            {
              title: "最佳月净利润（元）",
              render: (_, row) => format(row.current.profit),
            },
            {
              title: "当月净利润（元）",
              render: (_, row) => format(row.current.current_profit),
            },
            {
              title: "距最佳月差距（元）",
              render: (_, row) => format(row.current.gap),
            },
          ]}
        />
      </Card>
      <Card title={`最佳月排除清单（${data.excluded.length}项）`} size="small">
        <Table
          rowKey="key"
          size="small"
          dataSource={data.excluded}
          pagination={{ pageSize: 5, showSizeChanger: false }}
          columns={[
            { title: "站点 / LISTING", dataIndex: "label" },
            {
              title: "排除原因",
              render: (_, row) => row.dimensions.excluded_reason,
            },
          ]}
        />
      </Card>
    </div>
  );
}
