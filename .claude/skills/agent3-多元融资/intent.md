# Agent3 多元融资 Skill — 意图捕获（V2）

> 本文件为 skill-creator 阶段 1 意图捕获产物（V2 版本）。
> 来源：`super-skill/plan/2026-08-08-super-skill-implementation-plan.md` Task 5 Step 2 +
> `skill集群/plan/2026-08-03-agent3-多元融资-skill工作流.md` §1 + §3 +
> `super-skill/plan/2026-08-08-6agent-盘点与分类.md` §2.4（agent3 P1 下沉）+
> `super-skill/plan/2026-08-08-libSQL-接口缺口分析.md` §2.3（agent3 sandbox 直连 libSQL）。
> 锚点：V1 §3（L111-198）+ super-skill architecture Task 5。

---

## 0. 版本变更摘要（V1 → V2）

| 变更项 | V1 | V2 |
|---|---|---|
| 实施方法 | LLM 心算综合分 + DSCR + 覆盖率 | **sandbox 脚本执行**（`finance_tools.py` + 5 个 references/*.json fallback） |
| 数据源 | references/ 静态文件（10 个预设库 dump） | **sandbox 直连 libSQL**（`finance_products` / `mortgage_thresholds` / `negative_list` / `pilot_cities` / `industry_thresholds`），fallback references/*.json |
| 触发位置 | 单 skill | super-skill 编排（≥3 维度时由 super-skill 调用）+ 直接 query |
| 输出字段 | 6 字段（灯色 / 工具清单 / 资金组合 / 风险点 / 依据 / 建议动作） | 同 V1 + **`_calc.engine = libsql-direct`** 引擎溯源字段 |
| 综合分公式 | LLM 心算 S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2 | sandbox 严格按公式计算（round 1 位小数） |
| DSCR 计算 | LLM 心算 | sandbox 计算 `(基准租金×面积×12) / 年还款额` |
| 失败回退 | 标注「缺字段」由 LLM 兜底 | sandbox 不可用 → 降级对象（禁止 LLM 心算）+ libSQL 失败 → fallback references/*.json |

---

## 1. skill 做什么

输入用户参数（总投资 / 持有年限 / 退出策略 / 资产盘活属性）+ agent1 输出（业主资质 / 物理参数 / 业态方向 / 文保约束 / 改造模式）+ agent2 输出（可适用政策清单 / 试点城市资格判定），由 sandbox 内 `finance_tools.py` 按 V1 §3 H1-H4 硬约束剔除（资本金 25-30% / 5 类抵押物 / 负面清单 / 15 城试点）+ S1-S4 软约束评分（审批通过率×0.3 + 资金成本×0.3 + 期限匹配×0.2 + 还款覆盖×0.2），输出融资可行性灯（red/yellow/green）+ 推荐资金组合 + 关键审批风险点。

V2 关键能力：
1. **libSQL 直连**：sandbox 内 `execute_sql("finance_products")` 拉取最新融资工具库（数据治理在数据库做，零文件 dump）
2. **fallback 设计**：libSQL 不可用时自动降级到 `references/{table}.json`（5 个静态 JSON：finance_products / mortgage_thresholds / negative_list / pilot_cities / industry_thresholds），保证 skill 在 DB 未就位时仍可执行
3. **DSCR 精确计算**：`DSCR = (基准租金 × 可租赁面积 × 12) / 年还款额`，由 sandbox 计算而非 LLM 心算
4. **覆盖率精确计算**：`覆盖率 = Σ(H 通过工具融资金额) / 项目总投资`，决定 yellow vs green

输出严格遵循 V1 §7 schema（6 字段 JSON）+ `_calc` 引擎溯源字段（V2 新增）。

不自行编造融资产品，不跳过任一 H 硬约束，不在 H 剔除后继续 S 评分，不心算综合分 / DSCR / 覆盖率（必须由 sandbox 脚本执行）。

---

## 2. 何时触发

由 super-skill 编排器或用户直接触发：

- **super-skill 全流程模式**：用户描述完整项目 + 问「融资方案 / 资金组合 / 融资可行性 / 多元融资」（super-skill 串行调 agent1 → agent2 → agent3 → agent4 → agent5 → agent6）
- **super-skill 追加模式**：已有 conversation 中追问融资可行性（不重跑 agent1 / agent2，复用其输出）
- **直接 query**：用户问「融资方案 / 资金组合 / 多元融资 / 资本金门槛 / 抵押物合规 / REITs 资格 / 专项债资格 / 试点城市 / 融资期限匹配 / 还款覆盖」+ 已有 agent1 / agent2 输出

不应触发（near-miss，识别为别的 skill）：

- 单独问 IRR / NPV / 回收期 / 敏感性 → agent4 财务模型
- 单独问政策条款 / 政策应答 → agent2 政策应答
- 单独问固有对象识别 / 产权 / 文保 → agent1
- 单独问失败案例 / Top3 检索 → agent5
- 单独问顶层判定 / 双层决策 → agent6
- 单维度查询（< 3 维度）→ super-skill 不触发，agent3 也不触发

---

## 3. 输入格式

### 3.1 用户输入字段（必填，缺则降级人工填报）

| 字段 | 类型 | 说明 | 影响维度 |
|---|---|---|---|
| `investment` | float | 项目总投资（万元） | H1 资本金校验 + 覆盖率 |
| `holding_years` | int | 持有运营年限（1-50） | S3 期限匹配 |
| `exit_strategy` | str | 整体出售 / 单层散售 / REITs 退出 / 持有到期 | S3 期限匹配 |
| `user_region` | str | 项目所在城市 | H4 试点资格 |
| `user_industry` | str | 商业 / 办公 / 文旅 / 商业提质 / 产业升级 | 业态匹配 |
| `capital_ratio` | float | 资本金比例（0-1） | **H1 硬约束**（25-30% 门槛） |
| `mortgage_type` | str | 土地使用权 / 运营权 / 收益权 / 经营权 / 收费权 / 组合 / 其他 | **H2 硬约束**（5 类清单） |
| `mortgage_value` | float | 抵押物估值（万元） | H2 抵押率计算 |
| `baseline_rent` | float | 基准租金（元/㎡/月） | S4 DSCR |
| `leasable_area` | float | 可租赁面积（㎡） | S4 DSCR |

### 3.2 下游 agent 输出（JSON 对象）

```json
{
  "agent1": {
    "灯色": "...",
    "业主资质": {"信用记录": "...", "国资背景": "...", "房地产开发资质": "..."},
    "物理参数": {...},
    "业态方向": "商业 | 办公 | 文旅",
    "文保约束": "...",
    "改造模式": "拆除重建 | 保留微更新 | 混合"
  },
  "agent2": {
    "灯色": "...",
    "可适用政策清单": [...],
    "试点城市资格判定": {"城市": "...", "是否试点": true, "分档": "一线 | 强二线 | 其他"}
  }
}
```

字段缺失时 MUST 在「关键审批风险点」中标注「输入缺失」，并在「建议动作」中列出补齐要求；不得静默跳过任一硬约束。

---

## 4. 输出格式

JSON 对象，schema 详见 V1 §7 + 本 skill SKILL.md §6。核心字段：

- **agent**：`agent3-多元融资`（V2 新增）
- **灯色**：`red | yellow | green`
- **可适用融资工具清单**：H1-H4 全部通过的工具，含工具名称 / 资金成本 / 期限 / 审批通过率 / 综合分（V2 含 S1-S4 分项）
- **推荐资金组合**：基于综合分 Top 工具组装的方案（占比 / 综合利率）
- **关键审批风险点**：H 不通过原因 + S 低分维度（< 60）+ 门槛接近警告
- **依据**：引用的 libSQL 表 + fallback JSON 文件版本
- **建议动作**：`终止 | 条件推进 | 可推进`
- **_calc**（V2 新增）：`{ "engine": "libsql-direct | libsql-fallback-json", "scripts_version": "V2", "data_version": "2026-08-08" }`

任一 H 硬约束未优先于 S 软约束执行、综合分公式被改写、DSCR 心算替代 sandbox、覆盖率未达阈值时灯色判定错误，均视为 skill 失败，必须重跑 sandbox。

---

**版本**：V2（2026-08-08）
**依据**：implementation-plan Task 5 Step 2 + V1 工作流 md §1 + §3 + 6agent 盘点 §2.4 + libSQL 接口缺口分析 §2.3
**前一版**：`intent-V1.md`（保留留底）
