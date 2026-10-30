const pages = [
  ["overview", "1. 经营总览"],
  ["business", "2. 业务组经营分析"],
  ["products", "3. 产品经营分析"],
  ["inventory", "4. 库存周转"],
  ["listing", "5. LISTING业务分析报告"],
] as const;

/** 原稿的文字导航；子组沿细竖线排列，不额外插入组标题。 */
export function ReportNavigation({
  page,
  group,
  onNavigate,
  groups,
}: {
  page: string;
  group: string;
  onNavigate: (key: string) => void;
  groups: string[];
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
      {pages.map(([key, label]) => (
        <div key={key}>
          <button
            role="menuitem"
            aria-current={page === key ? "page" : undefined}
            className={`report-nav-main ${page === key ? "active" : ""}`}
            onClick={() => onNavigate(key)}
          >
            {label}
          </button>
          {page === key && ["business", "listing"].includes(key) && (
            <div className="report-subnav" role="group" aria-label="业务小组">
              {groups.map((name, index) => (
                <button
                  key={name}
                  role="menuitem"
                  aria-current={name === group ? "page" : undefined}
                  className={`report-nav-sub ${name === group ? "active" : ""}`}
                  onClick={() => onNavigate(`${key}:${name}`)}
                >
                  {key === "business" ? "2" : "5"}.{index + 1} {name}
                  {key === "listing" ? "LISTING分析报告" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
