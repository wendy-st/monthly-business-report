import { Card } from "antd";
import { inventoryPreview, categoryInventoryPreview } from "./fixtures";
import { formatNumber } from "../../shared/report/format";

type InventoryPreview = ReturnType<typeof inventoryPreview>;

export function InventoryScale({ fixture }: { fixture: InventoryPreview }) {
  return (
    <>
      <div className="two-col-grid">
        {["数量", "金额"].map((kind) => (
          <Card
            key={kind}
            title={`仓库${kind}占比`}
            size="small"
            className="warehouse-panel"
          >
            {fixture.warehouses.map((row, index) => (
              <div className="warehouse-share-row" key={row.name}>
                <strong>{row.name}</strong>
                <span className={`warehouse-track warehouse-color-${index}`}>
                  <i style={{ width: `${row.share}%` }} />
                </span>
                <span>
                  {kind === "数量"
                    ? `${formatNumber(row.quantity, 0)}件`
                    : `${formatNumber(row.amount / 10000)}万`}{" "}
                  · {row.share.toFixed(1)}%
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
                    (name) => (
                      <th key={name}>{name}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {categoryInventoryPreview.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    {[0.35, 0.5, 0.15, 1].map((share, index) => (
                      <td key={index}>
                        {formatNumber(fixture.quantity * row.share * share, 0)}
                        <small>{formatNumber(share * 100, 1)}%</small>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="9月三级品类库存结构" size="small">
          <div className="report-table-scroll">
            <table className="report-table inventory-structure-table">
              <thead>
                <tr>
                  {[
                    "三级品类",
                    "总库存量",
                    "库存量占比",
                    "总库存金额",
                    "库存金额占比",
                  ].map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categoryInventoryPreview.flatMap((row) =>
                  row.children.map((child) => (
                    <tr key={child.name}>
                      <td>{child.name}</td>
                      <td>{formatNumber(fixture.quantity * child.share, 0)}</td>
                      <td>
                        <span className="share-track">
                          <i style={{ width: `${child.share * 100}%` }} />
                        </span>
                        {formatNumber(child.share * 100, 1)}%
                      </td>
                      <td>
                        {formatNumber((fixture.amount * child.share) / 10000)}万
                      </td>
                      <td>{formatNumber(child.share * 100, 1)}%</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
