import { useLayoutEffect, useRef } from "react";

/** 吸顶偏移使用布局高度，避免浏览器缩放时重复放大。 */
export function useReportHeaderOffset() {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = body.current;
    const header = container?.querySelector<HTMLElement>(".report-header");
    if (!container || !header) return;
    const update = () =>
      container.style.setProperty(
        "--report-header-height",
        `${header.offsetHeight}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return body;
}
