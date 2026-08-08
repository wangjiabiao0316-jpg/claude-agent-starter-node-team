#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agent6 双层决策聚合器（V2）。

读取 /tmp/finance/decision_rules.json 决策表（或 references/decision_rules.json fallback），
按四维聚合规则算灯色，消费 agent4._calc.engine 字段强制投资拓展维度灯色。

参考：
- super-skill/plan/2026-08-08-super-skill-implementation-plan.md Task 4 Step 3
- skill集群/plan/2026-08-03-agent6-双层决策-skill工作流.md §1.6 schema
- references/decision_rules.json (V2 决策表)

Usage:
    from decision_aggregator import decide
    result = decide(agent1=..., agent3=..., agent4=..., agent5=...)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Tuple


# ---------------------------------------------------------------------------
# 决策表加载（candidates fallback：sandbox 路径优先，本地 references 兜底）
# ---------------------------------------------------------------------------

def _load_rules() -> Dict[str, Any]:
    """加载 decision_rules.json。优先 sandbox 路径，其次本地 references/。"""
    candidates = [
        Path(__file__).parent / "decision_rules.json",                       # /tmp/finance/decision_rules.json
        Path(__file__).parent.parent / "references" / "decision_rules.json",  # skills/agent6-双层决策/references/decision_rules.json
        Path.cwd() / "decision_rules.json",
    ]
    for p in candidates:
        if p.exists():
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError(
        "decision_rules.json not found in candidates: " + ", ".join(str(c) for c in candidates)
    )


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

_RENOVATION_FAILURE_MODES = {"招商失败", "改造超预算", "业态误判"}
_CONSTRUCTION_FAILURE_MODE = "施工引发周边协调失败"


def _safe_get(obj: Any, key: str, default: Any = None) -> Any:
    """安全读取 dict 字段；obj 不是 dict 时返回 default。"""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return default


def _has_renovation_root_cause(agent5: Dict[str, Any]) -> bool:
    """agent5.Top3案例 中是否含改造类根因（招商失败 / 改造超预算 / 业态误判）。"""
    cases = _safe_get(agent5, "Top3案例", []) or []
    for c in cases:
        if not isinstance(c, dict):
            continue
        if c.get("失败模式") in _RENOVATION_FAILURE_MODES:
            return True
    return False


def _has_construction_root_cause(agent5: Dict[str, Any]) -> bool:
    """agent5.Top3案例 中是否含「施工引发周边协调失败」根因。"""
    cases = _safe_get(agent5, "Top3案例", []) or []
    for c in cases:
        if not isinstance(c, dict):
            continue
        if c.get("失败模式") == _CONSTRUCTION_FAILURE_MODE:
            return True
    return False


def _has_H2_core(agent1: Dict[str, Any]) -> bool:
    """agent1.命中判据 中是否含 H2 核心保护区（H2.red 且 文保核心保护区）。"""
    hits = _safe_get(agent1, "命中判据", []) or []
    for h in hits:
        if isinstance(h, str) and "H2" in h and "核心保护区" in h:
            return True
    return False


def _has_H2_buffer(agent1: Dict[str, Any]) -> bool:
    """agent1.命中判据 中是否含 H2 建控地带（H2.yellow 且 建控地带）。"""
    hits = _safe_get(agent1, "命中判据", []) or []
    for h in hits:
        if isinstance(h, str) and "H2" in h and "建控地带" in h:
            return True
    return False


# ---------------------------------------------------------------------------
# 四维子灯计算
# ---------------------------------------------------------------------------

def _dim_light_设计咨询(agent1: Dict[str, Any], agent5: Dict[str, Any]) -> Tuple[str, str]:
    """维度一：设计咨询 = agent1 主信号 + agent5 改造类根因重现校验。

    V1 §1.2 维度一规则：agent1=yellow + agent5 命中改造类根因（招商失败/改造超预算/业态误判）
    且 根因重现判断=true → 设计咨询=red。
    若 根因重现判断=false（仅相似案例命中但根因不重现），按 agent1 主信号 yellow 处理。
    """
    a1 = _safe_get(agent1, "灯色")
    a5_light = _safe_get(agent5, "校验灯")
    a5_root_cause_recurrence = _safe_get(agent5, "根因重现判断", False)  # 默认 False
    has_renovation = a5_root_cause_recurrence and _has_renovation_root_cause(agent5)

    if a1 == "red":
        return "red", "agent1.灯色=red"
    if a1 == "yellow" and has_renovation:
        return "red", "agent1=yellow + agent5 命中改造类根因且 根因重现判断=true（招商失败/改造超预算/业态误判）"
    if a1 == "yellow":
        return "yellow", "agent1=yellow, agent5 无改造类根因重现（根因重现判断=false 或失败模式未命中）"
    if a1 == "green" and a5_light == "green":
        return "green", "agent1=green + agent5=green"
    return "yellow", f"默认降级 yellow（a1={a1}, a5={a5_light}）"


