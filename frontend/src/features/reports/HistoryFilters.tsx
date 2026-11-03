import { useReportMonth } from "./report-month";
import { Button, Card, Select } from "antd";
import type { HistoryView } from "./contracts";
import { compareBusinessSites } from "./business-presentation";
import { historyYear } from "./history-presentation";

export type HistorySelection = {
  site: string;
  listing: string;
  years: string[];
  yearBasis: HistoryView["year_basis"];
  periodScope: HistoryView["period_scope"];
};

export function HistoryFilters({
  data,
  value,
  onChange,
}: {
  data?: HistoryView;
  value: HistorySelection;
  onChange: (update: Partial<HistorySelection>) => void;
}) {
  const { month } = useReportMonth();
  const { site, listing, years, yearBasis, periodScope } = value;
  const availableYears = data?.years || [month.slice(0, 4)];
  return (
    <Card size="small" className="history-filter-toolbar">
      <div className="history-filter-row">
        <label>
          年度口径
          <Select
            virtual={false}
            aria-label="年度口径"
            value={yearBasis}
            options={[
              { value: "calendar", label: "自然年度（1—12月）" },
              { value: "fiscal", label: "财务年度（4—3月）" },
            ]}
            onChange={(yearBasis) => onChange({ yearBasis })}
          />
        </label>
        <label>
          统计区间
          <Select
            virtual={false}
            aria-label="年度统计区间"
            value={periodScope}
            options={[
              { value: "full", label: "全年" },
              {
                value: "h1",
                label:
                  yearBasis === "fiscal"
                    ? "上半年（4—9月）"
                    : "上半年（1—6月）",
              },
              {
                value: "h2",
                label:
                  yearBasis === "fiscal"
                    ? "下半年（10—3月）"
                    : "下半年（7—12月）",
              },
            ]}
            onChange={(periodScope) => onChange({ periodScope })}
          />
        </label>
        <label>
          站点
          <Select
            virtual={false}
            aria-label="历史站点"
            value={site}
            options={[
              { value: "", label: "全部站点" },
              ...[...(data?.options.site || [])]
                .sort(compareBusinessSites)
                .map((value) => ({ value, label: value })),
            ]}
            onChange={(site) => onChange({ site, listing: "" })}
          />
        </label>
        <label>
          趋势LISTING
          <Select
            virtual={false}
            aria-label="历史LISTING"
            value={listing}
            options={[
              { value: "", label: "小组合计" },
              ...(data?.options.listing || []).map((value) => ({
                value,
                label: value,
              })),
            ]}
            onChange={(listing) => onChange({ listing })}
          />
        </label>
        <div
          className="history-year-filters"
          role="group"
          aria-label="历史年份"
        >
          <span>选择年份（可多选）</span>
          {[...availableYears]
            .sort()
            .reverse()
            .map((year) => (
              <Button
                key={year}
                aria-pressed={years.includes(year)}
                type={years.includes(year) ? "primary" : "default"}
                onClick={() =>
                  onChange({
                    years: years.includes(year)
                      ? years.length > 1
                        ? years.filter((value) => value !== year)
                        : years
                      : [...years, year].sort(),
                  })
                }
              >
                {data
                  ? historyYear(year, data)
                  : yearBasis === "fiscal"
                    ? `${year}/${String(Number(year) + 1).slice(-2)}财年`
                    : `${year}年`}
              </Button>
            ))}
        </div>
      </div>
    </Card>
  );
}
