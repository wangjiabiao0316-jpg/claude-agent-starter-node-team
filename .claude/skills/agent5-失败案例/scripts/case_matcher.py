"""
case_matcher.py — agent5-失败案例 V2 sandbox 主入口

按 super-skill/plan/2026-08-08-super-skill-implementation-plan.md Task 6 Step 5 实现：
  1. libsql_client.query_cases 拉取候选（已做 SQL WHERE region + industry 预筛）
  2. 6 维加权相似度（region/industry 硬匹配 + scale/property_type/physical_params/financing 软加权）
  3. Top3 + 失败模式归因
  4. 灯色判定（H1 高危命中 red / Top3 高相似度根因重现 yellow / 无危险 green）

依赖：
  - libsql_client.query_cases(features, top_k=10) — 由 _shared/scripts/libsql_client.py 提供
  - references/case_library.json — libSQL 查询失败时的 fallback

引擎：纯 Python（无第三方依赖），urllib 通过 libsql_client 间接调用
"""
import os
import json
import math

# 尝试 import libsql_client；失败时仅标记不可用，不抛错（fallback 仍可工作）
try:
    from libsql_client import query_cases as _libsql_query_cases
    _LIBSQL_AVAILABLE = True
except Exception:
    _libsql_query_cases = None
    _LIBSQL_AVAILABLE = False


# ============================================================================
# 配置（来自 references/similarity_weights.md，V1 §5 L287-288 锚定值）
# ============================================================================

WEIGHTS = {
    "region": 0.0,         # 硬匹配（必须等，已 SQL WHERE 预筛）
    "industry": 0.0,       # 硬匹配（必须等，已 SQL WHERE 预筛）
    "scale": 0.2,          # 软加权 — _normalize_scale 分档
    "property_type": 0.2,  # 软加权 — 字符串向量化后余弦
    "physical_params": 0.3,  # 软加权 — dict 向量化后余弦（文保/结构/改造模式）
    "financing": 0.3,      # 软加权 — dict 向量化后余弦（融资期限/持有年限/退出策略）
}

HARD_MATCH = ["region", "industry"]  # 必须等

# 相似度阈值
SIMILARITY_INCLUSIVE_THRESHOLD = 0.4   # < 0.4 不纳入 Top3
HIGH_SIMILARITY_THRESHOLD = 0.7        # ≥ 0.7 视为高相似度
RECONSIDER_THRESHOLD = 0.8             # ≥ 0.8 + 根因重现 → yellow

# 改造超预算阈值（V1 §5 L281-285 锚定）
RENOVATION_OVER_BUDGET_RATIO = 1.5

# 业态门槛基准（V1 §3 L176 / §4 L245，agent5 仅消费 agent4 输出，不直接判定）
INDUSTRY_THRESHOLD = {
    "商业": {"下限": 0.08, "上限": 0.12},
    "办公": {"下限": 0.06, "上限": 0.09},
    "文旅": {"下限": 0.07, "上限": 0.10},
}


# ============================================================================
# 工具函数：相似度计算
# ============================================================================

def _normalize_scale(s):
    """规模归一化（V1 §5 L287-288 + plan Task 6 Step 5）。"""
    if s is None:
        return 0.0
    try:
        s = float(s)
    except (TypeError, ValueError):
        return 0.0
    if s < 1000:
        return 0.2
    if s < 5000:
        return 0.4
    if s < 20000:
        return 0.6
    if s < 50000:
        return 0.8
    return 1.0


def _cosine_sim(a, b):
    """余弦相似度（来自 plan Task 6 Step 5）。"""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb + 1e-9)


def _stable_hash(s):
    """稳定的 hash 函数（不受 PYTHONHASHSEED 影响）。

    使用 hashlib.md5 取前 8 字节，归一化到 [0, 1]。
    替代 Python 内置 hash()，避免跨进程结果不一致 + 避免不同字符串偶然碰撞。
    """
    import hashlib
    if not isinstance(s, str):
        s = str(s)
    h = hashlib.md5(s.encode("utf-8")).hexdigest()
    # 取前 8 位十六进制（32 bit），归一化到 [0, 1]
    return int(h[:8], 16) / 0xFFFFFFFF


