import { inventoryColors, reportColors } from "../../theme/seekway-antd-theme";
import { format } from "./presentation";

export function InventoryChange({
  value,
  highlight = false,
}: {
  value: string | null | undefined;
  highlight?: boolean;
}) {
  if (value == null) return <>—</>;
  const amount = Number(value);
  const color = amount > 0 ? reportColors.danger : reportColors.success;
  const background =
    amount > 0
      ? inventoryColors.deteriorationBg
      : inventoryColors.improvementBg;
  return (
    <span
      style={{
        color: amount === 0 ? undefined : color,
        background: highlight && amount !== 0 ? background : undefined,
      }}
    >
      {amount >= 0 ? "↑" : "↓"} {format(String(Math.abs(amount)), 1)}天
    </span>
  );
}
