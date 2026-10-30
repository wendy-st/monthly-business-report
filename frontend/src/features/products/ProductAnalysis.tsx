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
      <div className="product-head">
        <div>
          <h2 className="section-heading">3. 产品经营分析</h2>
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
      <ProductDiagnostics rows={rows} />
      <CostDiagnostics rows={rows} />
      <ProductDetails rows={rows} />
      <h2 className="section-heading">
        <span>
          五、LISTING 历史验证
          <small>选择款式后，对照历史销售、利润和成本率。</small>
        </span>
      </h2>
      <div className="pending-section">
        请点击上方款式明细中的“查看”。历史真实数据尚未接入。
      </div>
    </div>
  );
}
