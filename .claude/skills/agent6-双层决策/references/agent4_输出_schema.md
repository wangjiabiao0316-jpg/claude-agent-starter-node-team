# agent4 通用财务模型 — 结论层输出对象 schema (V2)

> 本文件为 agent6 SKILL.md V2 的 references 子文件。
> 引用源：`2026-08-03-agent4-财务模型-skill工作流.md` §1.4 + agent4 V2 SKILL.md（已落地的 _calc.engine 字段）。
> V1 留底：`agent4_输出_schema-V1.md`。

agent6 投资拓展维度子灯聚合规则的财务信号源取自本 schema 的 `业态门槛对照.达标结论`；
**V2 新增 `agent4._calc.engine` 字段**，agent6 必须按 `decision_rules.json` 的 `agent4_engine_mapping` 消费。

---

## 1. JSON Schema (V2)

```json
{
  "agent": "agent4-财务模型",
  "改造模式": "拆除重建 | 保留微更新 | 混合",
  "收入测算": {
    "月租金": "...",
    "可租赁面积": "...",
    "出租率": "...",
    "年收入": "..."
  },
  "成本测算": {
    "建安": "...",
    "改造": "...",
    "运营": "...",
    "税费": "..."
  },
  "现金流时序": [
    {
      "年份": "...",
      "现金流入": "...",
      "现金流出": "...",
      "净现金流": "..."
    }
  ],
  "财务指标": {
    "IRR": "...",
    "NPV": "...",
    "回收期": "...",
    "敏感性分析": "..."
  },
  "业态门槛对照": {
    "业态": "商业 | 办公 | 文旅",
    "门槛区间": "8-12% | 6-9% | 7-10%",
    "达标结论": "优 | 达标 | 不达标"
  },
  "关键假设": "【待校准】",
  "依据": ["建安成本基准库", "基准租金库", "税务规则库"],
  "_calc": {
    "engine": "numpy-financial | python-bisection | timeout-at-30s | unavailable | sandbox_error | not-invoked",
    "numpy_financial_version": "<version> | null",
    "scripts_version": "V2",
    "kernel_session": "injected_by_sandbox"
  }
}
```

---

## 2. `_calc` 字段（V2 新增 — agent6 消费的关键溯源字段）

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

### 2.1 `engine` 字段值含义

| engine 值 | 含义 | agent6 投资拓展维度处置 |
|---|---|---|
| `numpy-financial` | 正常算出 IRR/NPV（pip install numpy-financial 成功 + 计算收敛） | **normal**（按常规规则：agent3 灯色 + agent4.达标结论） |
| `python-bisection` | numpy-financial 不可用，已 fallback 到手写二分法 | **force_yellow**（强制 yellow，依据标注「bisection fallback，数值精度低于 numpy」） |
| `timeout-at-30s` | sandbox 计算超时（30s 限制），IRR 部分算出 | **force_yellow**（强制 yellow，依据标注「sandbox 超时」） |
| `unavailable` | sandbox 不可用 / numpy-financial 装不上 / 完全没算 | **force_red**（强制 red，触发顶层 red + 终止） |
| `sandbox_error` | sandbox 运行时抛错（kernel crash 等） | **force_red**（强制 red） |
| `not-invoked` | agent4 V2 sandbox 路径未触发（如降级到 V1 LLM 推理） | **follow_v1**（按 V1 规则处理，仅看 `业态门槛对照.达标结论`） |

### 2.2 agent6 消费规则（必须严格执行）

agent6 消费规则见 `references/decision_rules.json` `agent4_engine_mapping`：

```python
# decision_aggregator.py 的核心逻辑（简化版）
engine_map = rules["agent4_engine_mapping"]
action = engine_map.get(agent4["_calc"]["engine"], "follow_v1")
if action == "force_red":
    return "red", f"agent4._calc.engine={engine}（强制 red）"
if action == "force_yellow":
    return "yellow", f"agent4._calc.engine={engine}（强制 yellow）"
# normal / follow_v1：按常规规则（agent3 + agent4.达标结论）
```

---

## 3. 字段说明（agent6 引用方式）

| 字段 | 类型 | agent6 引用方式 |
|---|---|---|
| `改造模式` | enum | 设计咨询维度 / 业主平台维度（运营收益评估）参考 |
| `收入测算` / `成本测算` | object | 投资人版 / 业主版报告模板数据源 |
| `现金流时序` | object[] | 业主平台维度（长期运营收益）数据源 |
| `财务指标.IRR` | string | 投资人版报告主指标；与业态门槛对照联合用于投资拓展维度 |
| `财务指标.NPV` | string | 投资人版报告主指标 |
| `财务指标.回收期` | string | 投资人版报告主指标 |
| `财务指标.敏感性分析` | string | 内部决策版报告 |
| `业态门槛对照.达标结论` | enum: 优/达标/不达标 | **投资拓展维度财务信号主键**：`优` + `agent3.灯色=绿` → 投资拓展 green；`不达标` → 投资拓展 red（顶层硬规则） |
| `关键假设` | string | 内部决策版报告（须显式标注【待校准】） |
| `依据` | string[] | 用于 agent6 输出对象 `四维子灯.投资拓展.依据.agent4_*` 字段填充 |
| **`_calc.engine`**（V2 新增） | enum | **agent6 强制规则主键**：见 §2.1 消费表 |

---

## 4. 业态门槛基准表【待校准】

来源：V1 §3 L176 + §4 L245。本 references 仅落地数值，不调参。

| 业态 | IRR 下限 | IRR 上限 | 门槛区间 |
|---|---|---|---|
| 商业 | 8% | 12% | 8-12% |
| 办公 | 6% | 9% | 6-9% |
| 文旅 | 7% | 10% | 7-10% |

---

## 5. 达标结论判定规则

IRR 对照业态门槛：

- IRR ≥ 上限 → **优**
- IRR 在区间内 → **达标**
- IRR < 下限 → **不达标**

> agent6 投资拓展维度聚合（V2 增强）：
> - **优先级 1（engine 强制）**：`agent4._calc.engine ∈ {unavailable, sandbox_error}` → 投资拓展 red；`∈ {python-bisection, timeout-at-30s}` → 投资拓展 yellow
> - **优先级 2（常规规则）**：`agent4.业态门槛对照.达标结论 = 不达标` → 投资拓展 red（顶层硬规则触发）
> - **优先级 3**：`达标结论 = 达标（非优）` 且 `agent3.灯色 = 黄` → 投资拓展 yellow
> - **优先级 4**：`达标结论 = 优` 且 `agent3.灯色 = 绿` → 投资拓展 green

---

## 6. H1 改造模式适配（影响 agent6 建造实施维度）

- 文保强制保留 → 模式 = 保留微更新，标注受限
- 文保非强制 → 拆除重建 / 保留微更新 / 混合（依据物理参数 + 业态方向 + 文保约束）

> agent6 建造实施维度 Phase1 简化：仅靠 `agent1.H2` 文保条款 + `agent5.Top3案例[]` 失败模式反推；
> Phase2 应新增「施工风险子 agent」补全此维度。

---

**版本**：V2（2026-08-08）
**前一版**：`agent4_输出_schema-V1.md`（保留留底）
**写作依据**：agent4 工作流 md §1.4 + agent4 V2 SKILL.md（_calc.engine 字段）
