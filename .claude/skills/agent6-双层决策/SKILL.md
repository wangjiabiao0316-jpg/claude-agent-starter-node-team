---
name: agent6-双层决策
description: 'MUST follow agent6 双层决策红绿灯聚合规则。 Use when super-skill or user requests 项目顶层判定 / 四维灯色 / 上会就绪度 / 双层决策 aggregation across agent1 (固有对象识别) + agent3 (多元融资) + agent4 (财务模型) + agent5 (失败案例). 先算咨投建运四维子灯, 再按 H 硬规则 (设计咨询红 或 投资拓展红 → 顶层红, 逐字保留 V1 §6 L322) 与 S 决策权重 0.3/0.3/0.2/0.2【待校准】 算顶层灯. 消费 agent4._calc.engine 字段 (numpy-financial / python-bisection / unavailable → 强制黄/红). sandbox 必须调 decision_aggregator.py + decision_rules.json; 不得跳过 / 不得估算 / 不得 fallback / 不得心算. 输出严格遵循 schema; 任一维度论证断裂即失败 (skill failure). maxTurns=30.'
---

# Agent6 双层决策红绿灯 Skill (V2)

> 本 skill 实现 V1 §6（L297-331）「双层决策红绿灯 → 智能体判别逻辑」+ super-skill architecture Task 4。
> 智能体类型：**聚合型**｜结论：顶层灯 + 咨投建运四维子灯。
> V2 关键升级：**sandbox 脚本聚合**（不再依赖 LLM 心算）+ 消费 `agent4._calc.engine` 字段。
> 锚点：V1 §6；implementation-plan Task 4；工作流文档：`skill集群/plan/2026-08-03-agent6-双层决策-skill工作流.md` §1。

---

## Step 0: Sandbox Bootstrap（5 步，参考 agent4 V2 模板）

> 目标：在 sandbox 内写入 `decision_aggregator.py` + `decision_rules.json`，验证模块可装载，再进入 Step 1。

### Step 0.1: probe sandbox（重试 3 次）

```python
# 用 sandbox.commands.run('ls /tmp') 探测 sandbox 是否 ready
# 参考 agent4 V2 + EdgeOne Makers agents skill 推荐 cold start retry 模式
for attempt in range(3):
    try:
        result = sandbox.commands.run("ls /tmp", {timeout: 10})
        break
    except Exception:
        await sleep(2000)  # 2s 退避
else:
    # F1 降级：sandbox 不可用
    return _fallback_sandbox_unavailable()
```

### Step 0.2: 写入 2 个文件到 `/tmp/finance/`

```python
sandbox.commands.run("mkdir -p /tmp/finance", {timeout: 5})

# 文件 1: decision_aggregator.py（主算法）
# 来源：本 skill 的 scripts/decision_aggregator.py
sandbox.files.write("/tmp/finance/decision_aggregator.py", decision_aggregator_py_content)

# 文件 2: decision_rules.json（机器可读决策表）
# 来源：本 skill 的 references/decision_rules.json
sandbox.files.write("/tmp/finance/decision_rules.json", decision_rules_json_content)
```

> 注：agent6 不需要 libsql_client.py（agent6 不查 libSQL，仅读 references/decision_rules.json）。

### Step 0.3: 验证模块装载（import 测试）

```python
verify_result = sandbox.commands.run(
    "cd /tmp/finance && python3 -c 'from decision_aggregator import decide; print(\"OK\")'",
    {timeout: 10}
)
# 期望输出：OK
# 失败 → F2 降级（脚本语法错误 / decision_rules.json 解析失败）
```

### Step 0.4: 跳过 pip install（agent6 纯标准库）

> agent6 不依赖 numpy / numpy-financial（纯 if/else + 查表），无需 Step 0.4 pip install。
> 跳到 Step 0.5。

### Step 0.5: 进入 Step 1

sandbox bootstrap 完成，进入 Step 1 主算法调用。

---

## Step 1: 立即调用 runCode（不得跳过、不得估算、不得 fallback、不得心算）

