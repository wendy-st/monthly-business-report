import { Table } from "antd";
import type { InventoryRow } from "./contracts";
import { InventoryDiagnosis } from "./InventoryDiagnosis";
import { format, percent } from "./presentation";

export function InventorySkuReadiness({ rows }: { rows: InventoryRow[] }) {
  const days = (row: InventoryRow, field: string, bound: string) =>
    row.values[field] == null
      ? "—"
      : `${row.values[bound] === "1" ? "≥" : ""}${format(row.values[field], 1)}天`;
  const rate = (row: InventoryRow, field: string, bound: string) =>
    `${row.values[field] != null && row.values[bound] === "1" ? "≥" : ""}${percent(row.values[field])}`;
  return (
    <Table<InventoryRow>
      aria-label="SKU库存满足率明细"
      rowKey="key"
      size="small"
      dataSource={rows}
      pagination={{ pageSize: 20, showSizeChanger: false }}
      scroll={{ x: 1450, y: 360 }}
      columns={[
        {
          title: "SKU / 款式",
          width: 210,
          render: (_, row) => (
            <div>
              {row.dimensions.sku || "未映射SKU"}
              <small>{row.dimensions.style || "未映射款式"}</small>
              <small>标准匹配：{row.dimensions.standard_match}</small>
            </div>
          ),
        },
        {
          title: "本地可用 / 三仓库存（件）",
          width: 140,
          align: "right",
          render: (_, row) => (
            <div>
              {format(row.values.local_available, 0)} /{" "}
              {format(row.values.total_quantity, 0)}
            </div>
          ),
        },
        {
          title: "本地仓发货满足率",
          width: 185,
          align: "right",
          render: (_, row) => (
            <div>
              {rate(row, "shipping_rate", "local_bound")}
              <small>
                {days(row, "local_days", "local_bound")} / 标准
                {format(row.values.shipping_days, 0)}天
              </small>
            </div>
          ),
        },
        {
          title: "保底下单天数满足率",
          width: 185,
          align: "right",
          render: (_, row) => (
            <div>
              {rate(row, "order_rate", "total_bound")}
              <small>
                {days(row, "total_days", "total_bound")} / 标准
                {format(row.values.order_days, 0)}天
              </small>
            </div>
          ),
        },
        {
          title: "FBA＋海外仓预测覆盖",
          width: 180,
          align: "right",
          render: (_, row) => (
            <div>
              {percent(row.values.coverage)}
              <small>可覆盖 {days(row, "abroad_days", "abroad_bound")}</small>
            </div>
          ),
        },
        {
          title: "FBA超270天占比",
          width: 150,
          align: "right",
          render: (_, row) => (
            <div>
              {percent(row.values.age270_rate)}
              <small>
                {format(row.values.age270, 0)} / 在库
                {format(row.values.in_stock, 0)}件
              </small>
            </div>
          ),
        },
        {
          title: "库存状况说明 / 资料状态",
          width: 420,
          render: (_, row) => (
            <div>
              <InventoryDiagnosis text={row.dimensions.diagnosis || ""} />
              <small>{row.dimensions.notes}</small>
            </div>
          ),
        },
      ]}
    />
  );
}
