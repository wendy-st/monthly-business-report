import { diagnosticPreview } from "../../features/overview/fixtures";

/** 原报告瀑布下方的三段核算版式；本阶段不产生正式拆解结果。 */
export function FinancialDiagnostics() {
  return (
    <div className="diagnostic-blocks">
      <div>
        <h3>1. 收入与利润转化</h3>
        <div className="report-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                {["指标", "对比期", "本期", "变化", "对净利影响"].map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[
                "净销售额",
                "毛利润",
                "毛利率",
                "产品营业利润",
                "净利润",
                "净利率",
              ].map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>待正式接入</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          布局样例：沿收入、产品成本、费用到净利逐层查看。正式转化与影响金额由后端提供。
        </p>
      </div>
      <div>
        <h3>2. 费用杠杆</h3>
        <div className="report-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                {[
                  "成本费用项",
                  "对比期占比",
                  "本期占比",
                  "变化（PP）",
                  "费用杠杆",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diagnosticPreview.costs.map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>待核验</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3>3. 金额影响拆解</h3>
        <div className="report-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                {["影响来源", "规模影响", "占比影响", "净影响金额", "判断"].map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {diagnosticPreview.costs.map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>待核验</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>“—”表示尚未接入正式结果；不把未核验数据视为零。</p>
      </div>
    </div>
  );
}
