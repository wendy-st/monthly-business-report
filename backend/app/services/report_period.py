"""报告期间唯一入口；比较期由已登记月份推导，不按数据最大月份猜测。"""

import re
from dataclasses import dataclass

BASELINE_MONTH = "2026-09"


def shift_month(month: str, offset: int) -> str:
    year, monthly = map(int, month.split("-"))
    value = year * 12 + monthly - 1 + offset
    return f"{value // 12:04}-{value % 12 + 1:02}"


@dataclass(frozen=True)
class ReportPeriod:
    current: str = BASELINE_MONTH

    def __post_init__(self) -> None:
        if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", self.current):
            raise ValueError("报告月份须为YYYY-MM")

    @property
    def months(self) -> tuple[str, str, str]:
        return self.current, shift_month(self.current, -1), shift_month(self.current, -12)

    @property
    def fields(self) -> dict[str, str]:
        return dict(zip(("current", "previous", "year_ago"), self.months, strict=True))
