import { useState } from "react";
import { Card } from "antd";
import { BusinessToggle } from "./BusinessControls";
import type { BasisAnalysis } from "./contracts";
import type { BusinessView } from "./business-contracts";
import { ReportChart } from "../../shared/report/ReportChart";
import { IncomeProfitConversion } from "./IncomeProfitConversion";
import { waterfallOption } from "./waterfall-option";
import { format } from "./presentation";

export function BusinessWaterfall({
  data,
  costs,
}: {
  data: BusinessView;
  costs?: BasisAnalysis[];
}) {
  const [mode, setMode] = useState("mom");
  const steps = data.waterfall[mode];
  return (
    <Card
      size="small"
      className="profit-waterfall business-waterfall"
      title={
        <div className="waterfall-heading">
          <span>净利润分析瀑布图</span>
          <BusinessToggle
            label="业务组利润比较期间"
            value={mode}
            onChange={setMode}
            options={[
              { value: "mom", label: "环比" },
              { value: "yoy", label: "同比" },
            ]}
          />
        </div>
      }
    >
      <p className="sample-note">
        当前口径：{data.business.scope}；
        {mode === "mom" ? "环比 · 对比期 2026-08" : "同比 · 对比期 2025-09"}
      </p>
      {steps.every((step) => step.amount !== null) ? (
        <div className="waterfall-plot">
          <ReportChart
            sample={false}
            option={waterfallOption(steps, mode)}
            summary={
              steps
                .map((step) => `${step.label}：${format(step.amount)}元`)
                .join("；") + "。来源：经营底表；单位人民币元。"
            }
          />
        </div>
      ) : (
        <p role="status">存在缺失金额，暂不能绘制利润瀑布图。</p>
      )}
      <IncomeProfitConversion
        analyses={costs?.filter((item) => item.comparison === mode) ?? []}
        activeBasis="actual"
        changes={data.business.conversion[mode]}
      />
      <ol className="business-conclusions" aria-label="业务组经营分析结论">
        {data.business.conclusions[mode]?.map((item) => (
          <li key={item.label}>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
