# agent1-固有对象 Skill 意图捕获（Intent）

> skill-creator 阶段 1 输出。4 项意图问卷。
> 锚点：V1 §1（L40-61）+ 2026-08-03-agent1-固有对象识别-skill工作流.md §1。
> P2 替代方案：仅 references/{H_rules.md, S_rules.md}，无 sandbox scripts。

---

## 1. skill 做什么（What）

输入「规划文书 / 不动产证号 / 业主意愿 / 业态方向 / 运营模式」+ 由 super-skill 注入的 `[RETRIEVED CONTEXT]` 块（含权属规则、文保等级、不动产登记合规接口的被动向量检索结果），按 V1 §1 判别逻辑输出**三色灯信号对象**：

1. **H1 产权清晰度**校验（红/黄/绿触发条件）
2. **H2 文保与规划**校验（红/黄/绿触发条件）
3. **S1 更新意愿**评分（0-100，权重 0.5）
4. **S2 可经营性**评分（0-100，权重 0.5）
5. **判定层**：H 任一红 → 终止；H 黄 → 条件推进；H 全绿 → S 总分 ≥75 → green / 60-75 → yellow / <60 → red

输出严格遵循 schema（灯色 / 命中判据 / 风险点 / 依据 / 建议动作），任一 H 命中 red 即输出红灯并终止后续 agent 调用。

---

## 2. 何时触发（When）

**触发条件**（任一即触发）：

- 用户问「**产权** / **文保** / **固有对象** / **三色灯** / **闸门判定** / **能否推进** / **固有对象识别**」
- super-skill 编排器在 Phase 1 自动调用（城市更新项目完整流水线第一步）
- 用户问「**H1 产权清晰度** / **H2 文保规划** / **S1 更新意愿** / **S2 可经营性**」

**不应触发**（near-miss）：

- 单独问政策匹配 → agent2
- 单独问融资可行性 / 资金组合 → agent3
- 单独问 IRR / NPV / 财务指标 → agent4
- 单独问失败案例 / Top3 检索 → agent5
- 单独问顶层判定 / 上会就绪度 → agent6（agent1 仅是 agent6 的输入源之一）
- 通用办公问答、PDF 抽取、法律咨询

---

## 3. 输入格式（Input）

```json
{
  "用户描述": {
    "规划文书": "<规划文件 / 条件 / 项目信息>",
    "不动产证号": "<不动产文书 / 证号>",
    "业主资质": "<业主类型 + 改造意愿>",
    "业态方向": "<经营性功能精准定位，如商业/办公/文旅/工业仓储>",
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

- `不动产证号` 缺失 → 输出降级清单（不允许进入 H1.green 判定）
- `[RETRIEVED CONTEXT]` 缺失 → 仅靠 references/{H_rules.md, S_rules.md} + 用户输入做判定，标 WARN
- `业态方向` / `运营模式` 缺失 → S2 不可算，触发降级（顶层 yellow）

---

## 4. 输出格式（Output）

```json
{
  "agent": "agent1-固有对象",
  "灯色": "red | yellow | green",
  "命中判据": [
    "H1.red | H1.yellow | H1.green",
    "H2.red | H2.yellow | H2.green",
    "S总分.>=75 | S总分.60-75 | S总分.<60"
  ],
  "风险点": [
    "<具体风险描述，如：不动产证号无效、文保核心保护区且改造不可经营>"
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

**字段约束**：

- `灯色` MUST ∈ {`red`, `yellow`, `green`}（小写枚举）
- `命中判据` MUST 至少含 H1 与 H2 各一项（除非数据缺失触发降级）
- `建议动作` MUST 与 `灯色` 自洽（red→终止 / yellow→条件推进 / green→可推进）
- `_calc.engine` MUST = `"llm-references-v2"`（标识 P2 替代方案：纯 LLM + references/ 推理，无 sandbox）

---

## 5. P2 替代方案要点（与 V1 / sandbox 版的差异）

| 维度 | V1 工作流 md 设想 | P2 替代方案（本 V2） |
|---|---|---|
| 数据源 | 不动产登记合规接口 + 权属规则库 | 被动注入（[RETRIEVED CONTEXT]）+ references/{H_rules.md, S_rules.md} |
| 算法执行 | LLM 心算（V1） / sandbox 脚本（agent4 V2 模板） | LLM 读 references 做规则查表（P2 替代） |
| 风险 | LLM 心算阈值漂移 | LLM 在小规模规则查表（H1+H2 各 3-4 条）上稳定，下沉收益仅是「可审计」不是「精度」 |
| 触发条件 | 同 V1 | 同 V1 |
| 输出 schema | 同 V1 | 同 V1，多 `_calc.engine = "llm-references-v2"` |

---

**版本**：V2（2026-08-08）
**意图捕获人**：skill-creator 流水线（P2 替代方案）
**前置依赖**：[RETRIEVED CONTEXT] 由 super-skill 注入；references/{H_rules.md, S_rules.md} 由本 skill 自带
