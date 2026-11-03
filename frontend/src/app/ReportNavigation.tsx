import {
  AppstoreOutlined,
  BarChartOutlined,
  InboxOutlined,
  LineChartOutlined,
  PieChartOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";

const pages = [
  ["overview", "经营总览", PieChartOutlined],
  ["business", "月度经营分析", BarChartOutlined],
  ["annual", "年度经营分析", LineChartOutlined],
  ["products", "品类经营分析", AppstoreOutlined],
  ["inventory", "库存周转", InboxOutlined],
  ["itk", "ITK大盘数据分析", BarChartOutlined],
  ["listing", "LISTING分析问题清单", UnorderedListOutlined],
] as const;

/** 图标与文字共同标识模块；月度、年度和问题清单按同一小组切换。 */
export function ReportNavigation({
  page,
  group,
  onNavigate,
  groups,
  includeItk = true,
}: {
  page: string;
  group: string;
  onNavigate: (key: string) => void;
  groups: string[];
  includeItk?: boolean;
}) {
  return (
    <nav
      className="report-navigation"
      role="menu"
      aria-label="报告模块"
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]',
          ),
        );
        const current = buttons.findIndex(
          (button) => button === document.activeElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      {pages
        .filter(([key]) => includeItk || key !== "itk")
        .map(([key, label, Icon]) => (
          <div key={key}>
            <button
              role="menuitem"
              aria-current={page === key ? "page" : undefined}
              className={`report-nav-main ${page === key ? "active" : ""}`}
              onClick={() => onNavigate(key)}
            >
              <Icon className="report-nav-icon" aria-hidden />
              <span>{label}</span>
            </button>
            {page === key &&
              ["business", "annual", "listing"].includes(key) && (
                <div
                  className="report-subnav"
                  role="group"
                  aria-label="业务小组"
                >
                  {groups.map((name) => (
                    <button
                      key={name}
                      role="menuitem"
                      aria-current={name === group ? "page" : undefined}
                      className={`report-nav-sub ${name === group ? "active" : ""}`}
                      onClick={() => onNavigate(`${key}:${name}`)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
          </div>
        ))}
    </nav>
  );
}
