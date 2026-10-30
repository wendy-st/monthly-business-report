import { Alert, Button, Card, Empty, Skeleton, Tag, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useReport, query } from "./api";
import type {
  Amounts,
  FutureRow,
  InventoryRow,
  MetricRow,
  SeasonalRisk,
} from "./contracts";
import { format, percent } from "./presentation";

type ListingItem = {
  key: string;
  group: string;
  site: string;
  listing: string;
  position: string;
  mode: "full" | "promotion" | "retired" | "mx";
  business: MetricRow | null;
  inventory: InventoryRow;
  turnover: Amounts;
  future: FutureRow[];
  stockout: string;
  seasonal: SeasonalRisk;
};
type ListingView = {
  items: ListingItem[];
  excluded_sites: string[];
  source_note: string;
};

function ListingCard({ item }: { item: ListingItem }) {
  const business = item.business;
  const amounts = business?.current ?? {};
  const stock = item.inventory.values;
  const sections = [
    {
      title: "经营规模与盈利",
      values: [
        ["净销量", `${format(amounts.units, 0)}件`, "units"],
        ["净销售额", `${format(amounts.revenue, 2, 10000)}万元`, "revenue"],
        ["净利润", `${format(amounts.profit, 2, 10000)}万元`, "profit"],
        ["净利率", percent(amounts.margin), "margin"],
      ],
    },
    {
      title: "成本费用与退货",
      values: [
        ["退款率", percent(amounts.refund_rate), "refund_rate"],
        ["营销推广费率", percent(amounts.marketing_rate), "marketing_rate"],
        ["FBA配送成本率", percent(amounts.delivery_rate), "delivery_rate"],
        ["头程费率", percent(amounts.freight_rate), "freight_rate"],
        [
          "FBA赔偿收入占比",
          percent(amounts.compensation_rate),
          "compensation_rate",
        ],
      ],
    },
    {
      title: "库存规模与周转",
      values: [
        ["所有仓库库存", `${format(stock.quantity, 0)}件`, ""],
        ["含头程库存金额", `${format(stock.amount, 2, 10000)}万元`, ""],
        ["数量周转（周转表）", `${format(item.turnover.days_qty, 1)}天`, ""],
        [
          "180天以上库龄",
          `${format(stock.age180, 0)}件 / ${percent(stock.age180_rate)}`,
          "",
        ],
        [
          "270天以上库龄",
          `${format(stock.age270, 0)}件 / ${percent(stock.age270_rate)}`,
          "",
        ],
      ],
    },
    {
      title: "未来库存预警",
      values: [
        [
          "预测窗口",
          item.future.length
            ? `${item.future[0].month}—${item.future[item.future.length - 1].month}`
            : "无有效未来预测",
          "",
        ],
        ["预计耗尽", item.stockout, ""],
        ["窗口末剩余", `${format(item.future.at(-1)?.remaining, 0)}件`, ""],
        [
          "季节阶段",
          `${item.seasonal.phase} / 峰值${item.seasonal.peak_month || "—"}`,
          "",
        ],
        [
          "季节风险",
          `${item.seasonal.level}（${item.seasonal.score}分）：${item.seasonal.reasons.join("、") || "未触发风险条件"}`,
          "",
        ],
      ],
    },
  ];
  if (item.mode !== "full")
    return (
      <Card
        size="small"
        title={`${item.site}/${item.listing} · ${{ promotion: "上新 / 推广集中关注", retired: "废弃 / 已停运集中关注", mx: "MX经营简版" }[item.mode]}`}
      >
        <div className="listing-compact-row">
          <div>
            <Tag>{item.position}</Tag>
            <p>{item.group}</p>
          </div>
          <div>
            <strong>当月经营</strong>
            <p>净销量{format(amounts.units, 0)}件</p>
            <p>净销售额{format(amounts.revenue, 2, 10000)}万元</p>
            <p>净利润{format(amounts.profit, 2, 10000)}万元</p>
          </div>
          <div>
            <strong>成本费用与退货</strong>
            <p>营销推广费率{percent(amounts.marketing_rate)}</p>
            <p>退款率{percent(amounts.refund_rate)}</p>
            <p>头程费率{percent(amounts.freight_rate)}</p>
          </div>
          <div>
            <strong>库存情况</strong>
            <p>
              {format(stock.quantity, 0)}件 / {format(stock.amount, 2, 10000)}
              万元
            </p>
            <p>周转{format(item.turnover.days_qty, 1)}天</p>
            <p>{item.stockout}</p>
          </div>
        </div>
      </Card>
    );
  return (
    <article className="listing-report">
      <div className="listing-identity">
        <h3>{item.listing}</h3>
        <p>
          {item.site}/{item.listing}
        </p>
        <Tag>{item.position}</Tag>
        <p>库存来源：经营工作簿</p>
        <p>周转来源：库存周转表</p>
      </div>
      <div className="listing-quadrants">
        {sections.map((section) => (
          <div className="listing-quadrant" key={section.title}>
            <h3>{section.title}</h3>
            <table
              className="listing-values"
              aria-label={`${item.site}/${item.listing}${section.title}`}
            >
              <tbody>
                {section.values.map(([label, value, metric]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>
                      {value}
                      {metric && (
                        <small>
                          环比 {business?.changes[`${metric}_mom`] ?? "—"} ·
                          同比 {business?.changes[`${metric}_yoy`] ?? "—"}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </article>
  );
}

export function ListingPage({
  group,
  groups,
}: {
  group: string;
  groups: string[];
}) {
  const request = useReport<ListingView>(`listing?${query({ group })}`);
  const data = request.data;
  const sites = [...new Set(data?.items.map((row) => row.site) ?? [])];
  return (
    <div className="section-stack listing-page">
      <div className="listing-heading">
        <div>
          <h2 className="section-heading">
            5.{groups.indexOf(group) + 1} {group}LISTING分析报告
          </h2>
          <Typography.Text type="secondary">
            按小组、站点、LISTING归集经营、费用、库存及未来预警。
          </Typography.Text>
        </div>
        <Button
          icon={<PrinterOutlined />}
          disabled={!data}
          onClick={() => window.print()}
        >
          保存为PDF
        </Button>
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
          <Card size="small" className="listing-group-summary">
            <div className="listing-summary">
              <div>
                <h3>{group}</h3>
                <Tag>LISTING {data.items.length}个</Tag>
                <Tag>站点 {sites.length}个</Tag>
              </div>
              <div className="listing-summary-copy">
                <p>{data.source_note}</p>
                <p>
                  金额为人民币。库存周转与库存存量分源核算；未来支持以经营库存为起点，不含新增补货。
                </p>
                <div className="listing-position-summary">
                  维护{" "}
                  {data.items.filter((row) => row.position === "维护").length}个
                  · 新品{" "}
                  {data.items.filter((row) => row.position === "新品").length}个
                  · 废弃{" "}
                  {data.items.filter((row) => row.position === "废弃").length}个
                  · 已停运{" "}
                  {data.items.filter((row) => row.position === "已停运").length}
                  个
                </div>
              </div>
            </div>
          </Card>
          {!data.items.length && (
            <Empty description="该小组当前没有可展示LISTING" />
          )}
          {sites.map((site) => (
            <section
              className="section-stack listing-site-section"
              key={site}
              aria-label={`${site}站点报告`}
            >
              <div className="listing-site">
                <h2>{site}站点</h2>
                <span>
                  LISTING {data.items.filter((row) => row.site === site).length}
                  个
                </span>
              </div>
              {data.items
                .filter((row) => row.site === site)
                .map((item) => (
                  <ListingCard key={item.key} item={item} />
                ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