def _vectorize(d):
    """将 dict / 字符串 / 数值 转为长度固定的数值向量。

    使用稳定 hash（_stable_hash）归一化到 [0, 1]。
    改进点（V2 iterate 1）：
      1. 用 hashlib.md5 替代 Python 内置 hash()，避免 PYTHONHASHSEED 导致跨进程不一致
      2. 同字段同值才得相同 hash（不同字段值即使内容相近也得不同 hash），避免虚高相似度
    """
    if d is None:
        return [0.0]
    if isinstance(d, dict):
        if not d:
            return [0.0]
        return [_stable_hash(v) for v in d.values()]
    if isinstance(d, (list, tuple)):
        if not d:
            return [0.0]
        return [_stable_hash(v) for v in d]
    # 标量
    return [_stable_hash(d)]


def _similarity(project, case):
    """6 维加权相似度（来自 plan Task 6 Step 5）。

    region / industry 已 SQL 预筛（HARD_MATCH），跳过；
    scale 用 _normalize_scale 分档；
    property_type / physical_params / financing 用 _vectorize + _cosine_sim。
    """
    total = 0.0
    for dim, w in WEIGHTS.items():
        if dim in HARD_MATCH:
            continue
        if w == 0.0:
            continue
        if dim == "scale":
            ps = _normalize_scale(project.get("scale", 0))
            cs = _normalize_scale(case.get("scale", 0))
            total += w * (1.0 - abs(ps - cs))
        else:
            pv = _vectorize(project.get(dim, {}))
            cv = _vectorize(case.get(dim, {}))
            # 长度对齐（截短到较短长度）
            min_len = min(len(pv), len(cv))
            if min_len == 0:
                continue  # 该维度贡献 0
            pv_aligned = pv[:min_len]
            cv_aligned = cv[:min_len]
            total += w * _cosine_sim(pv_aligned, cv_aligned)
    return total


# ============================================================================
# 工具函数：失败模式归因
# ============================================================================

def _classify_failure(top3, agent1, agent3, agent4):
    """从 Top3 案例提取失败模式 + 高危触发条件复核。

    返回：[{失败模式, 根因, 高危命中(bool), 触发条件}], list
    """
    if not top3:
        return []

    result = []
    for case in top3:
        failure_mode = case.get("失败模式") or case.get("failure_mode") or "未知"
        root_cause = case.get("根因") or case.get("root_cause") or ""
        high_risk_hit, trigger = _check_high_risk_detail(failure_mode, agent1, agent3, agent4)
        result.append({
            "失败模式": failure_mode,
            "根因": root_cause,
            "高危命中": high_risk_hit,
            "触发条件": trigger,
            "案例 case_id": case.get("case_id", "unknown"),
        })
    return result


