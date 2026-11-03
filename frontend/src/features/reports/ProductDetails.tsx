import { Button, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import type { MetricRow } from "./contracts";
import type {
  ProductRefundView,
  ProductStyleContext,
} from "./product-contracts";
import { format, percent } from "./presentation";
import { ProductStyleDrawer } from "./ProductStyleDrawer";

const tabs = [
  "全部",
  "盈利款",
  "亏损款",
  "产品成本",
  "费用端",
  "待核验",
  "退款率",
];

function shownInTab(row: MetricRow, tab: string) {
  const profit = row.current.profit;
  if (tab === "全部") return true;
  if (tab === "盈利款") return profit !== null && Number(profit) >= 0;
  if (tab === "亏损款") return profit !== null && Number(profit) < 0;
  const diagnoses: Record<string, string> = {
    产品成本: "产品成本问题",
    费用端: "费用端问题",
  };
  return row.diagnosis === (diagnoses[tab] ?? tab);
}

export function ProductDetails({
  rows,
  contexts,
  refunds,
  refundError,
}: {
  rows: MetricRow[];
  contexts: Record<string, ProductStyleContext>;
  refunds?: ProductRefundView;
  refundError?: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string>();
  const [tab, setTab] = useState("全部");
  const [paging, setPaging] = useState({ rows, tab, refunds, page: 1 });
  const current =
    paging.rows === rows && paging.tab === tab && paging.refunds === refunds
      ? paging.page
      : 1;
  const selected = rows.find((row) => row.key === selectedKey);
  const sortKey = tab === "退款率" ? "refund_rate" : "revenue";
  const shown = rows
    .filter(
      (row) =>
        row.record_count > 0 &&
        (tab === "退款率"
          ? refunds?.eligible_keys.includes(row.key)
          : shownInTab(row, tab)),
    )
    .sort(
      (left, right) =>
        Number(right.current[sortKey] ?? 0) -
        Number(left.current[sortKey] ?? 0),
    );
  const metric = (
    key: string,
    title: string,
    width = 85,
  ): ColumnsType<MetricRow>[number] => ({
    title,
    key,
    width,
    align: "right",
    render: (_, row) => {
      if (key === "refund_rate") {
        const status = refunds?.statuses[row.key];
        if (!status) return refundError ? "核验失败" : "正在核验";
        if (status === "low_sales")
          return <span className="product-sample-insufficient">样本不足</span>;
        if (status === "missing_sales") return "销量缺失";
      }
      return (
        <span
          className={
            ["profit", "margin"].includes(key) && row.current[key] !== null
              ? Number(row.current[key]) < 0
                ? "negative"
                : "positive"
              : key === "refund_rate" &&
                  refunds?.abnormal_keys.includes(row.key)
                ? "negative"
                : ""
          }
        >
          {key === "sales_qty"
            ? format(row.current[key], 0)
            : key === "revenue" || key === "profit"
              ? `${format(row.current[key], 2, 10000)}${row.current[key] === null ? "" : "万"}`
              : percent(row.current[key])}
        </span>
      );
    },
  });
  const columns: ColumnsType<MetricRow> = [
    {
      title: "款式信息",
      children: [
        ...[
          ["group", "小组", 85],
          ["site", "站点", 45],
          ["category3", "三级品类", 165],
          ["listing", "LISTING", 85],
        ].map(([key, title, width]) => ({
          title,
          key,
          width: Number(width),
          render: (_: unknown, row: MetricRow) => row.dimensions[String(key)],
        })),
        {
          title: "款式",
          key: "style",
          width: 160,
          render: (_, row) => (
            <Button
              type="link"
              size="small"
              aria-label={`查看 ${row.label}`}
              onClick={() => setSelectedKey(row.key)}
            >
              {row.dimensions.style}
            </Button>
          ),
        },
      ],
    },
    {
      title: "销售规模",
      children: [
        metric("sales_qty", "销量"),
        metric("revenue", "销售额"),
        {
          title: "原币均价",
          key: "local_price",
          align: "right",
          width: 110,
          render: (_, row) => {
            const context = contexts[row.key];
            return context?.local_price == null
              ? "—"
              : `${context.currency} ${format(context.local_price)}`;
          },
        },
      ],
    },
    {
      title: "盈利结果",
      children: [
        metric("gross_margin", "毛利率"),
        metric("profit", "净利润"),
        metric("margin", "净利率"),
      ],
    },
    {
      title: "成本退款",
      children: [
        metric("refund_rate", "退款率"),
        metric("purchase_rate", "销售成本率"),
        metric("freight_rate", "头程费率"),
        metric("other_cost_rate", "其他成本率"),
      ],
    },
    {
      title: "诊断",
      children: [
        {
          title: "诊断",
          key: "diagnosis",
          width: 165,
          render: (_, row) => {
            const context = contexts[row.key];
            return (
              <div className="product-diagnosis">
                <strong
                  className={
                    row.diagnosis === "健康盈利"
                      ? "positive"
                      : row.diagnosis === "费用端问题"
                        ? "negative"
                        : "diagnosis-warning"
                  }
                >
                  {row.diagnosis}
                </strong>
                <small>
                  {context?.benchmark == null
                    ? "待核验"
                    : `${context.basis}：${percent(context.benchmark)}`}
                </small>
              </div>
            );
          },
        },
      ],
    },
  ];
  return (
    <div className="category-details">
      <div className="product-detail-toolbar">
        <Space wrap size={6}>
          {tabs.map((label) => (
            <Button
              key={label}
              aria-label={label}
              size="small"
              type={tab === label ? "primary" : "default"}
              onClick={() => {
                setTab(label);
                setPaging({ rows, tab: label, refunds, page: 1 });
              }}
            >
              {label}
            </Button>
          ))}
        </Space>
        <span>{shown.length} 个款式</span>
      </div>
      <p className="product-refund-detail-note">
        退款率榜单及本页“退款率”标签共用最低销量{refunds?.min_sales ?? "—"}
        件；低销量显示“样本不足”，原始值可点击款式查看。
      </p>
      <Table<MetricRow>
        rowKey="key"
        size="small"
        classNames={{ root: "product-detail-table" }}
        dataSource={shown}
        loading={tab === "退款率" && !refunds && !refundError}
        columns={columns}
        scroll={{ x: 1680, y: 520 }}
        locale={{
          emptyText:
            tab === "退款率" && refundError
              ? "退款样本读取失败，请在退款率榜单重试"
              : "当前筛选没有款式",
        }}
        pagination={{
          current,
          pageSize: 25,
          showSizeChanger: false,
          hideOnSinglePage: true,
          showTotal: (total) => `共 ${total} 个款式`,
          onChange: (page) => setPaging({ rows, tab, refunds, page }),
        }}
      />
      <ProductStyleDrawer
        selected={selected}
        context={selected ? contexts[selected.key] : undefined}
        onClose={() => setSelectedKey(undefined)}
      />
    </div>
  );
}
