# Agent6 双层决策红绿灯 Skill — 意图捕获（V2）

> 本文件为 skill-creator 阶段 1 意图捕获产物（V2 版本）。
> 来源：`super-skill/plan/2026-08-08-super-skill-implementation-plan.md` Task 4 Step 2 +
> `skill集群/plan/2026-08-03-agent6-双层决策-skill工作流.md` §1 + §3 +
> `super-skill/plan/2026-08-08-6agent-盘点与分类.md` §2.7（agent6 P0 下沉）。
> 锚点：V1 §6（L297-331）+ super-skill architecture Task 4。

---

## 0. 版本变更摘要（V1 → V2）

| 变更项 | V1 | V2 |
|---|---|---|
| 实施方法 | LLM 推理聚合 | **sandbox 脚本聚合**（`decision_aggregator.py` + `decision_rules.json`） |
| 触发位置 | 单 skill | super-skill 编排（≥3 维度时由 super-skill 调用） |
| 输入字段 | 4 个 agent 输出 | 4 个 agent 输出 + **`agent4._calc.engine`** 字段（V2 新增） |
| 输出字段 | 顶层灯 + 四维子灯 | 同 V1 + **`_calc.engine = decision-aggregator-v2`** |
| 决策表 | LLM 读 references/*.md | **机器可读 `decision_rules.json`**（agent4_engine_mapping 含 6 种 engine 处置） |
| 一致性 | 靠 LLM 自检 | sandbox 强制校验（顶层灯与四维子灯论证断裂即抛错） |

---

## 1. skill 做什么

输入 agent1 / agent3 / agent4 / agent5 的结论层输出对象（V2 含 `agent4._calc.engine` 字段），由 sandbox 内 `decision_aggregator.py` 按 V1 §6 四维聚合规则计算「咨投建运」四维子灯（设计咨询 / 投资拓展 / 建造实施 / 业主平台），再用 H 顶层硬规则（设计咨询红 或 投资拓展红 → 顶层红）与 S 决策权重聚合（0.3/0.3/0.2/0.2【待校准】）算出顶层灯。

V2 新增能力：**消费 `agent4._calc.engine`**（numpy-financial / python-bisection / timeout-at-30s / unavailable / sandbox_error / not-invoked），按 `decision_rules.json` 的 `agent4_engine_mapping` 强制投资拓展维度灯色（unavailable / sandbox_error → force_red；timeout-at-30s / python-bisection → force_yellow）。

输出顶层灯 + 四维子灯（各含灯色 / 依据）+ 顶层判据 + 条件推进事项 + 建议动作 + 触发的报告模板（投资人版 / 政府版 / 业主版 / 内部决策版四类用户差异化视图）+ `_calc` 引擎溯源字段。

不自行编造聚合规则，不跳过任一维度，不在 H 硬规则命中时继续 S 软规则聚合，不心算（必须由 sandbox 脚本执行）。

---

## 2. 何时触发

由 super-skill 编排器触发（参考 `super-skill/plan/2026-08-08-super-skill-架构设计.md` §4 4 种触发模式）：

- **全流程模式**：用户描述完整项目 + 问「能不能上会 / 顶层判定 / 双层决策 / 完整测算」（≥3 维度时 super-skill 触发，串行调 6 个子 agent）
- **追加模式**：用户在已有 conversation 中追问顶层结论（不重跑下游 agent，仅重新聚合）
- 直接 query（用户绕过 super-skill 直接调 agent6）：用户问「项目顶层判定 / 四维灯色 / 上会就绪度 / 双层决策」+ 已有 4 个下游 agent 输出

不应触发（near-miss，需识别为别的 skill）：

- 单独问固有对象识别（→ agent1）
- 单独问融资可行性（→ agent3）
- 单独问财务指标 / IRR（→ agent4）
- 单独问失败案例 / Top3 检索（→ agent5）
- 单维度查询（用户只问一维 → super-skill 不触发，agent6 也不触发）

---

## 3. 输入格式

JSON 对象，4 个下游 agent 的结论层输出对象（V2 schema 见 `references/agent{N}_输出_schema.md`）：

```json
{
  "agent1": { "灯色": "...", "命中判据": [], "风险点": [], "依据": {}, "建议动作": "..." },
  "agent3": { "灯色": "...", "可适用融资工具清单": [], "推荐资金组合": {}, "关键审批风险点": [], "依据": {}, "建议动作": "..." },
  "agent4": {
    "改造模式": "...",
    "财务指标": { "IRR": "...", "NPV": "...", "回收期": "...", "敏感性分析": {} },
    "业态门槛对照": { "业态": "...", "门槛区间": "...", "达标结论": "优 | 达标 | 不达标" },
    "关键假设": "...",
    "依据": {},
    "_calc": {
      "engine": "numpy-financial | python-bisection | timeout-at-30s | unavailable | sandbox_error | not-invoked",
      "numpy_financial_version": "<version> | null",
      "scripts_version": "V2",
      "kernel_session": "injected_by_sandbox"
    }
  },
  "agent5": { "校验灯": "...", "Top3案例": [], "根因重现判断": false, "命中判据": {}, "规避建议": "...", "案例库依据": "..." }
}
```

必填字段缺失时 MUST 在对应维度的「依据」中标注「输入缺失」，并在「条件推进事项」中列出补齐要求；不得静默跳过该维度。

---

## 4. 输出格式

JSON 对象，schema 详见 `references/四维聚合规则详解.md` V2 + 工作流 §1.6。核心字段：

- **agent**：`agent6-双层决策`（V2 新增）
- **顶层灯**：`red | yellow | green`
- **顶层判据**：`H.关键维度硬规则（设计咨询=red 或 投资拓展=red）` | `S.决策权重聚合(0.3/0.3/0.2/0.2)`
- **四维子灯**：`设计咨询` / `投资拓展` / `建造实施`（Phase1 简化）/ `业主平台` 各含 `灯色` / `依据`（V2 简化字段，命中判据与风险点合并到「依据」中）
- **条件推进事项**：黄级事项清单（如「设计咨询 维度 yellow」「投资拓展 维度 yellow」）
- **建议动作**：`终止 | 条件推进 | 可推进`
- **触发报告模板**：根据顶层灯自动映射（red → 内部决策版（终止原因）；yellow → 投资人版 + 政府版（条件推进）；green → 全部 4 类用户版）
- **_calc**（V2 新增）：`{ "engine": "decision-aggregator-v2", "rules_version": "2026-08-08" }`

任一维度论证断裂（顶层灯与四维子灯不自洽、H 硬规则未优先于 S 软规则、决策权重不等于 1.0、`agent4._calc.engine` 未按 mapping 消费）即视为 skill 失败，必须重写。

---

**版本**：V2（2026-08-08）
**依据**：implementation-plan Task 4 Step 2 + V1 工作流 md §1（V1 §6 抽取）+ §3（阶段 1 意图捕获）
**前一版**：`intent-V1.md`（保留留底）
