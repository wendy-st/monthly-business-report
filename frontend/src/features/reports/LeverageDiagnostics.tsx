import { Table } from "antd";
import type { BasisAnalysis } from "./contracts";
import { format, percent } from "./presentation";

export function LeverageDiagnostics({ analysis }: { analysis: BasisAnalysis }) {
  const indicators = analysis.leverage;
  const impacts = [
    {
      key: "scale_impact",
      label: "收入规模影响",
      value: indicators.scale_impact,
    },
    ...analysis.rows.map((row) => ({
      key: row.key,
      label: row.label,
      value: indicators[`impact_${row.key}`],
    })),
    { key: "residual", label: "未拆分差额", value: indicators.residual },
    {
      key: "profit_change",
      label: "净利润变化合计",
      value: indicators.profit_change,
    },
  ];
  return (
    <div className="diagnostic-blocks">
      <div>
        <h3>2. 费用杠杆</h3>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={analysis.rows}
          scroll={{ x: 650 }}
          columns={[
            { title: "费用", dataIndex: "label" },
            { title: "对比期占比", render: (_, row) => percent(row.base_rate) },
            {
              title: "本期占比",
              render: (_, row) => percent(row.current_rate),
            },
            {
              title: "变化（pp）",
              render: (_, row) => format(row.delta, 2, 0.01),
            },
            { title: "费用弹性", render: (_, row) => format(row.elasticity) },
          ]}
        />
      </div>
      <div>
        <h3>3. 金额影响拆解</h3>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={impacts}
          columns={[
            { title: "影响来源", dataIndex: "label" },
            {
              title: "对净利润影响（人民币元）",
              align: "right",
              render: (_, row) => format(row.value),
            },
          ]}
        />
        <p>
          利润弹性 {format(indicators.profit_elasticity)}
          ；收入与两期利润须为正、收入变化绝对值至少1%，否则情景利润不可计算。
        </p>
        <Table
          rowKey={(row) => String(row.shift)}
          size="small"
          pagination={false}
          dataSource={analysis.scenarios}
          columns={[
            { title: "收入变动情景", render: (_, row) => percent(row.shift) },
            {
              title: "情景收入（元）",
              render: (_, row) => format(row.revenue),
            },
            { title: "情景利润（元）", render: (_, row) => format(row.profit) },
          ]}
        />
        <p>
          固定弹性模型测算，非销售预测。拆解保留费用冲回方向，金额不使用费用负担的绝对值替代。
        </p>
      </div>
    </div>
  );
}
