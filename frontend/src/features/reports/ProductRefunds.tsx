import { Alert, Button, Card, InputNumber, Skeleton, Table } from "antd";
import type { MetricRow } from "./contracts";
import type { ProductRefundView } from "./product-contracts";
import { format, percent } from "./presentation";

export function ProductRefunds({
  rows,
  minSales,
  onChange,
  analysis,
  error,
  retry,
}: {
  rows: MetricRow[];
  minSales: number;
  onChange: (value: number) => void;
  analysis?: ProductRefundView;
  error?: string;
  retry: () => void;
}) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ranking = (analysis?.ranking_keys ?? []).flatMap((key) => {
    const row = byKey.get(key);
    return row ? [row] : [];
  });
  return (
    <Card
      title="款式退款率 TOP10"
      size="small"
      className="product-refunds"
      classNames={{
        header: "category-card-heading",
        body: "category-card-body",
      }}
    >
      <div className="product-refund-controls">
        <label htmlFor="refund-min-sales">退款分析最低销量</label>
        <InputNumber
          id="refund-min-sales"
          min={1}
          precision={0}
          size="small"
          value={minSales}
          changeOnBlur
          onChange={(value) => {
            if (value !== null && value >= 1) onChange(value);
          }}
        />
        <span>件</span>
      </div>
      <p className="product-refund-note">
        本期销量达到门槛才参与排行及异常判断；退款率超过15%标红。
      </p>
      {error ? (
        <Alert
          type="error"
          title={error}
          action={
            <Button aria-label="重试退款分析" onClick={retry}>
              重试
            </Button>
          }
        />
      ) : !analysis ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <>
          <p className="product-refund-summary" aria-label="退款样本统计">
            当前范围 {analysis.total_styles} 款；低于{analysis.min_sales}件：
            {analysis.low_sales_count} 款（款式占比
            {percent(analysis.low_sales_share)}， 销量占比
            {percent(analysis.low_sales_qty_share)}）。
            {analysis.missing_sales_count > 0 &&
              `销量缺失${analysis.missing_sales_count}款，另行排除。`}
          </p>
          <Table<MetricRow>
            rowKey="key"
            size="small"
            dataSource={ranking}
            pagination={false}
            scroll={{ x: 290 }}
            locale={{
              emptyText: "当前范围没有达到销量门槛且退款率可计算的款式",
            }}
            columns={[
              {
                title: "款式",
                width: 125,
                ellipsis: true,
                render: (_, row) => row.dimensions.style,
              },
              {
                title: "站点",
                width: 40,
                render: (_, row) => row.dimensions.site,
              },
              {
                title: "销量",
                width: 55,
                align: "right",
                render: (_, row) => format(row.current.sales_qty, 0),
              },
              {
                title: "退款率",
                width: 70,
                align: "right",
                render: (_, row) => (
                  <span
                    className={
                      analysis.abnormal_keys.includes(row.key) ? "negative" : ""
                    }
                  >
                    {percent(row.current.refund_rate)}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}
