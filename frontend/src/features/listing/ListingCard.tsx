import { Tag } from "antd";
import { formatNumber } from "../../shared/report/format";
import type { Product } from "../products/fixtures";

/** 连续表格沿用原报告的四象限结构；缺失业务结果仍保留缺失。 */
export function ListingCard({ row }: { row: Product }) {
  const quadrants = [
    {
      title: "经营规模与盈利",
      values: [
        ["净销量", `${formatNumber(row.revenue / 100, 0)}件`],
        ["净销售额", `${formatNumber(row.revenue / 10000)}万元`],
        ["净利润", `${formatNumber(row.profit / 10000)}万元`],
        ["净利率", `${formatNumber((row.profit / row.revenue) * 100)}%`],
      ],
    },
    {
      title: "成本费用与退货",
      values: [
        ["退款率", `${row.refund.toFixed(2)}%`],
        ["营销推广费用", "—"],
        ["FBA配送成本", "—"],
        ["头程费用", `${row.freight.toFixed(2)}%`],
        ["FBA赔偿收入占比", "—"],
      ],
    },
    {
      title: "库存规模与周转",
      values: [
        ["库存数量", "—"],
        ["库存金额", "—"],
        ["周转天数", "—"],
      ],
    },
    {
      title: "未来库存预警",
      values: [
        ["预测结论", "待核验"],
        ["覆盖率", "—"],
        ["预计耗尽", "—"],
      ],
    },
  ];
  return (
    <article className="listing-report">
      <div className="listing-identity">
        <h3>{row.listing}</h3>
        <p>
          {row.site}/{row.listing}
        </p>
        <Tag color="gold">定位待核验</Tag>
        <p>
          季节阶段：待核验
          <br />
          库存问题：待核验
          <br />
          销售峰值：待核验
        </p>
        <div className="listing-position-summary">
          产品定位
          <br />
          <strong>待正式数据</strong>
        </div>
      </div>
      <div className="listing-quadrants">
        {quadrants.map(({ title, values }) => (
          <div className="listing-quadrant" key={title}>
            <h3>{title}</h3>
            <table
              className="listing-values"
              aria-label={`${row.listing}${title}`}
            >
              <tbody>
                {values.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>
                      {value}
                      <small>环比 — · 同比 —</small>
                      {["营销推广费用", "FBA配送成本", "头程费用"].includes(
                        label,
                      ) && (
                        <small className="refund-impact">
                          退款影响：待核验
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {title === "库存规模与周转" && (
              <>
                <div className="listing-age-title">FBA库龄风险</div>
                <div className="listing-age-highlights">
                  <div>
                    <span>180天以上占比</span>
                    <strong>—</strong>
                    <small>待正式库龄数据</small>
                  </div>
                  <div>
                    <span>270天以上占比</span>
                    <strong>—</strong>
                    <small>待正式库龄数据</small>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
