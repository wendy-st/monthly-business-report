import { useEffect, useRef, useState } from "react";
import { Popover } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";

// 沿用原9月报告的批注；公式文字只解释后端结果，不参与核算。
const formulas = {
  basis_price_adjusted:
    "剔价口径：本期保持实际；对比期按LISTING重算。标准化毛销售额 = 对比期毛销量 × 可比售价 × 本期汇率，再扣除按本期汇率换算的对比期退款。可比售价优先取本期售价，本期无有效售价时取该对比期自身售价。人民币成本保持原值，外币平台费用按本期汇率换算。该口径剔除售价和汇率差异，但保留退款影响。",
  basis_price_refund_adjusted:
    "剔价剔退款口径：在剔价基础上，本期与对比期收入都改用不扣退款的毛销售额；销售成本、头程费用按净销量单位成本补回退货数量对应成本；FBA佣金按80%退款返佣规则还原；其余费用不做退款还原，对比期外币费用仍按本期汇率换算。该口径用于观察同时剔除售价、汇率和退款影响后的变化。",
  expense_change_rate:
    "费用变化率 =（本期费用 - 对比期费用）÷ 对比期费用。表示费用金额自身增减了多少。",
  sales_change_rate:
    "收入变化率 =（本期收入 - 对比期收入）÷ 对比期收入。不同口径会使用对应的实际、剔价或剔价剔退款收入。",
  expense_elasticity:
    "费用弹性 = 费用变化率 ÷ 收入变化率。绝对值越大，表示费用对收入变化越敏感；正负号表示变化方向是否一致。",
  expense_rate_delta:
    "费用率变化 = 本期费用 ÷ 本期收入 - 对比期费用 ÷ 对比期收入。单位为百分点（pp）。",
  profit_impact:
    "理论费用 = 对比期费用 ×（1 + 收入变化率）；单项利润影响 = 理论费用 - 本期实际费用。正数表示节省费用、增加利润，负数表示费用超出理论值、压低利润。",
  scale_profit_effect:
    "收入规模利润影响 = 对比期净利润 × 收入变化率。表示只考虑收入规模变化时，对利润的影响。",
  seven_cost_impact:
    "7项费用合计 = 7项费用各自的利润影响之和。单项利润影响 = 理论费用 - 本期实际费用。",
  other_profit_impact:
    "其他经营项目 = 净利润变化 - 收入规模利润影响 - 7项费用合计。用于承接未列入7项费用的其他利润变化。",
  net_profit_delta:
    "净利润变化 = 本期净利润 - 对比期净利润，并满足：收入规模利润影响 + 7项费用合计 + 其他经营项目。",
  business_item_change:
    "项目金额变化率 =（本期金额 - 对比期金额）÷ 对比期金额。赔偿收入为收入项，成本冲回保留负号；对比期金额不为正时不计算变化率。",
  business_profit_impact:
    "理论金额 = 对比期金额 × 本期收入 ÷ 对比期收入。成本费用的利润影响 = 理论金额 - 本期金额；收入项的利润影响 = 本期金额 - 理论金额。正数增加利润，负数减少利润；成本冲回保留符号。所有金额均使用当前选中的实际、剔价或剔价剔退款口径。",
  business_items_impact:
    "11项收支净影响 = 10项成本费用及1项FBA赔偿收入的利润影响合计。赔偿收入不按费用方向相加，已列明项目不再重复计入其他经营项目。",
  business_net_profit_delta:
    "当前口径净利润变化 = 本期净利润 - 对比期净利润 = 收入规模利润影响 + 11项收支净影响。剔价和剔价剔退款使用对应口径的收入、费用和利润，不代表账面实际利润变化。",
} as const;

export function FormulaHelp({
  name,
  label,
}: {
  name: keyof typeof formulas;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <Popover
      content={<div className="formula-help-content">{formulas[name]}</div>}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
    >
      <button
        ref={button}
        type="button"
        className="formula-help-button"
        aria-label={label}
        aria-expanded={open}
      >
        <QuestionCircleOutlined aria-hidden />
      </button>
    </Popover>
  );
}
