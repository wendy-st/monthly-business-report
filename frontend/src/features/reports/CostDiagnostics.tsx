import { useState } from "react";
import { Alert, Card, Segmented, Space, Table } from "antd";
import type { BasisAnalysis, CostBridge, CostRow } from "./contracts";
import { format, percent } from "./presentation";

export type AnalysisSelection = {
  comparison: string;
  basis: string;
  onComparison: (value: string) => void;
  onBasis: (value: string) => void;
};

export function CostDiagnostics({
  data,
  selection,
}: {
  data: BasisAnalysis[];
  selection?: AnalysisSelection;
}) {
  const [localComparison, setComparison] = useState("mom");
  const [localBasis, setBasis] = useState("actual");
  const comparison = selection?.comparison ?? localComparison;
  const basis = selection?.basis ?? localBasis;
  const analysis = data.find(
    (item) => item.basis === basis && item.comparison === comparison,
  );
  return (
    <Card
      title="费用杠杆与金额影响"
      size="small"
      extra={
        <Space wrap>
          <Segmented
            aria-label="费用比较期间"
            value={comparison}
            onChange={selection?.onComparison ?? setComparison}
            options={[
              { value: "mom", label: "环比" },
              { value: "yoy", label: "同比" },
            ]}
          />
          <Segmented
            aria-label="费用分析口径"
            value={basis}
            onChange={selection?.onBasis ?? setBasis}
            options={[
              { value: "actual", label: "实际" },
              { value: "price_adjusted", label: "剔价" },
              { value: "price_refund_adjusted", label: "剔价剔退款" },
            ]}
          />
        </Space>
      }
    >
      {analysis && analysis.unavailable_listings > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${analysis.unavailable_listings}个LISTING缺少标准化依据；受影响项目不输出完整变化。`}
        />
      )}
      <Table<CostRow>
        rowKey="key"
        size="small"
        dataSource={analysis?.rows}
        pagination={false}
        scroll={{ x: 1100 }}
        columns={[
          { title: "费用项目", dataIndex: "label", width: 150, fixed: "left" },
          {
            title: "本期（人民币元）",
            align: "right",
            render: (_, row) => format(row.current),
          },
          {
            title: "对比期（人民币元）",
            align: "right",
            render: (_, row) => format(row.base),
          },
          {
            title: "本期费用率",
            align: "right",
            render: (_, row) => percent(row.current_rate),
          },
          {
            title: "对比期费用率",
            align: "right",
            render: (_, row) => percent(row.base_rate),
          },
          {
            title: "变化（pp）",
            align: "right",
            render: (_, row) => format(row.delta, 2, 0.01),
          },
          {
            title: "费用弹性",
            align: "right",
            render: (_, row) => format(row.elasticity),
          },
          {
            title: "利润影响（人民币元）",
            align: "right",
            render: (_, row) => format(row.profit_impact),
          },
          { title: "不可比原因", dataIndex: "reason", width: 220 },
        ]}
      />
      <p className="sample-note">
        费用金额为负担展示值；FBA赔偿保留收入方向。弹性要求收入变化绝对值至少1%，对比期费用为正。
      </p>
      <h3>成本率桥与退款贡献</h3>
      <Table<CostBridge>
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={analysis?.bridges}
        scroll={{ x: 1100 }}
        columns={[
          { title: "费用项目", dataIndex: "label", width: 130, fixed: "left" },
          ...(
            [
              ["actual", "实际变化"],
              ["standardization", "标准化差额"],
              ["adjusted", "剔价变化"],
              ["refund", "退款影响"],
              ["restored", "剔价剔退款变化"],
            ] as const
          ).map(([key, title]) => ({
            title: `${title}（pp）`,
            render: (_: unknown, row: CostBridge) => format(row[key], 2, 0.01),
          })),
          {
            title: "退款等效金额（元）",
            render: (_, row) => format(row.equivalent),
          },
          { title: "判断", dataIndex: "judgement" },
        ]}
      />
      <p className="sample-note">
        实际变化＝标准化差额＋剔价变化；剔价变化＝退款影响＋剔价剔退款变化。显示四舍五入可能相差0.01pp。
      </p>
    </Card>
  );
}
