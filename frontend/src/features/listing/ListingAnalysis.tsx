import { Button, Card, Tag, Tooltip, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { productFixtures } from "../products/fixtures";
import { ListingCard } from "./ListingCard";

export function ListingAnalysis({ group }: { group: string }) {
  const rows = productFixtures.filter((row) => row.group === group);
  const sites = [...new Set(rows.map((row) => row.site))];
  return (
    <div className="section-stack listing-page">
      <div className="listing-heading">
        <div>
          <h2 className="section-heading">{group} · LISTING分析问题清单</h2>
          <Typography.Text type="secondary">
            按小组、站点、LISTING归集经营、费用、库存周转及未来预警。
          </Typography.Text>
        </div>
        <Tooltip title="真实报告接入后开放PDF导出">
          <Button disabled icon={<PrinterOutlined />}>
            保存为PDF
          </Button>
        </Tooltip>
      </div>
      <Card size="small" className="listing-group-summary">
        <div className="listing-summary">
          <div>
            <h3>{group}</h3>
            <Tag>LISTING {rows.length}个</Tag>
            <Tag>站点 {sites.length}个</Tag>
          </div>
          <div className="listing-summary-copy">
            <p>
              {group}
              的核心结论：当前为合成样例。先查看经营规模与盈利，再对照成本费用、库存规模和未来库存预警。
            </p>
            <p>
              库存与预测尚未关联，缺失值保留“—”。静态周转、未来扣减和季节性预测分别显示，正式接入后提供经营判断。
            </p>
            <div className="listing-position-summary">
              维护 — 个 · 新品 — 个 · 废弃 — 个 · 已停运 — 个
            </div>
          </div>
        </div>
      </Card>
      {sites.map((site) => (
        <section
          className="section-stack listing-site-section"
          key={site}
          aria-label={`${site}站点报告`}
        >
          <div className="listing-site">
            <h2>{site}站点</h2>
            <span>
              LISTING {rows.filter((row) => row.site === site).length}个 ·
              合成样例
            </span>
          </div>
          {rows
            .filter((row) => row.site === site)
            .map((row) => (
              <ListingCard row={row} key={row.id} />
            ))}
        </section>
      ))}
    </div>
  );
}
