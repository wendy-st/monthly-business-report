import { useState } from "react";
import { Card, Select, Space } from "antd";
import { groupNames } from "../overview/fixtures";
import { MetricCards } from "../../shared/report/MetricCards";
import { ReportTabs } from "../../shared/report/ReportTabs";
import { formatNumber } from "../../shared/report/format";
import { inventoryPreview } from "./fixtures";
import { InventoryScale } from "./InventoryScale";
import { InventoryTurnover } from "./InventoryTurnover";
import { InventoryOutlook, InventoryAge } from "./InventoryOutlook";

export function InventoryAnalysis() {
  const [group, setGroup] = useState("库存总览");
  const [basis, setBasis] = useState("不含头程");
  const [site, setSite] = useState("全部站点");
  const fixture = inventoryPreview(group, basis);
  const overview = group === "库存总览";
  return (
    <div className="section-stack inventory-page">
      <div className="sticky-filter-bar inventory-filter-bar">
        <ReportTabs
          label="库存分组"
          value={group}
          onChange={setGroup}
          options={["库存总览", ...groupNames].map((value) => ({
            value,
            label: value,
          }))}
        />
        {!overview && (
          <div className="inventory-group-toolbar">
            <Space wrap>
              <Select
                aria-label="小组库存站点"
                value={site}
                onChange={setSite}
                options={["全部站点", "US", "CA"].map((value) => ({
                  value,
                  label: value,
                }))}
                style={{ width: 140 }}
              />
              <span className="sample-note">
                {group} · 合成库存总量；站点库存尚未关联，暂不按站点拆分。
              </span>
            </Space>
          </div>
        )}
      </div>
      {overview && (
        <>
          <h2 className="inventory-section-title">
            <b>1</b>库存总览
          </h2>
          <MetricCards metrics={fixture.metrics} caption="9月" />
          <Card title="库存结论" size="small" className="inventory-conclusion">
            <div className="inventory-conclusion-lines">
              <p>
                合成样例：截至2026-09，所有仓库库存数量
                {formatNumber(fixture.quantity, 0)}件，库存资金
                {formatNumber(fixture.amount / 10000)}万元（{basis}）。
              </p>
              <p>
                9月所有仓库周转{fixture.days.toFixed(1)}天，FBA+海外仓周转
                {(fixture.days * 0.6).toFixed(1)}天。
              </p>
              <p>
                未来支持天数按无新增补货场景展示，预测销量和覆盖率尚待正式核验。
              </p>
            </div>
          </Card>
        </>
      )}
      <section className="inventory-section">
        <h2 className="inventory-section-title">
          {overview && <b>2</b>}
          {overview ? "库存规模" : `${group}小组库存规模结构`}
        </h2>
        <InventoryScale fixture={fixture} />
      </section>
      <section className="inventory-section">
        <h2 className="inventory-section-title">
          {overview && <b>3</b>}库存周转
        </h2>
        <InventoryTurnover
          fixture={fixture}
          basis={basis}
          onBasisChange={setBasis}
        />
      </section>
      <section className="inventory-section">
        <h2 className="inventory-section-title">
          {overview && <b>4</b>}未来库存趋势
        </h2>
        <InventoryOutlook />
      </section>
      {overview ? (
        <section className="inventory-section">
          <h2 className="inventory-section-title">
            <b>5</b>FBA库龄
          </h2>
          <InventoryAge fixture={fixture} />
        </section>
      ) : (
        <Card title="小组库存状况分析（季节性口径）" size="small">
          <p className="sample-note">
            合成样例：{group}库存资金{formatNumber(fixture.amount / 10000)}
            万元（{basis}
            ）。正式季节阶段、站点/LISTING库存明细和预测覆盖关系待接入。
          </p>
          <div className="pending-section">
            当前不根据合成数据生成真实补货或清仓建议。
          </div>
        </Card>
      )}
    </div>
  );
}
