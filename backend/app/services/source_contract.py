"""沿用已确认Excel结构；按来源角色识别文件，年月由导入批次指定。"""

import re
from dataclasses import dataclass
from pathlib import Path

from app.services.report_period import ReportPeriod


@dataclass(frozen=True)
class SheetSpec:
    family: str
    sheet: str
    header: int


def source_role(name: str, month: str) -> str:
    year = int(month[:4])
    prefixes = {
        "经营报告": "operating",
        "近6年": "history",
        "MSKU": "forecast",
        "全小组": "mapping",
        f"{year}年-库存周转率": "current_turnover",
        f"{year - 1}年-库存周转率": "previous_turnover",
        "库存发货天数表": "shipping",
    }
    return next((role for prefix, role in prefixes.items() if name.startswith(prefix)), "")


def sheet_specs(name: str, month: str) -> list[SheetSpec]:
    role = source_role(name, month)
    year = int(month[:4])
    plans = {
        "operating": [
            SheetSpec("operating", "月度经营底表", 2),
            SheetSpec("products", "产品基础信息表", 1),
            SheetSpec("rates", "汇率信息", 2),
            SheetSpec("current_inventory", "库存数据", 1),
        ],
        "history": [SheetSpec("history", "LISTING数据源总表", 1)],
        "forecast": [
            SheetSpec("forecast", f"{year}预估销量", 1),
            SheetSpec("forecast_mapping", "字段映射", 3),
        ],
        "mapping": [
            SheetSpec("style_mapping", "自动匹配核对", 5),
            SheetSpec("style_mapping", "待补充映射", 5),
        ],
        "current_turnover": [
            SheetSpec("inventory", f"数据源-{year}年-FBA仓-进销存", 2),
            SheetSpec("inventory", f"数据源-{year}-本地仓&海外仓-新", 1),
        ],
        "previous_turnover": [
            SheetSpec("inventory", f"数据源-{year - 1}年-FBA仓-进销存", 2),
            SheetSpec("inventory", f"数据源-{year - 1}-本地仓&海外仓", 1),
            SheetSpec("inventory", f"FBA-{year - 2}.12", 2),
        ],
        "shipping": [SheetSpec("shipping", "Sheet1", 1)],
    }
    return plans.get(role, [])


def source_plan(source_dir: Path, month: str) -> dict[str, list[SheetSpec]]:
    ReportPeriod(month)
    paths = sorted(p for p in source_dir.glob("*.xlsx") if not p.name.startswith("~$"))
    roles: dict[str, str] = {}
    output = {}
    for path in paths:
        role = source_role(path.name, month)
        if not role:
            raise ValueError(f"无法识别来源类型：{path.name}")
        if role == "mapping" and not path.name.endswith(f"{month}.xlsx"):
            matched = re.search(r"(20\d{2}-\d{2})\.xlsx$", path.name)
            if not matched or matched[1] >= month:
                raise ValueError(f"款式映射月份不匹配：{path.name}")
            role = f"prior_mapping:{matched[1]}"
        if role in roles:
            raise ValueError(f"同类来源重复：{roles[role]}、{path.name}")
        roles[role] = path.name
        output[path.name] = sheet_specs(path.name, month)
    missing = {
        "operating",
        "history",
        "forecast",
        "mapping",
        "current_turnover",
        "previous_turnover",
        "shipping",
    } - roles.keys()
    if missing:
        raise ValueError("缺少配套来源：" + "、".join(sorted(missing)))
    return output
