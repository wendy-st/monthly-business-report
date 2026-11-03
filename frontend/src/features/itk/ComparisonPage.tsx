import { useEffect, useRef, useState } from "react";
import { useReport } from "../reports/api";
import type { ComparisonScope, ComparisonView, Options } from "./contracts";
import {
  categoryKey,
  categoryLabel,
  dateChange,
  exportUrl,
  params,
  short,
} from "./presentation";
import { Dates, Field, Result } from "./Controls";
import { ComparisonResults, ComparisonTables } from "./ComparisonResults";

export function ComparisonPage({
  options,
  onExport,
}: {
  options: Options;
  onExport: (kind: "comparison", url?: string) => void;
}) {
  const [scope, setScope] = useState<ComparisonScope>({
    start: options.start,
    end: options.end,
    site: "US",
    category: "",
    audience: "",
    kind: "",
    brand: "",
    target: "SEEKWAY",
  });
  const result = useReport<ComparisonView>(`itk/comparison?${params(scope)}`);
  const [previous, setPrevious] = useState<ComparisonView>();
  const [categoryOptions, setCategoryOptions] = useState<
    ComparisonView["categories"]
  >([]);
  const [categoryOwner, setCategoryOwner] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(true);
  const sticky = useRef<HTMLDivElement>(null);
  const peers = useRef<HTMLDetailsElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onExport(
      "comparison",
      result.data ? exportUrl("comparison", result.data.scope) : undefined,
    );
    if (result.data) {
      setPrevious(result.data);
      const normalized = result.data.scope;
      setScope((old) =>
        old.site === normalized.site &&
        old.category === normalized.category &&
        old.audience === normalized.audience &&
        old.kind === normalized.kind
          ? old
          : {
              ...old,
              site: normalized.site,
              category: normalized.category,
              audience: normalized.audience,
              kind: normalized.kind,
            },
      );
      const owner = `${result.data.scope.target}:${result.data.scope.site}`;
      if (owner !== categoryOwner) {
        setCategoryOptions(result.data.categories);
        setCategoryOwner(owner);
      }
    }
  }, [result.data, onExport, categoryOwner]);
  useEffect(() => {
    const element = sticky.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      peers.current?.style.setProperty(
        "--itk-sticky-height",
        `${element.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const view = result.data ?? previous;
  const current = {
    ...scope,
    category: scope.category || view?.scope.category || "",
    audience: scope.audience || view?.scope.audience || "",
    kind: scope.kind || view?.scope.kind || "",
  };
  function change(update: Partial<ComparisonScope>) {
    setScope({ ...current, ...update, peers: undefined });
  }
  function choose(selected: string[]) {
    setScope({ ...current, peers: selected });
  }
  const pool = view?.pool.filter((p) => p.brand !== current.target) ?? [];
  const selected = scope.peers ?? view?.selected.slice(1) ?? [];
  const available = categoryOptions.length
    ? categoryOptions
    : (view?.categories ?? []);
  return (
    <div className="itk-comparison">
      <div className="itk-sticky" ref={sticky}>
        <div className="itk-comparison-title">
          <h2>重点品牌与同类竞品</h2>
          <div className="itk-focus-brands">
            {["SEEKWAY", "RIVMOUNT", "SIMARI", "RIVBOS"].map((b) => (
              <button
                key={b}
                className={current.target === b ? "active" : ""}
                aria-pressed={current.target === b}
                onClick={() => {
                  change({ target: b });
                  setSearch("");
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="itk-compare-filters">
          <Dates
            scope={current}
            months={options.months}
            onChange={(field, value) =>
              change(dateChange(current, field, value))
            }
          />
          <Field
            label="站点"
            value={
              view?.sites.includes(current.site)
                ? current.site
                : (view?.scope.site ?? current.site)
            }
            options={view?.sites ?? ["US"]}
            onChange={(site) => change({ site })}
          />
          <Field
            label="同类范围：品类 / 人群 / 细分类型"
            value={categoryKey(current)}
            options={available.map((c) => ({
              value: categoryKey(c),
              label: categoryLabel(c),
            }))}
            onChange={(value) => {
              const c = available.find((item) => categoryKey(item) === value);
              if (c) change(c);
            }}
          />
          <button
            className="itk-manual"
            onClick={() => {
              setExpanded(true);
              requestAnimationFrame(() => {
                peers.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
                searchInput.current?.focus({ preventScroll: true });
              });
            }}
          >
            手选竞品
          </button>
        </div>
      </div>
      <Result loading={!view} error={result.error} retry={result.retry}>
        {view && (
          <div
            aria-busy={!result.data}
            className={!result.data ? "itk-updating" : ""}
          >
            <ComparisonResults data={view} />
          </div>
        )}
      </Result>
      <details
        className="itk-panel itk-peers"
        ref={peers}
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>
          手选竞品{" "}
          <span>
            {selected.length}个竞品已选 / {pool.length}个可选
          </span>
        </summary>
        <div className="itk-peer-toolbar">
          <label>
            搜索竞品
            <input
              ref={searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索品牌"
            />
          </label>
          <button disabled={!result.data} onClick={() => change({})}>
            恢复销售额前5个竞品
          </button>
          <button
            disabled={!result.data}
            onClick={() =>
              choose(
                (view?.pool.filter((p) => p.sales !== null).slice(0, 8) ?? [])
                  .filter((p) => p.brand !== current.target)
                  .map((p) => p.brand),
              )
            }
          >
            对比销售额前8名
          </button>
          <button disabled={!result.data} onClick={() => choose([])}>
            仅看目标品牌
          </button>
        </div>
        <div className="itk-peer-choices" aria-label="可选竞品">
          {pool
            .filter((p) =>
              p.brand
                .toLocaleLowerCase()
                .includes(search.trim().toLocaleLowerCase()),
            )
            .map((p) => (
              <label key={p.brand} title={p.brand}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.brand)}
                  disabled={!result.data}
                  onChange={(e) =>
                    choose(
                      e.target.checked
                        ? [...selected, p.brand]
                        : selected.filter((b) => b !== p.brand),
                    )
                  }
                />
                <span>{p.brand}</span>
                <small>{p.sales === null ? "—" : short(Number(p.sales))}</small>
              </label>
            ))}
          {pool.filter((p) =>
            p.brand
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase()),
          ).length === 0 && <p>暂无符合条件的竞品</p>}
        </div>
      </details>
      {view && (
        <div
          aria-busy={!result.data}
          className={!result.data ? "itk-updating" : ""}
        >
          <ComparisonTables data={view} />
        </div>
      )}
    </div>
  );
}
