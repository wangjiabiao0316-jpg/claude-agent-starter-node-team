"""
agent4 财务模型核心算法
- IRR：优先 numpy-financial；不可用则纯 Python 二分法兜底
- NPV：纯 Python 实现（不依赖 numpy-financial）
- 回收期：手写（numpy-financial 无此 API）
- 敏感性：基准 ±X% 重新调 irr
"""
import json
import sys
from typing import Dict, List, Optional

# 兼容 sandbox 内 import 路径
sys.path.insert(0, "/tmp/finance")

from cashflow import build_income, build_costs, build_cashflows
from industry_thresholds import lookup_industry, judge

try:
    import numpy_financial as npf
    _HAS_NPF = True
except ImportError:
    _HAS_NPF = False


# ─── IRR ─────────────────────────────────────────────
def irr(cashflows: List[float], guess: float = 0.1) -> Optional[float]:
    """IRR：Newton-Raphson（npf）+ 二分法兜底"""
    if not cashflows or len(cashflows) < 2:
        return None
    if _HAS_NPF:
        try:
            v = npf.irr(cashflows)
            if v is not None and v == v:  # not None, not NaN
                return float(v)
        except (ValueError, OverflowError):
            pass
    return _irr_bisection(cashflows)


def _irr_bisection(cashflows: List[float],
                   lo: float = -0.99, hi: float = 10.0,
                   tol: float = 1e-6, max_iter: int = 200) -> Optional[float]:
    """纯 Python 二分法兜底 IRR"""
    f_lo = _npv(lo, cashflows)
    f_hi = _npv(hi, cashflows)
    if f_lo * f_hi > 0:
        return None  # 区间内无解或多解
    for _ in range(max_iter):
        mid = (lo + hi) / 2
        f_mid = _npv(mid, cashflows)
        if abs(f_mid) < tol:
            return mid
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


# ─── NPV ─────────────────────────────────────────────
def _npv(rate: float, cashflows: List[float]) -> float:
    """NPV：第 0 期不折现"""
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cashflows))


def npv(rate: float, cashflows: List[float]) -> float:
    return _npv(rate, cashflows)


# ─── 回收期 ──────────────────────────────────────────
def payback_period(cashflows: List[float]) -> Optional[float]:
    """
    静态回收期（年精度 + 小数，如 7.2 年）。
    - t: enumerate 索引（0=第 0 年/建设期，1=运营第 1 年，依此类推）
    - cf: 当年单期净现金流（非累计）
    - prev / cumulative: 上一年 / 当年的累计净现金流
    命中条件: prev < 0 < cumulative（即累计现金流在当年穿零到正值）
    返回: t-1（前一年整数位）+ (-prev)/cf（用当年单期现金流补足剩余距离的小数位）
    边界: 累计正好等于零（既未正也未负）不算"回本到正值"，视为未回本
    """
    cumulative = 0.0
    for t, cf in enumerate(cashflows):
        prev = cumulative
        cumulative += cf
        if prev < 0 < cumulative:
            return t - 1 + (-prev) / cf
    return None  # 未回本


# ─── 敏感性 ──────────────────────────────────────────
def sensitivity(builder_kwargs: Dict, builder_fn,
                perturbations: Dict[str, List[float]]) -> Dict[str, Dict]:
    """
    围绕基准值扰动重算 IRR。
    - builder_kwargs: 重建现金流所需的基准参数
    - builder_fn: 现金流构造器，签名 builder_fn(**kwargs) -> List[float]
    - perturbations: {"occupancy": [-0.05, 0.05], ...}
    返回 {"occupancy": {"-5%": irr_x, "+5%": irr_y}, ..., "_base": base_irr}
    """
    base_cf = builder_fn(**builder_kwargs)
    base_irr = irr(base_cf)
    out: Dict[str, Dict] = {"_base": base_irr}
    for var, deltas in perturbations.items():
        if var not in builder_kwargs:
            continue
        bucket: Dict[str, float] = {}
        base_value = builder_kwargs[var]
        for delta in deltas:
            perturbed = {**builder_kwargs, var: base_value * (1 + delta)}
            try:
                cf_perturbed = builder_fn(**perturbed)
                v = irr(cf_perturbed)
                if v is not None:
                    sign = "+" if delta >= 0 else ""
                    bucket[f"{sign}{int(delta*100)}%"] = v
            except Exception:
                continue
        out[var] = bucket
    return out


def _format_sensitivity(s: Dict) -> str:
    """把 sensitivity dict 格式化为单行字符串"""
    parts = []
    for k, v in s.items():
        if k == "_base":
            continue
        if isinstance(v, dict):
            sub = ", ".join(f"{kk}→{vv*100:.2f}%" for kk, vv in v.items())
            parts.append(f"{k}: {sub}")
    base = s.get("_base")
    if base is not None:
        parts.append(f"base IRR={base*100:.2f}%")
    return "; ".join(parts) if parts else "(无)"


def _build_assumptions(occ, dr, cap, hy, mode, irr_val) -> str:
    parts = [
        f"【待校准】出租率 = {occ}",
        f"【待校准】折现率 = {dr*100:.1f}%",
        f"【待校准】退出 cap rate = {cap*100:.1f}%",
        f"【待校准】持有年限 = {hy}",
        f"改造模式 = {mode}",
    ]
    if irr_val is None:
        parts.append("【WARN】IRR 不收敛，二分法兜底无解")
    return "；".join(parts)


