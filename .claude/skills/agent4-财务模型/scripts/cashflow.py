"""
agent4 财务模型 - 现金流构造（S1 收入 + S2 成本 + S3 现金流时序）
"""
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class CashFlow:
    年份: int
    现金流入: float
    现金流出: float
    净现金流: float


def build_income(monthly_rent: float, leasable_area: float,
                 occupancy: float) -> Dict:
    """
    S1 收入测算
    年收入 = 月租金 × 可租赁面积 × 出租率 × 12
    """
    annual = monthly_rent * leasable_area * occupancy * 12
    return {
        "月租金": monthly_rent,
        "可租赁面积": leasable_area,
        "出租率": occupancy,
        "年收入": round(annual, 2),
    }


def build_costs(construction: float, renovation: float,
                operation_annual: float, tax: float,
                holding_years: int) -> Dict:
    """
    S2 成本测算
    - 建安、改造：一次性（第 0 年），来自建安成本基准库
    - 运营、税费：年度化 × holding_years
    """
    return {
        "建安": construction,
        "改造": renovation,
        "运营": round(operation_annual * holding_years, 2),
        "税费": round(tax * holding_years, 2),
    }


def build_cashflows(income: Dict, costs: Dict, holding_years: int,
                    exit_cap_rate: float,
                    financing: Optional[Dict] = None) -> List[CashFlow]:
    """
    S3 现金流时序
    - 第 0 年：建设期，现金流出 = 建安 + 改造，现金流入 = 融资金额（如有）
    - 第 1..N 年：运营期，年收入 - 年运营 - 年税费 (- 还本付息)
    - 第 N 年（末年）：叠加退出 = 年收入 / exit_cap_rate
    """
    annual_income = income["年收入"]
    annual_op = costs["运营"] / holding_years
    annual_tax = costs["税费"] / holding_years

    flows: List[CashFlow] = []
    # 第 0 年：建设期
    year0_out = costs["建安"] + costs["改造"]
    year0_in = (financing or {}).get("融资金额", 0)
    flows.append(CashFlow(0, year0_in, year0_out, year0_in - year0_out))

    # 第 1..N 年：运营期
    financing_service = (financing or {}).get("还本付息时序", {})
    for y in range(1, holding_years + 1):
        inflow = annual_income
        outflow = annual_op + annual_tax + financing_service.get(str(y), 0)
        # 末年叠加退出
        if y == holding_years:
            inflow += annual_income / exit_cap_rate
        flows.append(CashFlow(y, inflow, outflow, inflow - outflow))
    return flows
