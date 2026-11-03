import type { RefObject } from "react";
import type { Options } from "./contracts";
import { sources, sourceNotes } from "./source-metadata";
import { format } from "./presentation";

export function SourceNotes({
  options,
  notesRef,
}: {
  options: Options;
  notesRef: RefObject<HTMLDetailsElement | null>;
}) {
  return (
    <>
      <details className="itk-panel itk-source-notes" ref={notesRef}>
        <summary>统计口径与来源</summary>
        {options.reference_metadata ? (
          <>
            {sourceNotes.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <div
              className="itk-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="ITK来源表，可横向滚动"
            >
              <table>
                <thead>
                  <tr>
                    {[
                      "来源文件",
                      "月份范围",
                      "站点",
                      "源记录数",
                      "纳入记录数",
                    ].map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((row) => (
                    <tr key={row[0]}>
                      {row.map((value, i) => (
                        <td key={i}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>
            CSV已更新，原版来源级元数据不再适用。当前仅展示CSV可核对的汇总记录数；来源文件统计及更新时间待同步。
          </p>
        )}
      </details>
      <footer className="itk-footer">
        源表样本汇总，未推算全市场。
        {options.reference_metadata ? "源记录 2,220,903 条，" : ""}去重后{" "}
        {format(options.source_count)} 条。负数保留，缺失情况见明细。品牌优先
        Brand Name。
        {options.reference_metadata
          ? "更新于 2026-11-02。"
          : "来源元数据待更新。"}
      </footer>
    </>
  );
}
