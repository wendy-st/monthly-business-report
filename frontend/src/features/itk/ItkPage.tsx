import { useCallback, useRef, useState } from "react";
import { useReport } from "../reports/api";
import type { Options } from "./contracts";
import { Result } from "./Controls";
import { ComparisonPage } from "./ComparisonPage";
import { OverviewPage } from "./OverviewPage";
import { SourceNotes } from "./SourceNotes";
import "./itk.css";

type Tab = "comparison" | "overview";
export function ItkPage() {
  const options = useReport<Options>("itk/options");
  const [tab, setTab] = useState<Tab>("comparison");
  const [exports, setExports] = useState<Partial<Record<Tab, string>>>({});
  const notes = useRef<HTMLDetailsElement>(null);
  const onExport = useCallback((kind: Tab, url?: string) => {
    setExports((old) => (old[kind] === url ? old : { ...old, [kind]: url }));
  }, []);
  return (
    <div className="itk-dashboard" aria-label="ITK大盘数据分析">
      <header className="itk-header">
        <div className="itk-identity">
          <div className="itk-logo">ITK</div>
          <div>
            <h2>大盘数据看板</h2>
            <p>
              {options.data
                ? `${options.data.months[0]} — ${options.data.end} · ${options.data.reference_metadata ? "8份来源 · " : ""}${options.data.sites.length}个站点分组`
                : "正在加载数据…"}
            </p>
          </div>
        </div>
        <div className="itk-actions">
          <button
            onClick={() => {
              if (notes.current) {
                notes.current.open = true;
                notes.current.scrollIntoView({ behavior: "smooth" });
              }
            }}
          >
            数据口径
          </button>
          <a
            className="itk-button itk-primary"
            href={exports[tab]}
            aria-disabled={!exports[tab]}
            onClick={(e) => {
              if (!exports[tab]) e.preventDefault();
            }}
          >
            {tab === "comparison" ? "导出品牌对比 CSV" : "导出汇总 CSV"}
          </a>
        </div>
      </header>
      <div className="itk-tabs" role="tablist" aria-label="ITK分析页签">
        {(["comparison", "overview"] as Tab[]).map((t, i, tabs) => (
          <button
            key={t}
            id={`itk-tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`itk-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? tabs[0]
                  : e.key === "End"
                    ? tabs[1]
                    : tabs[(i + 1) % 2];
              setTab(next);
              document.getElementById(`itk-tab-${next}`)?.focus();
            }}
          >
            {t === "comparison" ? "品牌同类对比" : "大盘概览"}
          </button>
        ))}
      </div>
      <Result
        loading={!options.data}
        error={options.error}
        retry={options.retry}
      >
        {options.data && (
          <>
            <section
              id="itk-panel-comparison"
              role="tabpanel"
              aria-labelledby="itk-tab-comparison"
              hidden={tab !== "comparison"}
            >
              <ComparisonPage options={options.data} onExport={onExport} />
            </section>
            <section
              id="itk-panel-overview"
              role="tabpanel"
              aria-labelledby="itk-tab-overview"
              hidden={tab !== "overview"}
            >
              <OverviewPage
                options={options.data}
                onExport={onExport}
                active={tab === "overview"}
              />
            </section>
            <SourceNotes options={options.data} notesRef={notes} />
          </>
        )}
      </Result>
    </div>
  );
}
