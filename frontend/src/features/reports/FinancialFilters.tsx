import { useState } from "react";
import { Button, Card, Input, Select } from "antd";
import type { Filters } from "./contracts";

const dimensions = [
  "group",
  "site",
  "category1",
  "category2",
  "category3",
  "listing",
  "style",
];
const labels = [
  "小组",
  "站点",
  "一级品类",
  "二级品类",
  "三级品类",
  "LISTING",
  "款式",
];

export function FinancialFilters({
  filters,
  options,
  product,
  fixedGroup,
  onChange,
}: {
  filters: Filters;
  options: Record<string, string[]>;
  product: boolean;
  fixedGroup: boolean;
  onChange: (next: Filters) => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");
  function select(key: string, value: string) {
    const next = { ...filters, [key]: value };
    dimensions.slice(dimensions.indexOf(key) + 1).forEach((lower) => {
      next[lower] = "";
    });
    onChange(next);
  }
  const keys = product ? dimensions : ["site", "listing"];
  const content = (
    <div className={product ? "filter-grid" : "business-filter-strip"}>
      {product && (
        <label className="filter-field">
          月份
          <Select
            aria-label="产品月份"
            size="small"
            disabled
            value="2026-09"
            options={[{ value: "2026-09", label: "2026年9月" }]}
          />
        </label>
      )}
      {keys.map((key) => (
        <label className="filter-field" key={key}>
          <span>{labels[dimensions.indexOf(key)]}</span>
          <Select
            aria-label={labels[dimensions.indexOf(key)]}
            size={product ? "small" : "middle"}
            value={filters[key] || ""}
            showSearch
            disabled={key === "group" && fixedGroup}
            options={[
              { value: "", label: "全部" },
              ...(options[key] ?? []).map((value) => ({ value, label: value })),
            ]}
            onChange={(value) => select(key, value)}
            style={{ width: "100%" }}
          />
        </label>
      ))}
      {product && (
        <label className="filter-field">
          <span>盈亏状态</span>
          <Select
            aria-label="盈亏状态"
            value={filters.result || ""}
            options={[
              { value: "", label: "全部" },
              { value: "盈利", label: "盈利" },
              { value: "亏损", label: "亏损" },
            ]}
            onChange={(value) => onChange({ ...filters, result: value })}
          />
        </label>
      )}
      <label className="filter-field">
        <span>搜索</span>
        <Input.Search
          size={product ? "small" : "middle"}
          aria-label="搜索LISTING或款式"
          placeholder="关键词回车"
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSearch={(value) => onChange({ ...filters, search: value })}
        />
      </label>
    </div>
  );
  const reset = (
    <Button
      size="small"
      className={product ? "product-reset" : ""}
      onClick={() => {
        setSearch("");
        onChange({ group: fixedGroup ? filters.group : "" });
      }}
    >
      重置筛选
    </Button>
  );
  return product ? (
    <Card size="small" className="product-filters">
      {content}
      {reset}
    </Card>
  ) : (
    <>
      {content}
      {reset}
    </>
  );
}
