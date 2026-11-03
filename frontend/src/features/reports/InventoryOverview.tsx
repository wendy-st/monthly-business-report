import { Card } from "antd";
import type { InventoryView } from "./contracts";
import { format } from "./presentation";

export function InventoryOverview({ data }: { data: InventoryView }) {
  return (
    <>
      <h2 className="inventory-section-title">
        <b>1</b>库存总览
      </h2>
      <div className="metric-grid">
        {data.kpis.map((item) => {
          const display = (value: string | null) =>
            value === null
              ? "—"
              : `${format(value, item.unit === "天" ? 1 : item.unit === "件" ? 0 : 2, item.unit === "万元" ? 10000 : 1)}${item.unit === "天" ? "天" : item.unit === "万元" ? "万" : ""}`;
          return (
            <Card key={item.label} className="metric-card" size="small">
              <span className="inventory-metric-label">{item.label}</span>
              <div className="metric-value">
                {display(item.current)}
                <small>本月</small>
              </div>
              {[
                ["环比", item.previous, item.mom],
                ["同比", item.year_ago, item.yoy],
              ].map(([label, previous, delta]) => (
                <div className="metric-comparison" key={label}>
                  <span>{label}</span>
                  <span>{display(previous)}</span>
                  <strong
                    className={
                      delta !== null && Number(delta) < 0
                        ? "inventory-decrease"
                        : "inventory-increase"
                    }
                  >
                    {delta === null
                      ? "—"
                      : `${Number(delta) < 0 ? "↓" : Number(delta) > 0 ? "↑" : ""} ${format(String(Math.abs(Number(delta))), 1, item.unit === "天" ? 1 : 0.01)}${item.unit === "天" ? "天" : "%"}`}
                  </strong>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
      <Card title="库存结论" size="small" className="inventory-conclusion">
        <div className="inventory-conclusion-lines">
          {data.conclusions.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Card>
    </>
  );
}
