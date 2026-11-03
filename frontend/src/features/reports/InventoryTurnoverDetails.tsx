import { useState } from "react";
import { Select } from "antd";
import type { InventoryView } from "./contracts";
import { InventoryTable } from "./InventoryTable";

const fields = [
  "quantity",
  "quantity_share",
  "amount",
  "amount_share",
  "purchase",
  "purchase_share",
  "freight",
  "freight_share",
  "sales_units",
  "days_qty",
  "ytd_days_qty",
];

export function InventoryTurnoverDetails({
  data,
  overview,
}: {
  data: InventoryView;
  overview: boolean;
}) {
  const [category1, setCategory1] = useState("");
  const rows = data.breakdowns.category_turnover;
  const categories = [
    ...new Set(rows.map((row) => row.dimensions.category1)),
  ].filter(Boolean);
  return (
    <>
      <InventoryTable
        title={
          overview
            ? "小组库存周转明细（FBA仓+海外仓）"
            : "站点/LISTING库存周转明细（FBA仓+海外仓）"
        }
        rows={data.breakdowns[overview ? "group_turnover" : "listing_turnover"]}
        fields={fields}
        identities={overview ? ["group"] : ["site", "listing"]}
      />
      {overview && (
        <InventoryTable
          title="品类库存周转天数（FBA+海外仓）"
          compact
          rows={rows
            .filter(
              (row) =>
                row.values.days_qty !== null &&
                (!category1 || row.dimensions.category1 === category1),
            )
            .sort(
              (a, b) => Number(b.values.days_qty) - Number(a.values.days_qty),
            )}
          fields={["days_qty", "mom_days_qty", "yoy_days_qty"]}
          identities={["category1", "category3"]}
          extra={
            <Select
              aria-label="品类周转一级品类"
              style={{ minWidth: 160 }}
              value={category1}
              onChange={setCategory1}
              options={[
                { value: "", label: "全部一级品类" },
                ...categories.map((name) => ({ value: name, label: name })),
              ]}
            />
          }
        />
      )}
    </>
  );
}
