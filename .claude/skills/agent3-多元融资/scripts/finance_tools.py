"""
finance_tools.py - agent3 多元融资 V2 主算法

V2 关键设计：
1. sandbox 内 import libsql_client 直连 libSQL 拉数据
2. libSQL 失败 fallback references/<table>.json
3. H1-H4 硬约束剔除（任一不通过即剔除该工具）
4. S1-S4 软约束评分（综合分 = S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2）
5. 灯色判定：0 工具→red / 覆盖率<0.7→yellow / 达标→green

依据：V1 §3 (L111-198) + super-skill implementation-plan Task 5 Step 5
"""
import os
import json

# sandbox 内由 _tools.ts prepareSandbox 写入 /tmp/finance/libsql_client.py
# 本地开发或 fallback 模式下也尝试 import
try:
    from libsql_client import execute_sql
    _LIBSQL_AVAILABLE = True
except Exception:
    _LIBSQL_AVAILABLE = False
    execute_sql = None


# ============================================================
# Fallback: references/<table>.json 静态数据
# ============================================================

_FALLBACK_DIR_CANDIDATES = [
    # sandbox 模式：本文件被写入 /tmp/finance/scripts/finance_tools.py
    os.path.join(os.path.dirname(__file__), "..", "references"),
    # 本地开发：脚本在 skills/agent3-多元融资/scripts/ 下
    os.path.join(os.path.dirname(__file__), "..", "references"),
    # sandbox 内 references 直接挂在 /tmp/finance/references/
    "/tmp/finance/references",
]


def _fallback_path(table: str) -> str:
    for base in _FALLBACK_DIR_CANDIDATES:
        candidate = os.path.abspath(os.path.join(base, f"{table}.json"))
        if os.path.exists(candidate):
            return candidate
    return None


def _safe_execute_sql(table: str, **kwargs):
    """
    优先 libSQL，失败 fallback references/<table>.json。
    返回 (rows, source) source 为 "libsql" | "fallback-json" | "missing"
    """
    if _LIBSQL_AVAILABLE:
        try:
            rows = execute_sql(table, **kwargs)
            return rows, "libsql"
        except Exception as e:
            # 落到 fallback
            pass

    # Fallback: references/<table>.json
    path = _fallback_path(table)
    if path:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        # JSON 文件可能是 {"rows": [...]} 或 [...]
        if isinstance(data, dict) and "rows" in data:
            return data["rows"], "fallback-json"
        if isinstance(data, list):
            return data, "fallback-json"
        return [data], "fallback-json"

    # 既无 libSQL 也无 fallback 文件
    raise RuntimeError(
        f"{table} 既无法从 libSQL 拉取（{_LIBSQL_AVAILABLE=}），也无 fallback JSON 文件"
    )


# ============================================================
# H1-H4 硬约束
# ============================================================

def _h1_capital_ratio(product: dict, user_capital_ratio: float) -> bool:
    """H1: 用户资本金比例 ≥ 该工具要求的资本金门槛 (25-30%)"""
    threshold = product.get("capital_ratio_min") or product.get("capital_ratio") or 0.25
    # 兼容百分比字符串如 "25%" 或小数 0.25
    if isinstance(threshold, str):
        threshold = float(threshold.replace("%", "").strip()) / 100.0
    elif threshold > 1:
        threshold = threshold / 100.0
    return user_capital_ratio >= threshold


def _h2_mortgage(product: dict, user_mortgage_type: str,
                 user_mortgage_value: float, mortgage_thresholds: list) -> bool:
    """H2: 抵押物类型必须在 5 类清单内 + 抵押率 ≤ 阈值"""
    if not user_mortgage_type:
        return False
    # 5 类清单
    allowed_types = {"土地使用权", "运营权", "收益权", "经营权", "收费权", "组合"}
    if user_mortgage_type not in allowed_types:
        return False

    # 抵押率阈值查表
    threshold = None
    for entry in mortgage_thresholds:
        if entry.get("类型") == user_mortgage_type or entry.get("mortgage_type") == user_mortgage_type:
            threshold = entry.get("阈值") or entry.get("threshold") or entry.get("max_ratio")
            break
    if threshold is None:
        threshold = 0.6  # 默认 60%
    if isinstance(threshold, str):
        threshold = float(threshold.replace("%", "").strip()) / 100.0
    elif threshold > 1:
        threshold = threshold / 100.0

    # product 可能声明 max_loan_amount（该产品对这类抵押物的最大贷款额）
    max_loan = product.get("max_loan_amount") or product.get("贷款额度上限")
    if max_loan and user_mortgage_value:
        # 抵押率 = 贷款额 / 抵押物估值
        ratio = float(max_loan) / float(user_mortgage_value) if user_mortgage_value > 0 else 1.0
        if ratio > threshold:
            return False
    return True


