import { Table, Tag } from "antd";
import type { InventoryRisk } from "./contracts";
import { InventorySkuReadiness } from "./InventorySkuReadiness";
import { InventoryChange } from "./InventoryChange";
import { InventoryDiagnosis } from "./InventoryDiagnosis";
import { format, percent } from "./presentation";

function readiness(row: InventoryRisk, field: string) {
  const bound = field === "shipping_rate" ? "local_bound" : "total_bound";
  const days = field === "shipping_rate" ? "local_days" : "total_days";
  const standard = field === "shipping_rate" ? "shipping_days" : "order_days";
  const prefix = row.values[bound] === "1" ? "≥" : "";
  return (
    <div>
      {row.values[field] == null
        ? "—"
        : `${prefix}${percent(row.values[field])}`}
      <small>
        {row.values[days] == null
          ? "—"
          : `${prefix}${format(row.values[days], 1)}天`}
        {" / 标准"}
        {format(row.values[standard], 0)}天
      </small>
      <small>按有标准的SKU等权平均</small>
    </div>
  );
}

export function InventoryRiskTable({
  rows,
  style,
}: {
  rows: InventoryRisk[];
  style: boolean;
}) {
  return (
    <Table<InventoryRisk>
      rowKey="key"
      dataSource={rows}
      size="small"
      pagination={false}
      scroll={{ x: 1680, y: 640 }}
      expandable={
        style
          ? {
              expandedRowRender: (row) => (
                <InventorySkuReadiness rows={row.skus} />
              ),
              rowExpandable: (row) => row.skus.length > 0,
              columnTitle: "SKU",
              columnWidth: 48,
            }
          : undefined
      }
      locale={{ emptyText: "当前没有库存评估明细" }}
      columns={[
        {
          title: "核查状态",
          width: 80,
          render: (_, row) => (
            <Tag
              color={
                row.risk.level === "有提示"
                  ? "warning"
                  : row.risk.level === "待补充"
                    ? "default"
                    : "success"
              }
            >
              {row.risk.level}
            </Tag>
          ),
        },
        {
          title: style ? "款式" : "LISTING",
          width: 190,
          render: (_, row) => (
            <div className="inventory-risk-object">
              <strong>
                {style
                  ? row.dimensions.style
                  : `${row.dimensions.site} / ${row.dimensions.listing}`}
              </strong>
              <small>
                {style &&
                  `${row.dimensions.site} / ${row.dimensions.listing} · `}
                {row.dimensions.category3}
              </small>
            </div>
          ),
        },
        {
          title: "阶段 / 销售季",
          width: 150,
          render: (_, row) => (
            <div>
              {row.risk.phase}
              <small>
                {row.risk.season_start
                  ? `${row.risk.season_start}～${row.risk.season_end}`
                  : "销售季待确认"}
              </small>
              <small>峰值：{row.risk.peak_month || "未确定"}</small>
            </div>
          ),
        },
        {
          title: "FBA＋海外仓库存 / 周转",
          width: 160,
          align: "right",
          render: (_, row) => (
            <div>
              {format(row.values.amount, 2, 10000)}万 /{" "}
              {format(row.values.quantity, 0)}件
              <small>实际周转 {format(row.values.days_qty, 1)}天</small>
              <small>
                环 <InventoryChange value={row.values.mom_days_qty} /> / 同{" "}
                <InventoryChange value={row.values.yoy_days_qty} />
              </small>
            </div>
          ),
        },
        {
          title: "本地仓发货满足率",
          width: 175,
          align: "right",
          render: (_, row) => readiness(row, "shipping_rate"),
        },
        {
          title: "保底下单天数满足率",
          width: 190,
          align: "right",
          render: (_, row) => readiness(row, "order_rate"),
        },
        {
          title: "FBA＋海外仓预测覆盖",
          width: 200,
          align: "right",
          render: (_, row) => (
            <div>
              {percent(row.values.coverage)}
              <small>
                {row.values.abroad_days == null
                  ? "—"
                  : `${row.values.abroad_bound === "1" ? "≥" : ""}${format(row.values.abroad_days, 1)}天`}
              </small>
              <small>
                {row.exhaustion
                  ? `预计${row.exhaustion}耗尽`
                  : `窗口末余${format(row.values.remaining, 0)}件`}
              </small>
              <small>
                {row.values.forecast_start || "—"}～
                {row.values.forecast_end || "—"}
              </small>
            </div>
          ),
        },
        {
          title: "FBA超270天占比",
          width: 140,
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
          title: "库存状况说明",
          width: 420,
          render: (_, row) => (
            <InventoryDiagnosis
              text={row.risk.reasons.join("；") || "已核查项未见异常"}
            />
          ),
        },
      ]}
    />
  );
}
