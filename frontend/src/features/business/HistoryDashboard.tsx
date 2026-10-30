import { useState } from "react";
import { Card, Checkbox, Select, Table } from "antd";
import { historyFixtures } from "./fixtures";
import type { Product } from "../products/fixtures";
import { ReportChart } from "../../shared/report/ReportChart";
import { trendOption } from "../../shared/report/chart-options";

const historySections = [
  ["年度", "1. 年度趋势（近6年）"],
  ["季度", "2. 季度趋势（最近12个季度）"],
  ["月度", "3. 月度趋势（最近24个月）"],
] as const;
const years = ["2021", "2022", "2023", "2024", "2025", "2026"];

export function HistoryDashboard({
  group,
  rows,
}: {
  group: string;
  rows: Product[];
}) {
  const [selected, setSelected] = useState(years);
  const [cost, setCost] = useState("FBA配送成本");
  const annual = historyFixtures.年度;
  return (
    <>
      <div className="history-intro">
        <h2>{group} · 近6年LISTING盈收管理看板</h2>
        <p>独立合成序列，用于核对历史看板布局；尚未关联真实小组历史数据。</p>
      </div>
      <Card size="small" className="history-toolbar">
        <span>站点</span>
        <Select
          aria-label="历史站点"
          disabled
          value="全部站点"
          options={[{ value: "全部站点", label: "全部站点" }]}
          style={{ width: 132 }}
        />
        <span>趋势LISTING</span>
        <Select
          aria-label="历史趋势LISTING"
          disabled
          value="小组合计"
          options={[{ value: "小组合计", label: "小组合计" }]}
          style={{ width: 160 }}
        />
        <span>选择年份（可多选）</span>
        <Checkbox.Group
          aria-label="历史年份"
          options={years}
          value={selected}
          onChange={setSelected}
        />
      </Card>
      <div className="history-summary-grid">
        {["累计销售额", "累计净利润", "整体净利率", "历史峰值"].map((label) => (
          <Card key={label} size="small">
            <span>{label}</span>
            <strong>—</strong>
            <small>待正式历史数据</small>
          </Card>
        ))}
      </div>
      {historySections.map(([period, title]) => {
        const series = historyFixtures[period];
        const indices = series.periods
          .map((name, index) => ({ name, index }))
          .filter((item) => selected.includes(item.name.slice(0, 4)));
        return (
          <Card key={period} title={title} size="small">
            <ReportChart
              option={trendOption(
                indices.map((x) => x.name),
                indices.map((x) => series.revenue[x.index]),
                indices.map((x) => series.profit[x.index]),
                indices.map((x) => series.margin[x.index]),
              )}
              summary={`${period}独立合成序列，人民币万元；可按年份筛选。`}
            />
          </Card>
        );
      })}
      <Card title="4. 关键指标明细（年度）" size="small">
        <Table
          rowKey="period"
          size="small"
          pagination={false}
          dataSource={annual.periods
            .map((period, index) => ({
              period,
              revenue: annual.revenue[index],
              profit: annual.profit[index],
              margin: annual.margin[index],
            }))
            .filter((row) => selected.includes(row.period.slice(0, 4)))}
          columns={[
            { title: "期间", dataIndex: "period" },
            { title: "销售额（万）", dataIndex: "revenue" },
            { title: "净利润（万）", dataIndex: "profit" },
            { title: "净利率（%）", dataIndex: "margin" },
          ]}
        />
      </Card>
      <div className="two-col-grid">
        <Card title="5. LISTING业务拆解" size="small">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={rows}
            columns={[
              { title: "站点", dataIndex: "site" },
              { title: "LISTING", dataIndex: "listing" },
              { title: "定位", render: () => "待核验" },
              { title: "历史贡献", render: () => "—" },
            ]}
          />
        </Card>
        <Card title="6. LISTING盈利能力象限" size="small">
          <div className="pending-section">
            待接入正式历史数据后，展示规模与盈利能力象限。
          </div>
        </Card>
      </div>
      <Card
        title="7. 成本费用项占比趋势"
        size="small"
        extra={
          <Select
            aria-label="历史成本费用项"
            value={cost}
            onChange={setCost}
            style={{ width: 160 }}
            options={[
              "销售成本",
              "头程运费",
              "FBA配送成本",
              "FBA仓储成本",
              "FBA佣金",
              "营销推广费",
            ].map((value) => ({ value, label: value }))}
          />
        }
      >
        <div className="pending-section">
          {cost}历史占比待接入，缺失值不补零。
        </div>
      </Card>
      <Card title="逐LISTING历史最佳月与2026年9月对比" size="small">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: "站点", dataIndex: "site" },
            { title: "LISTING", dataIndex: "listing" },
            { title: "历史最佳月", render: () => "—" },
            { title: "最佳月净利", render: () => "—" },
            { title: "本月净利", render: () => "—" },
            { title: "差距", render: () => "待核验" },
          ]}
        />
      </Card>
    </>
  );
}
