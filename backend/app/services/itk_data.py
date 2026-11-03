"""只读CSV接入与唯一汇总规则，不使用CSV的已舍入均价和退货率。"""

import csv
import hashlib
from collections import defaultdict
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from app.schemas.itk import Metrics, NamedMetrics, Options, Row, Scope

SOURCE = Path(__file__).resolve().parents[3] / "data/sources/2026-09/ITK年月站点品类品牌汇总.csv"
REFERENCE_HASH = "8ce8bb9eb02931e41dfd5b64014929c10d9c16f3dce0b844b5cdfcdd8e910a64"
SITE_ORDER = ["US", "CA", "DE", "JP", "UK", "FR"]
CURRENCIES = {"US": "USD", "CA": "CAD", "UK": "GBP", "DE": "EUR", "FR": "EUR", "JP": "JPY"}
COUNTS = {
    "count": "源记录数",
    "sales_count": "销售额有效记录数",
    "units_count": "销量有效记录数",
    "returns_count": "退货量有效记录数",
    "negative_count": "含负数记录数",
    "fallback_count": "辅助品牌补充记录数",
}


def currency(site: str) -> str:
    return CURRENCIES.get(site, "币种待确认")


def site_order(site: str) -> tuple[int, str]:
    return (SITE_ORDER.index(site) if site in SITE_ORDER else 100 if site == "待确认" else 99, site)


def status(row: Row) -> str:
    flags = [f"含负数 {row.negative_count} 条"] if row.negative_count else []
    for label, count in [
        ("销售额", row.sales_count),
        ("销量", row.units_count),
        ("退货量", row.returns_count),
    ]:
        if count < row.count:
            flags.append(f"{label}缺失 {row.count - count} 条")
    if row.site == "待确认":
        flags.append("站点缺失")
    elif row.site.startswith("ID:"):
        flags.append("国家/币种待确认")
    return "；".join(flags) or "完整"


def aggregate(rows: list[Metrics]) -> Metrics:
    counts = {key: sum(int(getattr(row, key)) for row in rows) for key in COUNTS}
    values: dict[str, Decimal | None] = {}
    for field in ("sales", "units", "returns"):
        values[field] = (
            sum((getattr(r, field) for r in rows if getattr(r, field) is not None), Decimal(0))
            if counts[f"{field}_count"] > 0
            else None
        )
    sales, units, returns = values["sales"], values["units"], values["returns"]
    return Metrics.model_validate(
        {
            **values,
            **counts,
            "rate": returns / units
            if returns is not None and units is not None and units > 0
            else None,
            "asp": sales / units if sales is not None and units is not None and units > 0 else None,
        }
    )


@lru_cache(maxsize=2)
def _load(identity: tuple[int, int]) -> tuple[list[Row], Options]:
    del identity
    rows = []
    with SOURCE.open(encoding="utf-8-sig", newline="") as stream:
        for item in csv.DictReader(stream):
            values = {key: int(item[label]) for key, label in COUNTS.items()}
            metrics = Metrics.model_validate(
                {
                    **values,
                    **{
                        key: Decimal(item[label]) if item[label].strip() else None
                        for key, label in [
                            ("sales", "销售额"),
                            ("units", "销量"),
                            ("returns", "退货量"),
                        ]
                    },
                }
            )
            row = Row(
                **metrics.model_dump(),
                month=item["年月"],
                site=item["站点"],
                currency=currency(item["站点"]),
                category=item["品类"],
                audience=item["人群"],
                kind=item["细分类型"],
                brand=item["品牌"],
            )
            calculated = aggregate([row])
            row.rate, row.asp = calculated.rate, calculated.asp
            if row.site == "待确认":
                row.sales, row.asp = None, None
            row.status = status(row)
            rows.append(row)
    months = sorted({r.month for r in rows})
    options = Options(
        months=months,
        sites=sorted({r.site for r in rows}, key=site_order),
        categories=sorted({r.category for r in rows}),
        audiences=sorted({r.audience for r in rows}),
        start=months[max(0, len(months) - 12)],
        end=months[-1],
        row_count=len(rows),
        source_count=sum(r.count for r in rows),
        negative_count=sum(r.negative_count for r in rows),
        reference_metadata=hashlib.sha256(SOURCE.read_bytes()).hexdigest() == REFERENCE_HASH,
    )
    return rows, options


def dataset() -> tuple[list[Row], Options]:
    info = SOURCE.stat()
    return _load((info.st_mtime_ns, info.st_size))


def normalize(scope: Scope) -> Scope:
    _, options = dataset()
    scope = scope.model_copy(
        update={"start": scope.start or options.start, "end": scope.end or options.end}
    )
    if (
        scope.start not in options.months
        or scope.end not in options.months
        or scope.start > scope.end
    ):
        raise ValueError("年月范围无效")
    if scope.site not in options.sites:
        raise ValueError("站点无效")
    return scope


def filter_rows(scope: Scope, *, include_brand: bool = True) -> list[Row]:
    rows, _ = dataset()
    return [
        r
        for r in rows
        if scope.start <= r.month <= scope.end
        and r.site == scope.site
        and (not scope.category or r.category == scope.category)
        and (not scope.audience or r.audience == scope.audience)
        and (not include_brand or not scope.brand or r.brand == scope.brand)
    ]


def grouped(rows: list[Row], field: str) -> list[NamedMetrics]:
    groups: dict[str, list[Metrics]] = defaultdict(list)
    for row in rows:
        groups[str(getattr(row, field))].append(row)
    return [
        NamedMetrics(name=name, **aggregate(items).model_dump()) for name, items in groups.items()
    ]
