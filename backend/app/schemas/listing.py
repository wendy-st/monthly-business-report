"""LISTING简明问题及核查状态。"""

from typing import Literal

from pydantic import BaseModel

IssueStatus = Literal["关注", "待核查", "未见异常"]


class ListingIssue(BaseModel):
    key: str
    title: str
    detail: str
    status: IssueStatus


def select_issues(candidates: list[ListingIssue]) -> list[ListingIssue]:
    # 先保留真实问题，再保留资料缺口；不足三条时展示明确标识的正常核查结果。
    order = {"关注": 0, "待核查": 1, "未见异常": 2}
    fallback = {"sales": 0, "profit": 1, "inventory": 2}
    ranked = sorted(candidates, key=lambda item: (order[item.status], fallback.get(item.key, 3)))
    count = min(5, max(3, sum(item.status != "未见异常" for item in ranked)))
    selected = {item.key for item in ranked[:count]}
    if any(item.key == "inventory" for item in candidates):
        selected.add("inventory")
    return [item for item in candidates if item.key in selected]