def _check_high_risk_detail(failure_mode, agent1, agent3, agent4):
    """详细高危触发条件判定（V1 §5 L281-285 5 类失败模式高危示例）。"""
    agent1 = agent1 or {}
    agent3 = agent3 or {}
    agent4 = agent4 or {}

    # ① 招商失败：可租赁面积 < 业态最低门槛 / 区位客流评级 < D 级
    if failure_mode == "招商失败":
        scale = agent1.get("可租赁面积") or agent1.get("scale")
        industry = agent1.get("业态方向") or agent1.get("industry")
        # 业态最低门槛：商业 5000 / 办公 3000 / 文旅 8000（【待校准】）
        threshold_scale_map = {"商业": 5000, "办公": 3000, "文旅": 8000}
        threshold_scale = threshold_scale_map.get(industry, 5000)
        # 修 bug：scale 必须是数值才进入比较
        try:
            scale_val = float(scale) if scale is not None else None
        except (TypeError, ValueError):
            scale_val = None
        if scale_val is not None and scale_val < threshold_scale:
            return True, f"可租赁面积 {scale_val} ㎡ < 业态最低门槛 {threshold_scale} ㎡"
        # 区位客流评级 < D 级（V1 高危条件之一）
        # 修 bug：仅在 agent1 显式提供 区位客流评级 时判定；缺失不进入字符串比较
        location_rating = agent1.get("区位客流评级")
        if location_rating is not None:
            rating_order = ["A", "B", "C", "D", "E"]  # A 最优，E 最差
            try:
                idx = rating_order.index(str(location_rating).upper())
                if idx >= 3:  # D 或 E
                    return True, f"区位客流评级 {location_rating} ≥ D 级"
            except (ValueError, IndexError):
                pass  # 不在评级表内，不触发
        return False, "未触发"

    # ② 退出受阻：融资期限与持有年限严重错配 / 资产属性禁止 REITs 退出
    if failure_mode == "退出受阻":
        financing_term = agent3.get("融资期限") or agent3.get("期限") or 0
        holding_years = agent3.get("持有年限") or 0
        try:
            financing_term = float(financing_term)
            holding_years = float(holding_years)
        except (TypeError, ValueError):
            return False, "融资期限/持有年限数据非法"
        # 严重错配：融资期限 < 持有年限 / 2
        if financing_term and holding_years and financing_term < holding_years / 2:
            return True, f"融资期限 {financing_term} 年与持有年限 {holding_years} 年严重错配"
        exit_strategy = agent3.get("退出策略") or ""
        asset_attr = agent1.get("资产属性") or ""
        if "REITs" in str(exit_strategy) and "禁止" in str(asset_attr):
            return True, "资产属性禁止 REITs 退出"
        return False, "未触发"

    # ③ 改造超预算：文保核心保护区 + 改造模式被迫收敛致成本 > 1.5× 基准
    if failure_mode == "改造超预算":
        heritage = agent1.get("文保等级") or agent1.get("文保约束") or ""
        renovation_mode = agent1.get("改造模式") or ""
        cost_ratio = agent1.get("改造成本倍数") or 0
        try:
            cost_ratio = float(cost_ratio)
        except (TypeError, ValueError):
            cost_ratio = 0.0
        if "核心保护" in str(heritage) and renovation_mode == "保留微更新" and cost_ratio > RENOVATION_OVER_BUDGET_RATIO:
            return True, f"文保核心保护区 + 改造模式收敛 + 改造成本 {cost_ratio}× 基准 > {RENOVATION_OVER_BUDGET_RATIO}×"
        return False, "未触发"

    # ④ 业态误判：IRR < 业态门槛基准下限（agent4 输出已含达标结论）
    if failure_mode == "业态误判":
        irr = agent4.get("IRR")
        industry = agent1.get("业态方向") or agent4.get("业态")
        threshold = INDUSTRY_THRESHOLD.get(industry or "", {})
        lower = threshold.get("下限")
        try:
            irr_val = float(irr) if irr is not None else None
        except (TypeError, ValueError):
            irr_val = None
        if irr_val is not None and lower is not None and irr_val < lower:
            return True, f"IRR {irr_val*100:.1f}% < {industry}业态门槛下限 {lower*100:.1f}%"
        # agent4 已输出不达标结论
        conclusion = agent4.get("业态门槛对照", {}).get("达标结论") if isinstance(agent4.get("业态门槛对照"), dict) else None
        if conclusion == "不达标":
            return True, "agent4 业态门槛对照结论=不达标"
        return False, "未触发"

    # ⑤ 施工引发周边协调失败：文保周边 / 密集区施工扰动评估为高风险
    if failure_mode == "施工引发周边协调失败":
        heritage_around = agent1.get("文保周边")
        density = agent1.get("密集区")
        disturbance = agent1.get("施工扰动评估") or ""
        # 修 bug: 字段值可能是 bool(True/False) 或字符串 "True"/"False"
        def _is_truthy(v):
            if v is None:
                return False
            if isinstance(v, bool):
                return v
            return str(v).lower() in ("true", "1", "yes", "是", "高风险")
        # 文保周边 或 密集区 任一为真 + 施工扰动=高风险
        condition1 = _is_truthy(heritage_around) or _is_truthy(density)
        condition2 = (disturbance == "高风险")
        if condition1 and condition2:
            return True, f"文保周边/密集区 + 施工扰动评估=高风险"
        return False, "未触发"

    return False, "未触发"


