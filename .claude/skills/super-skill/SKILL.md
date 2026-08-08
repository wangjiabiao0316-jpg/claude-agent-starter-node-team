---
name: super-skill
description: 'MUST trigger when user asks for project-level decisions involving ≥3 of: 固有对象/政策/融资/财务/失败案例/双层决策, OR explicitly mentions "上会/顶层判定/双层决策/完整测算". DO NOT trigger for single-dimension queries (use child skill directly: agent1-固有对象 / agent2-政策应答 / agent3-多元融资 / agent4-财务模型 / agent5-失败案例 / agent6-双层决策). super-skill 是 6 个子 agent 的编排器 (Claude SDK sub-agent + sseQueue side channel). 按依赖关系串/并行调用: agent1 + agent2 并行 → agent3 → agent4 → agent5 → agent6. 通过 system prompt 拼接上游输出注入下游. 完成后推送 suggest_actions (7 按钮: 5 view_agent + 1 export_report + 1 rerun_agent) + agent_output × 6 + report_ready. maxTurns=30.'
---

# Super-Skill 编排器（6 agent 协同，形态 A: Claude SDK sub-agent + sseQueue）

> 本 skill 是 **编排器**，**不**实现具体业务逻辑（融资/财务/失败案例等由子 skill 实现）。
>
> 配套文档：
> - 架构设计：`plan/2026-08-08-super-skill-架构设计.md`
> - 实施计划：`plan/2026-08-08-super-skill-implementation-plan.md` Task 8
> - 调用决策树：`references/agent_调用决策树.md`
> - 数据传递契约：`references/数据传递契约.md`
> - suggest_actions payload：`references/suggest_actions_payload_schema.md`

---

## 触发条件（4 模式）

| 模式 | 触发条件 | 调用 |
|---|---|---|
| **全流程模式（默认）** | 用户描述完整项目 + 问「能不能上会 / 顶层判定 / 双层决策 / 完整测算」 | super-skill 跑全部 6 agent |
| **单 agent 模式（不触发 super-skill）** | 用户只问某一维度（如「算 IRR」「融资方案」） | 直接调对应子 skill（agent1-固有对象 / agent2-政策应答 / ... / agent6-双层决策） |
| **子集模式** | 用户问 2-3 个维度（如「融资 + 财务」） | super-skill 部分激活（agent3 + agent4 + agent6） |
| **追加模式** | 已有 conversation 中追问（如「再算失败案例」） | 不重跑已完成 agent，只跑新增 agent |

**触发判定决策树（详细）**：见 `references/agent_调用决策树.md`。

---

## 调用顺序（混合串并行，最小化总耗时）

```
                ┌─── agent1 固有对象 ──┐
用户描述项目 ──→│                     │── → agent3 融资 ──→ agent4 财务 ──→ agent5 失败案例 ──→ agent6 双层决策
                └─── agent2 政策应答 ──┘
                          ↑                                              ↑
                    (并行，无依赖)                                  (消费 agent1/3/4 输出)
```

### Phase 1（并行）— agent1 + agent2 同时调

```python
# super-skill 在 Phase 1 必须并行触发 agent1 + agent2
# Claude SDK 内部并发：通过 Promise.all 或 sub-agent tool parallel invoke

agent1_output = call_skill("agent1-固有对象", user_input=project_description)
agent2_output = call_skill("agent2-政策应答", user_input=project_description)
```

> agent1（产权/文保/物理参数）与 agent2（政策应答）**无相互依赖**，必须并行触发以最小化总耗时。

### Phase 2（串行）— agent3 消费 agent1 + agent2

```python
agent3_output = call_skill(
    "agent3-多元融资",
    user_input=project_description,
    inject_context={
        "agent1": agent1_output,  # 产权判定 / 物理参数（影响抵押物类型）
        "agent2": agent2_output,  # 试点城市合规 / 政策限制（影响 H4 试点 + S1 政策匹配）
    }
)
```

### Phase 3（串行）— agent4 消费 agent3

```python
agent4_output = call_skill(
    "agent4-财务模型",
    user_input=project_description,
    inject_context={
        "agent3": agent3_output,  # 推荐资金组合（资本金比例 + 贷款结构 → 影响 IRR/NPV）
    }
)
```

### Phase 4（串行）— agent5 消费 agent1 / agent3 / agent4

