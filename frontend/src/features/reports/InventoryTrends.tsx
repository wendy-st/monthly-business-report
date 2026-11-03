import { Card, Empty, Segmented, theme } from "antd";
import { useState } from "react";
import { ReportChart } from "../../shared/report/ReportChart";
import type { InventoryView } from "./contracts";
import { InventoryTurnoverDetails } from "./InventoryTurnoverDetails";
import { turnoverOption, holdingOption } from "./inventory-chart-options";
import { format } from "./presentation";

export function InventoryTrends({
  data,
  overview,
}: {
  data: InventoryView;
  overview: boolean;
}) {
  const [basis, setBasis] = useState("days_purchase");
  const { token } = theme.useToken();
  const sharedMax =
    Math.max(
      1,
      ...data.turnover
        .filter((row) => !row.label.endsWith("YTD"))
        .flatMap((row) => [
          Number(row.values.days_qty ?? 0),
          Number(row.values[basis] ?? 0),
        ]),
    ) * 1.12;
  return (
    <>
      <section className="inventory-section">
        {overview && (
          <h2 className="inventory-section-title">
            <b>3</b>库存周转
          </h2>
        )}
        <div className="two-column inventory-turnover-grid">
          {[
            ["days_qty", "数量周转天数（2025—2026年同期对比）"],
            [
              basis,
              `金额周转天数（${basis === "days_purchase" ? "不含" : "含"}头程）`,
            ],
          ].map(([field, title]) => (
            <Card
              key={field}
              title={title}
              size="small"
              styles={{ header: { minHeight: 52 }, title: { fontSize: 16 } }}
              extra={
                field !== "days_qty" && (
                  <Segmented
                    aria-label="库存金额口径"
                    value={basis}
                    onChange={setBasis}
                    options={[
                      { value: "days_purchase", label: "不含头程" },
                      { value: "days_amount", label: "含头程" },
                    ]}
                  />
                )
              }
            >
              <div
                className="inventory-turnover-chart-scroll"
                tabIndex={0}
                role="region"
                aria-label={`${title}，可横向滚动`}
              >
                <ReportChart
                  sample={false}
                  summary={data.turnover
                    .filter((row) => !row.label.endsWith("YTD"))
                    .map(
                      (row) =>
                        `${row.dimensions.scope} ${row.label}：${format(row.values[field], 1)}天`,
                    )
                    .join("；")}
                  option={turnoverOption(data.turnover, field, sharedMax)}
                />
              </div>
            </Card>
          ))}
        </div>
        {overview && <InventoryTurnoverDetails data={data} overview />}
      </section>
      <section className="inventory-section">
        {overview && (
          <h2 className="inventory-section-title">
            <b>4</b>未来库存趋势
          </h2>
        )}
        <Card
          title="未来库存可支持天数趋势"
          size="small"
          className="inventory-future-panel"
        >
          {data.future.length ? (
            <>
              <div className="inventory-future-alerts">
                {["所有仓库", "FBA+海外仓"].map((scope) => (
                  <div key={scope}>
                    <strong>{scope}</strong>
                    {["需求+15%", "基础", "需求-15%"].map((scenario) => {
                      const rows = data.future.filter(
                        (row) =>
                          row.scope === scope && row.scenario === scenario,
                      );
                      const shortage = rows.find(
                        (row) =>
                          row.support_days !== null &&
                          Number(row.support_days) < row.calendar_days,
                      );
                      const missing = rows.some(
                        (row) => row.support_days === null,
                      );
                      return (
                        <span key={scenario}>
                          {scenario}：
                          {missing
                            ? "预测数据缺失"
                            : shortage
                              ? `${shortage.month}可覆盖${format(shortage.support_days, 1)}天`
                              : "有效预测窗口内尚未耗尽"}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
              {["所有仓库", "FBA+海外仓"].map((scope) => (
                <div key={scope} className="inventory-holding-chart">
                  <h3>{scope}可覆盖天数 · 实色为基准，浅色为±15%区间</h3>
                  <ReportChart
                    sample={false}
                    option={holdingOption(
                      data.future,
                      scope,
                      scope === "所有仓库"
                        ? token.colorInfo
                        : token.colorPrimary,
                    )}
                    summary={data.future
                      .filter((row) => row.scope === scope)
                      .map(
                        (row) =>
                          `${row.month} ${row.scenario}：${format(row.support_days, 1)}天，月末余${format(row.remaining, 0)}件`,
                      )
                      .join("；")}
                  />
                </div>
              ))}
            </>
          ) : (
            <Empty description="当前筛选无有效未来销量预测" />
          )}
          <p className="sample-note">
            面积覆盖：按月初剩余库存折算当月可覆盖天数；误差区间±15%；不计未来新增补货。
          </p>
        </Card>
      </section>
    </>
  );
}
