import { HistoryPanel } from "./HistoryPanel";

export function AnnualPage({ group }: { group: string }) {
  return (
    <section className="section-stack annual-page" aria-label="年度经营分析">
      <HistoryPanel key={group} filters={{ group }} />
    </section>
  );
}
