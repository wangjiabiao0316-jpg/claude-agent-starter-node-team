# agent5 失败案例 — 结论层输出对象 schema (V2)

> 本文件为 agent6 SKILL.md V2 的 references 子文件。
> 引用源：`2026-08-03-agent5-失败案例-skill工作流.md` §1.5。
> V1 留底：`agent5_输出_schema-V1.md`。
> V2 变更：无字段层面变更；仅澄清 agent6 设计咨询 + 建造实施维度的根因识别逻辑。

agent6 设计咨询维度（改造可行性校验）与建造实施维度（施工协调失败模式）
均依赖本 schema 的 `校验灯` 与 `Top3案例[]` 字段。

---

## 1. JSON Schema (V2)

```json
{
  "校验灯": "red | yellow | green",
  "Top3案例": [
    {
      "case_id": "string",
      "相似度": 0.0,
      "失败模式": "招商失败 | 退出受阻 | 改造超预算 | 业态误判 | 施工引发周边协调失败",
      "根因": "string"
    }
  ],
  "根因重现判断": true,
  "命中判据": {
    "H1_高危模式": "招商失败 | 退出受阻 | 改造超预算 | 业态误判 | 施工引发周边协调失败 | null",
    "S1_相似度分": 0.0,
    "S2_归因分": 0.0
  },
  "规避建议": "string",
  "案例库依据": "string"
}
```

---

## 2. 字段说明（agent6 引用方式）

| 字段 | 类型 | agent6 引用方式 |
|---|---|---|
| `校验灯` | enum: red/yellow/green | 设计咨询维度校验信号；建造实施维度（`校验灯=yellow` 触发建控地带升级） |
| `Top3案例` | object[] | 设计咨询维度（改造超预算 / 业态误判根因）；建造实施维度（施工引发周边协调失败根因） |
| `Top3案例[].失败模式` | enum | **关键聚合键**：用于 agent6 维度归类（详见 §3） |
| `根因重现判断` | bool | 设计咨询维度（agent1=yellow + 根因重现 + 改造类 → 升级 red）；建造实施维度（施工类根因重现 → red） |
| `命中判据.H1_高危模式` | enum \| null | agent6 直接读取以判断失败模式归类 |
| `规避建议` | string | agent6 输出对象 `条件推进事项[]` 数据源 |
| `案例库依据` | string | 用于 agent6 输出对象 `四维子灯.{维度}.依据.agent5_*` 字段填充 |

---

## 3. 5 类失败模式标准化定义（V1 §5 L279-285 逐字保留）

| 失败模式 | 标准化定义 | agent6 维度归类 |
|---|---|---|
| **招商失败** | 招商前置条件缺失（可租赁面积不足 / 区位客流薄弱） | 设计咨询维度（属改造类根因） |
| **退出受阻** | 退出策略与融资期限 / 资产属性不匹配，路径不清晰 | 投资拓展维度 |
| **改造超预算** | 文保或结构硬约束高，改造模式受限致成本失控 | **设计咨询维度**（改造类根因，agent1=yellow 时升级 red） |
| **业态误判** | 业态方向 IRR 低于业态门槛基准下限 | **设计咨询维度**（改造类根因） + 投资拓展维度（IRR 不达标） |
| **施工引发周边协调失败** | 周边协调条件复杂（文保周边 / 密集区） | **建造实施维度**（施工类根因，触发维度 red） |

### 3.1 改造类根因（用于设计咨询维度升级，V2 sandbox 自动识别）

`招商失败` / `改造超预算` / `业态误判` 三类失败模式归类为「改造类根因」。

agent6 `decision_aggregator.py` 自动识别（V2 实现）：

```python
RENOVATION_FAILURE_MODES = {"招商失败", "改造超预算", "业态误判"}

def _has_renovation_root_cause(agent5):
    cases = agent5.get("Top3案例", []) or []
    return any(c.get("失败模式") in RENOVATION_FAILURE_MODES for c in cases if isinstance(c, dict))
```

agent6 设计咨询维度聚合：`agent1.灯色=yellow` 且 `_has_renovation_root_cause(agent5) = True` → 设计咨询维度 red（风险升级）。

### 3.2 施工类根因（用于建造实施维度，V2 sandbox 自动识别）

`施工引发周边协调失败` 归类为「施工类根因」。

agent6 `decision_aggregator.py` 自动识别：

```python
CONSTRUCTION_FAILURE_MODE = "施工引发周边协调失败"

def _has_construction_root_cause(agent5):
    cases = agent5.get("Top3案例", []) or []
    return any(c.get("失败模式") == CONSTRUCTION_FAILURE_MODE for c in cases if isinstance(c, dict))
```

agent6 建造实施维度聚合：`_has_construction_root_cause(agent5) = True` → 建造实施维度 red。

---

## 4. H1/S1/S2 判据摘要

- **H1 高危模式命中**（硬约束）：5 类失败模式任一高危触发条件命中 → `校验灯 = red`
- **S1 相似度匹配**（权重 0.6【待校准】）：按产权/业态/规模/区域/物理参数/融资结构匹配 → Top3
- **S2 失败模式归因**（权重 0.4【待校准】）：对 Top3 提取根因，映射到 5 类

---

## 5. 校验灯判定

- H1 命中高危 → **red**（不直接终止，作为 agent6 关键输入）
- Top3 高相似度且根因重现 → **yellow**
- 无高危且相似案例根因已被前置 agent 规避 → **green**

> 注：agent5 **不直接终止**后续测算，红灯信号作为 agent6 双层决策的关键输入。

---

**版本**：V2（2026-08-08，无字段变更；新增 V2 sandbox 自动识别逻辑说明）
**前一版**：`agent5_输出_schema-V1.md`（保留留底）
**写作依据**：agent5 工作流 md §1.5 结论层输出对象 schema
