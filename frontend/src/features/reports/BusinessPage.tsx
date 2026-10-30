import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Select, Skeleton } from "antd";
import { query, useReport } from "./api";
import type { BasisAnalysis, Filters } from "./contracts";
import type { BusinessView } from "./business-contracts";
import { MetricCards } from "../../shared/report/MetricCards";
import { metrics } from "./presentation";
import { HistoryPanel } from "./HistoryPanel";
import { BusinessCharts } from "./BusinessCharts";
import { BusinessWaterfall } from "./BusinessWaterfall";
import { BusinessPriceMatrix } from "./BusinessPriceMatrix";
import { BusinessCosts } from "./BusinessCosts";
import { BusinessListings } from "./BusinessListings";
import { compareBusinessSites } from "./business-presentation";

export function BusinessPage({ group }: { group: string }) {
  const initial = { group, ...(group === "KAYO-欧日" ? { site: "JP" } : {}) };
  const [filters, setFilters] = useState<Filters>(initial);
  const [tab, setTab] = useState("current");
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = document.querySelector(".report-header");
    if (!header) return;
    const observer = new ResizeObserver(() =>
      page.current?.style.setProperty(
        "--business-header-height",
        `${header.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const request = useReport<BusinessView>(
    `financial?${query({ ...filters, view: "business" })}`,
  );
  const costs = useReport<BasisAnalysis[]>(`costs?${query(filters)}`);
  const data = request.data;
  const details = data?.business;
  const sites = [
    ...(details?.site_options ?? ["", ...(filters.site ? [filters.site] : [])]),
  ].sort((a, b) => (group === "KAYO-欧日" ? 0 : compareBusinessSites(a, b)));
  const listings = [...(details?.listing_options ?? [])].sort((a, b) =>
    compareBusinessSites(a.site, b.site),
  );
  return (
    <div className="section-stack business-page" ref={page}>
      <div className="business-view-tabs" aria-label="业务组视图">
        {[
          ["current", "当月经营概况"],
          ["history", "近6年LISTING盈收趋势"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "history" ? (
        <HistoryPanel filters={{ group }} />
      ) : (
        <>
          <Card size="small" className="business-filters">
            <label>
              站点
              <Select
                aria-label="业务组站点"
                virtual={false}
                value={filters.site || ""}
                options={sites.map((site) => ({
                  value: site,
                  label: site || "全部范围",
                }))}
                onChange={(site) => setFilters({ group, site })}
              />
            </label>
            <label>
              LISTING
              <Select
                aria-label="业务组LISTING"
                virtual={false}
                showSearch
                optionFilterProp="label"
                value={
                  filters.listing
                    ? `${filters.listing_site}::${filters.listing}`
                    : ""
                }
                options={[
                  { value: "", label: "全部LISTING" },
                  ...listings.map((row) => ({
                    value: `${row.site}::${row.listing}`,
                    label: `${row.site}/${row.listing}`,
                  })),
                ]}
                onChange={(value) => {
                  const [listing_site, ...parts] = value.split("::");
                  setFilters({
                    group,
                    site: filters.site || "",
                    listing_site: value ? listing_site : "",
                    listing: parts.join("::"),
                  });
                }}
              />
            </label>
          </Card>
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
              <Card
                title={`${group === "薄底水鞋" ? "薄底水鞋US" : `${group}组`}经营表现`}
                size="small"
                className="business-kpi-panel"
                styles={{ header: { marginBottom: 24 } }}
              >
                <MetricCards
                  metrics={metrics(data.summary).map((item) => ({
                    ...item,
                    title: item.title
                      .replace("净销量", "销量")
                      .replace("净销售额", "销售额"),
                    previous: item.title.includes("万元")
                      ? `${item.previous}万`
                      : item.previous,
                    yearAgo: item.title.includes("万元")
                      ? `${item.yearAgo}万`
                      : item.yearAgo,
                  }))}
                  caption={details?.scope || group}
                  showArrows
                />
              </Card>
              {data.summary.status === "NO_RECORD" ? (
                <Empty description="当前筛选无记录，请选择其他站点或LISTING。" />
              ) : (
                <>
                  <BusinessCharts data={data} />
                  <BusinessWaterfall data={data} costs={costs.data} />
                  <BusinessPriceMatrix rows={data.business.listings} />
                  {costs.error && (
                    <Alert
                      type="error"
                      title={costs.error}
                      action={
                        <Button onClick={costs.retry}>重试费用分析</Button>
                      }
                    />
                  )}
                  {!costs.data && !costs.error && (
                    <Skeleton active paragraph={{ rows: 5 }} />
                  )}
                  {costs.data && (
                    <BusinessCosts data={costs.data} details={data.business} />
                  )}
                  <BusinessListings
                    details={data.business}
                    selected={Boolean(filters.listing)}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
