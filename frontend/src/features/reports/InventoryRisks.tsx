import type { ReactNode } from "react";
import { Card, Empty, Tag } from "antd";
import type { InventoryView } from "./contracts";
import { InventoryChange } from "./InventoryChange";
import { InventoryDiagnosis } from "./InventoryDiagnosis";
import { format, percent } from "./presentation";

export function InventoryRisks({ data }: { data: InventoryView }) {
  const group = data.seasonal_group;
  return (
    <section className="inventory-section">
      <h2 className="inventory-section-title">小组库存状况分析</h2>
      {!group ? (
        <Empty description="当前筛选没有可分析的在售库存记录" />
      ) : (
        <Card
          title={
            group.dimensions.group === "薄底水鞋"
              ? "薄底水鞋US"
              : `${group.dimensions.group}组`
          }
          size="small"
          className="inventory-season-card"
          extra={
            <div className="inventory-season-badges">
              <Tag>
                {group.risk.phase} ·{" "}
                {group.risk.peak_month
                  ? `峰值${Number(group.risk.peak_month.slice(-2))}月`
                  : "峰值未确定"}
              </Tag>
              <span>提示LISTING {group.values.flagged_listings}</span>
              <span>提示款式 {group.values.flagged_styles}</span>
            </div>
          }
        >
          <div className="inventory-season-metrics">
            {(
              [
                ["库存资金", `${format(group.values.amount, 2, 10000)}万`],
                ["库存数量", `${format(group.values.quantity, 0)}件`],
                ["周转天数", `${format(group.values.days_qty, 1)}天`],
                [
                  "环比 / 同比",
                  <>
                    <InventoryChange value={group.values.mom_days_qty} /> /{" "}
                    <InventoryChange value={group.values.yoy_days_qty} />
                  </>,
                ],
                ["FBA＋海外仓预测覆盖率", percent(group.values.coverage)],
                [
                  "滚动扣减结果",
                  group.exhaustion
                    ? `预计${group.exhaustion}耗尽`
                    : `窗口末余${format(group.values.remaining, 0)}件`,
                ],
              ] satisfies [string, ReactNode][]
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="inventory-season-conclusions">
            {group.conclusions.map((line) => (
              <p key={line}>
                <InventoryDiagnosis text={line} />
              </p>
            ))}
          </div>
          <p className="inventory-season-core">
            <strong>核心结论</strong>
            {group.core_conclusion}
          </p>
        </Card>
      )}
    </section>
  );
}