def _check_high_risk(failure_mode, agent1, agent3, agent4):
    """简化版高危判定（仅 bool）。"""
    hit, _ = _check_high_risk_detail(failure_mode, agent1, agent3, agent4)
    return hit


# ============================================================================
# 工具函数：根因重现判断 + 命中判据 + 规避建议
# ============================================================================

def _root_cause_recurrence(top3, failure_modes=None):
    """根因是否在当前项目特征中重现（bool）。

    V2 iterate 2 严格化：必须 Top3 中至少 1 条相似度 ≥ HIGH_SIMILARITY_THRESHOLD(0.7)
    且对应失败模式在高危判定中触发（failure_modes 中存在该模式且 高危命中=True）。

    failure_modes=None 时退化为旧逻辑（仅相似度判定），用于向后兼容。
    """
    if not top3:
        return False

    if failure_modes is None:
        return any(case.get("相似度", 0) >= HIGH_SIMILARITY_THRESHOLD for case in top3)

    # 严格模式：相似度高 + 该失败模式确实在 agent1 字段中触发高危
    high_risk_modes = {m["失败模式"] for m in failure_modes if m.get("高危命中")}
    if not high_risk_modes:
        return False

    for case in top3:
        if case.get("相似度", 0) >= HIGH_SIMILARITY_THRESHOLD:
            case_mode = case.get("失败模式") or case.get("failure_mode")
            if case_mode in high_risk_modes:
                return True
    return False


def _build_evidence(top3, failure_modes):
    """构建命中判据对象。"""
    s1 = max([case.get("相似度", 0) for case in top3], default=0.0) if top3 else 0.0
    high_risk_modes = [m for m in failure_modes if m.get("高危命中")]
    h1_mode = high_risk_modes[0]["失败模式"] if high_risk_modes else None
    # S2 归因分 = 高危命中数 / Top3 数（保守估计）
    s2 = (len(high_risk_modes) / len(failure_modes)) if failure_modes else 0.0
    return {
        "H1_高危模式": h1_mode,
        "S1_相似度分": round(s1, 3),
        "S2_归因分": round(s2, 3),
    }


_MITIGATION_TEMPLATE = {
    "招商失败": "调整业态方向至对可租赁面积门槛更低的业态，或重新评估区位客流提升路径（如引入主力店 / 加强交通接驳）",
    "退出受阻": "重设融资期限与持有年限的匹配关系，或调整退出策略（如 REITs → 整体转让 / 散售）",
    "改造超预算": "拆分非文保区域独立测算，调整业态方向降低文保约束冲击，或重新评估改造模式选择",
    "业态误判": "调整业态方向至 IRR 达标的业态（商业 8-12% / 办公 6-9% / 文旅 7-10%），或优化租金假设提升 IRR",
    "施工引发周边协调失败": "分阶段施工降低扰动，建立居民沟通机制，制定交通导流方案，必要时调整工期窗口",
}


def _build_mitigation(failure_modes):
    if not failure_modes:
        return "无失败模式命中，无需额外规避动作"
    parts = []
    for m in failure_modes:
        if m.get("高危命中"):
            mode = m["失败模式"]
            parts.append(_MITIGATION_TEMPLATE.get(mode, f"针对 {mode} 制定规避方案"))
    if not parts:
        return "Top3 案例相似度较高但未触发高危，建议关注根因变化趋势"
    return "; ".join(parts)


