import { Alert, Button, Card, Empty, Skeleton, Tag } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { query, useReport } from "./api";
import type { InventoryRow, MetricRow } from "./contracts";
import { format } from "./presentation";
import "../../styles/listing-issues.css";

export type ListingIssue = {
  key: string;
  title: string;
  detail: string;
  status: "关注" | "待核查" | "未见异常";
};
export type ListingItem = {
  key: string;
  group: string;
  site: string;
  listing: string;
  position: string;
  mode: "full" | "promotion" | "retired" | "mx";
  business: MetricRow | null;
  inventory: InventoryRow;
  issues: ListingIssue[];
};
export type ListingView = {
  items: ListingItem[];
  excluded_sites: string[];
  source_note: string;
};

function ListingCard({ item }: { item: ListingItem }) {
  const amounts = item.business?.current ?? {};
  const retired = item.mode === "retired";
  const hasCurrent = (item.business?.record_count ?? 0) > 0;
  return (
    <article
      className="listing-report listing-issue-report"
      aria-label={`${item.group}/${item.site}/${item.listing}问题清单`}
    >
      <div className="listing-identity">
        <h3>{item.listing}</h3>
        <p>
          {item.group} / {item.site}
        </p>
        <Tag>{item.position}</Tag>
        {!retired && hasCurrent && (
          <p>净收入 {format(amounts.revenue, 2, 10000)}万元</p>
        )}
        {hasCurrent && <p>净利润 {format(amounts.profit, 2, 10000)}万元</p>}
      </div>
      <ol
        className="listing-issues"
        aria-label={retired ? "利润侵蚀与库存清理" : "主要问题与核查结果"}
      >
        {item.issues.map((issue) => (
          <li key={issue.key}>
            <div className="listing-issue-title">
              <strong>{issue.title}</strong>
              <Tag
                color={
                  issue.status === "关注"
                    ? "orange"
                    : issue.status === "待核查"
                      ? "gold"
                      : "default"
                }
              >
                {issue.status}
              </Tag>
            </div>
            <p>{issue.detail}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function ListingPage({ group }: { group: string }) {
  const request = useReport<ListingView>(`listing?${query({ group })}`);
  const data = request.data;
  const sites = [...new Set(data?.items.map((row) => row.site) ?? [])];
  return (
    <div className="section-stack listing-page">
      <div className="listing-heading">
        <h2 className="section-heading">{group} · LISTING分析问题清单</h2>
        <Button
          aria-label="保存为PDF"
          icon={<PrinterOutlined />}
          disabled={!data}
          onClick={() => window.print()}
        >
          保存为PDF
        </Button>
      </div>
      {request.error && (
        <Alert
          type="error"
          title={request.error}
          action={
            <Button aria-label="重试" onClick={request.retry}>
              重试
            </Button>
          }
        />
      )}
      {!data && !request.error && <Skeleton active paragraph={{ rows: 15 }} />}
      {data && (
        <>
          <Card size="small" className="listing-group-summary">
            <div className="listing-summary">
              <div>
                <h3>{group}</h3>
                <Tag>LISTING {data.items.length}个</Tag>
                <Tag>站点 {sites.length}个</Tag>
                <Tag>金额：人民币万元</Tag>
              </div>
              <div className="listing-summary-copy">
                <span>
                  关注{" "}
                  {
                    data.items.filter((item) =>
                      item.issues.some((issue) => issue.status === "关注"),
                    ).length
                  }
                  个LISTING
                </span>
                <span>
                  {" "}
                  · 待核查{" "}
                  {
                    data.items.filter((item) =>
                      item.issues.some((issue) => issue.status === "待核查"),
                    ).length
                  }
                  个LISTING
                </span>
              </div>
            </div>
          </Card>
          {!data.items.length && (
            <Empty description="该小组当前没有可展示LISTING" />
          )}
          {sites.map((site) => (
            <section
              className="section-stack listing-site-section"
              key={site}
              aria-label={`${site}站点报告`}
            >
              <div className="listing-site">
                <h2>{site}站点</h2>
                <span>
                  LISTING {data.items.filter((row) => row.site === site).length}
                  个
                </span>
              </div>
              {data.items
                .filter((row) => row.site === site)
                .map((item) => (
                  <ListingCard key={item.key} item={item} />
                ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
