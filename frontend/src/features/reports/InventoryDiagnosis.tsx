import { Fragment } from "react";
import { reportColors } from "../../theme/seekway-antd-theme";

export function InventoryDiagnosis({ text }: { text: string }) {
  return text.split("；").map((part, index) => (
    <Fragment key={index}>
      {index > 0 && "；"}
      <span
        style={
          part.startsWith("库存冗余：")
            ? { color: reportColors.danger, fontWeight: 700 }
            : part.startsWith("整体库存正常")
              ? { color: reportColors.primary }
              : undefined
        }
      >
        {part}
      </span>
    </Fragment>
  ));
}