> **6 条 pushy 硬规则（同 agent4 V2）**：
> 1. 不得跳过 Step 0（sandbox bootstrap 必须执行）
> 2. 不得估算（必须由 sandbox 脚本算）
> 3. 不得 fallback（即使 agent4._calc.engine 异常，也由脚本按 mapping 处置）
> 4. 不得心算（LLM 心算四维聚合规则极易出错，下沉后 LLM 不参与计算）
> 5. 必须 sandbox（必须通过 `sandbox.commands.run` 或 `sandbox.runCode` 执行）
> 6. 必须 schema（输出必须符合 §4 schema，任一字段缺失或论证断裂 → skill failure）

```python
from decision_aggregator import decide
import json

inputs = {
    "agent1": <agent1_输出对象>,
    "agent3": <agent3_输出对象>,
    "agent4": <agent4_输出对象>,  # V2 必须含 _calc.engine 字段
    "agent5": <agent5_输出对象>,
}

result = decide(
    agent1=inputs["agent1"],
    agent3=inputs["agent3"],
    agent4=inputs["agent4"],
    agent5=inputs["agent5"],
)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

`result` 即为 agent6 结论层输出对象（schema 见 §4）。

---

## 2. 触发条件

由 super-skill 编排器或用户直接触发：

- **super-skill 全流程模式**：用户描述完整项目 + 问「能不能上会 / 顶层判定 / 双层决策 / 完整测算」（≥3 维度时 super-skill 触发）
- **super-skill 追加模式**：已有 conversation 中追问顶层结论
- **直接 query**：用户问「项目顶层判定 / 四维灯色 / 上会就绪度 / 双层决策」+ 已有 4 个下游 agent 输出

不应触发（near-miss）：

- 单独问固有对象识别 → agent1
- 单独问融资可行性 → agent3
- 单独问财务指标 / IRR → agent4
- 单独问失败案例 / Top3 检索 → agent5
- 单维度查询（< 3 维度）→ super-skill 不触发，agent6 也不触发

前置：4 个下游 agent 的结论层输出对象已就绪（schema 见 `references/agent{N}_输出_schema.md`）。

---

## 3. 输入（下游 4 个 agent 的结论层 schema）

完整 schema 索引到 `references/agent{N}_输出_schema.md`，本节列字段速查表：

| 下游 agent | 关键引用字段（聚合规则消费） |
|---|---|
| **agent1 固有对象识别** | `灯色`、`命中判据[]`（含 H1.red / H2.red / H2.yellow）、`风险点[]`、`依据{}`、`建议动作` |
| **agent3 多元融资** | `灯色`、`可适用融资工具清单[]`、`推荐资金组合{}`、`关键审批风险点[]`、`依据{}`、`建议动作` |
| **agent4 财务模型**（V2 含 `_calc`） | `财务指标{IRR, NPV, 回收期, 敏感性分析}`、`业态门槛对照{业态, 门槛区间, 达标结论}`、`现金流时序[]`、`改造模式`、**`_calc.engine`**（V2 新增） |
| **agent5 失败案例** | `校验灯`、`Top3案例[{相似度, 失败模式, 根因}]`、`根因重现判断`、`命中判据{}`、`规避建议` |

### 3.1 agent4 `_calc.engine` 字段（V2 新增，agent6 必须消费）

```json
{
  "_calc": {
    "engine": "numpy-financial | python-bisection | timeout-at-30s | unavailable | sandbox_error | not-invoked",
    "numpy_financial_version": "<version> | null",
    "scripts_version": "V2",
    "kernel_session": "injected_by_sandbox"
  }
}
```

agent6 消费规则见 `references/decision_rules.json` `agent4_engine_mapping`：

| engine 值 | agent6 投资拓展维度处置 |
|---|---|
| `numpy-financial` | normal（按常规规则） |
| `python-bisection` | force_yellow（强制 yellow） |
| `timeout-at-30s` | force_yellow（强制 yellow） |
| `unavailable` | **force_red**（强制 red，触发顶层 red） |
| `sandbox_error` | **force_red**（强制 red） |
| `not-invoked` | follow_v1（按 V1 规则处理） |

字段缺失时 MUST 在对应维度「依据」中标注「输入缺失」，并在「条件推进事项」列出补齐要求；不得静默跳过该维度。

---

## 4. 判据层：四维聚合规则（decision_rules.json 机器可读版本）

> 详见 `references/四维聚合规则详解.md` + `references/decision_rules.json`。本节给出映射表，措辞与 V1 §6 L317-323 严格一致。

### 4.1 维度一：设计咨询维度（权重 0.3【待校准】）

聚合规则：`agent1 主信号 + agent5 改造类根因校验`

| 主信号 | 校验信号 | 维度灯 |
|---|---|---|
| `agent1.灯色 = red` | 任意 | **red** |
| `agent1.灯色 = yellow` | agent5 命中改造类根因（招商失败/改造超预算/业态误判） | **red**（风险升级） |
| `agent1.灯色 = yellow` | agent5 无改造类根因 | yellow |
| `agent1.灯色 = green` | `agent5.校验灯 = green` | green |

### 4.2 维度二：投资拓展维度（权重 0.3【待校准】）

聚合规则：`agent3 融资可行性灯 + agent4 财务指标达标 + agent4._calc.engine 强制规则`

| 融资信号 | 财务信号 | 维度灯 |
|---|---|---|
| `agent3.灯色 = red` | 任意 | **red** |
| 任意 | `agent4.达标结论 = 不达标` | **red** |
| `agent3.灯色 = yellow` | `agent4.达标结论 = 达标（非优）` | yellow |
| `agent3.灯色 = green` | `agent4.达标结论 = 优` | green |

> **engine 强制规则优先**：见 §3.1 `agent4_engine_mapping`。

### 4.3 维度三：建造实施维度（权重 0.2【待校准】，Phase1 简化）

聚合规则：`agent1 物理参数 / 文保约束 + agent5 施工协调失败模式`

> **Phase1 简化标注**：Phase1 不接入独立的施工风险子 agent，仅靠 agent1 物理参数与 agent5 失败模式反推；Phase2 应新增「施工风险子 agent」补全此维度。

| 物理约束信号 | 失败模式信号 | 维度灯 |
|---|---|---|
| `agent1.H2` 命中核心保护区 | 任意 | **red** |
| 任意 | `agent5.Top3案例` 含「施工引发周边协调失败」 | **red** |
| `agent1.H2` 命中建控地带 | agent5.校验灯 = yellow | yellow |
| 其余组合 | — | green |

### 4.4 维度四：业主平台维度（权重 0.2【待校准】）

聚合规则：`综合前三维度 + 上会就绪度`

| 三维基础 | 维度灯 |
|---|---|
| 三维任一 red | **red**（一致性硬规则） |
| 三维全 green | green |
| 其余（含数据缺失、四维矛盾） | yellow |

---

## 5. 判定层（顶层灯算法，按顺序执行，禁止跳步）

### Step 1：算四维子灯（按 §4 各维度聚合规则）

由 `decision_aggregator.py` 的 `decide()` 函数执行。

### Step 2：H 顶层硬规则（V1 §6 L322 逐字保留）

> **H 硬规则**：**设计咨询维度 = red 或 投资拓展维度 = red → 触发顶层 red（不推进）**

- 触发条件：四维中「设计咨询」或「投资拓展」任一维度子灯 = `red`
- 触发后果：顶层灯 = `red`，建议动作 = `终止`，**不再继续 Step 3 软规则聚合**
- 顶层判据字段：`H.关键维度硬规则（设计咨询=red 或 投资拓展=red）`

### Step 3：S 顶层软规则（仅当 Step 2 未触发时执行）

- **四维全 green 且一致** → 顶层 green，建议动作「可推进」
- **存在 yellow（无 red）** → 顶层 yellow，建议动作「条件推进」，并列出黄级事项清单
- 顶层判据字段：`S.决策权重聚合（0.3/0.3/0.2/0.2）【待校准】`

> 决策权重【待校准】：设计咨询 0.3 / 投资拓展 0.3 / 建造实施 0.2 / 业主平台 0.2，合计 = 1.0。
> 本 skill 不调权重，仅落地 V1 §6 L323 锚定值。

---

## 6. 结论层输出 schema (V2)

```json
{
  "agent": "agent6-双层决策",
  "顶层灯": "red | yellow | green",
  "顶层判据": "H.关键维度硬规则（设计咨询=red 或 投资拓展=red） | S.决策权重聚合（0.3/0.3/0.2/0.2）",
  "四维子灯": {
    "设计咨询": { "灯色": "...", "依据": "..." },
    "投资拓展": { "灯色": "...", "依据": "..." },
    "建造实施": { "灯色": "...", "依据": "...", "Phase1_简化标注": "未接入施工风险子 agent，Phase2 待补" },
    "业主平台": { "灯色": "...", "依据": "..." }
  },
  "条件推进事项": ["设计咨询 维度 yellow", "..."],
  "建议动作": "终止 | 条件推进 | 可推进",
  "触发报告模板": "内部决策版（终止原因） | 投资人版 + 政府版（条件推进） | 全部 4 类用户版",
  "_calc": {
    "engine": "decision-aggregator-v2",
    "rules_version": "2026-08-08"
  }
}
```

**字段约束**：

- `agent` MUST = `"agent6-双层决策"`
- `顶层灯` MUST ∈ {`red`, `yellow`, `green`}（小写枚举）
- `顶层判据` MUST 与 `顶层灯` 自洽：顶层 red 时判据必含 `H.关键维度硬规则`；顶层 yellow / green 时判据必含 `S.决策权重聚合`
- 四维子灯各维度的 `灯色` MUST 与 `顶层灯` 自洽（顶层 red 必有设计咨询或投资拓展维度 red；顶层 green 必四维全 green）
- `建议动作` MUST 与 `顶层灯` 一致：red→终止 / yellow→条件推进 / green→可推进
- `条件推进事项` 在 yellow 时 MUST ≥ 1 条；red 时列终止原因；green 时为空数组
- `_calc.engine` MUST = `"decision-aggregator-v2"`（V2 sandbox 溯源）

---

## 7. 失败 / 降级路径

| 编号 | 场景 | 处理 |
|---|---|---|
| **F1** | sandbox 不可用（probe 失败 3 次） | 输出降级对象：`{"agent": "agent6-双层决策", "_calc": {"engine": "fallback-v1-llm"}, "顶层灯": null, "降级原因": "sandbox 不可用，禁止 LLM 心算"}`。**禁止 LLM 心算替代 sandbox**。 |
| **F2** | `_calc.engine = unavailable` 或 `sandbox_error` | decision_aggregator.py 强制投资拓展维度 red（触发顶层 red + 终止） |
| **F3** | agent1 / agent3 / agent4 / agent5 任一缺失或非 dict | `decision_aggregator.py` 抛 `TypeError`，agent6 阻断，禁止聚合 |
| **F4** | 四维一致性矛盾（如顶层 green 但有维度 red） | `decision_aggregator.py` 抛 `AssertionError`，强制重算 |
| **F5** | `decision_rules.json` 加载失败 | 文件不存在 → 抛 `FileNotFoundError`；JSON 解析失败 → 抛 `JSONDecodeError`；均触发 F1 降级 |
| **F6** | 下游 4 个 agent 输出对象任一字段缺失 | 标注「输入缺失」，按最保守假设判灯（默认 yellow）+ 显式说明缺失字段 |
| **F7** | agent4 财务指标缺失 | 投资拓展维度按 agent3 主信号单独判灯 + 依据标注「agent4 财务指标缺失」 |
| **F8** | agent5 案例库不可访问 | 设计咨询维度按 agent1 主信号单独判灯 + 依据标注「案例库不可达」 |

---

## 8. 报告模板库（四类用户差异化视图）

> 完整模板详见 `references/报告模板库.md`，本节列差异化重点 + V2 触发规则。

| 顶层灯 | 触发模板 |
|---|---|
| `red` | 内部决策版（终止原因） |
| `yellow` | 投资人版 + 政府版（条件推进） |
| `green` | 全部 4 类用户版（投资人 / 政府 / 业主 / 内部决策） |

---

## 9. 关键约束（self-check）

每次输出前 MUST 自检（V2 sandbox 强制校验，但 LLM 也须心知）：

- [ ] 是否调用了 sandbox `decision_aggregator.py`？跳过 → 失败
- [ ] 是否按 §4.1 / §4.2 / §4.3 / §4.4 跑了全部四维？跳过任一维度 → 失败
- [ ] H 硬规则是否优先于 S 软规则？设计咨询 red 或 投资拓展 red 时是否跳过 Step 3？ → 失败
- [ ] 顶层灯与四维子灯是否自洽？（顶层 red 必有设计咨询或投资拓展维度 red；顶层 green 必四维全 green）
- [ ] 决策权重合计是否 = 1.0（0.3 + 0.3 + 0.2 + 0.2）？≠ 1.0 → 失败
- [ ] 建造实施维度是否标注「Phase1 简化，Phase2 待补施工风险子 agent」？
- [ ] `灯色` 字段是否是 `red/yellow/green` 小写枚举？
- [ ] `建议动作` 是否与 `顶层灯` 一致？
- [ ] `条件推进事项` 在 yellow 时是否 ≥ 1 条？
- [ ] **`agent4._calc.engine` 是否按 `agent4_engine_mapping` 消费？**（V2 新增）
- [ ] **`_calc.engine = decision-aggregator-v2`** 是否在输出中？（V2 新增）

任一项不达标 → skill failure，必须重跑 sandbox。

---

## 10. references/ 子目录索引

为控制 SKILL.md ≤ 500 行，明细内容索引如下：

```
skills/agent6-双层决策/references/
├── agent1_输出_schema-V1.md      # V1 留底
├── agent3_输出_schema-V1.md      # V1 留底
├── agent4_输出_schema-V1.md      # V1 留底
├── agent5_输出_schema-V1.md      # V1 留底
├── 四维聚合规则详解-V1.md         # V1 留底
├── 报告模板库-V1.md               # V1 留底
├── 顶层硬规则与决策权重-V1.md     # V1 留底
├── agent1_输出_schema.md         # V2（下游 schema，含 agent4 _calc 字段说明）
├── agent3_输出_schema.md         # V2
├── agent4_输出_schema.md         # V2（含 _calc.engine 字段）
├── agent5_输出_schema.md         # V2
├── 四维聚合规则详解.md            # V2（含 agent4 engine mapping）
├── 报告模板库.md                  # V2
├── 顶层硬规则与决策权重.md        # V2
└── decision_rules.json           # 🆕 V2 机器可读决策表（核心资产）
```

---

## 11. 与下游 / 上游 agent 的衔接

**上游（强依赖）**：

- agent1（产权 / 物理参数 / 业态方向 / 文保约束 / 改造模式）
- agent3（融资结构 / 期限 / 抵押物 / 可适用融资工具）
- agent4（IRR / NPV / 业态门槛对照：达标/不达标 / **`_calc.engine`**）
- agent5（5 类失败模式校验 + Top3 检索 + 根因映射）

agent6 是聚合型，不调用上游 agent，仅消费其结论层输出对象。下游 4 份 md 第 1 章结论层 schema 必须先固化。

**下游**：

- Agent7 报告模板库（投资人 / 政府 / 业主 / 内部决策四类视图），消费 `触发报告模板` 字段
- super-skill 编排器（消费 `agent_output` SSE event + 整体 `suggest_actions` payload）

---

**版本**：V2（2026-08-08）
**锚点**：V1 §6（L297-331）+ implementation-plan Task 4
**前一版**：`SKILL-V1.md`（保留留底）
**行数**：约 380 行（< 500 行上限）
**校准状态**：决策权重 0.3/0.3/0.2/0.2【待校准】；建造实施维度 Phase1 简化【Phase2 待补】；业主平台数据完整度阈值【待校准】
**sandbox 资产**：`scripts/decision_aggregator.py` + `references/decision_rules.json`（V2 新增）
