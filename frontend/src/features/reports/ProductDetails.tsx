import { Button, Descriptions, Drawer, Space, Tabs } from "antd";
import { useState } from "react";
import type { MetricRow } from "./contracts";
import { HistoryPanel } from "./HistoryPanel";
import { ReportTable } from "./ReportTable";
import { format, percent } from "./presentation";

export function ProductDetails({
  rows,
  onSelect,
}: {
  rows: MetricRow[];
  onSelect?: (row: MetricRow) => void;
}) {
  const [selected, setSelected] = useState<MetricRow>();
  const [tab, setTab] = useState("全部");
  const shown = rows.filter(
    (row) =>
      row.record_count > 0 &&
      (tab === "全部" ||
        (tab === "盈利款" && Number(row.current.profit) >= 0) ||
        (tab === "亏损款" && Number(row.current.profit) < 0) ||
        row.diagnosis === tab),
  );
  return (
    <>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          "全部",
          "盈利款",
          "亏损款",
          "产品成本问题",
          "费用端问题",
          "待核验",
        ].map((label) => ({ key: label, label }))}
      />
      <ReportTable
        title="款式盈利与成本明细"
        rows={shown}
        fields={[
          "sales_qty",
          "revenue",
          "gross_margin",
          "profit",
          "margin",
          "refund_rate",
        ]}
        onSelect={(row) => {
          setSelected(row);
          onSelect?.(row);
        }}
      />
      <Drawer
        title={selected?.label || "款式明细"}
        open={!!selected}
        width="min(100%, 1080px)"
        onClose={() => setSelected(undefined)}
      >
        {selected && (
          <div className="section-stack">
            <Descriptions
              bordered
              column={2}
              items={[
                {
                  key: "sales",
                  label: "净销售额（人民币元）",
                  children: format(selected.current.revenue),
                },
                {
                  key: "profit",
                  label: "净利润（人民币元）",
                  children: format(selected.current.profit),
                },
                {
                  key: "gross",
                  label: "毛利率",
                  children: percent(selected.current.gross_margin),
                },
                {
                  key: "diagnosis",
                  label: "相对诊断",
                  children: selected.diagnosis,
                },
                {
                  key: "source",
                  label: "经营底表来源行",
                  children: selected.source_rows.join("、"),
                },
              ]}
            />
            <Space wrap>
              <Button onClick={() => setSelected(undefined)}>关闭明细</Button>
            </Space>
            <HistoryPanel
              filters={{
                group: selected.dimensions.group,
                site: selected.dimensions.site,
                listing: selected.dimensions.listing,
              }}
            />
          </div>
        )}
      </Drawer>
    </>
  );
}
