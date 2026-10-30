import { useState } from "react";
import { Card, Input, Segmented, Table } from "antd";
import { formatNumber } from "../../shared/report/format";
import { diagnosticPreview } from "../overview/fixtures";
import type { Product } from "../products/fixtures";

const columns = [
  { title: "站点", dataIndex: "site" },
  { title: "LISTING", dataIndex: "listing" },
  { title: "三级品类", dataIndex: "category3" },
  {
    title: "销售额（万）",
    render: (_: unknown, row: Product) => formatNumber(row.revenue / 10000),
  },
  {
    title: "净利润（万）",
    render: (_: unknown, row: Product) => formatNumber(row.profit / 10000),
  },
  {
    title: "净利率",
    render: (_: unknown, row: Product) =>
      `${formatNumber((row.profit / row.revenue) * 100)}%`,
  },
  {
    title: "退款率",
    render: (_: unknown, row: Product) => `${formatNumber(row.refund)}%`,
  },
];

export function BusinessCurrentDetails({ rows }: { rows: Product[] }) {
  const [period, setPeriod] = useState("环比");
  const [profitSearch, setProfitSearch] = useState("");
  const [lossSearch, setLossSearch] = useState("");
  return (
    <>
      <Card title="LISTING 平均售价与退货率对照" size="small">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 800 }}
          columns={[
            { title: "站点", dataIndex: "site" },
            { title: "LISTING", dataIndex: "listing" },
            { title: "币种", render: () => "—" },
            { title: "上年同期售价", render: () => "—" },
            { title: "上月售价", render: () => "—" },
            { title: "本月售价", render: () => "—" },
            { title: "环比", render: () => "—" },
            { title: "同比", render: () => "—" },
            {
              title: "本月退款率",
              render: (_, row) => `${formatNumber(row.refund)}%`,
            },
          ]}
        />
        <p className="sample-note">
          平均售价按站点、LISTING和币种区分。正式三期售价、退货率变化待接入。
        </p>
      </Card>
      <Card
        title="费用明细：退款影响拆解"
        size="small"
        extra={
          <Segmented
            aria-label="退款影响比较期间"
            value={period}
            onChange={setPeriod}
            options={["环比", "同比"]}
          />
        }
      >
        <div className="report-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                {[
                  "费用项",
                  "本月实际占比",
                  "对比期占比",
                  "实际变化",
                  "剔价变化",
                  "退款影响",
                  "剔价剔退款变化",
                  "等效影响金额",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diagnosticPreview.costs.map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  {Array.from({ length: 7 }, (_, i) => (
                    <td key={i}>—</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sample-note">
          {period}
          退款影响与非退款影响分开显示。当前未接入成本冲回与佣金返还依据，不生成拆解判断。
        </p>
      </Card>
      <Card title="费用杠杆与金额影响拆解" size="small">
        <div className="report-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                {[
                  "成本费用项",
                  "本月金额",
                  "对比期金额",
                  "占比变化",
                  "金额影响",
                  "费用杠杆",
                  "结论",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diagnosticPreview.costs.map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  {Array.from({ length: 5 }, (_, i) => (
                    <td key={i}>—</td>
                  ))}
                  <td>待核验</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="LISTING 经营明细" size="small">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 800 }}
        />
      </Card>
      <Card
        title="盈利 LISTING"
        size="small"
        extra={
          <Input
            aria-label="搜索盈利LISTING"
            placeholder="搜索LISTING/品类"
            value={profitSearch}
            onChange={(e) => setProfitSearch(e.target.value)}
          />
        }
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={columns}
          scroll={{ x: 800 }}
          dataSource={rows.filter(
            (row) =>
              row.profit >= 0 &&
              `${row.listing} ${row.category3}`.includes(profitSearch),
          )}
        />
      </Card>
      <Card
        title="亏损 LISTING"
        size="small"
        extra={
          <Input
            aria-label="搜索亏损LISTING"
            placeholder="搜索LISTING/品类"
            value={lossSearch}
            onChange={(e) => setLossSearch(e.target.value)}
          />
        }
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={columns}
          scroll={{ x: 800 }}
          dataSource={rows.filter(
            (row) =>
              row.profit < 0 &&
              `${row.listing} ${row.category3}`.includes(lossSearch),
          )}
        />
      </Card>
    </>
  );
}
