import { useState } from "react";
import { Card, Select } from "antd";
import { costMatrixPreview, type Product } from "./fixtures";
import { formatNumber } from "../../shared/report/format";

export function CostRateComparison({ rows }: { rows: Product[] }) {
  const [period, setPeriod] = useState("环比");
  const matrix = costMatrixPreview(rows, "group");
  return (
    <Card
      title="三项成本率对比"
      size="small"
      extra={
        <Select
          aria-label="成本比较方式"
          size="small"
          value={period}
          onChange={setPeriod}
          options={["环比", "同比"].map((value) => ({ value, label: value }))}
        />
      }
    >
      {(["cost", "freight"] as const).map((key, index) => (
        <div className="cost-rate-section" key={key}>
          <h4>{index === 0 ? "销售成本率" : "头程费率"}</h4>
          {matrix.map((row) => (
            <div className="cost-rate-row" key={row.name}>
              <span>{row.name}</span>
              <span className="share-track">
                <i style={{ width: `${row[key]}%` }} />
              </span>
              <strong>{formatNumber(row[key])}%</strong>
            </div>
          ))}
        </div>
      ))}
      <div className="cost-rate-section">
        <h4>其他成本率</h4>
        <p>当前合成记录为0.00%。</p>
      </div>
      <p className="sample-note">
        当前值为合成样例；{period}差异及退款拆解待接入。
      </p>
    </Card>
  );
}
