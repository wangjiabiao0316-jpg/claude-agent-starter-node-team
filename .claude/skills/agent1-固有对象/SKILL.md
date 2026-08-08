---
name: agent1-固有对象
description: 'MUST follow agent1 三色灯闸门判定规则. Use when user asks 产权 / 文保 / 固有对象 / 三色灯 / 闸门判定 / 能否推进 / H1 产权清晰度 / H2 文保规划 / S1 更新意愿 / S2 可经营性. H1 产权 + H2 文保任一命中 red → 输出红灯并终止后续 agent 调用; S 总分 = S1×0.5 + S2×0.5, ≥75 → green / 60-75 → yellow / <60 → red. 结合 [RETRIEVED CONTEXT] 块的权属规则 + references/H_rules.md + references/S_rules.md 做规则查表; 不得跳过 H1/H2 校验 / 不得估算 S 总分 / 必须读 references/ / 必须输出 schema. 输出严格遵循 schema; 数据缺失 → 阻断输出降级清单. maxTurns=30.'
---

# Agent1 固有对象 Skill (V2, references-only)

> 本 skill 实现 V1 §1（L40-61）「固有对象识别 → 智能体判别逻辑」+ super-skill architecture Task 7。
> 智能体类型：**闸门型**｜三色灯｜任一 H 红终止后续 agent。
> V2 关键决策：**P2 替代方案**——仅 `references/{H_rules.md, S_rules.md}`，**无 sandbox scripts**。
> 锚点：V1 §1；implementation-plan Task 7 Step 1-2；工作流文档：`skill集群/plan/2026-08-03-agent1-固有对象识别-skill工作流.md` §1。
> 替代方案理由：见 `super-skill/plan/2026-08-08-6agent-盘点与分类.md` §2.2（agent1 P2，规则数量少，LLM 在小规模规则查表上稳定）。

---

## 1. 触发条件

### 1.1 应当触发（should-trigger）

任一即触发：

- 用户问「**产权** / **文保** / **固有对象** / **三色灯** / **闸门判定** / **能否推进**」
- super-skill 编排器在 Phase 1 自动调用（城市更新项目完整流水线第一步）
- 用户问具体判据：「**H1 产权清晰度** / **H2 文保规划** / **S1 更新意愿** / **S2 可经营性**」

### 1.2 不应触发（near-miss，避免越权）

- 单独问政策匹配 → agent2 政策应答
- 单独问融资可行性 / 资金组合 → agent3 多元融资
- 单独问 IRR / NPV / 财务指标 → agent4 财务模型
- 单独问失败案例 / Top3 检索 → agent5 失败案例
- 单独问顶层判定 / 上会就绪度 / 双层决策 → agent6（agent1 仅是 agent6 设计咨询维度的主信号源）
- 通用办公问答、PDF 抽取、法律咨询、学术研究

---

## 2. 输入 schema

```json
{
  "用户描述": {
    "规划文书": "<规划文件 / 条件 / 项目信息>",
    "不动产证号": "<不动产文书 / 证号>",
    "业主资质": "<业主类型 + 改造意愿>",
    "业态方向": "<商业 / 办公 / 文旅 / 工业仓储>",
    "运营模式": "<自持运营 / 委托 / 出租 / 合作开发>",
    "物理参数": {
      "层高_m": <number>,
      "结构类型": "<框架/砖混/木结构>",
      "建筑面积_平方米": <number>,
      "区位": "<城市核心/中环/郊区>"
    }
  },
  "[RETRIEVED CONTEXT]": "<super-skill 注入的被动向量检索结果：权属规则、文保等级、不动产登记合规接口返回>"
}
```

**字段约束**：

- `不动产证号` 缺失 → 不允许进入 `H1.green` 判定，触发降级（详见 §6 F1）
- `[RETRIEVED CONTEXT]` 缺失 → 仅靠 `references/{H_rules.md, S_rules.md}` + 用户输入做判定，标 WARN（不阻断）
- `业态方向` / `运营模式` 缺失 → S2 不可算，触发降级（详见 §6 F2）
- `物理参数` 缺失 → S2 仅按业态方向估分，标 WARN

---

## 3. 处理步骤（H 硬规则 → S 软规则 → 输出）

> **6 条 pushy 硬规则（适配 P2 替代方案）**：
> 1. 不得跳过 H1/H2 校验（必须先做 H 硬规则查表，再做 S 软规则评分）
> 2. 不得估算 S 总分（必须按 `references/S_rules.md` 的评分维度逐项打分）
> 3. 必须读 `references/H_rules.md`（H1/H2 红黄绿触发条件逐字对照）
> 4. 必须读 `references/S_rules.md`（S1/S2 评分维度 + 75/60 阈值映射）
> 5. 必须输出 schema（输出对象字段约束见 §4，任一字段缺失或论证断裂 → skill failure）
> 6. 数据缺失必须降级（不得静默跳过缺失字段；详见 §6 失败降级路径）

### Step 1：读 [RETRIEVED CONTEXT] + references/H_rules.md，校验 H1 产权清晰度

