import { useReportMonth, comparedMonth } from "./report-month";
import { useState } from "react";
import { Alert, Card } from "antd";
import type { BasisAnalysis } from "./contracts";
import type { BusinessDetails } from "./business-contracts";
import {
  businessAmount,
  BusinessChange,
  businessCostLabels,
  businessPercent,
} from "./business-presentation";
import { BusinessLeverage } from "./BusinessLeverage";
import { BusinessToggle } from "./BusinessControls";

export function BusinessCosts({
  data,
  details,
}: {
  data: BasisAnalysis[];
  details: BusinessDetails;
}) {
  const { month } = useReportMonth();
  const [mode, setMode] = useState("mom");
  const [basis, setBasis] = useState("actual");
  const actual = data.find(
    (item) => item.comparison === mode && item.basis === "actual",
  );
  const selected = data.find(
    (item) => item.comparison === mode && item.basis === basis,
  );
  const rows = [...(actual?.rows ?? [])].sort(
    (a, b) => Number(b.current) - Number(a.current),
  );
  const max = Math.max(
    0.001,
    ...rows.map((row) => Math.abs(Number(row.current_rate))),
  );
  const totals = details.refund_totals[mode];
  return (
    <>
      <Card
        title="费用明细：退款影响拆解"
        size="small"
        className="business-refunds"
        extra={
          <BusinessToggle
            label="费用比较期间"
            value={mode}
            onChange={setMode}
            options={[
              { value: "mom", label: "环比" },
              { value: "yoy", label: "同比" },
            ]}
          />
        }
      >
        <div
          className="report-table-scroll"
          role="region"
          aria-label="费用退款影响明细"
          tabIndex={0}
        >
          <table className="report-table business-refund-table">
            <thead>
              <tr>
                {[
                  "费用项目",
                  "占销售额",
                  "本月金额",
                  "实际占比",
                  `实际${mode === "mom" ? "环比" : "同比"}`,
                  "剔价变化",
                  "退款影响 / 等效金额",
                  "剔价剔退款后变化",
                  "判断",
                ].map((label) => (
                  <th
                    key={label}
                    className={label === "剔价变化" ? "business-adjusted" : ""}
                  >
                    <span>{label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const bridge = actual?.bridges.find(
                  (item) => item.key === row.key,
                );
                const lower = row.key !== "compensation";
                return (
                  <tr key={row.key}>
                    <td>{businessCostLabels[row.key] ?? row.label}</td>
                    <td>
                      <span className="business-cost-track" aria-hidden="true">
                        <i
                          style={{
                            width: `${(Math.abs(Number(row.current_rate)) / max) * 100}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td>{businessAmount(row.current)}</td>
                    <td>{businessPercent(row.current_rate)}</td>
                    {[
                      bridge?.actual,
                      bridge?.adjusted,
                      bridge?.refund,
                      bridge?.restored,
                    ].map((value, index) => (
                      <td
                        key={index}
                        className={index === 1 ? "business-adjusted" : ""}
                      >
                        <BusinessChange
                          value={value}
                          lowerIsBetter={lower}
                          badge
                          unit="PP"
                        />
                        {index === 2 && (
                          <small>{businessAmount(bridge?.equivalent)}</small>
                        )}
                      </td>
                    ))}
                    <td>{bridge?.judgement || "依据不足"}</td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  <th colSpan={4}>汇总（对净利润率的净影响）</th>
                  {["actual", "adjusted", "refund", "restored"].map((key) => (
                    <td
                      key={key}
                      className={key === "adjusted" ? "business-adjusted" : ""}
                    >
                      <BusinessChange value={totals[key]} badge unit="PP" />
                      {key === "refund" && (
                        <small>{businessAmount(totals.equivalent, true)}</small>
                      )}
                    </td>
                  ))}
                  <td>
                    {totals.restored == null
                      ? "不可核算"
                      : Number(totals.restored) > 0
                        ? "净利润率改善"
                        : Number(totals.restored) < 0
                          ? "净利润率承压"
                          : "净利润率持平"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="business-calculation-note">
          核算逻辑：实际变化 = 本月实际占比 - 对比期实际占比；剔价变化 =
          退款影响 + 剔价剔退款后变化；退款等效影响金额 = 退款影响 ×
          本月净销售额。汇总行统一换算为对净利润率的净影响，正数表示改善，负数表示承压。退款抵消表示退款影响与剔价变化方向相反，部分抵消总体变化。退款影响按已确认规则还原销售额、销售成本、头程费用及佣金返还影响，其他费用分子保持实际。PP表示百分点，1PP=1个百分点。
        </p>
      </Card>
      <Card
        title="费用杠杆与金额影响拆解"
        size="small"
        className="business-leverage-panel"
        extra={
          <BusinessToggle
            label="业务组费用分析口径"
            basis
            value={basis}
            onChange={setBasis}
            options={[
              { value: "actual", label: "实际" },
              { value: "price_adjusted", label: "剔价" },
              { value: "price_refund_adjusted", label: "剔价剔退款" },
            ]}
          />
        }
      >
        <p className="sample-note">
          {details.scope} /{" "}
          {`${mode === "mom" ? "环比" : "同比"} · 对比期 ${comparedMonth(month, mode === "mom" ? -1 : -12)}`}{" "}
          /{" "}
          {
            {
              actual: "实际",
              price_adjusted: "剔价",
              price_refund_adjusted: "剔价剔退款",
            }[basis]
          }
          口径
        </p>
        {selected && selected.unavailable_listings > 0 && (
          <Alert
            type="warning"
            showIcon
            title={`${selected.unavailable_listings}个LISTING缺少标准化依据，受影响项目不可计算。`}
          />
        )}
        {selected ? (
          <BusinessLeverage analysis={selected} />
        ) : (
          <p role="status">当前分析口径暂不可用。</p>
        )}
        <span className="business-source">
          来源：经营底表及后端费用核算；金额为人民币，“万”表示万元。
        </span>
      </Card>
    </>
  );
}