def _h3_negative(product: dict, negative_list: list, user_industry: str,
                 user_region: str) -> bool:
    """
    H3: 项目类型/业主/区域/业态不得命中负面清单 (True=命中即应剔除)
    仅对「政策性资金类工具」校验：专项债 / REITs / 政策性基金 / 政策性保险资金。
    「政策性银行」属于商业贷款范畴（V1 §3 L161 明确），不参与 H3。
    """
    product_category = str(product.get("类别") or product.get("category") or "")
    # 用精确关键词识别「真政策性资金类」（排除「政策性银行」）
    is_policy_funding = (
        ("专项债" in product_category) or
        ("REITs" in product_category) or
        ("政策性资金" in product_category and "银行" not in product_category) or
        ("政策性基金" in product_category) or
        ("政策性保险" in product_category)
    )
    if not is_policy_funding:
        return False  # 商业性融资（含政策性银行的商业贷款）不受 H3 限制

    for entry in negative_list:
        # 每条 entry: {"类型": "业态|区域|业主|项目类型", "值": "..."}
        etype = entry.get("类型") or entry.get("type") or ""
        evalue = entry.get("值") or entry.get("value") or entry.get("name") or ""
        if etype == "业态" and user_industry and user_industry in str(evalue):
            return True
        if etype == "区域" and user_region and user_region in str(evalue):
            return True
    return False


def _h4_pilot_city(product: dict, pilot_cities: list, user_region: str) -> bool:
    """H4: 政策性资金/专项债需校验 15 城试点（同 H3 范围，排除政策性银行商业贷款）"""
    product_category = str(product.get("类别") or product.get("category") or "")
    is_policy_funding = (
        ("专项债" in product_category) or
        ("REITs" in product_category) or
        ("政策性资金" in product_category and "银行" not in product_category) or
        ("政策性基金" in product_category) or
        ("政策性保险" in product_category)
    )
    if not is_policy_funding:
        return True  # 商业性融资不校验试点

    if not user_region:
        return False
    for entry in pilot_cities:
        city = entry.get("城市") or entry.get("city") or entry.get("name") or ""
        if city and city in user_region:
            return True
    return False


# ============================================================
# S1-S4 软约束评分 (0-100)
# ============================================================

def _s1_approval_rate(product: dict) -> float:
    """审批通过率评分"""
    rate = product.get("审批通过率") or product.get("approval_rate")
    if rate is None:
        return 50.0
    if isinstance(rate, str):
        # 提取数字部分
        digits = "".join(c for c in rate if c.isdigit() or c == ".")
        try:
            rate = float(digits)
        except ValueError:
            return 50.0
    if rate > 1:  # 0-100
        rate = rate
    else:  # 0-1
        rate = rate * 100
    return float(rate)


def _s2_cost(product: dict) -> float:
    """资金成本评分（越低越优）"""
    cost = product.get("综合利率") or product.get("利率") or product.get("annual_rate")
    if cost is None:
        return 50.0
    if isinstance(cost, str):
        digits = "".join(c for c in cost if c.isdigit() or c == ".")
        try:
            cost = float(digits)
        except ValueError:
            return 50.0
    if cost > 1:  # 百分比形式 5 = 5%
        cost = cost / 100.0
    # 评分映射：≤2% → 95；2-4% → 80；4-6% → 60；>6% → 40
    if cost <= 0.02:
        return 95.0
    elif cost <= 0.04:
        return 80.0
    elif cost <= 0.06:
        return 60.0
    else:
        return 40.0


def _s3_term(product: dict, holding_years: int) -> float:
    """期限匹配评分"""
    if not holding_years:
        return 50.0
    term_str = product.get("期限") or product.get("term") or ""
    if isinstance(term_str, (int, float)):
        term = float(term_str)
    else:
        digits = "".join(c for c in str(term_str) if c.isdigit() or c == ".")
        try:
            term = float(digits)
        except ValueError:
            return 50.0
    if term <= 0:
        return 50.0
    coverage = term / float(holding_years)
    if coverage >= 1.0:
        return 95.0
    elif coverage >= 0.8:
        return 80.0
    elif coverage >= 0.6:
        return 60.0
    else:
        return 40.0


