import { useMemo, useState } from "react";
import { Card, Empty, Typography } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import { reportColors } from "../../theme/seekway-antd-theme";
import type { FinancialView, Filters } from "./contracts";
import type { ProductRefundView } from "./product-contracts";
import { query, useReport } from "./api";
import { ProductRefunds } from "./ProductRefunds";
import { ProductMatrix } from "./ProductMatrix";
import { ProductDetails } from "./ProductDetails";
import {
  ProductCostRates,
  ProductCostTrends,
  ProductCostConclusion,
} from "./ProductCostAnalysis";
import { format } from "./presentation";

export function ProductDashboard({
  data,
  filters,
  minSales,
  onMinSalesChange,
}: {
  data: FinancialView;
  filters: Filters;
  minSales: number;
  onMinSalesChange: (value: number) => void;
}) {
  const [comparison, setComparison] = useState("mom");
  const refunds = useReport<ProductRefundView>(
    `product-refunds?${query({ ...filters, min_sales: String(minSales) })}`,
  );
  const rows = useMemo(
    () => data.breakdowns.styles.filter((row) => row.record_count > 0),
    [data],
  );
  const losses = [...rows]
    .filter(
      (row) => row.current.profit !== null && Number(row.current.profit) < 0,
    )
    .sort(
      (left, right) =>
        Number(left.current.profit) - Number(right.current.profit),
    )
    .slice(0, 10);
  return (
    <>
      <h2 className="section-heading">
        <span>
          一、最终盈亏结果
          <small>毛利判断产品成本，净利判断费用后的最终结果。</small>
        </span>
      </h2>
      <div className="three-col-grid">
        <ProductMatrix
          title="一级品类盈利矩阵"
          rows={data.breakdowns.categories}
        />
        <Card
          title="毛利率 × 净利率诊断"
          size="small"
          classNames={{
            header: "category-card-heading",
            body: "category-card-body",
          }}
        >
          <ReportChart
            sample={false}
            summary={`当前${rows.length}条本期款式，横轴毛利率，纵轴净利率，单位%。来源：经营底表。`}
            option={{
              tooltip: { trigger: "item", formatter: "{b}" },
              color: [reportColors.primary, reportColors.chartRed],
              legend: { data: ["盈利", "亏损"], top: "auto", bottom: 0 },
              grid: { left: 48, right: 20, top: 44, bottom: 55 },
              xAxis: { type: "value", name: "毛利率%" },
              yAxis: { type: "value", name: "净利率%" },
              series: ["盈利", "亏损"].map((name) => ({
                name,
                type: "scatter",
                symbol: name === "盈利" ? "circle" : "triangle",
                symbolSize: 8,
                data: rows
                  .filter(
                    (row) =>
                      row.current.profit !== null &&
                      row.current.gross_margin !== null &&
                      row.current.margin !== null &&
                      Number(row.current.profit) >= 0 === (name === "盈利"),
                  )
                  .map((row) => ({
                    name: row.label,
                    value: [
                      Number(row.current.gross_margin) * 100,
                      Number(row.current.margin) * 100,
                    ],
                  })),
              })),
            }}
          />
        </Card>
        <Card
          title="亏损款式 TOP10"
          size="small"
          classNames={{
            header: "category-card-heading",
            body: "category-card-body",
          }}
        >
          {losses.length ? (
            <ol className="ranking-list">
              {losses.map((row) => (
                <li key={row.key}>
                  <div>
                    <strong title={row.label}>{row.dimensions.style}</strong>
                    <Typography.Text type="secondary">
                      {row.dimensions.group} · {row.dimensions.site}/
                      {row.dimensions.listing}
                    </Typography.Text>
                  </div>
                  <span className="loss-track">
                    <i
                      style={{
                        width: `${Math.abs(Number(row.current.profit) / Number(losses[0].current.profit)) * 100}%`,
                      }}
                    />
                  </span>
                  <Typography.Text type="danger">
                    {format(row.current.profit, 2, 10000)}万
                  </Typography.Text>
                </li>
              ))}
            </ol>
          ) : (
            <Empty description="当前范围没有亏损款式" />
          )}
        </Card>
      </div>
      <h2 className="section-heading">
        <span>
          二、产品成本与毛利诊断
          <small>成本率与利润均由后端按当前范围核算。</small>
        </span>
      </h2>
      <ProductMatrix
        title="一级品类产品毛利成本矩阵"
        rows={data.breakdowns.categories}
        cost
      />
      <ProductMatrix
        title="二级品类产品毛利成本矩阵"
        rows={data.breakdowns.category2}
        cost
        rankByGross
      />
      <ProductMatrix
        title="三级品类产品毛利成本矩阵"
        rows={data.breakdowns.category3}
        cost
        rankByGross
      />
      <div className="three-col-grid cost-comparison-grid">
        {data.product && (
          <ProductCostRates
            data={data.product}
            comparison={comparison}
            onChange={setComparison}
          />
        )}
        {data.product && <ProductCostTrends data={data.product} />}
        <ProductRefunds
          rows={rows}
          minSales={minSales}
          onChange={onMinSalesChange}
          analysis={refunds.data}
          error={refunds.error}
          retry={refunds.retry}
        />
      </div>
      {data.product && (
        <ProductCostConclusion data={data.product} comparison={comparison} />
      )}
      <h2 className="section-heading">三、款式盈利 &amp; 成本诊断明细</h2>
      <ProductDetails
        rows={rows}
        contexts={data.product?.contexts ?? {}}
        refunds={refunds.data}
        refundError={refunds.error}
      />
    </>
  );
}