# ============================================================================
# 数据源：libsql_client.query_cases + fallback references/case_library.json
# ============================================================================

def _safe_query_cases(features, top_k=10):
    """尝试 libsql_client.query_cases；失败 fallback references/case_library.json。

    返回：(cases, engine)
      engine = "case-matcher-v2"（libSQL 直连成功）
               "references-json-direct"（fallback references/case_library.json；
                                         V5 标注：EdgeOne sandbox env 隔离导致 libsql_client
                                         抛 RuntimeError 是预期行为，references JSON 是
                                         合法数据源，不再是"降级"）
    抛 RuntimeError：libSQL 与 fallback 都不可用
    """
    if _LIBSQL_AVAILABLE:
        try:
            cases = _libsql_query_cases(features, top_k=top_k)
            if cases is not None:
                return cases, "case-matcher-v2"
        except Exception as e:
            print(f"[WARN] libsql_client.query_cases failed: {e}; falling back to references/case_library.json")

    # fallback references/case_library.json
    fallback_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "references", "case_library.json",
    )
    fallback_path = os.path.normpath(fallback_path)
    if not os.path.exists(fallback_path):
        # 再尝试 /tmp/finance/references/case_library.json（sandbox 内）
        sandbox_path = "/tmp/finance/references/case_library.json"
        if os.path.exists(sandbox_path):
            fallback_path = sandbox_path
        else:
            raise RuntimeError(
                f"case_library 既无法从 libSQL 拉取，也无 fallback 文件: {fallback_path}"
            )

    with open(fallback_path, encoding="utf-8") as f:
        all_cases = json.load(f)

    # F15 校验：案例库被篡改
    if not isinstance(all_cases, list) or len(all_cases) < 5:
        raise RuntimeError(f"case_library.json 数据异常（条数 < 5 或非 list）")

    # 简单 filter 模拟 SQL WHERE region + industry
    region = features.get("region")
    industry = features.get("industry")
    filtered = [
        c for c in all_cases
        if c.get("region") == region and c.get("industry") == industry
    ]
    # 如严格 filter 后为空，放宽 industry 限制（仅按 region）
    if not filtered:
        filtered = [c for c in all_cases if c.get("region") == region]
    # 仍为空则用全部
    if not filtered:
        filtered = all_cases

    return filtered[:top_k], "references-json-direct"


# ============================================================================
# 主入口
# ============================================================================

