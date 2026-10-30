import { useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { formatNumber } from "../../shared/report/format";
import type { Product } from "./fixtures";

export function ProductDetails({ rows }: { rows: Product[] }) {
  const [tab, setTab] = useState("全部");
  const visible = rows.filter(
    (row) =>
      tab === "全部" || (tab === "盈利款" ? row.profit >= 0 : row.profit < 0),
  );
  const [selected, setSelected] = useState<Product>();
  const [basis, setBasis] = useState("实际");
  return (
    <>
      <h2 className="section-heading">三、款式盈利与成本诊断明细</h2>
      <Card
        title={
          <Space size={4} wrap>
            {[
              "全部",
              "盈利款",
              "亏损款",
              "产品成本",
              "费用端",
              "待核验",
              "退款率",
            ].map((label) => (
              <Button
                key={label}
                size="small"
                disabled={!["全部", "盈利款", "亏损款"].includes(label)}
                type={tab === label ? "primary" : "default"}
                onClick={() => setTab(label)}
              >
                {label}
              </Button>
            ))}
          </Space>
        }
        size="small"
        extra={<Typography.Text>{visible.length} 款</Typography.Text>}
      >
        <Table<Product>
          rowKey="id"
          dataSource={visible}
          scroll={{ x: 1120, y: 520 }}
          locale={{ emptyText: "筛选无结果，请重置筛选" }}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          columns={[
            {
              title: "款式",
              dataIndex: "style",
              fixed: "left",
              width: 180,
              ellipsis: true,
            },
            { title: "小组", dataIndex: "group", width: 120 },
            { title: "站点", dataIndex: "site", width: 60 },
            { title: "LISTING", dataIndex: "listing", width: 100 },
            {
              title: "净销售额（人民币元）",
              dataIndex: "revenue",
              align: "right",
              render: (value: number) => formatNumber(value),
            },
            {
              title: "净利润（人民币元）",
              dataIndex: "profit",
              align: "right",
              render: (value: number) => formatNumber(value),
            },
            {
              title: "毛利率",
              dataIndex: "gross",
              align: "right",
              render: (value: number) => `${value.toFixed(2)}%`,
            },
            {
              title: "诊断",
              dataIndex: "status",
              width: 120,
              render: (value: string) => (
                <Tag color={value === "健康盈利" ? "success" : "warning"}>
                  {value}
                </Tag>
              ),
            },
            {
              title: "操作",
              fixed: "right",
              width: 72,
              render: (_, row) => (
                <Button
                  type="link"
                  onClick={() => {
                    setSelected(row);
                    setBasis("实际");
                  }}
                >
                  查看
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        title={selected?.style}
        open={!!selected}
        onClose={() => setSelected(undefined)}
        size="large"
      >
        <Descriptions
          column={1}
          bordered
          items={[
            {
              key: "scope",
              label: "小组 / 站点 / LISTING",
              children: `${selected?.group} / ${selected?.site} / ${selected?.listing}`,
            },
            {
              key: "profit",
              label: "净利润（人民币元）",
              children: selected ? formatNumber(selected.profit) : "—",
            },
          ]}
        />
        <h3 className="section-heading">LISTING 历史验证</h3>
        <Segmented
          aria-label="历史成本口径"
          options={["实际", "剔价", "剔价剔退款"]}
          value={basis}
          onChange={setBasis}
        />
        <Typography.Paragraph className="generate-button">
          当前查看：{basis}
          。历史与三种成本口径尚未接入正式数据，切换仅演示交互。
        </Typography.Paragraph>
      </Drawer>
    </>
  );
}
