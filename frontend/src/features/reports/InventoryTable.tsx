import { Card, ConfigProvider, Table } from "antd";
import type { ReactNode } from "react";
import type { InventoryRow } from "./contracts";
import { format, percent } from "./presentation";
import { InventoryChange } from "./InventoryChange";
import { inventoryColors } from "../../theme/seekway-antd-theme";

const labels: Record<string, string> = {
  quantity: "期末库存数量",
  amount: "期末库存金额",
  quantity_share: "数量占比",
  amount_share: "金额占比",
  purchase: "采购成本金额",
  freight: "头程成本金额",
  in_stock: "FBA在库（件）",
  age180: "180天以上（件）",
  age270: "270天以上（件）",
  age180_rate: "180天以上占比",
  age270_rate: "270天以上占比",
  days_qty: "库存周转天数",
  days_purchase: "金额周转（不含头程，天）",
  days_amount: "金额周转（含头程，天）",
  sales_units: "9月销量",
  ytd_days_qty: "1—9月周转天数",
  mom_days_qty: "环比",
  yoy_days_qty: "同比",
  purchase_share: "采购占比",
  freight_share: "头程占比",
};

function turnoverCell(field: string, raw: string | null | undefined) {
  if (raw == null) return "—";
  const amount = Number(raw);
  if (field === "mom_days_qty" || field === "yoy_days_qty") {
    return <InventoryChange value={raw} highlight />;
  }
  if (field.startsWith("days_") || field === "ytd_days_qty")
    return `${amount.toFixed(1)}天`;
  if (["amount", "purchase", "freight"].includes(field)) {
    return Math.abs(amount) >= 10000
      ? `${format(raw, 2, 10000)}万`
      : format(raw);
  }
  if (field.endsWith("share")) return `${format(raw, 1, 0.01)}%`;
  if (field.endsWith("rate")) return percent(raw);
  return format(raw, 0);
}

export function InventoryTable({
  title,
  rows,
  fields = ["quantity", "amount", "purchase", "freight"],
  extra,
  compact = false,
  identities,
}: {
  title: string;
  rows: InventoryRow[];
  fields?: string[];
  extra?: ReactNode;
  compact?: boolean;
  identities?: string[];
}) {
  return (
    <Card
      size="small"
      title={title}
      extra={extra}
      className="inventory-detail-table"
    >
      <ConfigProvider
        theme={{
          token: { fontWeightStrong: 700 },
          components: {
            Table: {
              headerBg: inventoryColors.tableHead,
              headerColor: inventoryColors.tableHeader,
              headerSplitColor: "transparent",
              borderColor: inventoryColors.grid,
            },
          },
        }}
      >
        <Table<InventoryRow>
          rowKey="key"
          size="small"
          dataSource={rows}
          pagination={false}
          scroll={{ x: compact ? 700 : 1400, y: 520 }}
          onHeaderRow={() => ({ style: { whiteSpace: "nowrap" } })}
          columns={[
            ...(identities?.map((key, index) => ({
              title: (
                {
                  group: "小组",
                  site: "站点",
                  listing: "LISTING",
                  category1: "一级品类",
                  category3: "三级品类",
                } as Record<string, string>
              )[key],
              key,
              align: index === 0 ? ("left" as const) : ("right" as const),
              width: key === "category3" ? 240 : 110,
              render: (_: unknown, row: InventoryRow) =>
                row.dimensions[key] || "—",
            })) ?? [{ title: "范围", dataIndex: "label", width: 240 }]),
            ...fields.map((key) => ({
              title:
                key === "days_qty" && !compact
                  ? "9月周转天数"
                  : (labels[key] ?? key),
              key,
              align: "right" as const,
              width: 110,
              onCell: () => ({
                style: key.endsWith("share")
                  ? { background: inventoryColors.shareCell }
                  : undefined,
              }),
              render: (_: unknown, row: InventoryRow) =>
                turnoverCell(key, row.values[key]),
            })),
          ]}
          locale={{ emptyText: "当前筛选没有库存记录" }}
        />
      </ConfigProvider>
    </Card>
  );
}
