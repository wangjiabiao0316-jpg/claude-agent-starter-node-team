"""
agent4 财务模型 - 业态门槛 lookup + 达标判定
数据源：references/thresholds.json（V1 §3 L176 / §4 L245）
"""
import json
from pathlib import Path
from typing import Dict, Optional

_CACHE: Optional[Dict] = None


def _load() -> Dict:
    """从 references/thresholds.json 读，缓存到模块级。

    路径解析（兼容两种部署）：
    1. sandbox 部署：industry_thresholds.py 在 /tmp/finance/，references 在 /tmp/finance/references/
       → 用 parent / 'references'
    2. 本地测试：industry_thresholds.py 在 $SKILL/scripts/，references 在 $SKILL/references/
       → 用 parent.parent / 'references'

    按 candidates 顺序 fallback，先 hit 的优先。
    """
    global _CACHE
    if _CACHE is None:
        candidates = [
            Path(__file__).parent / "references" / "thresholds.json",        # sandbox: /tmp/finance/references/
            Path(__file__).parent.parent / "references" / "thresholds.json", # 本地: $SKILL/references/
        ]
        p = next((c for c in candidates if c.exists()), None)
        if p is None:
            raise FileNotFoundError(f"thresholds.json not found in any of: {candidates}")
        _CACHE = json.loads(p.read_text(encoding="utf-8"))
    return _CACHE


def lookup_industry(industry: str) -> Dict[str, float]:
    """业态 → {floor, ceiling}；未匹配抛 KeyError"""
    table = _load()
    if industry not in table:
        raise KeyError(f"业态 {industry} 不在门槛表：{list(table.keys())}")
    item = table[industry]
    return {"floor": item["floor"], "ceiling": item["ceiling"]}


def judge(irr: Optional[float], industry: str) -> str:
    """
    IRR 对照业态门槛 → 优 / 达标 / 不达标 / 无法判定
    - irr is None 或 NaN → 无法判定
    - irr ≥ ceiling → 优
    - floor ≤ irr < ceiling → 达标
    - irr < floor → 不达标
    """
    if irr is None or (irr != irr):  # NaN check
        return "无法判定"
    t = lookup_industry(industry)
    if irr >= t["ceiling"]:
        return "优"
    if irr >= t["floor"]:
        return "达标"
    return "不达标"
