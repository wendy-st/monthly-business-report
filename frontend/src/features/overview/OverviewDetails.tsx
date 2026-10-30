import { useState } from "react";
import { Card, Select, Table } from "antd";
import { overviewFixture as fixture } from "./fixtures";
import {
  productFixtures,
  previewMatrix,
  type Product,
} from "../products/fixtures";
import { formatNumber } from "../../shared/report/format";

const listingColumns = [
  { title: "站点", dataIndex: "site" },
  { title: "LISTING", dataIndex: "listing" },
  { title: "小组", dataIndex: "group" },
  {
    title: "销售额（万）",
    render: (_: unknown, row: Product) => formatNumber(row.revenue / 10000),
  },
  {
    title: "净利润（万）",
    render: (_: unknown, row: Product) => formatNumber(row.profit / 10000),
  },
];

export function OverviewDetails() {
  const [site, setSite] = useState("全部站点");
  return (
    <>
      <Card title="小组经营占比" size="small">
        <Table
          rowKey="group"
          pagination={false}
          size="small"
          dataSource={fixture.groups}
          columns={[
            { title: "小组", dataIndex: "group" },
            { title: "销售额（万）", dataIndex: "revenue", align: "right" },
            {
              title: "销售占比",
              align: "right",
              render: (_, row) =>
                `${((Number(row.revenue) / 128) * 100).toFixed(1)}%`,
            },
            { title: "净利润（万）", dataIndex: "profit", align: "right" },
            { title: "净利率", dataIndex: "margin", align: "right" },
            { title: "环比", align: "right", render: () => "—" },
            { title: "同比", align: "right", render: () => "—" },
          ]}
        />
      </Card>
      <Card title="站点经营占比" size="small">
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={fixture.sites.map((name, index) => ({
            name,
            share: fixture.siteShares[index],
          }))}
          columns={[
            { title: "站点", dataIndex: "name" },
            {
              title: "销售占比",
              align: "right",
              render: (_, row) => `${row.share}%`,
            },
            {
              title: "销售额（万）",
              align: "right",
              render: (_, row) => formatNumber((128 * row.share) / 100),
            },
            { title: "净利润", align: "right", render: () => "—" },
            { title: "净利率", align: "right", render: () => "—" },
            { title: "环比", align: "right", render: () => "—" },
            { title: "同比", align: "right", render: () => "—" },
          ]}
        />
      </Card>
      <Card title="三级品类销售额占比" size="small">
        <Table
          rowKey="group"
          size="small"
          pagination={false}
          dataSource={previewMatrix(productFixtures)}
          columns={[
            { title: "小组", dataIndex: "group" },
            ...["薄底水鞋", "厚底水鞋", "保暖手套", "骑行眼镜"].map((name) => ({
              title: name,
              render: () => (
                <span className="share-track">
                  <i style={{ width: "60%" }} />
                </span>
              ),
            })),
            {
              title: "销售额（万）",
              align: "right",
              render: (_, row) => formatNumber(row.revenue / 10000),
            },
          ]}
        />
      </Card>
      <div className="two-col-grid">
        <Card title="站点-LISTING销售额TOP10" size="small">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 480 }}
            columns={listingColumns}
            dataSource={[...productFixtures]
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 10)}
          />
        </Card>
        <Card title="站点-LISTING净利润亏损TOP10" size="small">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 480 }}
            columns={listingColumns}
            dataSource={productFixtures
              .filter((row) => row.profit < 0)
              .sort((a, b) => a.profit - b.profit)
              .slice(0, 10)}
          />
        </Card>
      </div>
      <Card
        title="店铺经营"
        size="small"
        extra={
          <Select
            aria-label="店铺站点"
            value={site}
            onChange={setSite}
            style={{ width: 140 }}
            options={["全部站点", "US", "CA"].map((value) => ({
              value,
              label: value,
            }))}
          />
        }
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          columns={listingColumns}
          dataSource={productFixtures.filter(
            (row) => site === "全部站点" || row.site === site,
          )}
          scroll={{ y: 300 }}
        />
      </Card>
    </>
  );
}