def _dim_light_投资拓展(agent3: Dict[str, Any], agent4: Dict[str, Any], rules: Dict[str, Any]) -> Tuple[str, str]:
    """维度二：投资拓展 = agent3 融资可行性 + agent4 财务指标达标（含 _calc.engine 强制规则）。"""
    a3 = _safe_get(agent3, "灯色")
    a4_达标 = _safe_get(_safe_get(agent4, "业态门槛对照", {}), "达标结论")
    a4_engine = _safe_get(_safe_get(agent4, "_calc", {}), "engine")

    # 1) agent4 engine 强制规则（覆盖常规灯色逻辑）
    engine_map = rules.get("agent4_engine_mapping", {})
    engine_action = engine_map.get(a4_engine, "follow_v1")
    if engine_action == "force_red":
        return "red", f"agent4._calc.engine={a4_engine}（强制 red）"
    if engine_action == "force_yellow":
        return "yellow", f"agent4._calc.engine={a4_engine}（强制 yellow）"
    # engine_action == "normal" or "follow_v1"：按常规规则

    # 2) 常规规则
    if a3 == "red" or a4_达标 == "不达标":
        return "red", f"agent3={a3} 或 agent4.达标结论={a4_达标}"
    if a3 == "yellow" or a4_达标 == "达标":
        return "yellow", f"agent3={a3}, agent4.达标结论={a4_达标}"
    if a3 == "green" and a4_达标 == "优":
        return "green", f"agent3={a3}, agent4.达标结论={a4_达标}"
    return "yellow", f"默认降级 yellow（a3={a3}, a4_达标={a4_达标}, engine={a4_engine}）"


def _dim_light_建造实施(agent1: Dict[str, Any], agent5: Dict[str, Any]) -> Tuple[str, str]:
    """维度三：建造实施（Phase1 简化）= agent1 文保 + agent5 施工协调。"""
    has_H2_core = _has_H2_core(agent1)
    has_H2_buffer = _has_H2_buffer(agent1)
    a5_light = _safe_get(agent5, "校验灯")
    has_construction = _has_construction_root_cause(agent5)

    if has_H2_core:
        return "red", "agent1.H2 命中核心保护区"
    if has_construction:
        return "red", "agent5 含施工引发周边协调失败根因"
    if has_H2_buffer:
        return "yellow", "agent1.H2 命中建控地带"
    if a5_light == "yellow":
        return "yellow", "agent5.校验灯=yellow"
    return "green", "无文保约束 + 无施工类根因"


def _dim_light_业主平台(三维灯色: Dict[str, str], 数据完整度: float = 1.0) -> Tuple[str, str]:
    """维度四：业主平台 = 综合前三维度 + 上会就绪度（含数据完整度校验）。

    V1 §1.2 维度四规则：三维全 green 时若 数据完整度 < 90% → 业主平台=yellow。
    """
    lights = list(三维灯色.values())
    if any(l == "red" for l in lights):
        return "red", "三维任一 red → 业主平台 red（一致性硬规则）"
    if all(l == "green" for l in lights):
        if 数据完整度 >= 0.9:
            return "green", f"三维全 green + 数据完整度 {数据完整度:.0%} ≥ 90%"
        else:
            return "yellow", f"三维全 green 但数据完整度 {数据完整度:.0%} < 90%"
    return "yellow", "存在 yellow → 业主平台 yellow"


# ---------------------------------------------------------------------------
# 主入口：decide()
# ---------------------------------------------------------------------------

