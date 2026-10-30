import { useEffect, useState } from "react";
import type { Filters } from "./contracts";

const responses = new Map<string, Promise<unknown>>();

async function fetchReport(resource: string): Promise<unknown> {
  const response = await fetch(`/api/reports/2026-09/${resource}`);
  if (!response.ok) {
    if (response.status === 503)
      throw new Error("9月数据尚未就绪，请启动后端或完成本地导入。");
    if (response.status === 422)
      throw new Error("筛选参数无效，请重置筛选后重试。");
    throw new Error(
      `读取报告失败（${response.status}），请检查本地服务后重试。`,
    );
  }
  return response.json();
}

function request<T>(resource: string): Promise<T> {
  let pending = responses.get(resource);
  if (!pending) {
    pending = fetchReport(resource).catch((error: unknown) => {
      responses.delete(resource);
      throw error;
    });
    if (responses.size >= 12) responses.delete(responses.keys().next().value!);
    responses.set(resource, pending);
  }
  return pending as Promise<T>;
}

export function query(filters: Filters): string {
  return new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== ""),
  ).toString();
}

/** 复用同范围请求；切换后忽略旧回包，避免把旧金额显示到新范围。 */
export function useReport<T>(resource: string) {
  const [state, setState] = useState<{
    resource: string;
    data?: T;
    error?: string;
  }>({ resource: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    request<T>(resource).then(
      (data) => {
        if (active) setState({ resource, data });
      },
      (error: unknown) => {
        if (active)
          setState({
            resource,
            error: error instanceof Error ? error.message : "读取报告失败",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [resource, attempt]);
  return {
    data: state.resource === resource ? state.data : undefined,
    error: state.resource === resource ? state.error : undefined,
    retry: () => {
      responses.delete(resource);
      setState({ resource: "" });
      setAttempt((value) => value + 1);
    },
  };
}
