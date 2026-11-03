import { useEffect, useRef } from "react";
import { theme } from "antd";
import { init, use, type EChartsCoreOption } from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  GraphicComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  GraphicComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/** 图表共用生命周期；业务页面提供展示配置和可访问的数据摘要。 */
export function ReportChart({
  option,
  summary,
  sample = true,
}: {
  option: EChartsCoreOption;
  summary: string;
  sample?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();
  useEffect(() => {
    if (!element.current) return;
    const chart = init(element.current);
    chart.setOption({
      animation: false,
      color: [
        token.colorPrimary,
        token.colorInfo,
        token.colorWarning,
        token.colorError,
        token.colorTextSecondary,
      ],
      textStyle: {
        fontFamily: token.fontFamily,
        fontSize: 12,
        color: token.colorTextSecondary,
      },
      ...option,
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [
    option,
    token.colorPrimary,
    token.colorInfo,
    token.colorWarning,
    token.colorError,
    token.colorTextSecondary,
    token.fontFamily,
  ]);
  return (
    <figure className="report-chart">
      <div
        ref={element}
        className="chart-canvas"
        role="img"
        aria-label={summary}
      />
      <figcaption>
        <details>
          <summary>查看图表数据{sample ? " · 合成样例" : ""}</summary>
          <p>{summary}</p>
        </details>
      </figcaption>
    </figure>
  );
}
