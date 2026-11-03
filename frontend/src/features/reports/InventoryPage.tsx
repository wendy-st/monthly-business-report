import { useState } from "react";
import { Alert, Button, Empty, Select, Skeleton } from "antd";
import { ReportTabs } from "../../shared/report/ReportTabs";
import { query, useReport } from "./api";
import type { InventoryView } from "./contracts";
import { InventoryOverview } from "./InventoryOverview";
import { InventoryTrends } from "./InventoryTrends";
import { InventoryRisks } from "./InventoryRisks";
import { InventoryRiskDetails } from "./InventoryRiskDetails";
import { InventoryStructure } from "./InventoryStructure";
import { InventoryAge } from "./InventoryAge";
import { InventoryTurnoverDetails } from "./InventoryTurnoverDetails";

const groupOrder = ["LZF", "HCM", "Ash", "KAYO-北美", "KAYO-欧日", "薄底水鞋"];

export function InventoryPage({
  groups,
}: {
  groups: string[];
  sites: string[];
}) {
  const [group, setGroup] = useState("");
  const [site, setSite] = useState("");
  const [listing, setListing] = useState("");
  const [category3, setCategory3] = useState("");
  const request = useReport<InventoryView>(
    `inventory?${query({ group, site, listing, category3 })}`,
  );
  const data = request.data;
  const overview = !group;
  const orderedGroups = [
    ...groupOrder.filter((name) => groups.includes(name)),
    ...groups.filter((name) => !groupOrder.includes(name)),
  ];
  return (
    <div
      className="section-stack inventory-page"
      aria-busy={!data && !request.error}
    >
      <div className="sticky-filter-bar inventory-filter-bar">
        <ReportTabs
          label="库存分组"
          value={group}
          onChange={(next) => {
            setGroup(next);
            setSite("");
            setListing("");
            setCategory3("");
          }}
          options={[
            { value: "", label: "库存总览" },
            ...orderedGroups.map((name) => ({
              value: name,
              label: name === "薄底水鞋" ? "薄底水鞋US" : `${name}组`,
            })),
          ]}
        />
        {!overview && (
          <div className="inventory-group-filters">
            {(
              [
                ["site", "站点", site, setSite],
                ["listing", "LISTING", listing, setListing],
                ["category3", "三级品类", category3, setCategory3],
              ] as const
            ).map(([key, label, value, onChange]) => (
              <label key={key}>
                <span>{label}</span>
                <Select
                  aria-label={`小组库存${label}`}
                  showSearch
                  optionFilterProp="label"
                  value={value}
                  onChange={onChange}
                  options={[
                    { value: "", label: `全部${label}` },
                    ...(data?.options[key] ?? (value ? [value] : [])).map(
                      (name) => ({ value: name, label: name }),
                    ),
                  ]}
                />
              </label>
            ))}
            <Button
              onClick={() => {
                setSite("");
                setListing("");
                setCategory3("");
              }}
            >
              重置筛选
            </Button>
          </div>
        )}
      </div>
      {request.error && (
        <Alert
          type="error"
          title={request.error}
          action={<Button onClick={request.retry}>重试</Button>}
        />
      )}
      {!data && !request.error && <Skeleton active paragraph={{ rows: 15 }} />}
      {data && (
        <>
          {overview && <InventoryOverview data={data} />}
          {!data.summary.source_rows.length && (
            <Empty description="当前筛选没有当期库存记录" />
          )}
          {data.warnings.slice(1).map((message) => (
            <Alert key={message} type="warning" title={message} showIcon />
          ))}
          {!overview && <InventoryRisks data={data} />}
          <section className="inventory-section">
            <h2 className="inventory-section-title">
              {overview && <b>2</b>}
              {overview ? "库存规模" : "小组库存规模结构"}
            </h2>
            <InventoryStructure data={data} overview={overview} />
          </section>
          {!overview && (
            <InventoryTurnoverDetails data={data} overview={false} />
          )}
          <InventoryTrends key={group} data={data} overview={overview} />
          {!overview && <InventoryRiskDetails data={data} />}
          {overview && <InventoryAge data={data} />}
          <p className="sample-note">{data.source_note}</p>
        </>
      )}
    </div>
  );
}
