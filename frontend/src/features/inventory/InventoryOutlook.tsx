import { Card } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import { tooltipValue } from "../../shared/report/format";
import {
  forecastMonths,
  inventoryPreview,
  futureDaysPreview,
} from "./fixtures";

export function InventoryOutlook() {
  return (
    <Card
      title="未来库存可支持天数趋势"
      size="small"
      className="inventory-future-panel"
    >
      <p className="sample-note">
        面积覆盖：按月初剩余库存折算当月可覆盖天数；不计未来新增补货。本图为独立合成序列。
      </p>
      <ReportChart
        summary="合成样例：所有仓库与FBA+海外仓未来可支持天数；不是正式预测。"
        option={{
          tooltip: { trigger: "axis", valueFormatter: tooltipValue("天") },
          legend: { top: 4, data: ["所有库存", "FBA+海外仓"] },
          grid: { left: 48, right: 24, top: 48, bottom: 40 },
          xAxis: { type: "category", data: forecastMonths },
          yAxis: { type: "value", name: "可支持天数" },
          series: futureDaysPreview.map((row) => ({
            name: row.name,
            type: "line",
            smooth: true,
            areaStyle: { opacity: 0.12 },
            data: row.days,
          })),
        }}
      />
    </Card>
  );
}

export function InventoryAge({
  fixture,
}: {
  fixture: ReturnType<typeof inventoryPreview>;
}) {
  return (
    <Card title="FBA库龄占比（按小组）" size="small">
      <div className="age-card-grid">
        {fixture.rows.map((row) => (
          <div className="age-group-card" key={row.group}>
            <div className="age-card-title">
              <strong>{row.group}</strong>
              <span>合成库龄结构</span>
            </div>
            <div className="age-highlights">
              <div>
                180天以上<strong>20.0%</strong>
              </div>
              <div>
                270天以上<strong>8.0%</strong>
              </div>
            </div>
            {["US/DEMO-A", "CA/DEMO-B"].map((name) => (
              <div className="age-listing-row" key={name}>
                <span>{name}</span>
                <span className="warehouse-track">
                  <i style={{ width: "20%" }} />
                </span>
                <span>20.0%</span>
              </div>
            ))}
            <p className="sample-note">
              合成样例：0—90天52%，91—180天28%，181天以上20%。
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