def decide(agent1: Dict[str, Any], agent3: Dict[str, Any],
           agent4: Dict[str, Any], agent5: Dict[str, Any],
           数据完整度: float = 1.0) -> Dict[str, Any]:
    """
    agent6 双层决策聚合主入口。

    Args:
        agent1: 固有对象识别结论层输出对象（schema 见 references/agent1_输出_schema.md）
        agent3: 多元融资结论层输出对象（schema 见 references/agent3_输出_schema.md）
        agent4: 财务模型结论层输出对象（含 _calc.engine，schema 见 references/agent4_输出_schema.md）
        agent5: 失败案例结论层输出对象（schema 见 references/agent5_输出_schema.md）
        数据完整度: 业主平台上会就绪度（0.0-1.0，默认 1.0 满分）。
                   V1 §1.2 维度四：三维全 green 时若 < 90% → 业主平台=yellow。

    Returns:
        agent6 结论层输出对象（schema 见 intent.md §4）
    """
    # 输入缺失阻断（V2 强制校验）
    for name, obj in [("agent1", agent1), ("agent3", agent3),
                      ("agent4", agent4), ("agent5", agent5)]:
        if not isinstance(obj, dict):
            raise TypeError(f"{name} 必须是 dict，收到 {type(obj).__name__}")

    rules = _load_rules()

    # Step 1: 算四维子灯
    设计咨询灯, 设计咨询依据 = _dim_light_设计咨询(agent1, agent5)
    投资拓展灯, 投资拓展依据 = _dim_light_投资拓展(agent3, agent4, rules)
    建造实施灯, 建造实施依据 = _dim_light_建造实施(agent1, agent5)

    三维 = {"设计咨询": 设计咨询灯, "投资拓展": 投资拓展灯, "建造实施": 建造实施灯}
    业主平台灯, 业主平台依据 = _dim_light_业主平台(三维, 数据完整度)

    四维 = {
        "设计咨询": {"灯色": 设计咨询灯, "依据": 设计咨询依据},
        "投资拓展": {"灯色": 投资拓展灯, "依据": 投资拓展依据},
        "建造实施": {"灯色": 建造实施灯, "依据": 建造实施依据},
        "业主平台": {"灯色": 业主平台灯, "依据": 业主平台依据},
    }

    # Step 2: H 硬规则判定（设计咨询 red 或 投资拓展 red → 顶层 red）
    h_rules = rules.get("H_rules", {})
    if 设计咨询灯 == "red" or 投资拓展灯 == "red":
        顶层灯 = "red"
        顶层判据 = h_rules.get("result", {}).get("顶层判据",
                                                  "H.关键维度硬规则（设计咨询=red 或 投资拓展=red）")
        建议动作 = "终止"
    else:
        # Step 3: S 软规则聚合（无红时执行）
        if all(v["灯色"] == "green" for v in 四维.values()):
            顶层灯 = "green"
            建议动作 = "可推进"
        else:
            顶层灯 = "yellow"
            建议动作 = "条件推进"
        顶层判据 = "S.决策权重聚合（0.3/0.3/0.2/0.2）"

    # 条件推进事项（V2 简化：列出非 green 维度）
    if 顶层灯 == "green":
        条件推进事项 = []
    else:
        条件推进事项 = [
            f"{k} 维度 {v['灯色']}"
            for k, v in 四维.items()
            if v["灯色"] != "green"
        ]

    # 触发报告模板（按顶层灯映射）
    report_map = rules.get("report_template_mapping", {})
    触发报告模板 = report_map.get(顶层灯, "内部决策版")

    # 一致性校验（V2 sandbox 强制）：顶层与四维必须自洽
    if 顶层灯 == "green":
        for k, v in 四维.items():
            assert v["灯色"] == "green", (
                f"一致性校验失败：顶层=green 但 {k}={v['灯色']}（论证断裂）"
            )
    if 顶层灯 == "red":
        # 顶层 red 时至少有一维 red 且属 H 硬规则范围（设计咨询 / 投资拓展）
        h_trigger = (四维["设计咨询"]["灯色"] == "red") or (四维["投资拓展"]["灯色"] == "red")
        assert h_trigger, (
            "一致性校验失败：顶层=red 但设计咨询 / 投资拓展均非 red（H 硬规则未触发）"
        )

    return {
        "agent": "agent6-双层决策",
        "顶层灯": 顶层灯,
        "顶层判据": 顶层判据,
        "四维子灯": 四维,
        "条件推进事项": 条件推进事项,
        "建议动作": 建议动作,
        "触发报告模板": 触发报告模板,
        "_calc": {
            "engine": "decision-aggregator-v2",
            "rules_version": rules.get("version", "unknown"),
        },
    }


# ---------------------------------------------------------------------------
# CLI（供 sandbox.commands.run('python3 decision_aggregator.py ...')）
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) > 1:
        inputs = json.loads(sys.argv[1])
    else:
        # 从 stdin 读
        inputs = json.loads(sys.stdin.read())

    # 数据完整度 从顶层 input 解包（默认 1.0）
    result = decide(
        agent1=inputs.get("agent1", {}),
        agent3=inputs.get("agent3", {}),
        agent4=inputs.get("agent4", {}),
        agent5=inputs.get("agent5", {}),
        数据完整度=inputs.get("数据完整度", 1.0),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
