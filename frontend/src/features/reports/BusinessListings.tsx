import { useState } from "react";
import { Card, Input } from "antd";
import type { BusinessDetails, BusinessRow } from "./business-contracts";
import { format } from "./presentation";
import {
  businessAmount,
  BusinessChange,
  businessTone,
  compareBusinessSites,
  businessPercent as percent,
  BusinessRateChange,
} from "./business-presentation";

function withSubtotals(
  rows: BusinessRow[],
  totals: BusinessRow[],
  enabled: boolean,
) {
  if (!enabled) return rows;
  return [...new Set(rows.map((row) => row.dimensions.site))]
    .sort(compareBusinessSites)
    .flatMap((site) => [
      ...totals.filter((row) => row.dimensions.site === site),
      ...rows.filter((row) => row.dimensions.site === site),
    ]);
}
function CompactListings({
  title,
  rows,
  totals,
  selected,
}: {
  title: string;
  rows: BusinessRow[];
  totals: BusinessRow[];
  selected: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter((row) =>
    `${row.dimensions.site} ${row.dimensions.listing} ${row.category}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const visible = withSubtotals(filtered, totals, !selected && !search.trim());
  return (
    <Card
      title={title}
      size="small"
      extra={
        <Input.Search
          aria-label={`搜索${title.replace(" ", "")}`}
          placeholder="搜索LISTING/品类"
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      }
    >
      <div
        className="report-table-scroll"
        role="region"
        aria-label={title}
        tabIndex={0}
      >
        <table className="report-table business-listing-table">
          <thead>
            <tr>
              {[
                "小组",
                "站点",
                "三级品类",
                "LISTING",
                "销量",
                "销售额",
                "净利润",
                "净利率",
                "采购占比",
                "头程占比",
                "FBA配送占比",
                "FBA仓储占比",
                "营销推广占比",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                className={row.subtotal ? "business-subtotal" : ""}
              >
                <td>{row.dimensions.group || "—"}</td>
                <td>{row.dimensions.site}</td>
                <td>{row.category}</td>
                <td>{row.subtotal ? "站点小计" : row.dimensions.listing}</td>
                <td>{format(row.current.units, 0)}</td>
                <td>{businessAmount(row.current.revenue)}</td>
                <td className={businessTone(row.current.profit)}>
                  {businessAmount(row.current.profit)}
                </td>
                <td>{percent(row.current.margin)}</td>
                {[
                  "purchase",
                  "freight",
                  "delivery",
                  "storage",
                  "marketing",
                ].map((key) => (
                  <td key={key}>{percent(row.current[`${key}_rate`])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="business-empty">当前筛选无记录，请清除搜索后查看。</p>
        )}
      </div>
    </Card>
  );
}
export function BusinessListings({
  details,
  selected,
}: {
  details: BusinessDetails;
  selected: boolean;
}) {
  const rows = withSubtotals(details.listings, details.site_totals, !selected);
  const profits = details.listings.filter(
    (row) => row.current.profit !== null && Number(row.current.profit) >= 0,
  );
  const losses = details.listings.filter(
    (row) => row.current.profit !== null && Number(row.current.profit) < 0,
  );
  return (
    <>
      <Card title="LISTING 经营明细" size="small">
        <div
          className="report-table-scroll"
          role="region"
          aria-label="LISTING经营明细"
          tabIndex={0}
        >
          <table className="report-table business-listing-table business-full-listings">
            <thead>
              <tr>
                {[
                  "站点",
                  "三级品类",
                  "定位",
                  "LISTING",
                  "销量",
                  "销售额",
                  "销售贡献率",
                  "退货率",
                ].map((label) => (
                  <th key={label} rowSpan={2}>
                    {label}
                  </th>
                ))}
                {[
                  ["毛利润", 2],
                  ["产品营业利润", 2],
                  ["净利润", 2],
                  ["环比", 6],
                  ["同比", 6],
                ].map(([label, count]) => (
                  <th key={label} colSpan={Number(count)}>
                    {label}
                  </th>
                ))}
              </tr>
              <tr>
                {[
                  "毛利润",
                  "毛利率",
                  "产品营业利润",
                  "产品营业利润率",
                  "净利润",
                  "净利率",
                  ...["环比", "同比"].flatMap((mode) => [
                    `销量${mode}`,
                    `销量${mode}率`,
                    `销售额${mode}`,
                    `销售额${mode}率`,
                    `净利润${mode}`,
                    `净利率${mode}`,
                  ]),
                ].map((label, i) => (
                  <th key={i}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.subtotal ? "business-subtotal" : ""}
                >
                  <td>{row.dimensions.site}</td>
                  <td>{row.category}</td>
                  <td>{row.position || "—"}</td>
                  <td>{row.subtotal ? "站点小计" : row.dimensions.listing}</td>
                  <td>{format(row.current.units, 0)}</td>
                  <td>{businessAmount(row.current.revenue)}</td>
                  <td>{percent(row.revenue_share)}</td>
                  <td>{percent(row.current.return_rate)}</td>
                  {["gross_profit", "operating_profit", "profit"].map(
                    (key, index) => (
                      <PeriodProfit
                        key={key}
                        row={row}
                        field={key}
                        rate={
                          ["gross_margin", "operating_margin", "margin"][index]
                        }
                      />
                    ),
                  )}
                  {["mom", "yoy"].map((mode) => (
                    <ListingComparison key={mode} row={row} mode={mode} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <CompactListings
        title="盈利 LISTING"
        rows={profits}
        totals={details.profit_totals}
        selected={selected}
      />
      <CompactListings
        title="亏损 LISTING"
        rows={losses}
        totals={details.loss_totals}
        selected={selected}
      />
    </>
  );
}
function PeriodProfit({
  row,
  field,
  rate,
}: {
  row: BusinessRow;
  field: string;
  rate: string;
}) {
  return (
    <>
      <td className={businessTone(row.current[field])}>
        {businessAmount(row.current[field])}
      </td>
      <td>{percent(row.current[rate])}</td>
    </>
  );
}
function ListingComparison({ row, mode }: { row: BusinessRow; mode: string }) {
  return (
    <>
      <td>
        <BusinessChange value={row.deltas[`units_${mode}`]} scale={1} unit="" />
      </td>
      <td>
        <BusinessRateChange value={row.changes[`units_${mode}`]} />
      </td>
      <td>
        <BusinessChange
          value={row.deltas[`revenue_${mode}`]}
          scale={10000}
          unit="万"
        />
      </td>
      <td>
        <BusinessRateChange value={row.changes[`revenue_${mode}`]} />
      </td>
      <td>
        <BusinessChange
          value={row.deltas[`profit_${mode}`]}
          scale={10000}
          unit="万"
        />
      </td>
      <td>
        <BusinessChange value={row.deltas[`margin_${mode}`]} />
      </td>
    </>
  );
}
