import { Card, Radio, Segmented, Table } from "antd";
import { ReportChart } from "../../shared/report/ReportChart";
import type { BasisAnalysis, FinancialView, Step } from "./contracts";
import type { AnalysisSelection } from "./CostDiagnostics";
import { format } from "./presentation";
import { LeverageDiagnostics } from "./LeverageDiagnostics";
import { IncomeProfitConversion } from "./IncomeProfitConversion";
import { waterfallOption } from "./waterfall-option";
import { OverviewLeverage } from "./OverviewLeverage";
import { FormulaHelp } from "./FormulaHelp";

export function ProfitBridge({
  data,
  costs,
  selection,
  scope,
  overview = false,
}: {
  data: FinancialView;
  costs?: BasisAnalysis[];
  selection: AnalysisSelection;
  scope: string;
  overview?: boolean;
}) {
  const { comparison, basis, onComparison, onBasis } = selection;
  const steps = data.waterfall[comparison];
  const analyses =
    costs?.filter((item) => item.comparison === comparison) ?? [];
  const analysis = analyses.find((item) => item.basis === basis);
  const complete = steps.every((step) => step.amount !== null);
  const period = comparison === "mom" ? "2026-08" : "2025-09";
  return (
    <Card
      title={
        <div className="waterfall-heading">
          <span>净利润分析瀑布图</span>
          <Segmented
            aria-label="利润比较期间"
            value={comparison}
            onChange={onComparison}
            options={[
              { value: "mom", label: "环比" },
              { value: "yoy", label: "同比" },
            ]}
          />
        </div>
      }
      size="small"
      className="profit-waterfall"
    >
      <p className="sample-note">
        按{comparison === "mom" ? "环比" : "同比"}金额拆解（对比期 {period}
        ）：绿色表示增加利润，红色表示减少利润。单位：人民币万元；来源：经营底表。
      </p>
      {complete ? (
        <div className="waterfall-plot">
          <ReportChart
            sample={false}
            summary={steps
              .map((step) => `${step.label}：${format(step.amount)}元`)
              .join("；")}
            option={waterfallOption(steps, comparison)}
          />
        </div>
      ) : (
        <p role="status">
          该范围存在缺失金额，暂不能绘制利润桥接图。请查看下方明细。
        </p>
      )}
      <div className="conversion-toolbar">
        <span>
          {scope} · {comparison === "mom" ? "环比" : "同比"} · 对比期 {period}
        </span>
        {overview ? (
          <Radio.Group
            aria-label="利润分析口径"
            className="overview-basis-control"
            value={basis}
            onChange={(event) => onBasis(String(event.target.value))}
          >
            <Radio.Button value="actual">实际</Radio.Button>
            <span className="overview-basis-option">
              <Radio.Button value="price_adjusted">剔价</Radio.Button>
              <FormulaHelp
                key={`${comparison}-${basis}-price`}
                name="basis_price_adjusted"
                label="查看剔价口径说明"
              />
            </span>
            <span className="overview-basis-option">
              <Radio.Button value="price_refund_adjusted">
                剔价剔退款
              </Radio.Button>
              <FormulaHelp
                key={`${comparison}-${basis}-refund`}
                name="basis_price_refund_adjusted"
                label="查看剔价剔退款口径说明"
              />
            </span>
          </Radio.Group>
        ) : (
          <Segmented
            aria-label="利润分析口径"
            value={basis}
            onChange={onBasis}
            options={[
              { value: "actual", label: "实际" },
              { value: "price_adjusted", label: "剔价" },
              { value: "price_refund_adjusted", label: "剔价剔退款" },
            ]}
          />
        )}
      </div>
      <IncomeProfitConversion
        analyses={analyses}
        activeBasis={basis}
        changes={overview ? data.overview?.conversion[comparison] : undefined}
      />
      {analysis &&
        (overview ? (
          <OverviewLeverage
            key={`${comparison}-${basis}`}
            analysis={analysis}
          />
        ) : (
          <LeverageDiagnostics analysis={analysis} />
        ))}
      {!overview && (
        <details className="waterfall-detail">
          <summary>查看瀑布金额明细</summary>
          <Table<Step>
            rowKey="label"
            size="small"
            dataSource={steps}
            pagination={false}
            scroll={{ x: 500 }}
            columns={[
              { title: "利润桥接项目", dataIndex: "label" },
              {
                title: "影响金额（人民币元）",
                align: "right",
                render: (_, step) => format(step.amount),
              },
            ]}
          />
        </details>
      )}
      {overview && data.overview && (
        <dl className="overview-conclusions" aria-label="利润与费用分析总结">
          {data.overview.conclusions[comparison]?.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
