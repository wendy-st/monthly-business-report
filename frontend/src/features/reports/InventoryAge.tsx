import { Fragment, useState } from "react";
import { Button, Card, Empty } from "antd";
import type { InventoryView } from "./contracts";
import { format, percent } from "./presentation";

const groupOrder = ["LZF", "HCM", "Ash", "KAYO-北美", "KAYO-欧日", "薄底水鞋"];

export function InventoryAge({ data }: { data: InventoryView }) {
  const [expanded, setExpanded] = useState<{ key: string; age: string } | null>(
    null,
  );
  const groups = [...data.breakdowns.groups].sort(
    (a, b) =>
      groupOrder.indexOf(a.dimensions.group) -
      groupOrder.indexOf(b.dimensions.group),
  );
  return (
    <section className="inventory-section">
      <h2 className="inventory-section-title">
        <b>5</b>FBA库龄
      </h2>
      <Card title="FBA库龄占比（按小组）" size="small">
        <div className="inventory-age-cards">
          {groups.map((group) => {
            const rows = data.breakdowns.age_listings
              .filter((row) => row.dimensions.group === group.dimensions.group)
              .sort(
                (a, b) => Number(b.values.age180) - Number(a.values.age180),
              );
            if (!rows.length) return null;
            return (
              <article className="inventory-age-card" key={group.key}>
                <div className="inventory-age-heading">
                  <h3>{group.dimensions.group}组</h3>
                  <div>
                    <span>在库量 {format(group.values.in_stock, 0)}</span>
                    <span>
                      180+ {format(group.values.age180, 0)} /{" "}
                      {percent(group.values.age180_rate)}
                    </span>
                    <span>
                      270+ {format(group.values.age270, 0)} /{" "}
                      {percent(group.values.age270_rate)}
                    </span>
                  </div>
                </div>
                <div className="inventory-age-scroll report-table-scroll">
                  <table className="report-table inventory-age-table">
                    <thead>
                      <tr>
                        <th>站点</th>
                        <th>LISTING</th>
                        <th>180天以上库存量</th>
                        <th>占比</th>
                        <th>270天以上库存量</th>
                        <th>占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <Fragment key={row.key}>
                          <tr>
                            <td>{row.dimensions.site}</td>
                            <th>{row.dimensions.listing}</th>
                            {["age180", "age270"].map((age) => {
                              const active =
                                expanded?.key === row.key &&
                                expanded.age === age;
                              const max = Math.max(
                                ...rows.map((item) => Number(item.values[age])),
                                1,
                              );
                              return (
                                <Fragment key={age}>
                                  <td>
                                    <Button
                                      type="text"
                                      className="inventory-age-bar"
                                      disabled={!Number(row.values[age])}
                                      aria-label={`${row.dimensions.group} ${row.dimensions.site} ${row.dimensions.listing} ${age === "age180" ? "180" : "270"}天以上SKU明细`}
                                      aria-expanded={active}
                                      onClick={() =>
                                        setExpanded(
                                          active ? null : { key: row.key, age },
                                        )
                                      }
                                    >
                                      <span
                                        className={`warehouse-track ${age === "age270" ? "inventory-age-deep" : ""}`}
                                      >
                                        <i
                                          style={{
                                            width: `${(Number(row.values[age]) / max) * 100}%`,
                                          }}
                                        />
                                      </span>
                                      {format(row.values[age], 0)}
                                    </Button>
                                  </td>
                                  <td>{percent(row.values[`${age}_rate`])}</td>
                                </Fragment>
                              );
                            })}
                          </tr>
                          {expanded?.key === row.key && (
                            <tr>
                              <td
                                colSpan={6}
                                className="inventory-age-expanded"
                              >
                                <h4>
                                  {row.dimensions.site} /{" "}
                                  {row.dimensions.listing} /{" "}
                                  {expanded.age === "age180" ? "180" : "270"}
                                  天以上SKU明细
                                </h4>
                                <div className="report-table-scroll">
                                  <table className="report-table inventory-age-skus">
                                    <thead>
                                      <tr>
                                        {[
                                          "SKU",
                                          "MSKU",
                                          "产品名称",
                                          "ASIN",
                                          "FNSKU",
                                          "在库量",
                                          "181~270",
                                          "271~330",
                                          "331~365",
                                          "365+",
                                          "超龄数量",
                                          "占SKU库存",
                                        ].map((title) => (
                                          <th key={title}>{title}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {data.breakdowns.age
                                        .filter(
                                          (item) =>
                                            ["group", "site", "listing"].every(
                                              (name) =>
                                                item.dimensions[name] ===
                                                row.dimensions[name],
                                            ) &&
                                            Number(item.values[expanded.age]) >
                                              0,
                                        )
                                        .sort(
                                          (a, b) =>
                                            Number(b.values[expanded.age]) -
                                            Number(a.values[expanded.age]),
                                        )
                                        .map((item) => (
                                          <tr key={item.key}>
                                            {[
                                              "sku",
                                              "msku",
                                              "product_name",
                                              "asin",
                                              "fnsku",
                                            ].map((name) => (
                                              <td key={name}>
                                                {item.dimensions[name] || "—"}
                                              </td>
                                            ))}
                                            {[
                                              "in_stock",
                                              "age181",
                                              "age271",
                                              "age331",
                                              "age365",
                                              expanded.age,
                                            ].map((name) => (
                                              <td key={name}>
                                                {format(item.values[name], 0)}
                                              </td>
                                            ))}
                                            <td>
                                              {percent(
                                                item.values[
                                                  `${expanded.age}_rate`
                                                ],
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
        {!data.breakdowns.age_listings.length && (
          <Empty description="当前没有180天以上的有效FBA库龄记录" />
        )}
      </Card>
    </section>
  );
}
