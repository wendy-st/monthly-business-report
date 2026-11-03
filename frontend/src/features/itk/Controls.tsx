import { Alert, Button, Select, Skeleton } from "antd";
import type { ReactNode } from "react";
import type { Scope } from "./contracts";

export function Field({
  label,
  value,
  options,
  onChange,
  empty,
  searchable = false,
}: {
  label: string;
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (value: string) => void;
  empty?: string;
  searchable?: boolean;
}) {
  return (
    <label className="itk-field">
      <span>{label}</span>
      {searchable ? (
        <Select
          aria-label={label}
          value={value}
          onChange={onChange}
          showSearch={{ optionFilterProp: "label" }}
          virtual={false}
          notFoundContent="无匹配选项"
          styles={{ root: { width: "100%", height: 38 } }}
          options={[
            ...(empty ? [{ value: "", label: empty }] : []),
            ...options.map((item) =>
              typeof item === "string" ? { value: item, label: item } : item,
            ),
          ]}
        />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {empty && <option value="">{empty}</option>}
          {options.map((item) =>
            typeof item === "string" ? (
              <option key={item}>{item}</option>
            ) : (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ),
          )}
        </select>
      )}
    </label>
  );
}
export function Dates({
  scope,
  months,
  onChange,
}: {
  scope: Scope;
  months: string[];
  onChange: (field: "start" | "end", value: string) => void;
}) {
  return (
    <>
      <Field
        label="起始年月"
        value={scope.start}
        options={months}
        onChange={(value) => onChange("start", value)}
      />
      <Field
        label="结束年月"
        value={scope.end}
        options={months}
        onChange={(value) => onChange("end", value)}
      />
    </>
  );
}
export function Result({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (error)
    return (
      <Alert
        type="error"
        title={error.replace(
          "9月数据尚未就绪，请启动后端或完成本地导入。",
          "ITK数据暂不可用，请检查汇总CSV和本地服务。",
        )}
        action={<Button onClick={retry}>重试</Button>}
      />
    );
  if (loading)
    return (
      <div className="itk-loading" role="status">
        <Skeleton active title={{ width: "45%" }} paragraph={{ rows: 5 }} />
        <span>正在读取ITK数据…</span>
      </div>
    );
  return children;
}