按 `references/H_rules.md` §1 的 H1 触发条件逐项对照：

- 不动产证号是否有效 / 一致（H1.red.A）
- 产权人是否到场或授权（H1.red.B）
- 共有产权人是否全部同意（H1.red.C）
- 是否涉及法院查封 / 诉讼中（H1.red.D）
- 若均不触发 red，再查 yellow 触发条件（H1.yellow.A-C）
- 否则 H1 = green

**输出 H1 子灯** + 命中判据（如 `H1.red.A`）+ 风险点描述 + 依据（引用不动产文书 / [RETRIEVED CONTEXT] / references 条目编号）。

### Step 2：读 references/H_rules.md，校验 H2 文保与规划

按 `references/H_rules.md` §2 的 H2 触发条件逐项对照：

- 是否文保核心保护区且改造不可经营（H2.red.A）
- 规划是否明确禁止该业态（H2.red.B）
- 是否文保建控地带需专项审批（H2.yellow.A）
- 规划是否有条件允许（H2.yellow.B）
- 否则 H2 = green

**输出 H2 子灯** + 命中判据（如 `H2.red.A`）+ 风险点描述 + 依据（引用规划文件 / 文保等级 / references 条目编号）。

### Step 3：H 顶层判定（短路逻辑）

按 V1 §1 L60-66 逐字保留：

- **H1 或 H2 任一命中 red** → 输出 `灯色 = red`，建议动作 `终止`，**短路退出，不再执行 Step 4-5**
- **H1 或 H2 任一命中 yellow（无 red）** → 基础灯 yellow，仍执行 Step 4-5 但最终灯色至少 yellow
- **H1 与 H2 全 green** → 进入 Step 4-5 算 S 总分决定最终灯色

### Step 4：读 references/S_rules.md，算 S1 + S2 总分

按 `references/S_rules.md` §1 的评分维度逐项打分：

- **S1 更新意愿**（权重 0.5）：业主主动申请意愿 / 历史业态调整次数 / 配合度信号 → 0-100
  - 业主主动申请改造（≥80% 同意）→ 100
  - 业主被动响应（50-80%）→ 70
  - 业主反对（<50%）→ 30
- **S2 可经营性**（权重 0.5）：业态 × 区位 × 物理参数 → 0-100
  - 商业 + 城市核心 → 100
  - 办公 + 中环 → 70
  - 文旅 + 郊区 → 50
  - 工业仓储（无改造价值）→ 30
- **S 总分** = `S1 × 0.5 + S2 × 0.5`

### Step 5：S 总分阈值映射（出最终灯色）

按 `references/S_rules.md` §3：

- `S 总分 ≥ 75` → 灯色 `green`，建议动作 `可推进`
- `60 ≤ S 总分 < 75` → 灯色 `yellow`，建议动作 `条件推进`
- `S 总分 < 60` → 灯色 `red`，建议动作 `终止`

### Step 6：组装输出 schema

按 §4 schema 输出。**任一字段缺失或论证断裂 → skill failure**。

---

## 4. 结论层输出 schema (V2)

```json
{
  "agent": "agent1-固有对象",
  "灯色": "red | yellow | green",
  "命中判据": [
    "H1.red.A | H1.red.B | H1.red.C | H1.red.D",
    "H1.yellow.A | H1.yellow.B | H1.yellow.C",
    "H1.green",
    "H2.red.A | H2.red.B",
    "H2.yellow.A | H2.yellow.B",
    "H2.green",
    "S总分.>=75 | S总分.60-75 | S总分.<60"
  ],
  "风险点": [
    "<具体风险描述，逐项对应命中判据>"
  ],
  "依据": {
    "H1": "<不动产文书 + 不动产登记合规接口返回 + references/H_rules.md:H1.red.X>",
    "H2": "<规划文件 + 文保等级 + references/H_rules.md:H2.red.Y>",
    "S_aggregate": "S1=<s1_score>, S2=<s2_score> → <total_score>"
  },
  "建议动作": "终止 | 条件推进 | 可推进",
  "_calc": {
    "engine": "llm-references-v2",
    "rules_version": "2026-08-08"
  }
}
```

**字段约束（self-check）**：

- `agent` MUST = `"agent1-固有对象"`
- `灯色` MUST ∈ {`red`, `yellow`, `green`}（小写枚举）
- `命中判据` MUST 至少含 H1 与 H2 各一项；H 任一 red 时 `命中判据` 必含对应 `H*.red.*`
- `命中判据` 中 H 子灯与最终 `灯色` 自洽：H 任一 red → 灯色 red；H 全 green 且 S≥75 → 灯色 green
- `风险点` 数组在 red / yellow 时 MUST ≥ 1 条；green 时可空
- `依据` 字段 MUST 引用具体证据（不动产证号 / 规划条款 / 文保等级 / references 条目编号）
- `建议动作` MUST 与 `灯色` 一致（red→终止 / yellow→条件推进 / green→可推进）
- `_calc.engine` MUST = `"llm-references-v2"`（标识 P2 替代方案，无 sandbox）
- `_calc.rules_version` MUST = `"2026-08-08"`

