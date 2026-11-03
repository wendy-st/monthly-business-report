import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

export const BASELINE_MONTH = "2026-09";

interface MonthState {
  month: string;
  months: string[];
  monthsError: string;
  setMonth: (month: string) => void;
  refreshMonths: () => void;
}
const MonthContext = createContext<MonthState>({
  month: BASELINE_MONTH,
  months: [BASELINE_MONTH],
  monthsError: "",
  setMonth: () => {},
  refreshMonths: () => {},
});

export function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5))}月`;
}

export function comparedMonth(month: string, offset: number): string {
  const date = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + offset),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const useReportMonth = () => useContext(MonthContext);

export function ReportMonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(BASELINE_MONTH);
  const [months, setMonths] = useState([BASELINE_MONTH]);
  const [revision, setRevision] = useState(0);
  const [monthsError, setMonthsError] = useState("");
  const refreshMonths = useCallback(
    () => setRevision((value) => value + 1),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reports", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("月份列表读取失败");
        return response.json() as Promise<{ months: string[] }>;
      })
      .then((data) => {
        setMonths(data.months);
        setMonth((current) =>
          data.months.includes(current) ? current : (data.months[0] ?? current),
        );
        setMonthsError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMonthsError(
            error instanceof Error ? error.message : "月份列表读取失败",
          );
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <MonthContext.Provider
      value={{
        month,
        months,
        setMonth,
        refreshMonths,
        monthsError,
      }}
    >
      {children}
    </MonthContext.Provider>
  );
}
