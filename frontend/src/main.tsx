import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { seekwayAntdTheme } from "./theme/seekway-antd-theme";
import { LiveReportApp } from "./app/LiveReportApp";
import "./styles/seekway-theme.css";
import "./styles/app.css";
import "./styles/report-layout.css";
import "./styles/report-details.css";
import "./styles/product-layout.css";
import "./styles/inventory-layout.css";
import "./styles/report-navigation.css";
import "./styles/live-report.css";
import "./styles/overview-analysis.css";
import "./styles/overview-breakdowns.css";
import "./styles/business-current.css";
import "./styles/business-tables.css";
import "./styles/business-analysis.css";

// 已验收的合成布局仅供开发回归；正式构建不暴露样例入口。
const PreviewApp = import.meta.env.DEV
  ? lazy(() =>
      import("./app/ReportApp").then((module) => ({
        default: module.ReportApp,
      })),
    )
  : undefined;
const preview =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("preview") === "1";

const root = document.getElementById("root");
if (!root) throw new Error("缺少页面入口");

createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={seekwayAntdTheme}
      card={{
        classNames: {
          root: "report-panel",
          header: "report-panel-heading",
          body: "report-panel-body",
        },
        styles: {
          header: {
            padding: 0,
            minHeight: 0,
            borderBottom: 0,
            marginBottom: 12,
          },
          body: { padding: 0 },
        },
      }}
    >
      <App>
        <Suspense fallback={<p>正在加载报告…</p>}>
          {preview && PreviewApp ? <PreviewApp /> : <LiveReportApp />}
        </Suspense>
      </App>
    </ConfigProvider>
  </StrictMode>,
);