---

## 5. references/ 子目录索引

```
skills/agent1-固有对象/references/
├── H_rules.md      # H 硬规则查表（H1 产权红黄绿 + H2 文保红黄绿，逐字保留 V1 §1.2）
└── S_rules.md      # S 软规则 + 75/60 阈值映射（S1 更新意愿 + S2 可经营性 + 总分公式）
```

> 不创建 `scripts/` 目录（P2 替代方案不需要 sandbox）。所有规则查表由 LLM 在推理时读 references/ 文件完成。

---

## 6. 失败 / 降级路径

| 编号 | 场景 | 处理 |
|---|---|---|
| **F1** | `不动产证号` 缺失 / 无效 / 不一致 | **不允许进入 H1.green 判定**。H1 强制 yellow（H1.yellow.A：产权证号待补）+ 输出降级清单：`{阻断字段: 不动产证号, 补齐要求: 提供有效不动产证号或不动产权属证明}`。 |
| **F2** | `业态方向` / `运营模式` 缺失 | S2 不可算。H 全 green 时强制灯色 yellow + 依据标注「S2 数据缺失」+ 条件推进事项 ≥ 1 条。 |
| **F3** | `[RETRIEVED CONTEXT]` 缺失（向量检索无结果） | 标 WARN，仅靠 `references/{H_rules.md, S_rules.md}` + 用户输入做判定。**不阻断**，但依据字段标注「向量检索无结果，已 fallback references/」。 |
| **F4** | H1 / H2 子灯数据均缺失（用户未提供任何产权或文保信息） | 阻断输出降级清单：`{阻断字段: [规划文书, 不动产证号, 文保等级], 补齐要求: 至少提供不动产证号与规划文件}`。**禁止 LLM 编造判据**。 |
| **F5** | references/H_rules.md 或 S_rules.md 加载失败 | 标 ERROR，skill failure，禁止 LLM 用「常识」替代规则查表。 |
| **F6** | 共有产权人部分同意（未全） | H1.yellow.B + 强制灯色至少 yellow + 条件推进事项「补齐全部共有人书面同意」。 |
| **F7** | 数据完整度 < 60%（关键字段大面积缺失） | 阻断 + 输出降级清单（V1 工作流 md §1.5 schema 拓展）。**禁止部分推断**。 |

---

## 7. 关键约束（self-check）

每次输出前 MUST 自检（V2 P2 替代方案专属）：

- [ ] 是否读了 `references/H_rules.md`？跳过 → 失败
- [ ] 是否读了 `references/S_rules.md`？跳过 → 失败
- [ ] H1 与 H2 是否都做了校验？任一跳过 → 失败
- [ ] H 任一 red 时是否短路退出（不再算 S 总分）？
- [ ] H 全 green 时是否按 `S1×0.5 + S2×0.5` 算总分（不是估算）？
- [ ] S 总分是否按 75/60 阈值映射灯色（不是 LLM 心算）？
- [ ] `灯色` 字段是否 `red/yellow/green` 小写枚举？
- [ ] `命中判据` 是否引用 `references/H_rules.md` 或 `S_rules.md` 的具体条目编号（如 `H1.red.A`）？
- [ ] `建议动作` 是否与 `灯色` 一致？
- [ ] `_calc.engine` 是否 = `"llm-references-v2"`？
- [ ] 数据缺失字段是否走了 §6 失败降级路径（不得静默跳过）？

任一项不达标 → skill failure，必须重新走 Step 1-6。

---

## 8. 与下游 / 上游 agent 的衔接

**上游（数据来源）**：

- 用户输入（规划文书 / 不动产证号 / 业主意愿 / 业态 / 运营模式 / 物理参数）
- super-skill 注入的 `[RETRIEVED CONTEXT]`（被动向量检索：权属规则、文保等级、不动产登记合规接口）
- references/{H_rules.md, S_rules.md}（自带规则文档）

**下游（消费方）**：

- agent6 双层决策：消费 `灯色` + `命中判据`（含 H1.red / H2.red / H2.yellow）+ `风险点`，作为「设计咨询维度」的主信号源
- agent6 §4.1 聚合规则：`agent1.灯色 = red` → 设计咨询维度 red；`agent1.灯色 = yellow` + agent5 命中改造类根因 → 设计咨询维度 red（风险升级）
- 报告模板库：消费 `建议动作` 字段决定投资人/政府/业主/内部决策 4 类视图

agent1 是 6 agent 中的**闸门型第一环**，红灯即终止后续 agent3/agent4/agent5 调用，节省算力。

---

**版本**：V2（2026-08-08）
**锚点**：V1 §1（L40-61）+ implementation-plan Task 7 Step 1-2
**P2 替代方案**：仅 `references/{H_rules.md, S_rules.md}`，无 `scripts/`
**行数**：约 280 行（< 500 行上限）
**校准状态**：S1/S2 权重 0.5 各自【待校准】；软约束阈值 75/60【待校准】
