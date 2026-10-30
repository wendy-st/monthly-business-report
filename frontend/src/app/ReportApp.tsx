import { useState } from "react";
import { Button, Layout, Modal, Tag, Typography } from "antd";
import { ReportNavigation } from "./ReportNavigation";
import { Overview } from "../features/overview/Overview";
import { ProductAnalysis } from "../features/products/ProductAnalysis";
import { SourceImport } from "../features/sources/SourceImport";
import { groupNames } from "../features/overview/fixtures";
import { BusinessAnalysis } from "../features/business/BusinessAnalysis";
import { InventoryAnalysis } from "../features/inventory/InventoryAnalysis";
import { ListingAnalysis } from "../features/listing/ListingAnalysis";

/** 月份与分组在壳层维护；本阶段仅验证布局和界面状态。 */
export function ReportApp() {
  const [page, setPage] = useState("overview");
  const [group, setGroup] = useState(groupNames[0]);
  const [showBasis, setShowBasis] = useState(false);
  function navigate(key: string) {
    if (key.includes(":")) setGroup(key.split(":")[1]);
    else {
      setPage(key);
      window.scrollTo({ top: 0 });
    }
  }
  return (
    <Layout className="app-layout">
      <Layout.Sider width={228} className="report-sidebar">
        <div className="sidebar-heading">
          <div className="sidebar-logo">SEEKWAY</div>
          <div className="sidebar-title">经营分析报告</div>
          <div className="report-period">
            2026年9月
            <br />
            环比：2026年8月
            <br />
            同比：2025年9月
          </div>
          <label className="month-control">
            报告月份
            <select
              aria-label="报告月份"
              className="report-month-select"
              value="2026-09"
              onChange={() => undefined}
            >
              <option value="2026-09">2026年9月</option>
            </select>
          </label>
        </div>
        <ReportNavigation
          page={page}
          group={group}
          groups={groupNames}
          onNavigate={navigate}
        />
        <div className="sidebar-tools">
          <Button
            block
            type={page === "sources" ? "primary" : "default"}
            onClick={() => navigate("sources")}
          >
            数据导入与生成
          </Button>
          <Button block onClick={() => setShowBasis(true)}>
            口径说明
          </Button>
        </div>
      </Layout.Sider>
      <Layout className="report-body">
        <header className="report-header">
          <div>
            <Typography.Title level={1}>
              2026年9月月度经营分析报告
            </Typography.Title>
            <Typography.Text type="secondary">
              布局参照原报告。当前为合成数据样例；正式报告按来源及核算逻辑生成，成本费用项转正后做占比、环比和同比。
            </Typography.Text>
          </div>
          <Tag className="preview-label" color="warning">
            界面样例／合成数据
          </Tag>
        </header>
        <Layout.Content className="page-content">
          {page === "overview" && <Overview />}
          {page === "products" && <ProductAnalysis />}
          {page === "business" && (
            <BusinessAnalysis key={group} group={group} />
          )}
          {page === "sources" && <SourceImport />}
          {page === "inventory" && <InventoryAnalysis />}
          {page === "listing" && <ListingAnalysis group={group} />}
        </Layout.Content>
      </Layout>
      <Modal
        title="口径说明"
        open={showBasis}
        footer={null}
        onCancel={() => setShowBasis(false)}
      >
        <Typography.Paragraph>
          当前为布局样例，所有金额、数量、图表和结论均为合成数据，不能作为经营报告。
        </Typography.Paragraph>
        <Typography.Paragraph>
          正式系统按业务基准区分实际、剔价、剔价剔退款口径；计算与正式筛选汇总由后端提供。
        </Typography.Paragraph>
        <Typography.Paragraph>
          现阶段仅2026年9月可选，其他月份待正式导入后开放。
        </Typography.Paragraph>
      </Modal>
    </Layout>
  );
}