```python
agent5_output = call_skill(
    "agent5-失败案例",
    user_input=project_description,
    inject_context={
        "agent1": agent1_output,  # 物理参数（用于案例相似度匹配）
        "agent3": agent3_output,  # 融资结构（用于案例相似度匹配）
        "agent4": agent4_output,  # IRR/业态对照（用于案例相似度匹配）
    }
)
```

### Phase 5（串行）— agent6 聚合全部

```python
agent6_output = call_skill(
    "agent6-双层决策",
    user_input=project_description,
    inject_context={
        "agent1": agent1_output,
        "agent3": agent3_output,
        "agent4": agent4_output,
        "agent5": agent5_output,
    }
)
```

> 详细字段映射表（agent1 → agent3/5/6 哪些字段被消费、agent3 → agent4/5/6 等）：见 `references/数据传递契约.md`。

---

## 数据传递机制（system prompt 拼接）

super-skill 通过 **system prompt 拼接** 把上游 agent 输出 JSON 注入下游 agent 的 system prompt：

```
[AGENT_CONTEXT]
{
  "agent1": { ... agent1 完整输出 JSON ... },
  "agent2": { ... agent2 完整输出 JSON ... }
}
[END]
```

**约束**：
- 每个下游 agent 在 system prompt 顶部看到 `[AGENT_CONTEXT]...[END]` 块
- 下游 agent 必须**显式引用**上游字段（如 `agent3_output.灯色`），不得自行假设
- 若 `[AGENT_CONTEXT]` 块缺失（追加模式下上游已跑过），从 `[RETRIEVED CONTEXT]` 块（libSQL conversation 历史被动注入）取

**为什么不通过 MCP tool 传递**：增加 tool 数量会挤占 context.tools 配额；system prompt 拼接零成本，且 Claude SDK 自动持久化到 session。

---

## H 硬规则（违反即终止 super-skill）

### H1：agent1 red → 跳过 agent3/4 直接进 agent6

```python
if agent1_output["灯色"] == "red":
    # H1 产权 red 或 H2 文保 red → agent3/4 跑也无意义
    # 直接调 agent6（顶层必然 red，且 agent5 可选跑）
    agent6_output = call_skill("agent6-双层决策", inject_context={
        "agent1": agent1_output,
        "agent3": None,  # 跳过标记
        "agent4": None,
        "agent5": None,
    })
    push_suggest_actions()  # 提前推送按钮组
    return
```

### H2：agent3 red → 跳过 agent4 直接进 agent5/6

```python
if agent3_output["灯色"] == "red":
    # H1-H4 融资硬约束任一不过 → agent4 跑也无意义
    agent5_output = call_skill("agent5-失败案例", inject_context={
        "agent1": agent1_output,
        "agent3": agent3_output,
        "agent4": None,  # 跳过
    })
    agent6_output = call_skill("agent6-双层决策", inject_context={
        "agent1": ..., "agent3": ..., "agent4": None, "agent5": agent5_output,
    })
    push_suggest_actions()
    return
```

### H3：用户只问单维度 → super-skill 不触发

```python
# 用户："这个项目的 IRR 是多少"
# → super-skill 应判定为「单 agent 模式」直接调 agent4，不跑全部 6 agent
```

### H4：已有 conversation 中追加 → 不重跑已完成 agent

```python
# 第 N 轮：super-skill 跑了 agent1/2/3/4/5/6
# 第 N+1 轮：用户："再算一下失败案例"（agent5 重跑）
# → super-skill 从 [RETRIEVED CONTEXT] 读已完成 agent 列表，只调 agent5 + agent6（agent6 需重聚合）
```

---

## S 软规则（建议）

- **S1**：super-skill 在每个子 agent 完成后立即推 `agent_output` 事件（不等所有 agent 完成），让前端窗格逐个填充
- **S2**：用户中断（stop）时，super-skill 保留已完成 agent 的输出，不回滚
- **S3**：建议在 Phase 5（agent6 完成）后等用户主动点 `export_report` 按钮，不主动推 `report_ready` 事件
- **S4**：追加模式下，agent6 必须重跑（聚合依赖全部下游）

---

## 完成后推送：suggest_actions（7 按钮）

