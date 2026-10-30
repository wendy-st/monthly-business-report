import { Card, Empty, Table } from "antd";
import type { TableColumnsType } from "antd";
import type { OverviewDetails, OverviewRow } from "./overview-contracts";
import { format, percent } from "./presentation";
import {
  OverviewChange,
  overviewAmount,
  profitClass,
} from "./overview-presentation";

function contributionColumns(
  dimension: "group" | "site",
): TableColumnsType<OverviewRow> {
  return [
    {
      title: dimension === "group" ? "小组" : "站点",
      width: 132,
      fixed: "left",
      render: (_, row) => row.dimensions[dimension] ?? "总计",
    },
    {
      title: "销售额",
      align: "right",
      width: 120,
      render: (_, row) => overviewAmount(row.current.revenue),
    },
    {
      title: "销售额占比",
      align: "right",
      width: 120,
      className: "overview-share-cell",
      render: (_, row) => percent(row.revenue_share),
    },
    {
      title: "净利润",
      align: "right",
      width: 120,
      onCell: (row) => ({ className: profitClass(row.current.profit) }),
      render: (_, row) => overviewAmount(row.current.profit),
    },
    {
      title: "净利润占比",
      align: "right",
      width: 120,
      className: "overview-share-cell",
      render: (_, row) => percent(row.profit_share),
    },
    {
      title: "净利率",
      align: "right",
      width: 110,
      render: (_, row) => percent(row.current.margin),
    },
    {
      title: "销售额同比",
      align: "right",
      width: 120,
      render: (_, row) => <OverviewChange value={row.changes.revenue_yoy} />,
    },
    {
      title: "净利率同比（pp）",
      align: "right",
      width: 130,
      render: (_, row) => (
        <OverviewChange value={row.deltas.margin_yoy} kind="points" />
      ),
    },
    {
      title: "净利润额同比",
      align: "right",
      width: 130,
      render: (_, row) => (
        <OverviewChange value={row.deltas.profit_yoy} kind="amount" />
      ),
    },
  ];
}

function listingColumns(): TableColumnsType<OverviewRow> {
  return [
    { title: "站点", width: 65, render: (_, row) => row.dimensions.site },
    {
      title: "LISTING",
      width: 110,
      render: (_, row) => row.dimensions.listing,
    },
    {
      title: "销售额",
      align: "right",
      width: 110,
      render: (_, row) => overviewAmount(row.current.revenue),
    },
    {
      title: "净利润",
      align: "right",
      width: 110,
      onCell: (row) => ({ className: profitClass(row.current.profit) }),
      render: (_, row) => overviewAmount(row.current.profit),
    },
    {
      title: "净利率",
      align: "right",
      width: 90,
      render: (_, row) =>
        row.current.margin == null
          ? "—"
          : `${format(row.current.margin, 1, 0.01)}%`,
    },
  ];
}

/** 公司总览按原稿组织贡献表、品类横条及站点-LISTING榜单。 */
export function OverviewBreakdowns({ data }: { data: OverviewDetails }) {
  return (
    <div className="section-stack overview-breakdowns">
      {(
        [
          ["group", "小组经营占比", data.groups],
          ["site", "站点经营占比", data.sites],
        ] as const
      ).map(([dimension, title, rows]) => (
        <Card key={dimension} title={title} size="small">
          <Table<OverviewRow>
            aria-label={title}
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={rows}
            columns={contributionColumns(dimension)}
            scroll={{ x: 1102, y: dimension === "site" ? 330 : undefined }}
            summary={() =>
              data.total && (
                <Table.Summary fixed>
                  <Table.Summary.Row className="overview-total-row">
                    <Table.Summary.Cell index={0}>总计</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      {overviewAmount(data.total.current.revenue)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      {percent(data.total.revenue_share)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      {overviewAmount(data.total.current.profit)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      {percent(data.total.profit_share)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      {percent(data.total.current.margin)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <OverviewChange value={data.total.changes.revenue_yoy} />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <OverviewChange
                        value={data.total.deltas.margin_yoy}
                        kind="points"
                      />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <OverviewChange
                        value={data.total.deltas.profit_yoy}
                        kind="amount"
                      />
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )
            }
          />
        </Card>
      ))}
      <Card title="三级品类销售额占比" size="small">
        <div className="overview-category-scroll">
          <table
            className="overview-category-table"
            aria-label="三级品类销售额占比"
          >
            <thead>
              <tr>
                <th>三级品类</th>
                <th>销售额规模</th>
                <th>销售额</th>
                <th>净利润</th>
                <th>净利率</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((row) => (
                <tr key={row.key}>
                  <td>{row.dimensions.category3}</td>
                  <td>
                    <div className="overview-category-track">
                      <span
                        style={{
                          width: `${Number(row.bar_ratio ?? 0) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td>{overviewAmount(row.current.revenue)}</td>
                  <td
                    className={
                      Number(row.current.profit) < 0 ? "impact-negative" : ""
                    }
                  >
                    {overviewAmount(row.current.profit)}
                  </td>
                  <td>{percent(row.current.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.categories.length && <Empty description="本期无品类记录" />}
        </div>
      </Card>
      <div className="two-column overview-ranking-grid">
        {(
          [
            ["站点-LISTING销售额TOP10", data.sales_top10],
            ["站点-LISTING净利润亏损TOP10", data.loss_top10],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title} title={title} size="small">
            <Table<OverviewRow>
              aria-label={title}
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={[...rows]}
              columns={listingColumns()}
              scroll={{ x: 485 }}
              locale={{
                emptyText: title.includes("亏损")
                  ? "本期无亏损LISTING"
                  : "本期无正销售额LISTING",
              }}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
