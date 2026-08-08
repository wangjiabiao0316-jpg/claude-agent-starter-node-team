# agent 调用决策树（references/agent_调用决策树.md）

> super-skill 编排器在 `query()` 主循环入口处的**触发判定 + 调用顺序决策**。
>
> 配套：架构设计 §4 + SKILL.md 触发条件章节。

---

## 1. 4 触发模式决策树

```
用户输入 query
    │
    ├─ 是否包含 ≥3 of [固有对象/政策/融资/财务/失败案例/双层决策]?
    │   ├─ YES → 全流程模式（默认）
    │   │        → super-skill 跑全部 6 agent
    │   │
    │   └─ NO → 继续判定
    │
    ├─ 是否显式说「上会/顶层判定/双层决策/完整测算」?
    │   ├─ YES → 全流程模式
    │   │
    │   └─ NO → 继续判定
    │
    ├─ 是否只问 1 个维度（如「算 IRR」「融资方案」「产权判定」）?
    │   ├─ YES → 单 agent 模式 → super-skill 不触发，直接调对应子 skill
    │   │
    │   └─ NO → 继续判定
    │
    ├─ 是否问 2-3 个维度（如「融资 + 财务」「产权 + 融资 + 失败案例」）?
    │   ├─ YES → 子集模式 → super-skill 部分激活
    │   │        → 仅调用相关 agent（如 agent3 + agent4 + agent6）
    │   │
    │   └─ NO → 继续判定
    │
    └─ 是否在已有 conversation 中追问（如「再算失败案例」）?
        ├─ YES → 追加模式
        │        → 从 [RETRIEVED CONTEXT] 读已完成 agent 列表
        │        → 只调用新增 / 用户指定的 agent
        │        → agent6 必须重跑（聚合依赖全部下游）
        │
        └─ NO → 默认进单 agent 模式（让 LLM 自由回答，不调 super-skill）
```

---

## 2. 模式判定伪代码

```python
def determine_mode(query: str, conversation_history: list) -> tuple[str, list[str]]:
    """
    返回 (mode, agent_list_to_run)
    mode ∈ {"full", "single", "subset", "append", "none"}
    agent_list_to_run ∈ [["agent1", "agent2", "agent3", "agent4", "agent5", "agent6"], ...]
    """
    DIMENSIONS = ["固有对象", "政策", "融资", "财务", "失败案例", "双层决策"]
    FULL_TRIGGERS = ["上会", "顶层判定", "双层决策", "完整测算"]

    matched_dims = [d for d in DIMENSIONS if d in query or _synonym_match(query, d)]

    # 1. 全流程模式
    if len(matched_dims) >= 3 or any(t in query for t in FULL_TRIGGERS):
        return ("full", ["agent1", "agent2", "agent3", "agent4", "agent5", "agent6"])

    # 2. 单 agent 模式（super-skill 不触发）
    if len(matched_dims) == 1 and not _is_followup(query, conversation_history):
        return ("single", [f"agent{_dim_to_idx(matched_dims[0])}"])

    # 3. 子集模式
    if 2 <= len(matched_dims) <= 3:
        agents = [_dim_to_idx(d) for d in matched_dims]
        if "agent6" not in agents:  # 子集模式必须包含 agent6（聚合）
            agents.append("agent6")
        return ("subset", agents)

    # 4. 追加模式
    if _is_followup(query, conversation_history):
        prior_agents = _extract_prior_agents(conversation_history)
        new_agents = [a for a in ["agent5", "agent6"] if a not in prior_agents or a == "agent6"]
        return ("append", new_agents)

    # 5. 默认：单 agent 模式（让 LLM 自由回答）
    return ("none", [])


def _dim_to_idx(dim: str) -> str:
    return {
        "固有对象": "agent1",
        "政策": "agent2",
        "融资": "agent3",
        "财务": "agent4",
        "失败案例": "agent5",
        "双层决策": "agent6",
    }[dim]


def _synonym_match(query: str, dim: str) -> bool:
    synonyms = {
        "固有对象": ["产权", "文保", "物理参数", "建筑参数"],
        "政策": ["试点城市", "政策门槛", "专项债"],
        "融资": ["资金组合", "贷款", "资本金"],
        "财务": ["IRR", "NPV", "回收期", "敏感性", "算账", "测算"],
        "失败案例": ["案例", "风险案例", "失败模式"],
        "双层决策": ["顶层灯", "红绿灯", "上会就绪度"],
    }
    return any(s in query for s in synonyms.get(dim, []))


def _is_followup(query: str, conversation_history: list) -> bool:
    """是否在已有 conversation 中追问"""
    if not conversation_history:
        return False
    followup_markers = ["再算", "重算", "重新跑", "再算一下", "接着算", "也看看"]
    return any(m in query for m in followup_markers)


def _extract_prior_agents(conversation_history: list) -> list[str]:
    """从 [RETRIEVED CONTEXT] 块或 tool_called 事件历史中提取已完成的 agent 列表"""
    # 实现细节：扫 conversation_history 找 tool_called 事件，提取 tool name
    return []
```

---

## 3. 调用顺序图（mermaid）

