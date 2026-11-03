import { useState } from "react";
import { Card, Segmented, Typography, theme } from "antd";
import { FinancialDiagnostics } from "../../shared/report/FinancialDiagnostics";
import { ReportChart } from "../../shared/report/ReportChart";
import { tooltipValue } from "../../shared/report/format";
import { waterfallFixtures } from "./fixtures";

export function ProfitBridge({
  fixtures = waterfallFixtures,
  group = false,
}: {
  fixtures?: typeof waterfallFixtures;
  group?: boolean;
}) {
  const [comparison, setComparison] = useState<"环比" | "同比">("环比");
  const fixture = fixtures[comparison];
  const { token } = theme.useToken();
  return (
    <Card
      title="净利润分析瀑布图"
      styles={{
        title: { flex: `0 1 ${group ? "22%" : "42.25%"}` },
        extra: { marginInlineStart: 0 },
      }}
      size="small"
      extra={
        <Segmented
          aria-label="利润比较期间"
          value={comparison}
          options={["环比", "同比"]}
          onChange={setComparison}
        />
      }
    >
      <Typography.Paragraph type="secondary">
        按{comparison}金额拆解 · 人民币万元 · 合成样例
      </Typography.Paragraph>
      <ReportChart
        summary={fixture.summary}
        option={{
          tooltip: { trigger: "axis", valueFormatter: tooltipValue("万") },
          legend: { data: ["净利润及影响金额"] },
          grid: { left: 52, right: 24, top: 40, bottom: 36 },
          xAxis: { type: "category", data: fixture.names },
          yAxis: { type: "value", name: "人民币万元" },
          series: [
            {
              name: "基底",
              type: "bar",
              stack: "bridge",
              silent: true,
              itemStyle: { color: "transparent" },
              emphasis: { itemStyle: { color: "transparent" } },
              data: fixture.base,
              tooltip: { show: false },
            },
            {
              name: "净利润及影响金额",
              type: "bar",
              stack: "bridge",
              barMaxWidth: 56,
              label: {
                show: true,
                position: "top",
                formatter: (params: { dataIndex: number }) =>
                  fixture.labels[params.dataIndex],
              },
              data: fixture.values.map((value, index) => ({
                value,
                itemStyle: {
                  color:
                    index === 2
                      ? token.colorError
                      : index === 0 || index === 5
                        ? token.colorInfo
                        : token.colorPrimary,
                },
              })),
            },
          ],
        }}
      />
      <FinancialDiagnostics />
    </Card>
  );
}
