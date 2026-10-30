import { useState } from "react";
import { Alert, Button, Layout, Modal, Tag, Typography } from "antd";
import { ReportNavigation } from "./ReportNavigation";
import { FinancialPage } from "../features/reports/FinancialPage";
import { BusinessPage } from "../features/reports/BusinessPage";
import { InventoryPage } from "../features/reports/InventoryPage";
import { ListingPage } from "../features/reports/ListingPage";
import { SourcesPage } from "../features/reports/SourcesPage";
import { useReport } from "../features/reports/api";

const groupOrder = ["LZF", "HCM", "Ash", "KAYO-北美", "KAYO-欧日", "薄底水鞋"];

export function LiveReportApp() {
  const [page, setPage] = useState("overview");
  const [group, setGroup] = useState("LZF");
  const [showBasis, setShowBasis] = useState(false);
  const metadata = useReport<Record<string, string[]>>("options");
  const groups = [...(metadata.data?.group ?? groupOrder)].sort(
    (left, right) => {
      const rank = (name: string) =>
        groupOrder.includes(name) ? groupOrder.indexOf(name) : 99;
      return rank(left) - rank(right);
    },
  );
  function navigate(key: string) {
    if (key.includes(":")) setGroup(key.split(":")[1]);
    else {
      setPage(key);
      window.scrollTo({ top: 0 });
    }
  }
  return (
    <Layout className="app-layout live-report" data-report-month="2026-09">
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
          groups={groups}
          onNavigate={navigate}
        />
        <div className="sidebar-tools">
          <Button
            block
            type={page === "sources" ? "primary" : "default"}
            onClick={() => navigate("sources")}
          >
            数据来源与导入状态
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
              经营金额为人民币；成本费用保留核算方向，费用负担另按展示口径呈现。库存规模与周转天数分源核算。
            </Typography.Text>
          </div>
          <Tag className="preview-label" color="processing">
            9月真实数据 · 待核对
          </Tag>
        </header>
        <Layout.Content className="page-content">
          {metadata.error && (
            <Alert
              type="error"
              title={metadata.error}
              action={<Button onClick={metadata.retry}>重试连接</Button>}
            />
          )}
          {page === "overview" && <FinancialPage kind="overview" />}
          {page === "business" && <BusinessPage key={group} group={group} />}
          {page === "products" && <FinancialPage kind="products" />}
          {page === "inventory" && (
            <InventoryPage groups={groups} sites={metadata.data?.site ?? []} />
          )}
          {page === "listing" && (
            <ListingPage key={group} group={group} groups={groups} />
          )}
          {page === "sources" && <SourcesPage />}
        </Layout.Content>
      </Layout>
      <Modal
        title="口径说明"
        open={showBasis}
        footer={null}
        onCancel={() => setShowBasis(false)}
      >
        <Typography.Paragraph>
          本期、环比、同比经营数据均来自经营底表，利润按收入和有符号费用重算；历史看板保留历史LISTING结果表中的冻结利润，不混用两条路径。
        </Typography.Paragraph>
        <Typography.Paragraph>
          库存规模、金额、结构、库龄和未来支持起点使用经营工作簿“库存数据”。库存周转天数的期初、期末和销售流量单独使用2025、2026库存周转表。未来需求使用已有预测结果，不假定新增补货。
        </Typography.Paragraph>
        <Typography.Paragraph>
          实际、剔价、剔价剔退款分别核算。缺记录、缺字段、零分母和还原依据不足保留不可计算状态；原始Excel未重算，外链未刷新。
        </Typography.Paragraph>
        <Typography.Paragraph>
          第5模块仅本期沿用新品、UK推广、停运/废弃及MX简版，排除FR/ES/IT；经营总览仍包含这些站点。其他月份待导入后开放。
        </Typography.Paragraph>
      </Modal>
    </Layout>
  );
}
