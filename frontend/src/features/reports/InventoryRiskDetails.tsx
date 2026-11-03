import { useState } from "react";
import { Card } from "antd";
import type { InventoryView } from "./contracts";
import { InventoryRiskTable } from "./InventoryRiskTable";
import { ReportTabs } from "../../shared/report/ReportTabs";

export function InventoryRiskDetails({ data }: { data: InventoryView }) {
  const [view, setView] = useState("listing");
  if (!data.seasonal_group) return null;
  return (
    <section className="inventory-section">
      <h2 className="inventory-section-title">LISTING／款式库存明细</h2>
      <Card size="small" className="inventory-season-details">
        <div className="inventory-season-toolbar">
          <ReportTabs
            label="库存风险视图"
            value={view}
            onChange={setView}
            options={[
              { value: "listing", label: "LISTING" },
              { value: "style", label: "款式" },
            ]}
          />
          <span>
            先列有提示项目，再按库存资金排序
            {view === "style" ? "；展开查看SKU" : ""}
          </span>
        </div>
        <p className="sample-note">
          本地仓发货满足率＝本地可用库存预测可覆盖天数÷总发货天数；保底满足率＝三仓合计库存预测可覆盖天数÷保底下单天数。
          LISTING、款式分别汇总库存和预测核算；各项标准仅按有填写的去重SKU等权平均向上取整，空白不参与计算，≥表示覆盖下限。
          两项满足率均超过150%判定库存冗余；库龄仅统计FBA在库，同步状态异常的FBA记录不计入库存。
          仅展示维护／新品LISTING，零库存SKU隐藏明细。
        </p>
        <InventoryRiskTable
          rows={view === "style" ? data.seasonal_styles : data.seasonal}
          style={view === "style"}
        />
      </Card>
    </section>
  );
}
