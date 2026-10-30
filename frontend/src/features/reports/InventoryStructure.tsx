import { Card } from "antd";
import type { InventoryView } from "./contracts";
import { InventoryTable } from "./InventoryTable";
import { format, percent } from "./presentation";

export function InventoryStructure({ data }: { data: InventoryView }) {
  return (
    <>
      <div className="two-col-grid">
        {(["quantity", "amount"] as const).map((field) => (
          <Card
            key={field}
            title={`仓库${field === "quantity" ? "数量" : "金额"}占比`}
            size="small"
            className="warehouse-panel"
          >
            {data.breakdowns.warehouses.map((row, index) => (
              <div className="warehouse-share-row" key={row.key}>
                <strong>{row.label}</strong>
                <span className={`warehouse-track warehouse-color-${index}`}>
                  <i
                    style={{
                      width: `${Number(row.values[`${field}_share`] ?? 0) * 100}%`,
                    }}
                  />
                </span>
                <span>
                  {field === "quantity"
                    ? `${format(row.values.quantity, 0)}件`
                    : `${format(row.values.amount, 2, 10000)}万`}{" "}
                  · {percent(row.values[`${field}_share`])}
                </span>
              </div>
            ))}
          </Card>
        ))}
      </div>
      <div className="inventory-structure-grid">
        <Card title="9月一级品类库存数量占比" size="small">
          <div className="report-table-scroll">
            <table className="report-table inventory-structure-table">
              <thead>
                <tr>
                  {["一级品类", "本地仓", "FBA仓", "海外仓", "合计"].map(
                    (label) => (
                      <th key={label}>{label}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.breakdowns.categories.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {["本地仓", "FBA仓", "海外仓"].map((warehouse) => (
                      <td key={warehouse}>
                        {format(
                          data.breakdowns.category_warehouses.find(
                            (cell) =>
                              cell.dimensions.category1 ===
                                row.dimensions.category1 &&
                              cell.dimensions.warehouse === warehouse,
                          )?.values.quantity,
                          0,
                        )}
                      </td>
                    ))}
                    <td>
                      {format(row.values.quantity, 0)}
                      <small>{percent(row.values.quantity_share)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <InventoryTable
          title="9月三级品类库存结构"
          rows={data.breakdowns.category3}
          fields={["quantity", "quantity_share", "amount", "amount_share"]}
        />
      </div>
      <InventoryTable
        title="站点-LISTING库存明细"
        rows={data.breakdowns.listings}
      />
    </>
  );
}
