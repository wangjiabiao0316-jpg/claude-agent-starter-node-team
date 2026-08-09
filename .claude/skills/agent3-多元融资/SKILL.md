---
name: agent3-多元融资
description: 'MUST follow agent3 多元融资硬约束剔除 + 四维评分规则。 H1 资本金 25-30% / H2 5 类抵押物（土地使用权/运营权/收益权/经营权/收费权/组合）/ H3 政策性资金负面清单 / H4 15 城试点（北京/上海/江苏/浙江/安徽/福建/山东/湖南/广东/四川/雄安/河北/江西/湖北/重庆）任一不过 → red。 S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2 综合分；DSCR = (基准租金×面积×12)/年还款额；覆盖率 < 0.7 → yellow。 sandbox 必须调 libsql_client 拉取最新 finance_products / mortgage_thresholds / negative_list / pilot_cities；不得心算综合分、不得估算 DSCR、不得 fallback LLM 心算。 Use when 用户询问融资方案 / 资金组合 / 多元融资 / 资本金门槛 / 抵押物合规 / REITs 资格 / 专项债资格 / 政策性资金 / 试点城市 / 融资期限匹配 / 还款覆盖 / 融资可行性。 触发关键词：资本金比例, 抵押物, 土地使用权, 运营权, 收益权, 经营权, 收费权, 负面清单, 试点城市, 政策性资金, REITs, 专项债, 自审自发, 融资组合, 综合利率, 还款覆盖, 融资可行性, 持有年限, 退出策略, 资产盘活。 MUST NOT 输出 IRR/NPV/回收期（agent4 职责）, MUST NOT 输出政策条款检索（agent2 职责）, MUST NOT 输出固有对象识别（agent1 职责）, MUST NOT 输出顶层红绿灯（agent6 职责）。'
---

# Agent3 多元融资 Skill (V2)

