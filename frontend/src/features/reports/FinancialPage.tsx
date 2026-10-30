import { useState } from "react";
import { Alert, Button, Card, Empty, Skeleton } from "antd";
import { MetricCards } from "../../shared/report/MetricCards";
import { query, useReport } from "./api";
import type { BasisAnalysis, Filters, FinancialView } from "./contracts";
import { FinancialFilters } from "./FinancialFilters";
import { FinancialCharts } from "./FinancialCharts";
import { ProfitBridge } from "./ProfitBridge";
import { ProductDashboard } from "./ProductDashboard";
import { ReportTable } from "./ReportTable";
import { OverviewBreakdowns } from "./OverviewBreakdowns";
import { ShopOperation } from "./ShopOperation";
import { format, metrics, percent } from "./presentation";

export function FinancialPage({
  kind,
  group = "",
}: {
  kind: "overview" | "products";
  group?: string;
}) {
  const [filters, setFilters] = useState<Filters>({ group });
  const [comparison, setComparison] = useState("mom");
  const [basis, setBasis] = useState("actual");
  const selection = {
    comparison,
    basis,
    onComparison: setComparison,
    onBasis: setBasis,
  };
  const resource = query(filters);
  const request = useReport<FinancialView>(
    `financial?${query({ ...filters, view: kind })}`,
  );
  const costs = useReport<BasisAnalysis[]>(`costs?${resource}`);
  const data = request.data;
  const product = kind === "products";
  return (
    <div
      className={`section-stack ${kind === "overview" ? "overview-page" : "product-page"}`}
    >
      {product && (
        <div className="product-head">
          <div>
            <h2 className="section-heading">3. 产品经营分析</h2>
            <span>按小组、站点、LISTING与款式诊断盈利、成本和退款影响。</span>
          </div>
          <span>粒度包含完整三级品类路径</span>
        </div>
      )}
      {kind !== "overview" && (
        <FinancialFilters
          filters={filters}
          options={data?.options ?? {}}
          product={product}
          fixedGroup={false}
          onChange={setFilters}
        />
      )}
      <>
        {request.error && (
          <Alert
            type="error"
            showIcon
            title={request.error}
            action={<Button onClick={request.retry}>重试</Button>}
          />
        )}
        {!data && !request.error && (
          <Skeleton active paragraph={{ rows: 12 }} />
        )}
        {data && (
          <>
            {data.warnings.map((message) => (
              <Alert key={message} type="warning" title={message} showIcon />
            ))}
            {kind === "overview" && (
              <Card
                title="本月经营结论"
                size="small"
                className="conclusion-card"
              >
                <ul className="conclusion-list">
                  <li>
                    9月净销售额
                    {format(data.summary.current.revenue, 2, 10000)}
                    万元，净利润
                    {format(data.summary.current.profit, 2, 10000)}
                    万元，净利率{percent(data.summary.current.margin)}。
                  </li>
                  <li>
                    净销售额环比{data.summary.changes.revenue_mom}、同比
                    {data.summary.changes.revenue_yoy}；净利润环比
                    {data.summary.changes.profit_mom}、同比
                    {data.summary.changes.profit_yoy}。
                  </li>
                </ul>
              </Card>
            )}
            {product && (
              <div className="product-groups">
                {["", ...data.options.group].map((name) => (
                  <Button
                    key={name}
                    size="small"
                    type={
                      (filters.group || "") === name ? "primary" : "default"
                    }
                    onClick={() => setFilters({ group: name })}
                  >
                    {name || "全部小组"}
                  </Button>
                ))}
              </div>
            )}
            {!product && (
              <MetricCards
                metrics={metrics(data.summary)}
                showArrows={kind === "overview"}
              />
            )}
            {data.summary.status === "NO_RECORD" ? (
              <Empty description="当前筛选没有本期记录，可重置筛选；比较期金额仍在三期卡片中保留。" />
            ) : (
              <>
                {!product && <FinancialCharts data={data} />}
                {!product && (
                  <ProfitBridge
                    overview={kind === "overview"}
                    data={data}
                    costs={costs.data}
                    selection={selection}
                    scope={
                      [filters.group, filters.site, filters.listing]
                        .filter(Boolean)
                        .join(" / ") || "公司整体"
                    }
                  />
                )}
                {costs.error && (
                  <Alert
                    type="error"
                    title={costs.error}
                    action={<Button onClick={costs.retry}>重试费用分析</Button>}
                  />
                )}
                {product ? (
                  <ProductDashboard data={data} costs={costs.data} />
                ) : kind === "overview" && data.overview ? (
                  <>
                    <OverviewBreakdowns data={data.overview} />
                    <ShopOperation data={data.overview} />
                  </>
                ) : (
                  <>
                    <div
                      className={
                        kind === "overview" ? "section-stack" : "two-column"
                      }
                    >
                      <ReportTable
                        title="业务组经营占比"
                        rows={data.breakdowns.groups}
                      />
                      <ReportTable
                        title="站点经营表现"
                        rows={data.breakdowns.sites}
                      />
                    </div>
                    <ReportTable
                      title="三级品类经营表现"
                      rows={data.breakdowns.category3}
                    />
                    <ReportTable
                      title="LISTING经营明细"
                      rows={data.breakdowns.listings}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </>
    </div>
  );
}
