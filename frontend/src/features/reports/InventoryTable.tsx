import { Card, Table } from "antd";
import type { InventoryRow } from "./contracts";
import { format, percent } from "./presentation";

const labels: Record<string, string> = {
  quantity: "库存数量（件）",
  amount: "库存金额（人民币元）",
  quantity_share: "库存量占比",
  amount_share: "库存金额占比",
  purchase: "采购金额（人民币元）",
  freight: "头程金额（人民币元）",
  in_stock: "FBA在库（件）",
  age180: "180天以上（件）",
  age270: "270天以上（件）",
  age180_rate: "180天以上占比",
  age270_rate: "270天以上占比",
  days_qty: "数量周转（天）",
  days_purchase: "金额周转（不含头程，天）",
  days_amount: "金额周转（含头程，天）",
};

export function InventoryTable({
  title,
  rows,
  fields = ["quantity", "amount", "purchase", "freight"],
}: {
  title: string;
  rows: InventoryRow[];
  fields?: string[];
}) {
  return (
    <Card size="small" title={title}>
      <Table<InventoryRow>
        rowKey="key"
        size="small"
        dataSource={rows}
        pagination={{
          pageSize: 25,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        scroll={{ x: 900, y: 520 }}
        columns={[
          { title: "范围", dataIndex: "label", width: 240, fixed: "left" },
          ...fields.map((key) => ({
            title: labels[key] ?? key,
            key,
            align: "right" as const,
            width: 160,
            render: (_: unknown, row: InventoryRow) =>
              key.endsWith("rate") || key.endsWith("share")
                ? percent(row.values[key])
                : format(
                    row.values[key],
                    ["quantity", "in_stock", "age180", "age270"].includes(key)
                      ? 0
                      : 2,
                  ),
          })),
        ]}
        locale={{ emptyText: "当前筛选没有库存记录" }}
      />
    </Card>
  );
}
