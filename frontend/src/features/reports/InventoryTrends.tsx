import { Card, Segmented, Table } from "antd";
import { useState } from "react";
import { ReportChart } from "../../shared/report/ReportChart";
import type { FutureRow, InventoryView } from "./contracts";
import { InventoryTable } from "./InventoryTable";
import { format } from "./presentation";

export function InventoryTrends({ data }: { data: InventoryView }) {
  const [basis, setBasis] = useState("days_purchase");
  const [scope, setScope] = useState("所有仓库");
  const [scenario, setScenario] = useState("基础");
  const future = data.future.filter(
    (row) => row.scope === scope && row.scenario === scenario,
  );
  return (
    <>
      <section className="inventory-section">
        <h2 className="inventory-section-title">
          <b>3</b>库存周转
        </h2>
        <Segmented
          aria-label="库存金额口径"
          value={basis}
          onChange={setBasis}
          options={[
            { value: "days_purchase", label: "不含头程" },
            { value: "days_amount", label: "含头程" },
          ]}
        />
        <div className="two-column inventory-turnover-grid">
          {[
            ["days_qty", "数量周转同期对比"],
            [basis, "金额周转同期对比"],
          ].map(([key, title]) => (
            <Card key={key} title={title} size="small">
              <ReportChart
                sample={false}
                summary="来源：2025、2026库存周转表；各范围先汇总有符号流量再取绝对值，分母为零留空。单位：天。"
                option={{
                  tooltip: { trigger: "axis" },
                  legend: {
                    data: [
                      "2025所有仓库",
                      "2026所有仓库",
                      "2025FBA+海外仓",
                      "2026FBA+海外仓",
                    ],
                  },
                  grid: { left: 65, right: 25, top: 65, bottom: 40 },
                  xAxis: {
                    type: "category",
                    data: Array.from(
                      { length: 9 },
                      (_, index) => `${index + 1}月`,
                    ),
                  },
                  yAxis: { type: "value", name: "天" },
                  series: ["所有仓库", "FBA+海外仓"].flatMap((scopeName) =>
                    ["2025", "2026"].map((year) => ({
                      name: `${year}${scopeName}`,
                      type: "line",
                      symbol: year === "2025" ? "diamond" : "circle",
                      lineStyle: { type: year === "2025" ? "dashed" : "solid" },
                      data: Array.from({ length: 9 }, (_, index) => {
                        const value = data.turnover.find(
                          (row) =>
                            row.dimensions.scope === scopeName &&
                            row.label ===
                              `${year}-${String(index + 1).padStart(2, "0")}`,
                        )?.values[key];
                        return value === null || value === undefined
                          ? null
                          : Number(value);
                      }),
                    })),
                  ),
                }}
              />
            </Card>
          ))}
        </div>
        <InventoryTable
          title="周转明细与1—9月累计"
          rows={data.turnover.map((row) => ({
            ...row,
            label: `${row.dimensions.scope} / ${row.label}`,
          }))}
          fields={["days_qty", "days_purchase", "days_amount"]}
        />
      </section>
      <section className="inventory-section">
        <h2 className="inventory-section-title">
          <b>4</b>未来库存趋势
        </h2>
        <Card
          title="无新增补货下的库存支持天数"
          size="small"
          className="inventory-future-panel"
          extra={
            <>
              <Segmented
                aria-label="预测库存范围"
                value={scope}
                onChange={setScope}
                options={["所有仓库", "FBA+海外仓"]}
              />
              <Segmented
                aria-label="库存需求情景"
                value={scenario}
                onChange={setScenario}
                options={["需求+15%", "基础", "需求-15%"]}
              />
            </>
          }
        >
          <p className="sample-note">
            起点：经营工作簿9月末库存；需求：现有MSKU月销量预估结果。窗口按最后一个正需求月份结束，不假定未来补货。
          </p>
          <ReportChart
            sample={false}
            summary={future
              .map(
                (row) =>
                  `${row.month}需求${format(row.demand, 0)}件，可覆盖${format(row.support_days, 1)}天，月末剩余${format(row.remaining, 0)}件`,
              )
              .join("；")}
            option={{
              tooltip: { trigger: "axis" },
              legend: { data: ["可覆盖天数", "自然天数"] },
              grid: { left: 55, right: 20, top: 45, bottom: 40 },
              xAxis: { type: "category", data: future.map((row) => row.month) },
              yAxis: { type: "value", name: "天" },
              series: [
                {
                  name: "可覆盖天数",
                  type: "line",
                  data: future.map((row) =>
                    row.support_days === null ? null : Number(row.support_days),
                  ),
                },
                {
                  name: "自然天数",
                  type: "line",
                  lineStyle: { type: "dashed" },
                  data: future.map((row) => row.calendar_days),
                },
              ],
            }}
          />
          <Table<FutureRow>
            rowKey="month"
            dataSource={future}
            size="small"
            pagination={false}
            scroll={{ x: 650 }}
            columns={[
              { title: "月份", dataIndex: "month" },
              {
                title: "预测需求（件）",
                align: "right",
                render: (_, row) => format(row.demand, 0),
              },
              {
                title: "可覆盖（天）",
                align: "right",
                render: (_, row) => format(row.support_days, 1),
              },
              {
                title: "月末剩余（件）",
                align: "right",
                render: (_, row) => format(row.remaining, 0),
              },
            ]}
          />
        </Card>
      </section>
    </>
  );
}
