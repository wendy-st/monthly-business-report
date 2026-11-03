import { Card } from "antd";
import type { MetricRow } from "./contracts";
import { format, percent } from "./presentation";

export function ProductMatrix({
  rows,
  title,
  cost = false,
  rankByGross = false,
}: {
  rows: MetricRow[];
  title: string;
  cost?: boolean;
  rankByGross?: boolean;
}) {
  const fields = cost
    ? [
        "purchase_rate",
        "freight_rate",
        "other_cost_rate",
        "gross_margin",
        "fulfillment_expense_rate",
        "operating_margin",
        "marketing_expense_rate",
        "margin",
      ]
    : ["revenue", "gross_margin", "profit", "margin"];
  const names: Record<string, string> = {
    revenue: "销售额（万元）",
    profit: "净利润（万元）",
    gross_margin: "毛利率",
    purchase_rate: "销售成本率",
    freight_rate: "头程费率",
    other_cost_rate: "其他成本率",
    fulfillment_expense_rate: "FBA费用&海外仓费用率",
    operating_margin: "产品营业利润率",
    marketing_expense_rate: "营销推广费用率",
    margin: "净利率",
  };
  const displayed = rows.filter((row) => row.record_count > 0);
  if (rankByGross) {
    displayed.sort((left, right) => {
      const a = left.current.gross_margin;
      const b = right.current.gross_margin;
      if (a == null) return b == null ? 0 : 1;
      if (b == null) return -1;
      return Number(b) - Number(a);
    });
  }
  return (
    <Card
      title={title}
      size="small"
      className={`cost-matrix-card${rankByGross ? " product-matrix-ranked" : ""}`}
      extra={
        rankByGross ? (
          <span className="product-matrix-note">
            毛利率降序 · 共{displayed.length}项
            {displayed.length > 10 ? "，首屏10项，向下滚动查看更多" : ""}
          </span>
        ) : undefined
      }
      classNames={{
        header: "category-card-heading",
        body: "category-card-body",
      }}
    >
      <div
        className="report-table-scroll"
        role="region"
        aria-label={`${title}数据`}
        tabIndex={0}
      >
        <table className="report-table product-matrix">
          <thead>
            <tr>
              <th>范围</th>
              {fields.map((key) => (
                <th
                  key={key}
                  scope="col"
                  title={
                    key === "fulfillment_expense_rate"
                      ? "毛利率－产品营业利润率；含其他站内费用并抵减FBA赔偿，保留费用冲回符号。"
                      : undefined
                  }
                >
                  {names[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                {fields.map((key) => (
                  <td
                    key={key}
                    className={
                      (key === "purchase_rate" &&
                        Number(row.current[key]) > 0.45) ||
                      (key === "freight_rate" &&
                        Number(row.current[key]) > 0.15)
                        ? "cost-heat"
                        : ""
                    }
                  >
                    {key === "revenue" || key === "profit"
                      ? format(row.current[key], 2, 10000)
                      : percent(row.current[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
