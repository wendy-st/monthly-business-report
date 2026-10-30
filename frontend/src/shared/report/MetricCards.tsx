import { Card, Typography } from "antd";

export type Metric = {
  title: string;
  value: string;
  previous: string;
  yearAgo: string;
  mom: string;
  yoy: string;
};

export function MetricCards({
  metrics,
  caption = "总计",
  showArrows = false,
}: {
  metrics: Metric[];
  caption?: string;
  showArrows?: boolean;
}) {
  return (
    <div className="metric-grid">
      {metrics.map((item) => (
        <Card key={item.title} className="metric-card" size="small">
          <Typography.Text type="secondary">
            {item.title.replace(/（.*）/, "")}
          </Typography.Text>
          <div className="metric-value">
            {item.value}
            {item.title.includes("万元") ? "万" : ""}
            <small>{caption}</small>
          </div>
          <div className="metric-comparison">
            <span>环比</span>
            <span>{item.previous}</span>
            <strong
              className={item.mom.startsWith("-") ? "negative-change" : ""}
            >
              {showArrows && /^[+-]/.test(item.mom)
                ? item.mom.startsWith("-")
                  ? "↓ "
                  : "↑ "
                : ""}
              {item.mom}
            </strong>
          </div>
          <div className="metric-comparison">
            <span>同比</span>
            <span>{item.yearAgo}</span>
            <strong
              className={item.yoy.startsWith("-") ? "negative-change" : ""}
            >
              {showArrows && /^[+-]/.test(item.yoy)
                ? item.yoy.startsWith("-")
                  ? "↓ "
                  : "↑ "
                : ""}
              {item.yoy}
            </strong>
          </div>
        </Card>
      ))}
    </div>
  );
}
