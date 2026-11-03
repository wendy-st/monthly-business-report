import { Fragment } from "react";
import { Card, Empty } from "antd";
import type { InventoryView } from "./contracts";
import { format, percent } from "./presentation";

const warehouses = ["FBA仓", "海外仓", "本地仓"];

export function InventoryStructure({
  data,
  overview,
}: {
  data: InventoryView;
  overview: boolean;
}) {
  const categories = [...data.breakdowns.categories].sort(
    (a, b) => Number(b.values.quantity) - Number(a.values.quantity),
  );
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
            {warehouses.map((warehouse, index) => {
              const row = data.breakdowns.warehouses.find(
                (item) => item.dimensions.warehouse === warehouse,
              );
              return (
                <div className="warehouse-share-row" key={warehouse}>
                  <strong>{warehouse}</strong>
                  <span className={`warehouse-track warehouse-color-${index}`}>
                    <i
                      style={{
                        width: `${Number(row?.values[`${field}_share`] ?? 0) * 100}%`,
                      }}
                    />
                  </span>
                  <span>
                    {field === "quantity"
                      ? `${format(row?.values.quantity, 0)}件`
                      : `${format(row?.values.amount, 2, 10000)}万`}{" "}
                    · {percent(row?.values[`${field}_share`])}
                  </span>
                </div>
              );
            })}
          </Card>
        ))}
      </div>
      {overview && (
        <div className="inventory-structure-grid">
          <Card title="本月一级品类库存数量占比" size="small">
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
                  {categories.map((row) => {
                    const cells = ["本地仓", "FBA仓", "海外仓"].map(
                      (warehouse) =>
                        data.breakdowns.category_warehouses.find(
                          (cell) =>
                            cell.dimensions.category1 ===
                              row.dimensions.category1 &&
                            cell.dimensions.warehouse === warehouse,
                        ),
                    );
                    return (
                      <Fragment key={row.key}>
                        <tr>
                          <th rowSpan={2}>{row.label}</th>
                          {cells.map((cell, index) => (
                            <td key={index}>
                              {format(cell?.values.quantity ?? "0", 0)}
                            </td>
                          ))}
                          <td>{format(row.values.quantity, 0)}</td>
                        </tr>
                        <tr className="inventory-share-line">
                          {cells.map((cell, index) => (
                            <td key={index}>
                              {percent(cell?.values.quantity_share ?? "0")}
                            </td>
                          ))}
                          <td>100.0%</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!categories.length && (
                <Empty description="当前筛选没有库存记录" />
              )}
            </div>
          </Card>
          <Card title="本月三级品类库存结构" size="small">
            <div className="inventory-category-structure report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    {[
                      "三级品类",
                      "总库存量",
                      "库存量占比",
                      "总库存金额（万元）",
                      "库存金额占比",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.breakdowns.category3
                    .filter(
                      (row) =>
                        Number(row.values.quantity) > 0 ||
                        Number(row.values.amount) > 0,
                    )
                    .map((row) => (
                      <tr key={row.key}>
                        <th>{row.dimensions.category3}</th>
                        <td>{format(row.values.quantity, 0)}</td>
                        <td>
                          <span className="inventory-share-value">
                            <i className="warehouse-track">
                              <i
                                style={{
                                  width: `${(Number(row.values.quantity_share) / Number(data.breakdowns.category3[0]?.values.quantity_share || 1)) * 100}%`,
                                }}
                              />
                            </i>
                            {percent(row.values.quantity_share)}
                          </span>
                        </td>
                        <td>{format(row.values.amount, 2, 10000)}</td>
                        <td>
                          <span className="inventory-share-value">
                            <i className="warehouse-track">
                              <i
                                style={{
                                  width: `${Number(row.values.amount_share) * 100}%`,
                                }}
                              />
                            </i>
                            {percent(row.values.amount_share)}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
