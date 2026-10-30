import { Button, Card, Input, Select } from "antd";
import {
  initialFilters,
  productFixtures,
  type ProductFiltersValue,
} from "./fixtures";

const fields = [
  ["group", "小组"],
  ["site", "站点"],
  ["category1", "一级品类"],
  ["category2", "二级品类"],
  ["category3", "三级品类"],
  ["listing", "LISTING"],
  ["style", "款式"],
] as const;

export function ProductFilters({
  value,
  onChange,
}: {
  value: ProductFiltersValue;
  onChange: (value: ProductFiltersValue) => void;
}) {
  return (
    <Card size="small" className="product-filters">
      <div className="filter-grid">
        <label className="filter-field">
          月份
          <Select
            aria-label="产品月份"
            value="2026-09"
            size="small"
            options={[{ value: "2026-09", label: "2026年9月" }]}
          />
        </label>
        {fields.map(([key, label]) => (
          <label key={key} className="filter-field">
            {label}
            <Select
              aria-label={`产品${label}`}
              size="small"
              showSearch
              value={value[key]}
              onChange={(next) => onChange({ ...value, [key]: next })}
              options={[
                "全部",
                ...new Set(productFixtures.map((row) => row[key])),
              ].map((option) => ({
                value: option,
                label: option === "全部" ? `全部${label}` : option,
              }))}
            />
          </label>
        ))}
        <label className="filter-field">
          盈亏状态
          <Select
            aria-label="盈亏状态"
            size="small"
            value={value.result}
            onChange={(result) => onChange({ ...value, result })}
            options={["全部", "盈利", "亏损"].map((option) => ({
              value: option,
              label: option,
            }))}
          />
        </label>
        <label className="filter-field">
          搜索
          <Input
            aria-label="搜索款式"
            allowClear
            size="small"
            placeholder="LISTING / 款式"
            value={value.search}
            onChange={(event) =>
              onChange({ ...value, search: event.target.value })
            }
          />
        </label>
      </div>
      <Button
        size="small"
        className="product-reset"
        onClick={() => onChange(initialFilters)}
      >
        重置筛选
      </Button>
    </Card>
  );
}
