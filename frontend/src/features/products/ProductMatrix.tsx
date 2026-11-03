import { Card } from "antd";
import { costMatrixPreview, type Product } from "./fixtures";
import { formatNumber } from "../../shared/report/format";

export function ProductMatrix({ rows }: { rows: Product[] }) {
  const matrix = costMatrixPreview(rows, "category1");
  return (
    <Card title="一级品类盈利矩阵" size="small">
      <div className="report-table-scroll">
        <table className="report-table product-matrix">
          <thead>
            <tr>
              {[
                "一级品类",
                "销售额",
                "毛利率",
                "净利润",
                "净利率",
                "款式数",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{formatNumber(row.revenue / 10000)}万</td>
                <td className="positive">{formatNumber(row.gross)}%</td>
                <td className={row.profit < 0 ? "negative" : "positive"}>
                  {formatNumber(row.profit / 10000)}万
                </td>
                <td className={row.margin < 0 ? "negative" : "positive"}>
                  {formatNumber(row.margin)}%
                </td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function CostMatrix({
  rows,
  dimension,
  title,
}: {
  rows: Product[];
  dimension: "category1" | "category2" | "category3";
  title: string;
}) {
  const matrix = costMatrixPreview(rows, dimension);
  return (
    <Card title={title} size="small" className="cost-matrix-card">
      <div className="report-table-scroll">
        <table className="report-table product-matrix">
          <thead>
            <tr>
              {[
                dimension === "category1"
                  ? "一级品类"
                  : dimension === "category2"
                    ? "二级品类"
                    : "三级品类",
                "毛利率",
                "销售成本率",
                "头程费率",
                "其他成本率",
                "产品营业利润率",
                "营销推广费用率",
                "净利率",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{formatNumber(row.gross)}%</td>
                <td className="cost-heat">{formatNumber(row.cost)}%</td>
                <td className="cost-heat">{formatNumber(row.freight)}%</td>
                <td>0.00%</td>
                <td>—</td>
                <td>—</td>
                <td>{formatNumber(row.margin)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
