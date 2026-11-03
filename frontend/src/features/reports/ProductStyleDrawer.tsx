import { Button, Descriptions, Drawer } from "antd";
import type { MetricRow } from "./contracts";
import type { ProductStyleContext } from "./product-contracts";
import { format, percent } from "./presentation";

export function ProductStyleDrawer({
  selected,
  context,
  onClose,
}: {
  selected?: MetricRow;
  context?: ProductStyleContext;
  onClose: () => void;
}) {
  return (
    <Drawer
      title={selected?.label || "款式明细"}
      open={!!selected}
      width="min(100%, 1080px)"
      onClose={onClose}
    >
      {selected && (
        <div className="section-stack">
          <Descriptions
            bordered
            column={2}
            items={[
              {
                key: "sales",
                label: "净销售额（人民币元）",
                children: format(selected.current.revenue),
              },
              {
                key: "profit",
                label: "净利润（人民币元）",
                children: format(selected.current.profit),
              },
              {
                key: "gross",
                label: "毛利率",
                children: percent(selected.current.gross_margin),
              },
              {
                key: "diagnosis",
                label: "相对诊断",
                children: selected.diagnosis,
              },
              {
                key: "basis",
                label: "诊断基准",
                children:
                  context?.benchmark == null
                    ? "待核验"
                    : `${context.basis}：${percent(context.benchmark)}`,
              },
              {
                key: "quantity",
                label: "本期销售数量（件）",
                children: format(selected.current.sales_qty, 0),
              },
              {
                key: "refund",
                label: "原始退款率",
                children: percent(selected.current.refund_rate),
              },
              {
                key: "source",
                label: "经营底表来源行",
                children: selected.source_rows.join("、"),
              },
            ]}
          />
          <p>退款率＝退款金额绝对值 ÷ 销售金额。低销量样本的原始值仅供核验。</p>
          <Button onClick={onClose}>关闭明细</Button>
        </div>
      )}
    </Drawer>
  );
}