def _s4_dscr(product: dict, baseline_rent: float, leasable_area: float,
             investment: float) -> float:
    """还款覆盖评分 (DSCR)"""
    if not (baseline_rent and leasable_area and investment):
        return 50.0
    # 年营收估算（保守：基准租金 × 面积 × 12）
    annual_income = float(baseline_rent) * float(leasable_area) * 12.0
    # 年还款额：按贷款规模 + 利率 + 期限估算（这里用简化：产品贷款比例 × 投资 × 利率 / 期限）
    loan_ratio = float(product.get("max_loan_ratio", 0.6)) if product.get("max_loan_ratio") else 0.6
    loan_amount = float(investment) * float(loan_ratio) * 10000  # 万元 → 元
    cost = product.get("综合利率") or product.get("利率")
    if isinstance(cost, str):
        digits = "".join(c for c in cost if c.isdigit() or c == ".")
        try:
            rate = float(digits) / 100.0 if float(digits) > 1 else float(digits)
        except Exception:
            rate = 0.05
    elif cost is None:
        rate = 0.05
    else:
        rate = float(cost) / 100.0 if cost > 1 else float(cost)
    term_str = product.get("期限") or "5"
    digits = "".join(c for c in str(term_str) if c.isdigit() or c == ".")
    try:
        term = float(digits) if digits else 5.0
    except Exception:
        term = 5.0
    if term <= 0:
        term = 5.0
    # 等额本息粗估：年还款 ≈ 贷款 × rate / (1 - (1+rate)^-term)
    try:
        if rate > 0:
            annual_repay = loan_amount * rate / (1 - (1 + rate) ** (-term))
        else:
            annual_repay = loan_amount / term
        dscr = annual_income / annual_repay if annual_repay > 0 else 0
    except Exception:
        dscr = 1.0

    # 评分映射：≥1.5 → 95；1.2-1.5 → 80；1.0-1.2 → 60；<1.0 → 40
    if dscr >= 1.5:
        return 95.0
    elif dscr >= 1.2:
        return 80.0
    elif dscr >= 1.0:
        return 60.0
    else:
        return 40.0


# ============================================================
# Coverage & Portfolio
# ============================================================

def _coverage_ratio(scored: list, investment: float) -> float:
    """覆盖率 = Σ(产品 max_loan_ratio × investment) / investment"""
    if not investment:
        return 0.0
    total_covered = 0.0
    for p in scored:
        ratio = p.get("max_loan_ratio") or p.get("贷款比例") or 0.5
        if isinstance(ratio, str):
            digits = "".join(c for c in ratio if c.isdigit() or c == ".")
            try:
                ratio = float(digits) / 100.0 if float(digits) > 1 else float(digits)
            except Exception:
                ratio = 0.5
        total_covered += float(ratio)
    return min(total_covered, 1.0)


def _build_portfolio(scored: list, investment: float) -> str:
    if not scored:
        return "无可行资金组合"
    top = scored[:3]
    parts = []
    avg_cost = 0.0
    total_weight = 0.0
    for t in top:
        ratio = float(t.get("max_loan_ratio", 0.5))
        cost_str = t.get("综合利率") or t.get("利率") or "5%"
        digits = "".join(c for c in str(cost_str) if c.isdigit() or c == ".")
        try:
            cost_val = float(digits) if digits else 5.0
        except Exception:
            cost_val = 5.0
        if cost_val < 1:
            cost_val = cost_val * 100
        parts.append(f"{t.get('工具名称', t.get('name', '?'))} {int(ratio*100)}%")
        avg_cost += cost_val * ratio
        total_weight += ratio
    avg = avg_cost / total_weight if total_weight > 0 else 0
    return f"{'+'.join(parts)}, 综合利率 {avg:.2f}%"


def _extract_risks(scored: list, hard_filter_log: list) -> list:
    risks = []
    # H 不通过原因
    for log_entry in hard_filter_log:
        risks.append(log_entry)
    # S 低分维度
    for p in scored:
        for s_dim in ("S1", "S2", "S3", "S4"):
            v = p.get(s_dim)
            if v is not None and float(v) < 60:
                name_map = {"S1": "审批通过率", "S2": "资金成本", "S3": "期限匹配", "S4": "还款覆盖"}
                risks.append(f"{p.get('工具名称', p.get('name', '?'))} {name_map[s_dim]} 评分 {v} < 60，存在风险")
    return risks


