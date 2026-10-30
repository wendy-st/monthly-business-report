import { Card, Table, Tag } from "antd";
import type { InventoryView } from "./contracts";
import { percent } from "./presentation";

export function InventoryRisks({ data }: { data: InventoryView }) {
  return (
    <Card title="LISTING周转健康与季节性风险" size="small">
      <p className="sample-note">
        季节阶段按2026年预测推断，库存起点取经营库存，周转取周转表。窗口末可能跨年；仅对金额≥2万元或数量≥300件的组合累计风险分。
      </p>
      <Table
        rowKey="key"
        size="small"
        dataSource={data.seasonal}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 1100 }}
        columns={[
          { title: "小组 / 站点 / LISTING", dataIndex: "label", width: 250 },
          { title: "周转健康", render: (_, row) => row.risk.health },
          { title: "季节阶段", render: (_, row) => row.risk.phase },
          {
            title: "预测峰值月",
            render: (_, row) => row.risk.peak_month || "—",
          },
          {
            title: "季末剩余占比",
            render: (_, row) => percent(row.risk.season_end_remaining_rate),
          },
          {
            title: "窗口末剩余占比",
            render: (_, row) => percent(row.risk.window_end_remaining_rate),
          },
          {
            title: "季节风险",
            render: (_, row) => (
              <Tag
                color={
                  row.risk.score >= 7
                    ? "error"
                    : row.risk.score >= 3
                      ? "warning"
                      : "success"
                }
              >
                {row.risk.level}（{row.risk.score}分）
              </Tag>
            ),
          },
          {
            title: "触发原因",
            width: 300,
            render: (_, row) => row.risk.reasons.join("；") || "未触发风险条件",
          },
        ]}
      />
    </Card>
  );
}
