import { Button, Card, Table } from "antd";
import type { MetricRow } from "./contracts";
import { format, percent } from "./presentation";

const labels: Record<string, string> = {
  units: "净销量（件）",
  sales_qty: "销售数量（件）",
  revenue: "净销售额（人民币元）",
  gross_profit: "毛利润（人民币元）",
  profit: "净利润（人民币元）",
  margin: "净利率",
  gross_margin: "毛利率",
  refund_rate: "退款率",
};

export function ReportTable({
  title,
  rows,
  fields = ["units", "revenue", "profit", "margin"],
  onSelect,
}: {
  title: string;
  rows: MetricRow[];
  fields?: string[];
  onSelect?: (row: MetricRow) => void;
}) {
  return (
    <Card title={title} size="small">
      <Table<MetricRow>
        rowKey="key"
        size="small"
        dataSource={rows}
        pagination={{
          pageSize: 25,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        scroll={{ x: 920, y: 520 }}
        columns={[
          {
            title: "范围",
            dataIndex: "label",
            width: 250,
            fixed: "left",
            render: (label: string, row) =>
              onSelect ? (
                <Button type="link" onClick={() => onSelect(row)}>
                  {label}
                </Button>
              ) : (
                label
              ),
          },
          ...fields.map((key) => ({
            title: labels[key] ?? key,
            key,
            align: "right" as const,
            width: 150,
            render: (_: unknown, row: MetricRow) =>
              key.includes("rate") || key.includes("margin")
                ? percent(row.current[key])
                : format(
                    row.current[key],
                    key.includes("qty") || key === "units" ? 0 : 2,
                  ),
          })),
          {
            title: "状态",
            dataIndex: "status",
            width: 120,
            render: (status: string) =>
              ({
                OK: "可计算",
                NO_RECORD: "本期无记录",
                DATA_MISSING: "数据缺失",
              })[status] ?? "待核验",
          },
        ]}
        locale={{ emptyText: "当前筛选无记录，请清除筛选后查看" }}
      />
    </Card>
  );
}