def _assert_inputs(monthly_rent, leasable_area, occupancy,
                   holding_years, exit_cap_rate, discount_rate):
    """F12 边界值校验"""
    if monthly_rent <= 0:
        raise ValueError(f"月租金非法: {monthly_rent}")
    if leasable_area <= 0:
        raise ValueError(f"可租赁面积非法: {leasable_area}")
    if not (0 <= occupancy <= 1):
        raise ValueError(f"出租率非法: {occupancy}")
    if not (0 < holding_years <= 50):
        raise ValueError(f"持有年限非法: {holding_years}")
    if not (0 < exit_cap_rate <= 0.3):
        raise ValueError(f"exit_cap_rate 非法: {exit_cap_rate}")
    if not (0 <= discount_rate <= 0.5):
        raise ValueError(f"discount_rate 非法: {discount_rate}")


# ─── 主入口 analyze ─────────────────────────────────
def analyze(monthly_rent: float, leasable_area: float,
            occupancy: float, industry: str,
            construction_cost: float, renovation_cost: float,
            operation_annual: float, tax_annual: float,
            renovation_mode: str, holding_years: int,
            exit_cap_rate: float, discount_rate: float,
            financing: Optional[Dict] = None,
            perturbations: Optional[Dict] = None) -> Dict:
    """S1 → S2 → S3 → S4 主流水线"""
    _assert_inputs(monthly_rent, leasable_area, occupancy,
                   holding_years, exit_cap_rate, discount_rate)

    income = build_income(monthly_rent, leasable_area, occupancy)
    costs = build_costs(construction_cost, renovation_cost,
                        operation_annual, tax_annual, holding_years)
    cf_objs = build_cashflows(income, costs, holding_years,
                              exit_cap_rate, financing)
    cf_series = [c.净现金流 for c in cf_objs]
    irr_val = irr(cf_series)
    npv_val = npv(discount_rate, cf_series)
    pb_val = payback_period(cf_series)

    # 敏感性：用 closure 让 sensitivity() 能重建现金流
    def _rebuild(monthly_rent=monthly_rent, leasable_area=leasable_area,
                 occupancy=occupancy, construction_cost=construction_cost):
        inc = build_income(monthly_rent, leasable_area, occupancy)
        cst = build_costs(construction_cost, renovation_cost,
                          operation_annual, tax_annual, holding_years)
        cfs = build_cashflows(inc, cst, holding_years, exit_cap_rate, financing)
        return [c.净现金流 for c in cfs]

    builder_kwargs = {
        "monthly_rent": monthly_rent,
        "leasable_area": leasable_area,
        "occupancy": occupancy,
        "construction_cost": construction_cost,
    }
    sens_val = sensitivity(
        builder_kwargs, _rebuild,
        perturbations or {
            "occupancy": [-0.05, 0.05],
            "monthly_rent": [-0.10, 0.10],
            "construction_cost": [-0.10, 0.10],
        }
    )

    # 业态门槛对照（F8：未知业态兜底）
    try:
        threshold = lookup_industry(industry)
        threshold_str = f"{int(threshold['floor']*100)}-{int(threshold['ceiling']*100)}%"
        verdict = judge(irr_val, industry) if irr_val is not None else "无法判定"
    except KeyError:
        threshold_str = "未配置"
        verdict = "无法判定"
        industry_for_output = industry  # 保留原业态

    return {
        "agent": "agent4-财务模型",
        "改造模式": renovation_mode,
        "收入测算": income,
        "成本测算": costs,
        "现金流时序": [
            {"年份": c.年份, "现金流入": round(c.现金流入, 2),
             "现金流出": round(c.现金流出, 2),
             "净现金流": round(c.净现金流, 2)}
            for c in cf_objs
        ],
        "财务指标": {
            "IRR": f"{irr_val*100:.2f}%" if irr_val is not None else None,
            "NPV": round(npv_val, 2),
            "回收期": round(pb_val, 2) if pb_val else None,
            "敏感性分析": _format_sensitivity(sens_val),
        },
        "业态门槛对照": {
            "业态": industry,
            "门槛区间": threshold_str,
            "达标结论": verdict,
        },
        "关键假设": _build_assumptions(occupancy, discount_rate,
                                    exit_cap_rate, holding_years,
                                    renovation_mode, irr_val),
        "依据": ["建安成本基准库", "基准租金库",
                "税务规则库", "业态门槛基准"],
        "_calc": {
            "engine": "numpy-financial" if _HAS_NPF else "python-bisection",
            "numpy_financial_version": (npf.__version__ if _HAS_NPF else None),
            "scripts_version": "V2",
            "kernel_session": "injected_by_sandbox",
        },
    }


if __name__ == "__main__":
    # CLI 形式（供 sandbox.commands.run('python3 finance.py --rent 80 ...')）
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--rent", type=float, required=True)
    p.add_argument("--area", type=float, required=True)
    p.add_argument("--occupancy", type=float, default=0.85)
    p.add_argument("--industry", required=True)
    p.add_argument("--construction", type=float, required=True)
    p.add_argument("--renovation", type=float, required=True)
    p.add_argument("--operation", type=float, required=True)
    p.add_argument("--tax", type=float, required=True)
    p.add_argument("--mode", required=True)
    p.add_argument("--years", type=int, default=10)
    p.add_argument("--exit-cap", type=float, default=0.05)
    p.add_argument("--discount", type=float, default=0.08)
    args = p.parse_args()
    print(json.dumps(analyze(
        monthly_rent=args.rent, leasable_area=args.area,
        occupancy=args.occupancy, industry=args.industry,
        construction_cost=args.construction,
        renovation_cost=args.renovation,
        operation_annual=args.operation, tax_annual=args.tax,
        renovation_mode=args.mode, holding_years=args.years,
        exit_cap_rate=args.exit_cap, discount_rate=args.discount,
    ), ensure_ascii=False, indent=2))