```mermaid
flowchart TD
    U[用户输入 query] --> SS{super-skill<br/>触发判定}

    SS -->|全流程 ≥3 维度 OR 显式 上会/顶层判定/双层决策/完整测算| P1[Phase 1 并行<br/>agent1 + agent2]
    SS -->|单 agent 模式 1 维度| SINGLE[直接调子 skill<br/>不进 super-skill]
    SS -->|子集模式 2-3 维度| SUB[部分激活<br/>+ 强制 agent6]
    SS -->|追加模式 followup| APPEND[读 [RETRIEVED CONTEXT]<br/>只跑新增 + agent6]

    P1 --> A1[agent1-固有对象]
    P1 --> A2[agent2-政策应答]

    A1 --> CHK1{agent1 灯色?}
    A2 --> CHK1

    CHK1 -->|red| SHORT_CIRCUIT_1[H1 短路<br/>跳过 agent3/4<br/>直接进 agent6]
    CHK1 -->|yellow / green| A3[agent3-多元融资<br/>注入 agent1 + agent2]

    A3 --> CHK3{agent3 灯色?}
    CHK3 -->|red| SHORT_CIRCUIT_2[H2 短路<br/>跳过 agent4<br/>进 agent5 + agent6]
    CHK3 -->|yellow / green| A4[agent4-财务模型<br/>注入 agent3]

    A4 --> A5[agent5-失败案例<br/>注入 agent1/3/4]
    SHORT_CIRCUIT_2 --> A5

    A5 --> A6[agent6-双层决策<br/>注入全部]
    SHORT_CIRCUIT_1 --> A6

    A6 --> SSE[sseQueue 推送]
    SSE --> SA[suggest_actions × 1]
    SSE --> AO[agent_output × 6]
    SSE --> RR[report_ready 按需]
```

---

## 4. 4 模式调用矩阵

| 模式 | 触发条件 | 调用顺序 | 推送事件 |
|---|---|---|---|
| **全流程** | ≥3 维度 OR 显式触发词 | agent1+2 并行 → agent3 → agent4 → agent5 → agent6 | agent_output × 6 + suggest_actions × 1 |
| **单 agent**（不触发 super-skill） | 1 维度且非 followup | 直接调对应子 skill（不进 super-skill） | 该子 skill 自身输出（无 super-skill 编排事件） |
| **子集** | 2-3 维度 | 仅调用相关子 agent + 强制 agent6 | agent_output × N（N = 调用的 agent 数）+ suggest_actions × 1 |
| **追加** | followup（在已有 conversation 中追问） | 不重跑已完成 agent，只跑新增 + agent6（必重跑） | agent_output × M（M = 新增 agent 数 + 1）+ suggest_actions × 1 |

---

## 5. 短路逻辑（H1/H2 硬规则）

### H1：agent1 red → 跳过 agent3/4 直接进 agent6

```python
if agent1_output["灯色"] == "red":
    # 产权 red（H1）或文保 red（H2）→ 融资/财务跑也无意义
    # agent6 顶层必然 red（设计咨询 red）
    # 但 agent5（失败案例）可选跑（用于 root cause 归因）
    skip = ["agent3", "agent4"]
    agent6_output = call_skill("agent6-双层决策", inject_context={
        "agent1": agent1_output,
        "agent3": None, "agent4": None, "agent5": None,
    })
    push_suggest_actions()
    return
```

### H2：agent3 red → 跳过 agent4 进 agent5/6

```python
if agent3_output["灯色"] == "red":
    # H1-H4 融资硬约束任一不过 → agent4 跑也无意义
    # agent5（失败案例）仍需跑（root cause 归因「招商失败/退出受阻」可能与融资 red 相关）
    # agent6 顶层 red（投资拓展 red）
    agent5_output = call_skill("agent5-失败案例", inject_context={
        "agent1": agent1_output,
        "agent3": agent3_output,
        "agent4": None,
    })
    agent6_output = call_skill("agent6-双层决策", inject_context={
        "agent1": ..., "agent3": ..., "agent4": None, "agent5": agent5_output,
    })
    push_suggest_actions()
    return
```

---

## 6. 反触发（should-NOT-trigger）

super-skill **必须不触发**的查询示例：

| 查询 | 应调子 skill | super-skill 应不触发原因 |
|---|---|---|
| 「这个项目的 IRR 是多少」 | agent4-财务模型 | 单维度查询（财务） |
| 「融资方案有哪些」 | agent3-多元融资 | 单维度（融资） |
| 「产权是划拨还是出让」 | agent1-固有对象 | 单维度（固有对象） |
| 「15 城试点有哪些」 | agent2-政策应答 | 单维度（政策） |
| 「类似项目的失败案例」 | agent5-失败案例 | 单维度（失败案例） |
| 「导出报告」 | 直接由 agent6 处理（不调 super-skill） | 单操作（report） |
| 「调整 IRR 假设重算」 | agent4-财务模型 | 单 agent 重跑 |

---

## 7. 版本

- V1（references/agent_调用决策树.md）：2026-08-08
- 配套：SKILL.md 触发条件章节 + 数据传递契约.md
