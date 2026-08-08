# super-skill Intent（阶段 1 输出）

> skill-creator 流水线阶段 1：4 项意图捕获。
>
> 配套文档：
> - 架构设计：`plan/2026-08-08-super-skill-架构设计.md`
> - 实施计划：`plan/2026-08-08-super-skill-implementation-plan.md` Task 8
>
> 形态：方案 A（Claude SDK sub-agent + sseQueue side channel）。

---

## 1. skill 做什么（What）

super-skill 是 6 个子 agent 的**编排器（orchestrator）**：

- 按「固有对象 → 政策 → 融资 → 财务 → 失败案例 → 双层决策」的依赖关系，**串/并行调用** 6 个子 skill
- 通过 Claude SDK 的 `query()` 主循环注册 6 个子 MCP tool，单进程内串接
- 通过 `sseQueue` side channel 推送 3 类自定义 SSE 事件：
  - `suggest_actions`（7 按钮组：5 view_agent + 1 export_report + 1 rerun_agent）
  - `agent_output`（每个子 agent 完成时推送）
  - `report_ready`（agent6 触发报告模板）
- 通过 `system prompt 拼接` 把上游 agent 输出 JSON 注入下游 agent system prompt

调用顺序（混合串并行，最小化总耗时）：

```
                ┌─── agent1 固有对象 ──┐
用户描述项目 ──→│                     │── → agent3 融资 ──→ agent4 财务 ──→ agent5 失败案例 ──→ agent6 双层决策
                └─── agent2 政策应答 ──┘
                          ↑                                              ↑
                    (并行，无依赖)                                  (消费 agent1/3/4 输出)
```

## 2. 何时触发（When）

super-skill 触发条件（4 模式 + 默认行为）：

| 模式 | 触发条件 | 调用 |
|---|---|---|
| **全流程模式（默认）** | 用户描述完整项目 + 问「能不能上会 / 顶层判定 / 双层决策 / 完整测算」 | super-skill 跑全部 6 agent |
| **单 agent 模式（不触发）** | 用户只问某一维度（如「算 IRR」） | 直接调对应子 skill，**不调 super-skill** |
| **子集模式** | 用户问 2-3 个维度（如「融资 + 财务」） | super-skill 部分激活（agent3 + agent4 + agent6） |
| **追加模式** | 已有 conversation 中追问（如「再算失败案例」） | 不重跑已完成 agent，只跑新增 |

**description 关键词**（pushy 触发）：
- ≥3 of: 固有对象 / 政策 / 融资 / 财务 / 失败案例 / 双层决策
- OR 显式：上会 / 顶层判定 / 双层决策 / 完整测算

**反触发**：单维度查询应直接调子 skill（agent1/2/3/4/5/6），避免 super-skill 越权接管。

## 3. 输入格式（Input）

- `user_input`：用户的项目描述（自然语言，含项目类型 / 规模 / 业态 / 区位 / 业主等）
- `conversation_history`：Claude SDK session 自动持久化（`claudeSessionStore()`），被动注入 `[RETRIEVED CONTEXT]` 块
- `prior_agent_outputs`（追加模式用）：已有 conversation 中各 agent 的输出 JSON

## 4. 输出格式（Output）

super-skill 自身不产出新的数据结构，而是**编排**子 skill 输出 + **推送** SSE 事件：

### 4.1 6 个子 agent 输出（每完成一个 → 推 `agent_output` 事件）

- `agent1_output`：固有对象三色灯 + H1 产权 / H2 文保 触发条件
- `agent2_output`：政策应答（5 维门槛 + Top3 政策排序）
- `agent3_output`：多元融资灯色 + 可适用融资工具清单 + 推荐资金组合
- `agent4_output`：财务模型（IRR/NPV/回收期/敏感性 + 业态门槛达标结论 + `_calc.engine`）
- `agent5_output`：失败案例校验灯 + Top3 案例 + 失败模式归因
- `agent6_output`：双层决策（顶层灯 + 咨投建运四维子灯 + 条件推进事项）

### 4.2 suggest_actions payload（agent6 完成后推 1 次）

```typescript
{
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
```

### 4.3 report_ready event（agent6 触发，按用户选择）

```typescript
{
  report_type: "投资人版" | "政府版" | "业主版" | "内部决策版",
  html_content: string  // agent6 渲染好的 HTML
}
```

---

## 5. 与子 skill 的接口契约（向上兼容）

| 子 skill | super-skill 注入到下游的字段 |
|---|---|
| agent1 输出 → agent3 / agent5 / agent6 | `agent1_output.灯色` / `产权判定` / `文保判定` / `物理参数` |
| agent2 输出 → agent3 | `agent2_output.适用政策Top3` / `试点城市合规` |
| agent3 输出 → agent4 / agent5 / agent6 | `agent3_output.灯色` / `推荐资金组合` / `综合分` |
| agent4 输出 → agent5 / agent6 | `agent4_output.IRR` / `NPV` / `达标结论` / `_calc.engine` |
| agent5 输出 → agent6 | `agent5_output.校验灯` / `Top3案例` / `失败模式` |

详细字段映射见 `references/数据传递契约.md`。

---

## 6. 失败模式（不阻断 super-skill 自身，但标记降级）

| 模式 | 处置 |
|---|---|
| 单个子 agent 失败 | super-skill 仍继续后续 agent（除非是 H 硬规则 red 终止） |
| agent1 red | super-skill 跳过 agent3/4（无意义）直接到 agent6（顶层 red） |
| 子 agent sandbox 不可用 | 该子 agent 输出 `_calc.engine = unavailable`，agent6 按映射表强制黄/红 |
| super-skill 自身被单 agent 查询触发（误触发） | 不应触发（description 反触发条件覆盖） |

---

## 7. 版本

- V1（design spec）：2026-08-08
- 形态：方案 A（Claude SDK sub-agent + sseQueue）
- 后续：进入 skill-creator 阶段 2（SKILL.md + references/）