```typescript
sseQueue.enqueue({
  type: "suggest_actions",
  payload: {
    actions: [
      {id: "view_agent1", emoji: "🏠", title: "固有对象识别", description: "查看 agent1 三色灯判定"},
      {id: "view_agent3", emoji: "💰", title: "多元融资", description: "查看 agent3 融资方案"},
      {id: "view_agent4", emoji: "📊", title: "财务模型", description: "查看 agent4 IRR/NPV 测算"},
      {id: "view_agent5", emoji: "⚠️", title: "失败案例", description: "查看 agent5 Top3 风险案例"},
      {id: "view_agent6", emoji: "🚦", title: "双层决策", description: "查看 agent6 顶层灯 + 四维子灯"},
      {id: "export_report", emoji: "📄", title: "导出报告", description: "生成投资人/政府/业主/内部决策版报告"},
      {id: "rerun_agent", emoji: "🔄", title: "重新跑某个 agent", description: "调整参数后重跑"}
    ]
  }
});
```

> 完整 schema（id / emoji / title / description / 触发时机 / 前端动作映射）：见 `references/suggest_actions_payload_schema.md`。

---

## agent_output event（每个子 agent 完成时推送）

```typescript
// agent1 完成时
sseQueue.enqueue({
  type: "agent_output",
  payload: {
    agent_id: "agent1-固有对象",
    output_json: agent1_output,  // 完整输出对象
    summary: `agent1 三色灯：${agent1_output.灯色}（H1产权=${...}, H2文保=${...}）`
  }
});

// 重复 6 次（agent1 / agent2 / agent3 / agent4 / agent5 / agent6）
```

---

## report_ready event（按需触发，不主动推）

```typescript
// 用户点 `export_report` 按钮 → super-skill 调 agent6 渲染 HTML → 推送 report_ready
sseQueue.enqueue({
  type: "report_ready",
  payload: {
    report_type: "投资人版",  // 用户选择
    html_content: "<html>...</html>"
  }
});
```

---

## ⛔ 硬规则（违反即 super-skill 失败）

1. **禁止 super-skill 越权接管单 agent 查询** —— 用户问「算 IRR」必须直接调 agent4，**不**调 super-skill
2. **禁止 super-skill 重跑已完成 agent**（追加模式下） —— 必须从 `[RETRIEVED CONTEXT]` 读取已完成列表
3. **禁止 super-skill 实现具体业务逻辑** —— 融资/财务/失败案例等下沉到子 skill
4. **禁止 super-skill 跳过 H1/H2 短路逻辑** —— agent1 red 必须跳过 agent3/4
5. **必须按调用顺序**（agent1/2 并行 → 3 → 4 → 5 → 6），不得乱序
6. **必须推送 suggest_actions 事件**（agent6 完成后 1 次）
7. **必须 maxTurns = 30**（避免无限循环；6 agent × 平均 5 turn = 30）

---

## 失败模式（F1-F5）

| 编号 | 触发条件 | 处置 |
|---|---|---|
| F1 | 单个子 agent 持续失败（重试 3 次后） | super-skill 标记该 agent `_calc.engine = unavailable`，继续后续 agent（agent6 按映射表强制黄/红） |
| F2 | Claude SDK session 断开 | super-skill 终止，前端提示用户「连接中断，请重试」 |
| F3 | sseQueue 推送失败（如网络） | super-skill 主循环继续，事件丢失不重发（用户可手动点 `rerun_agent` 重触发） |
| F4 | 子 agent 输出 schema 不合法 | super-skill 标记该 agent 失败，agent6 按缺失字段处理（强制 yellow） |
| F5 | super-skill 自身被误触发（单 agent 查询） | 立即让位，不调用任何子 skill，输出「请直接调 [子 skill 名]」 |

---

## maxTurns = 30

参考 agent4 V2 经验（maxTurns=15 单 agent），super-skill 编排 6 agent × 平均 5 turn = 30 turn。超过则强制停止。

---

## 引用 references

- [agent_调用决策树.md](references/agent_调用决策树.md) — 4 模式决策树 + mermaid 调用顺序图
- [数据传递契约.md](references/数据传递契约.md) — 上游输出 JSON → 下游 system prompt 注入格式 + 字段映射表
- [suggest_actions_payload_schema.md](references/suggest_actions_payload_schema.md) — 7 按钮 payload schema + 触发时机 + 前端动作映射

---

## 版本

- V1（skill-creator 阶段 2 输出）：2026-08-08
- 形态：方案 A（Claude SDK sub-agent + sseQueue）
- 后续：进入 skill-creator 阶段 3（evals.json）