# ============================================================
# Main: evaluate()
# ============================================================

def evaluate(investment: float, holding_years: int, exit_strategy: str,
             user_region: str, user_industry: str,
             capital_ratio: float, mortgage_type: str, mortgage_value: float,
             baseline_rent: float = None, leasable_area: float = None,
             agent1_output: dict = None, agent2_output: dict = None) -> dict:
    """
    agent3 多元融资主入口。

    Returns:
        dict - V1 §7 schema 6 字段 + _calc 引擎溯源
    """
    # Step 1: 拉取最新数据
    products, src1 = _safe_execute_sql("finance_products")
    mortgage_thresholds, src2 = _safe_execute_sql("mortgage_thresholds")
    negative_list, src3 = _safe_execute_sql("negative_list")
    pilot_cities, src4 = _safe_execute_sql("pilot_cities")
    industry_thresholds, src5 = _safe_execute_sql("industry_thresholds")

    sources = [src1, src2, src3, src4, src5]
    engine_label = "libsql-direct" if all(s == "libsql" for s in sources) else "libsql-fallback-json"

    # Step 2: H1-H4 硬约束剔除
    candidates = []
    hard_filter_log = []
    for p in products:
        name = p.get("工具名称") or p.get("name") or "?"
        if not _h1_capital_ratio(p, capital_ratio):
            hard_filter_log.append(f"{name}: H1 资本金比例 {capital_ratio*100:.0f}% < 工具门槛，剔除")
            continue
        if not _h2_mortgage(p, mortgage_type, mortgage_value, mortgage_thresholds):
            hard_filter_log.append(f"{name}: H2 抵押物类型 {mortgage_type} 不在 5 类清单或抵押率超标，剔除")
            continue
        if _h3_negative(p, negative_list, user_industry, user_region):
            hard_filter_log.append(f"{name}: H3 命中负面清单，剔除")
            continue
        if not _h4_pilot_city(p, pilot_cities, user_region):
            hard_filter_log.append(f"{name}: H4 项目所在地 {user_region} 非 15 城试点，剔除")
            continue
        candidates.append(p)

    # Step 3: S1-S4 综合分
    scored = []
    for c in candidates:
        s1 = _s1_approval_rate(c)
        s2 = _s2_cost(c)
        s3 = _s3_term(c, holding_years)
        s4 = _s4_dscr(c, baseline_rent or 0, leasable_area or 0, investment)
        total = s1 * 0.3 + s2 * 0.3 + s3 * 0.2 + s4 * 0.2
        scored.append({
            **c,
            "工具名称": c.get("工具名称") or c.get("name") or "?",
            "资金成本": c.get("综合利率") or c.get("利率") or "未提供",
            "期限": c.get("期限") or c.get("term") or "未提供",
            "审批通过率": f"S1={s1:.0f}",
            "S1": s1, "S2": s2, "S3": s3, "S4": s4,
            "综合分": round(total, 1),
        })

    # Step 4: 灯色判定
    if len(scored) == 0:
        light = "red"
    else:
        cov = _coverage_ratio(scored, investment)
        if cov < 0.7:
            light = "yellow"
        else:
            light = "green"

    # Step 5: 组装输出 schema
    scored_sorted = sorted(scored, key=lambda x: -x["综合分"])

    # 推荐 Top3 工具清单 (轻量版)
    tool_list = []
    for s in scored_sorted:
        tool_list.append({
            "工具名称": s["工具名称"],
            "资金成本": s["资金成本"],
            "期限": s["期限"],
            "审批通过率": s["审批通过率"],
            "综合分": s["综合分"],
        })

    return {
        "agent": "agent3-多元融资",
        "灯色": light,
        "可适用融资工具清单": tool_list,
        "推荐资金组合": _build_portfolio(scored_sorted, investment),
        "关键审批风险点": _extract_risks(scored_sorted, hard_filter_log),
        "依据": [
            f"融资产品库 ({src1})",
            f"抵押率阈值表 ({src2})",
            f"负面清单 ({src3})",
            f"15 城试点 ({src4})",
        ],
        "建议动作": "终止" if light == "red" else ("条件推进" if light == "yellow" else "可推进"),
        "_calc": {
            "engine": engine_label,
            "scripts_version": "V2",
            "data_version": "2026-08-08",
            "libsql_available": _LIBSQL_AVAILABLE,
            "candidate_count": len(candidates),
            "coverage_ratio": _coverage_ratio(scored, investment) if scored else 0.0,
        },
    }
