import { Card } from "antd";
import { overviewFixture as fixture } from "./fixtures";
import { MetricCards } from "../../shared/report/MetricCards";
import { ReportChart } from "../../shared/report/ReportChart";
import { donutOption, trendOption } from "../../shared/report/chart-options";
import { OverviewDetails } from "./OverviewDetails";
import { ProfitBridge } from "./ProfitBridge";

export function Overview() {
  return (
    <div className="section-stack overview-page">
      <Card title="本月经营结论" size="small" className="conclusion-card">
        <ul className="conclusion-list">
          <li>
            合成样例：本期净销售额128.00万元，净利润19.20万元，净利率15.00%。
          </li>
          <li>环比净销售额增长6.7%，净利润增长12.3%；同比净利润增长28.0%。</li>
        </ul>
      </Card>
      <MetricCards metrics={fixture.metrics} />
      <div className="overview-chart-grid">
        <Card
          title="核心指标趋势"
          size="small"
          styles={{ header: { marginBottom: 24 } }}
        >
          <ReportChart
            option={trendOption(
              fixture.periods,
              fixture.revenue,
              fixture.profit,
              fixture.margin,
            )}
            summary="去年同月、上月、本月净销售额分别为108、120、128万元；净利润15、17.1、19.2万元；净利率13.89%、14.25%、15.00%。三期比较，非连续月趋势。"
          />
        </Card>
        <Card title="一级品类销售额占比" size="small">
          <ReportChart
            option={donutOption(
              fixture.categories,
              fixture.categoryShares,
              "%",
              "128.00万",
            )}
            summary="水鞋56%，手套24%，眼镜16%，其他4%。"
          />
        </Card>
      </div>
      <ProfitBridge />
      <OverviewDetails />
    </div>
  );
}