def match(region, industry, scale, property_type, physical_params, financing,
          agent1, agent3, agent4):
    """agent5-失败案例 V2 主入口。

    Args:
        region: 项目区域（如 "上海"）
        industry: 业态方向（"商业" / "办公" / "文旅"）
        scale: 可租赁面积（㎡，整数或浮点）
        property_type: 产权类型（如 "独立产权商业空间"）
        physical_params: dict {文保等级, 结构类型, 改造模式}
        financing: dict {融资期限, 持有年限, 退出策略}
        agent1: dict 上游 agent1 输出（含 产权/物理参数/业态方向/文保约束/改造模式）
        agent3: dict 上游 agent3 输出（含 融资结构/期限/抵押物）
        agent4: dict 上游 agent4 输出（含 IRR/业态门槛对照.达标结论）

    Returns:
        dict 完整输出 schema（含 _calc）
    """
    features = {
        "region": region,
        "industry": industry,
        "scale": scale,
        "property_type": property_type,
        "physical_params": physical_params or {},
        "financing": financing or {},
    }

    # 融合 agent1 的关键字段到 features（用于 _check_high_risk）
    agent1_merged = dict(agent1 or {})
    agent1_merged.setdefault("可租赁面积", scale)
    agent1_merged.setdefault("业态方向", industry)
    agent1_merged.setdefault("文保等级", (physical_params or {}).get("文保等级"))
    agent1_merged.setdefault("改造模式", (physical_params or {}).get("改造模式"))

    # Step 1: 拉取候选案例（libSQL 直连 / fallback）
    try:
        candidates, engine = _safe_query_cases(features, top_k=10)
    except Exception as e:
        # F15 案例 fallback 也无法访问
        return {
            "agent": "agent5-失败案例",
            "状态": "案例库不可用",
            "原因": str(e),
            "校验灯": "red",
            "Top3案例": [],
            "命中判据": {"H1_高危模式": None, "S1_相似度分": 0.0, "S2_归因分": 0.0},
            "规避建议": "稍后重试；如持续失败，检查 libSQL 连接与 references/case_library.json 完整性",
            "依据": [],
            "关键假设": "【待校准】S1 权重 0.6 / S2 权重 0.4",
            "_calc": {
                "engine": "unavailable",
                "data_version": "2026-08-08",
                "candidates_count": 0,
            },
        }

    # Step 2: 6 维加权相似度
    scored = []
    for case in candidates:
        score = _similarity(features, case)
        if score >= SIMILARITY_INCLUSIVE_THRESHOLD:
            scored.append({
                **case,
                "相似度": round(score, 3),
            })

    # Step 3: Top3 + 失败模式归因
    top3 = sorted(scored, key=lambda x: -x["相似度"])[:3]
    failure_modes = _classify_failure(top3, agent1_merged, agent3, agent4)

    # Step 4: 灯色判定（H1 高危 red / S1 高相似度根因重现 yellow / 无危险 green）
    high_risk = any(m.get("高危命中") for m in failure_modes)
    recurrence = _root_cause_recurrence(top3, failure_modes)
    if high_risk:
        light = "red"
    elif top3 and top3[0].get("相似度", 0) >= RECONSIDER_THRESHOLD and recurrence:
        light = "yellow"
    else:
        light = "green"

    return {
        "agent": "agent5-失败案例",
        "校验灯": light,
        "Top3案例": [
            {
                "case_id": c.get("case_id", "unknown"),
                "相似度": c.get("相似度", 0.0),
                "失败模式": c.get("失败模式") or c.get("failure_mode") or "未知",
                "根因": c.get("根因") or c.get("root_cause") or "",
            }
            for c in top3
        ],
        "失败模式": failure_modes,
        "根因重现判断": recurrence,
        "命中判据": _build_evidence(top3, failure_modes),
        "规避建议": _build_mitigation(failure_modes),
        "依据": ["失败模式定义库", "案例库"],
        "关键假设": "【待校准】S1 权重 0.6 / S2 权重 0.4；相似度纳入阈值 0.4；高相似度阈值 0.7",
        "_calc": {
            "engine": engine,
            "data_version": "2026-08-08",
            "candidates_count": len(candidates),
        },
    }


# ============================================================================
# CLI 入口（用于 sandbox runCode 直接调用 / 本地测试）
# ============================================================================

if __name__ == "__main__":
    # 测试样例：典型项目（无失败模式命中）
    result = match(
        region="上海",
        industry="商业",
        scale=15000,
        property_type="独立产权商业空间",
        physical_params={
            "文保等级": "无文保",
            "结构类型": "框架",
            "改造模式": "混合",
        },
        financing={
            "融资期限": 10,
            "持有年限": 10,
            "退出策略": "REITs",
        },
        agent1={
            "产权": "独立产权商业空间",
            "物理参数": {"文保等级": "无文保"},
            "业态方向": "商业",
            "文保约束": "无",
            "改造模式": "混合",
        },
        agent3={
            "融资结构": {"银行贷款": 0.6, "股权": 0.4},
            "期限": 10,
            "抵押物": "项目资产",
            "融资期限": 10,
            "持有年限": 10,
            "退出策略": "REITs",
        },
        agent4={
            "IRR": 0.10,
            "业态门槛对照": {"达标结论": "达标"},
        },
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
