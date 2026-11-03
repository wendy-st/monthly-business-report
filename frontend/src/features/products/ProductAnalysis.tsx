import { useState } from "react";
import { Button, Space, Typography } from "antd";
import { groupNames } from "../overview/fixtures";
import { filterProducts, initialFilters } from "./fixtures";
import { ProductFilters } from "./ProductFilters";
import { ProductDiagnostics } from "./ProductDiagnostics";
import { CostDiagnostics } from "./CostDiagnostics";
import { ProductDetails } from "./ProductDetails";

export function ProductAnalysis() {
  const [filters, setFilters] = useState(initialFilters);
  const rows = filterProducts(filters);
  return (
    <div className="section-stack product-page">
      <div className="sticky-filter-bar">
        <div className="product-head">
          <div>
            <h2 className="section-heading">3. 品类经营分析</h2>
            <Typography.Text type="secondary">
              按小组、站点、LISTING与款式诊断盈利、成本和退款影响。
            </Typography.Text>
          </div>
          <span>唯一粒度：月份 × 小组 × 站点 × LISTING × 款式</span>
        </div>
        <ProductFilters value={filters} onChange={setFilters} />
        <Space wrap className="product-groups">
          {["全部", ...groupNames].map((group) => (
            <Button
              key={group}
              size="small"
              type={filters.group === group ? "primary" : "default"}
              onClick={() => setFilters({ ...filters, group })}
            >
              {group === "全部" ? "全部小组" : group}
            </Button>
          ))}
        </Space>
      </div>
      <ProductDiagnostics rows={rows} />
      <CostDiagnostics rows={rows} />
      <ProductDetails rows={rows} />
    </div>
  );
}
