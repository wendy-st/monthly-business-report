import { useState } from "react";
import { Alert, Button, Card, Select, Skeleton, Space } from "antd";
import { ReportTabs } from "../../shared/report/ReportTabs";
import { MetricCards } from "../../shared/report/MetricCards";
import { query, useReport } from "./api";
import type { InventoryView } from "./contracts";
import { InventoryTable } from "./InventoryTable";
import { InventoryTrends } from "./InventoryTrends";
import { InventoryRisks } from "./InventoryRisks";
import { InventoryStructure } from "./InventoryStructure";
import { format, percent } from "./presentation";

export function InventoryPage({
  groups,
  sites,
}: {
  groups: string[];
  sites: string[];
}) {
  const [group, setGroup] = useState("");
  const [site, setSite] = useState("");
  const [listing, setListing] = useState("");
  const request = useReport<InventoryView>(
    `inventory?${query({ group, site, listing })}`,
  );
  const data = request.data;
  const overview = !group;
  const summary = data?.summary.values;
  return (
    <div className="section-stack inventory-page">
      <ReportTabs
        label="库存分组"
        value={group}
        onChange={(next) => {
          setGroup(next);
          setSite("");
          setListing("");
        }}
        options={[
          { value: "", label: "库存总览" },
          ...groups.map((name) => ({ value: name, label: name })),
        ]}
      />
      {!overview && (
        <Space wrap>
          <Select
            aria-label="小组库存站点"
            style={{ minWidth: 140 }}
            value={site}
            onChange={(next) => {
              setSite(next);
              setListing("");
            }}
            options={[
              { value: "", label: "全部站点" },
              ...sites.map((name) => ({ value: name, label: name })),
            ]}
          />
          <Select
            aria-label="小组库存LISTING"
            value={listing}
            style={{ minWidth: 170 }}
            onChange={setListing}
            options={[
              { value: "", label: "全部LISTING" },
              ...[
                ...new Set(
                  data?.breakdowns.listings.map(
                    (row) => row.dimensions.listing,
                  ) ?? [],
                ),
              ].map((name) => ({ value: name, label: name })),
            ]}
          />
        </Space>
      )}
      {request.error && (
        <Alert
          type="error"
          title={request.error}
          action={<Button onClick={request.retry}>重试</Button>}
        />
      )}
      {!data && !request.error && <Skeleton active paragraph={{ rows: 15 }} />}
      {data && summary && (
        <>
          {overview && (
            <>
              <h2 className="inventory-section-title">
                <b>1</b>库存总览
              </h2>
              <MetricCards
                caption="9月"
                metrics={[
                  ["库存数量（件）", format(summary.quantity, 0)],
                  ["库存金额（人民币万元）", format(summary.amount, 2, 10000)],
                  [
                    "采购金额（人民币万元）",
                    format(summary.purchase, 2, 10000),
                  ],
                  ["头程金额（人民币万元）", format(summary.freight, 2, 10000)],
                ].map(([title, value]) => ({
                  title,
                  value,
                  previous: "—",
                  yearAgo: "—",
                  mom: "—",
                  yoy: "—",
                }))}
              />
              <Card
                title="库存结论"
                size="small"
                className="inventory-conclusion"
              >
                <div className="inventory-conclusion-lines">
                  <p>
                    截至9月末库存{format(summary.quantity, 0)}件，含头程金额
                    {format(summary.amount, 2, 10000)}
                    万元。经营库存仅有当月快照，不使用周转表补造存量环比和同比。
                  </p>
                  <p>
                    FBA库龄180天以上{format(summary.age180, 0)}
                    件，占有效FBA在库量{percent(summary.age180_rate)}；270天以上
                    {format(summary.age270, 0)}件。
                  </p>
                  <p>{data.warnings[0]}</p>
                </div>
              </Card>
            </>
          )}
          {data.warnings.slice(1).map((message) => (
            <Alert key={message} type="warning" title={message} showIcon />
          ))}
          <section className="inventory-section">
            <h2 className="inventory-section-title">
              <b>2</b>库存规模
            </h2>
            <InventoryStructure data={data} />
          </section>
          <InventoryTrends data={data} />
          <InventoryRisks data={data} />
          <section className="inventory-section">
            <h2 className="inventory-section-title">
              <b>5</b>FBA库龄风险
            </h2>
            <InventoryTable
              title="小组库龄与完整在库分母"
              rows={data.breakdowns.groups}
              fields={[
                "in_stock",
                "age180",
                "age180_rate",
                "age270",
                "age270_rate",
              ]}
            />
            <InventoryTable
              title="超龄SKU明细（排除同步异常）"
              rows={data.breakdowns.age}
              fields={["in_stock", "age180", "age270"]}
            />
          </section>
          <p className="sample-note">{data.source_note}</p>
        </>
      )}
    </div>
  );
}