> 本 skill 实现 V1 §3（L111-198）「多元融资判别逻辑」+ super-skill architecture Task 5。
> 智能体类型：**计算型 + 规则查表（最复杂混合型）**｜结论：融资可行性灯 + 推荐资金组合 + 关键审批风险点。
> V2 关键升级：**sandbox 脚本执行**（不再依赖 LLM 心算综合分 / DSCR / 覆盖率）+ **libSQL 直连**（数据治理在数据库）+ **fallback references/*.json**。
> 锚点：V1 §3（L111-198）；implementation-plan Task 5；工作流文档：`skill集群/plan/2026-08-03-agent3-多元融资-skill工作流.md` §1。

---

## Step 0: Sandbox Bootstrap（5 步，参考 agent4 V2 模板）

> 目标：在 sandbox 内写入 `finance_tools.py` + 5 个 `references/*.json` + 共享 `libsql_client.py`，验证模块可装载，再进入 Step 1。

### Step 0.1: probe sandbox（重试 3 次）

```python
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

### Step 0.2: 写入 7 个文件到 `/tmp/finance/`

```python
sandbox.commands.run("mkdir -p /tmp/finance/references", {timeout: 5})

# 文件 1: 主算法 finance_tools.py
sandbox.files.write("/tmp/finance/finance_tools.py", finance_tools_py_content)

# 文件 2-6: 5 个 fallback JSON（防止 libSQL 不可用）
sandbox.files.write("/tmp/finance/references/finance_products.json", finance_products_json)
sandbox.files.write("/tmp/finance/references/mortgage_thresholds.json", mortgage_thresholds_json)
sandbox.files.write("/tmp/finance/references/negative_list.json", negative_list_json)
sandbox.files.write("/tmp/finance/references/pilot_cities.json", pilot_cities_json)
sandbox.files.write("/tmp/finance/references/industry_thresholds.json", industry_thresholds_json)

# 文件 7: 共享 libsql_client.py（agent3 自己 bootstrap 写入，不再依赖 prepareSandbox）
# 来源：.claude/skills/_shared/scripts/libsql_client.py
sandbox.files.write("/tmp/finance/libsql_client.py", libsql_client_py_content)
```

> ⚠️ V2 修订（2026-08-09）：原注释假设 `agents/chat/_tools.ts::prepareSandbox` 会自动注入 libsql_client.py + LIBSQL env，**但该函数是死代码从未被调用（已删除）**。agent3 必须自己写文件 + export env（本 Step 0.2 第 7 个文件就是必做步骤，不是兜底）。

### Step 0.3: 验证模块装载（import 测试）

```python
verify_result = sandbox.commands.run(
    "cd /tmp/finance && python3 -c 'from finance_tools import evaluate; print(\"OK\")'",
    {timeout: 10}
)
# 期望输出：OK
# 失败 → F2 降级（脚本语法错误）
```

### Step 0.4: 跳过 pip install（agent3 纯标准库）

> agent3 不依赖 numpy / numpy-financial（纯 Python 加权 + JSON 查表 + urllib），无需 Step 0.4 pip install。
> 跳到 Step 0.5。

### Step 0.5: 进入 Step 1

sandbox bootstrap 完成，进入 Step 1 主算法调用。

---

## Step 1: 立即调用 runCode（不得跳过、不得估算、不得 fallback、不得心算）

> **6 条 pushy 硬规则（同 agent4 / agent6 V2）**：
> 1. 不得跳过 Step 0（sandbox bootstrap 必须执行）
> 2. 不得估算（综合分 / DSCR / 覆盖率必须由 sandbox 脚本算）
> 3. 不得 fallback（即使 libSQL 失败，也由脚本自动 fallback references/*.json）
> 4. 不得心算（LLM 心算 S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2 极易在覆盖率边界、DSCR 阈值上出错）
> 5. 必须 sandbox（必须通过 `sandbox.commands.run` 或 `sandbox.runCode` 执行）
> 6. 必须 schema（输出必须符合 §6 schema，任一字段缺失或 H/S 顺序倒置 → skill failure）

```python
import sys
sys.path.insert(0, '/tmp/finance')
from finance_tools import evaluate
import json

result = evaluate(
    investment=<用户输入总投资（万元）>,
    holding_years=<持有年限>,
    exit_strategy="<退出策略>",
    user_region="<项目所在城市>",
    user_industry="<业态方向>",
    capital_ratio=<资本金比例 0-1>,
    mortgage_type="<土地使用权|运营权|收益权|经营权|收费权|组合>",
    mortgage_value=<抵押物估值（万元）>,
    baseline_rent=<基准租金 元/㎡/月>,
    leasable_area=<可租赁面积 ㎡>,
    agent1_output=<agent1 输出对象或 None>,
    agent2_output=<agent2 输出对象或 None>
)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

`result` 即为 agent3 结论层输出对象（schema 见 §6）。

**禁止行为**（违反即失败）：
- 不得自己心算综合分（S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2 必须由 `evaluate()` 算）
- 不得跳过任一 H 硬约束（H1 → H2 → H3 → H4 顺序执行，任一不通过即剔除该工具）
- 不得在 H 剔除后继续对被剔除工具做 S 评分
- 不得估算 DSCR（必须由 sandbox 算）
- 不得估算覆盖率（必须由 sandbox 算，决定 yellow vs green）
- 不得在 `evaluate()` 返回前结束响应
- 不得用 `print("综合分 ≈ ...")` 等估算输出代替真实 `evaluate()` 调用

---

## 2. 触发条件

由 super-skill 编排器或用户直接触发：

- **super-skill 全流程模式**：用户描述完整项目 + 问「融资方案 / 资金组合 / 多元融资」（super-skill 串行调 agent1 → agent2 → agent3 → agent4 → agent5 → agent6）
- **super-skill 追加模式**：已有 conversation 中追问融资可行性
- **直接 query**：用户问「融资方案 / 资金组合 / 资本金门槛 / 抵押物合规 / REITs 资格 / 专项债资格 / 试点城市 / 融资期限匹配 / 还款覆盖 / 融资可行性」+ 已有 agent1 / agent2 输出

不应触发（near-miss，识别为别的 skill）：

- 单独问 IRR / NPV / 回收期 / 敏感性 → agent4 财务模型
- 单独问政策条款 / 政策应答 → agent2 政策应答
- 单独问固有对象识别 / 产权 / 文保 → agent1
- 单独问失败案例 / Top3 检索 → agent5
- 单独问顶层判定 / 双层决策 → agent6
- 单维度查询（< 3 维度）→ super-skill 不触发，agent3 也不触发

---

## 3. 输入（用户参数 + 下游 agent 输出）

### 3.1 用户输入字段（必填，缺则降级人工填报）

| 字段 | 类型 | 说明 | 影响维度 |
|---|---|---|---|
| `investment` | float | 项目总投资（万元） | H1 资本金 + 覆盖率 |
| `holding_years` | int | 持有运营年限（1-50） | S3 期限匹配 |
| `exit_strategy` | str | 整体出售 / 单层散售 / REITs 退出 / 持有到期 | S3 期限匹配 |
| `user_region` | str | 项目所在城市 | H4 试点资格 |
| `user_industry` | str | 商业 / 办公 / 文旅 | 业态匹配 |
| `capital_ratio` | float | 资本金比例（0-1） | **H1 硬约束**（25-30% 门槛） |
| `mortgage_type` | str | 土地使用权 / 运营权 / 收益权 / 经营权 / 收费权 / 组合 | **H2 硬约束** |
| `mortgage_value` | float | 抵押物估值（万元） | H2 抵押率 |
| `baseline_rent` | float | 基准租金（元/㎡/月） | S4 DSCR |
| `leasable_area` | float | 可租赁面积（㎡） | S4 DSCR |

### 3.2 下游 agent 输出（可选，作为依据）

```json
{
  "agent1": {"灯色": "...", "业主资质": {...}, "业态方向": "...", "改造模式": "..."},
  "agent2": {"灯色": "...", "可适用政策清单": [...], "试点城市资格判定": {...}}
}
```

---

## 4. 判据层：H 硬约束 + S 软约束

### 4.1 H1 资本金门槛（硬约束）

- 触发条件：`用户资本金比例 ≥ 工具要求的 capital_ratio_min`
- 工具门槛区间 **25-30%**（专项债 ≥ 30% / 商业银行贷款 ≥ 25%）
- 不通过：剔除 + 风险点 `"{工具}: H1 资本金比例 {x}% < 工具门槛，剔除"`

### 4.2 H2 抵押物合规（硬约束）

- 5 类抵押物清单：**土地使用权 / 运营权 / 收益权 / 经营权 / 收费权 / 组合**
- 抵押率（贷款额 / 抵押物估值）≤ 阈值库对应上限（土地使用权 70% / 运营权 50% / 收益权 55% / 经营权 55% / 收费权 50% / 组合 60%）
- 不通过：剔除 + 风险点

### 4.3 H3 负面清单（硬约束，仅适用政策性资金类）

- 范围：**仅「真政策性资金类工具」**（专项债 / REITs / 政策性基金 / 政策性保险资金）
- 排除：「政策性银行商业贷款」（V1 §3 L161 明确属于商业性融资）
- 不通过：剔除 + 风险点

### 4.4 H4 试点资格（硬约束，仅适用政策性资金类）

- 15 城试点完整名单：**北京 / 上海 / 江苏 / 浙江 / 安徽 / 福建 / 山东 / 湖南 / 广东 / 四川 / 雄安 / 河北 / 江西 / 湖北 / 重庆**
- 范围：同 H3（仅真政策性资金类）
- 不通过：剔除 + 风险点

### 4.5 S 软约束（综合分 = S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2）

| 编号 | 维度 | 权重 | 评分逻辑 |
|---|---|---|---|
| **S1** | 审批通过率 | 0.3【待校准】 | 历史通过率 0-100，≥80→95 / 60-80→75 / 40-60→55 / <40→35 |
| **S2** | 资金成本 | 0.3【待校准】 | 综合利率 ≤2%→95 / 2-4%→80 / 4-6%→60 / >6%→40 |
| **S3** | 期限匹配 | 0.2【待校准】 | 期限/持有年限 ≥1.0→95 / 0.8-1.0→80 / 0.6-0.8→60 / <0.6→40 |
| **S4** | 还款覆盖 (DSCR) | 0.2【待校准】 | DSCR ≥1.5→95 / 1.2-1.5→80 / 1.0-1.2→60 / <1.0→40 |

> 4 维权合计 = 0.3 + 0.3 + 0.2 + 0.2 = **1.0**【待校准】
> DSCR = (基准租金 × 可租赁面积 × 12) / 年还款额（年还款按等额本息估算）

---

## 5. 判定层（匹配 → 校验 → 组装 三步）

### Step 1 匹配（候选池生成）
sandbox 内 `execute_sql("finance_products")` 拉取全表，作为候选池。

### Step 2 校验（H 剔除 + S 评分）
H1 → H2 → H3 → H4 顺序逐项校验，任一不通过即剔除；剩余工具进入 S1-S4 评分。

### Step 3 组装（综合分排序 + 灯色）
- 综合分 = S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2（round 1 位小数）
- 按综合分降序排序
- 灯色判定：
  - `0 工具` → **red**
  - `工具数 ≥ 1 但覆盖率 < 0.7` → **yellow**
  - `覆盖率 ≥ 0.7` → **green**
- 覆盖率 = `Σ(工具 max_loan_ratio) / 1.0`（capped 1.0）

---

## 6. 结论层输出 schema (V2)

```json
{
  "agent": "agent3-多元融资",
  "灯色": "red | yellow | green",
  "可适用融资工具清单": [
    {
      "工具名称": "专项债 - 自审自发",
      "资金成本": "综合利率 2.8%",
      "期限": "20 年",
      "审批通过率": "S1=75",
      "综合分": 84.5
    }
  ],
  "推荐资金组合": "专项债 30% + 银行开发贷 50% + 自有资金 20%, 综合利率 3.4%",
  "关键审批风险点": [
    "信托融资: H1 资本金比例 22% < 工具门槛 30%, 剔除",
    "银行开发贷 - 商业银行 期限匹配 评分 40 < 60, 存在风险"
  ],
  "依据": [
    "融资产品库 (libsql)",
    "抵押率阈值表 (libsql)",
    "负面清单 (libsql)",
    "15 城试点 (libsql)"
  ],
  "建议动作": "终止 | 条件推进 | 可推进",
  "_calc": {
    "engine": "libsql-direct | libsql-fallback-json",
    "scripts_version": "V2",
    "data_version": "2026-08-08",
    "libsql_available": true,
    "candidate_count": 4,
    "coverage_ratio": 1.0
  }
}
```

**字段约束**：
- `agent` MUST = `"agent3-多元融资"`
- `灯色` MUST ∈ {`red`, `yellow`, `green`}（小写枚举）
- `建议动作` MUST 与 `灯色` 一致：red→终止 / yellow→条件推进 / green→可推进
- `可适用融资工具清单` 在 red 时 = `[]`；yellow / green 时 ≥ 1 条
- `综合分` MUST = `round(S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2, 1)`，不得心算
- `_calc.engine` MUST ∈ {`"libsql-direct"`, `"libsql-fallback-json"`}（V2 sandbox 溯源）

---

## 7. 失败 / 降级路径

| 编号 | 场景 | 处理 |
|---|---|---|
| **F1** | sandbox 不可用（probe 失败 3 次） | 输出降级对象 `{"agent": "agent3-多元融资", "_calc": {"engine": "fallback-v1-llm"}, "灯色": null, "降级原因": "sandbox 不可用，禁止 LLM 心算"}`。**禁止 LLM 心算替代 sandbox**。 |
| **F2** | sandbox 启动成功但 import 失败 | 重试 1 次（重写文件 + 验证）；仍失败 → F1 降级 |
| **F3** | libSQL 不可用（HTTP 5xx / 网络超时） | sandbox 自动 fallback `references/*.json`，`_calc.engine = "libsql-fallback-json"`，标 WARN 不阻断 |
| **F4** | 用户输入字段缺失（如 `capital_ratio` 未提供） | 输出降级清单 `{"状态": "降级人工填报", "缺失字段": [...]}`，禁止猜测 |
| **F5** | 抵押物类型不在 5 类 | 该工具 H2 不通过，剔除 + 风险点 |
| **F6** | 综合分出现并列 | 按工具优先级（政策性资金 > 银行贷款 > 信托 > 其他）拆解 |
| **F7** | agent1 / agent2 输出缺失 | 不阻断（agent3 主要依赖用户 inputs + libSQL），在依据中标注「下游 agent 输出缺失」 |

---

## 8. 关键约束（self-check）

每次输出前 MUST 自检（V2 sandbox 强制校验，但 LLM 也须心知）：

- [ ] 是否调用了 sandbox `finance_tools.evaluate()`？跳过 → 失败
- [ ] 是否按 H1 → H2 → H3 → H4 顺序跑了全部 4 道硬约束？跳过任一 → 失败
- [ ] H 是否优先于 S？（被 H 剔除的工具不得进入 S 评分）
- [ ] 综合分公式是否严格 `S1×0.3 + S2×0.3 + S3×0.2 + S4×0.2`？（round 1 位小数）
- [ ] DSCR 公式是否严格 `(基准租金 × 可租赁面积 × 12) / 年还款额`？
- [ ] 灯色与候选工具数 / 覆盖率是否自洽？（0 工具 → red / 覆盖率 < 0.7 → yellow / 覆盖率 ≥ 0.7 → green）
- [ ] `灯色` 字段是否是 `red/yellow/green` 小写枚举？
- [ ] `建议动作` 是否与 `灯色` 一致？
- [ ] `关键审批风险点` 在 red / yellow 时是否 ≥ 1 条？
- [ ] `_calc.engine` 是否在输出中？（`libsql-direct` 或 `libsql-fallback-json`）
- [ ] 是否避免越权？（MUST NOT 输出 IRR/NPV/回收期 → agent4；MUST NOT 输出政策条款 → agent2；MUST NOT 输出顶层灯 → agent6）

任一项不达标 → skill failure，必须重跑 sandbox。

---

## 9. references/ 子目录索引

```
skills/agent3-多元融资/references/
├── finance_products.json         # 6 个融资工具（专项债/REITs/政策性银行/商业银行/保险资金/信托）
├── mortgage_thresholds.json      # 5 类抵押物 × 抵押率阈值
├── negative_list.json            # 政策性资金负面清单（8 条样本）
├── pilot_cities.json             # 15 城试点完整名单
└── industry_thresholds.json      # 业态门槛基准（与 agent4 / agent6 共享）
```

> 这些 JSON 仅在 libSQL 不可用时作为 fallback；正常路径下数据来自 libSQL 数据库。

---

## 10. 与下游 / 上游 agent 的衔接

**上游（强依赖）**：
- agent1（业主资质 / 物理参数 / 业态方向 / 文保约束 / 改造模式）
- agent2（可适用政策清单 / 试点城市资格判定）
- 用户输入（总投资 / 持有年限 / 退出策略 / 资本金比例 / 抵押物类型 / 抵押物估值 / 基准租金 / 可租赁面积）

**下游**：
- agent4 财务模型（消费 agent3 的「推荐资金组合」作为融资结构输入）
- agent6 双层决策（消费 agent3 的「灯色」作为投资拓展维度子灯输入 + `_calc.engine` 作为聚合引擎溯源）
- super-skill 编排器（消费 `agent_output` SSE event）

---

**版本**：V2（2026-08-08）
**锚点**：V1 §3（L111-198）+ implementation-plan Task 5
**前一版**：`SKILL-V1.md`（保留留底）
**行数**：约 290 行（< 500 行上限）
**校准状态**：S1-S4 权重 0.3/0.3/0.2/0.2【待校准】；覆盖率阈值 0.7【待校准】
**sandbox 资产**：`scripts/finance_tools.py`（V2 新增）+ `references/*.json` × 5（V2 新增 fallback）
