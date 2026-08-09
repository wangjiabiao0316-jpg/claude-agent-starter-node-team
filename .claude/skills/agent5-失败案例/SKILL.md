---
name: agent5-失败案例
description: MUST follow agent5 失败案例校验规则；H1 5 类高危模式任一命中 → red；S1×0.6 + S2×0.4 综合分（S1=6 维加权相似度，S2=失败模式归因分）；sandbox 必须调 libsql_client.query_cases 拉取 Top3；不得心算相似度（LLM 倾向给虚高 0.85+ 分）
---

# 通用失败案例 agent5（V2：sandbox 执行）

## 触发条件

- 用户或编排器请求"失败案例校验" / "失败模式归因" / "相似案例检索"
- 前置：agent1（产权/物理参数/业态方向/文保约束/改造模式）+ agent3（融资结构/期限/抵押物）+ agent4（IRR/业态门槛对照）输出已就绪
- 任何失败案例/风险校验类问题必须主动调用本 skill，不得自行编造案例或跳过 5 类失败模式校验

## ⛔ 硬规则（违反即失败）

1. **禁止 LLM 心算 6 维加权相似度** —— 必须 `case_matcher.match()` 输出
2. **禁止 LLM 自己读案例库编造 Top3** —— 必须 `libsql_client.query_cases(features, top_k=10)` 拉取候选
3. **禁止 LLM 自己判断失败模式归因** —— 必须 `case_matcher._classify_failure` 输出
4. **禁止 LLM 自己跑 Top3 排序** —— 必须 `case_matcher.match()` 返回 Top3
5. **sandbox 不可用时禁止 LLM fallback 心算** —— 必须输出降级对象
6. **5 类失败模式定义（招商失败 / 退出受阻 / 改造超预算 / 业态误判 / 施工引发周边协调失败）措辞不得修改**（来源 V1 §5 L281-285）

## 工作流（严格按顺序）

### H1 高危模式命中（硬约束，LLM 心算允许 — 由 case_matcher 复核）

- **输入**：项目特征对象（产权/业态/规模/区域/物理参数/融资结构/IRR/文保约束）
- **判据**：当前项目特征命中 5 类失败模式任一高危触发条件 → 校验红灯
- **5 类失败模式触发条件（V1 §5 L281-285 逐字保留）**：

| 失败模式 | 标准化定义与高危触发条件（逐字） |
|---|---|
| **招商失败** | 招商失败：招商前置条件缺失（可租赁面积不足 / 区位客流薄弱） |
| **退出受阻** | 退出受阻：退出策略与融资期限 / 资产属性不匹配，路径不清晰 |
| **改造超预算** | 改造超预算：文保或结构硬约束高，改造模式受限致成本失控 |
| **业态误判** | 业态误判：业态方向 IRR 低于业态门槛基准下限 |
| **施工引发周边协调失败** | 施工引发周边协调失败：周边协调条件复杂（文保周边 / 密集区） |

- **高危触发示例**（与上表一一对应）：
  - 招商失败高危：可租赁面积 < 业态最低门槛 / 区位客流评级 < D 级
  - 退出受阻高危：融资期限与持有年限严重错配 / 资产属性禁止 REITs 退出
  - 改造超预算高危：文保核心保护区 + 改造模式被迫收敛致成本 > 1.5× 基准
  - 业态误判高危：IRR < 业态门槛基准下限（如商业 < 8% / 办公 < 6% / 文旅 < 7%）
  - 施工引发周边协调失败高危：文保周边 / 密集区施工扰动评估为高风险

### Step 0: Sandbox 资产（自动预写，LLM 不需 Read/Write）

`agents/chat/_tools.ts` 的 `prepareSandbox` 已自动预写以下文件到 sandbox，LLM 直接使用即可：

| sandbox 路径 | 用途 |
|------------|------|
| `/tmp/finance/case_matcher.py` | 案例匹配主模块（match 函数） |
| `/tmp/finance/references/case_library.json` | 失败案例库 |
| `/tmp/finance/references/failure_modes.md` | 5 类失败模式定义 |
| `/tmp/finance/references/similarity_weights.md` | 相似度权重 |
| `/tmp/finance/libsql_client.py` | libSQL HTTP 客户端（shared） |

LLM 直接：
- `from case_matcher import match` 或 `import case_matcher`
- `import json; cases = json.load(open('/tmp/finance/references/case_library.json'))`
- `from libsql_client import libsql_client`

LIBSQL_URL / LIBSQL_RO_TOKEN 由 `prepareSandbox` 自动 export 到 sandbox env，无需手动注入。

**禁止**：
- 调用 `Read({file_path: "/Users/..."})` —— 沙箱无法访问本机路径
- 调用 `mcp__edgeone__files_write(...)` —— 文件已预写
- 估算 / 心算 / fallback —— 必须用 sandbox 数据
- 跳过 sandbox 直接 `print("相似度 ≈ ...")` —— 触发降级

> 如 sandbox 启动异常（`ls /tmp/finance/` 三次失败），直接进入 F1 降级路径，输出 `_calc.engine="unavailable"`。

### Step 1: 立即执行 match() 主入口（Step 0 完成后必须立即调用，不得思考、不得确认、不得 fallback）

完成 Step 0（0.1-0.5 全部验证通过）后，**立即**调用 `mcp__edgeone__code_interpreter` 工具，language="python"，code=下面模板（替换 `[]` 占位为用户输入实际数值）。**不得在 Step 0 与 Step 1 之间插入任何额外 thinking / 确认 / 总结 / 探索。**

```python
import sys, json
sys.path.insert(0, '/tmp/finance')
from case_matcher import match

result = match(
    region="[项目区域，如 上海/北京/深圳]",
    industry="[业态方向，如 商业/办公/文旅]",
    scale=[可租赁面积，整数，单位 ㎡],
    property_type="[产权类型，如 独立产权商业空间/其他]",
    physical_params={
        "文保等级": "[核心保护/建控地带/无文保]",
        "结构类型": "[框架/剪力墙/砖混]",
        "改造模式": "[拆除重建/保留微更新/混合]"
    },
    financing={
        "融资期限": [年限],
        "持有年限": [年限],
        "退出策略": "[REITs/散售/整体转让]"
    },
    agent1={
        "产权": "...",
        "物理参数": {...},
        "业态方向": "...",
        "文保约束": "...",
        "改造模式": "..."
    },
    agent3={
        "融资结构": {...},
        "期限": ...,
        "抵押物": "..."
    },
    agent4={
        "IRR": [百分比数值，如 7.0],
        "业态门槛对照": {"达标结论": "达标/不达标/优"}
    }
)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

**禁止行为**（违反即失败）：
- 不得自己心算 6 维加权相似度数值
- 不得在 Step 1 之前再次确认 Step 0 是否完成
- 不得因「数据可能不准」「输入可能不对」而跳过 `match()` 调用
- 不得在 `match()` 返回前结束响应
- 不得用 `print("相似度 ≈ ...")` 等估算输出代替真实 `match()` 调用
- 不得在 Step 1 中重复执行 Step 0 的 bootstrap（文件已写入，直接调用）

**返回结果处理后**：
1. 把 `result` JSON 原样组装为输出 schema（**不要修改任何数值**）
2. 加 `_calc` 字段（来自 `result._calc`，含 `engine` / `data_version` / `candidates_count`）
3. 按下面「输出 schema」章节结构化后发给用户
4. 如 `match()` 抛异常 → 进入 F4 降级（见下降级路径表）

> **执行约束**：Step 0 → Step 1 必须连续。Step 0 完成后你的下一个工具调用必须是上面的 `match()` Python 代码。如发现自己即将结束响应或返回纯文本结论，**立即**改为调用 Step 1。

---

## 判定层（红/黄/绿规则）

- **H1 命中高危** → 校验**红**（强风险信号，**作为 agent6 关键输入，不直接终止**后续测算）
- **Top3 存在高相似度案例（≥ 0.8）且根因在当前项目重现** → 校验**黄**
- **无高危且相似案例根因已被前置 agent 规避** → 校验**绿**

> 关键约束：agent5 不直接终止后续 agent 流水线。红灯信号作为 agent6 双层决策红绿灯（设计咨询维度子灯）的关键输入。agent6 决定是否终止。

---

## 输出 schema

```yaml
校验信号对象:
  agent: agent5-失败案例
  校验灯: red | yellow | green
  Top3案例:
    - case_id: string
      相似度: float          # 0-1
      失败模式: enum         # 招商失败/退出受阻/改造超预算/业态误判/施工引发周边协调失败
      根因: string
  根因重现判断: bool
  命中判据:
    H1_高危模式: enum | null  # 5 类失败模式之一；未命中高危时为 null
    S1_相似度分: float        # Top3 中最高相似度
    S2_归因分: float          # 根因映射置信度（0-1）
  规避建议: string
  依据: [失败模式定义库, 案例库]
  关键假设: "【待校准】"     # 显式列出权重 0.6/0.4、相似度阈值、5 类边界等
  _calc:
    engine: case-matcher-v2 | libsql-fallback | unavailable | sandbox_error | timeout-at-30s | not-invoked
    data_version: "2026-08-08"
    candidates_count: int
```

H1 命中高危时 `校验灯=red`、`H1_高危模式` 必填；未命中时 `H1_高危模式=null`，由 S1/S2 决定黄/绿。

---

## 输出示例

### 示例 1：H1 命中招商失败高危 + sandbox 直连 libSQL 成功

```json
{
  "agent": "agent5-失败案例",
  "校验灯": "red",
  "Top3案例": [
    {"case_id": "case-2024-001", "相似度": 0.85, "失败模式": "招商失败", "根因": "可租赁面积 3000㎡ 低于商业业态最低门槛 5000㎡，区位客流评级 D 级"}
  ],
  "根因重现判断": true,
  "命中判据": {
    "H1_高危模式": "招商失败",
    "S1_相似度分": 0.85,
    "S2_归因分": 0.90
  },
  "规避建议": "调整业态方向至对可租赁面积门槛更低的业态，或重新评估区位客流提升路径",
  "依据": ["失败模式定义库", "案例库"],
  "关键假设": "【待校准】S1 权重 0.6 / S2 权重 0.4；相似度纳入阈值 0.4；高相似度阈值 0.7",
  "_calc": {"engine": "case-matcher-v2", "data_version": "2026-08-08", "candidates_count": 7}
}
```

### 示例 2：H1 未命中 + Top3 根因不重现 → 绿灯

```json
{
  "agent": "agent5-失败案例",
  "校验灯": "green",
  "Top3案例": [
    {"case_id": "case-2023-018", "相似度": 0.62, "失败模式": "改造超预算", "根因": "文保建控地带改造模式受限"}
  ],
  "根因重现判断": false,
  "命中判据": {
    "H1_高危模式": null,
    "S1_相似度分": 0.62,
    "S2_归因分": 0.20
  },
  "规避建议": "前置 agent 已通过 H1 改造模式适配规避改造超预算风险，无需额外动作",
  "依据": ["失败模式定义库", "案例库"],
  "关键假设": "【待校准】S1 权重 0.6 / S2 权重 0.4；根因重现判断阈值",
  "_calc": {"engine": "case-matcher-v2", "data_version": "2026-08-08", "candidates_count": 12}
}
```

### 示例 3：libSQL 查询失败 → fallback references/case_library.json → 标 WARN

```json
{
  "agent": "agent5-失败案例",
  "校验灯": "yellow",
  "Top3案例": [...],
  "命中判据": {...},
  "规避建议": "...（含 WARN：libSQL 查询失败，使用 fallback 案例库，数据可能滞后）",
  "依据": ["失败模式定义库", "fallback案例库(references/case_library.json)"],
  "_calc": {"engine": "libsql-fallback", "data_version": "2026-08-08", "candidates_count": 5}
}
```

---

## 关键约束

1. **5 类失败模式措辞逐字保留**：来源 V1 §5 L279-285；定义本体不可变动
2. **权重 0.6/0.4 必须标注【待校准】**：来源 V1 §5 L287-288；本 skill 不调参
3. **不得编造案例**：Top3 必须来自 sandbox `libsql_client.query_cases` 拉取的候选或 `references/case_library.json` fallback
4. **不得跳过 5 类校验**：即使项目特征不完整，也必须按最保守假设完成 5 类校验
5. **不得直接终止后续 agent**：红灯是信号不是闸门；终止权属于 agent6
6. **输出依据必须列出引用的库**：失败模式定义库 + 案例库（libSQL 直连或 fallback）
7. **流程顺序不可调换**：Step 0 bootstrap → Step 1 match() → 解析输出
8. **降级路径必须输出缺失清单**，不得静默跳过

---

## 失败/降级路径

| 节点 | 失败条件 | 处理 |
|---|---|---|
| F1 | 沙箱不可用（`ls /tmp` 三次失败） | 输出降级对象，`_calc.engine="unavailable"`，禁止 LLM 心算相似度 |
| F4 | runCode 30s 未返回 | 输出降级对象，`_calc.engine="timeout-at-30s"`，校验灯默认 yellow |
| F6/H2 字段缺失 | 项目特征对象任一字段缺失 | 标注【待校准】，按最保守假设判灯（默认 red）+ 显式说明缺失字段 |
| F7 上游 agent 未就绪 | agent1/3/4 输出缺失 | 输出降级清单，`_calc.engine="not-invoked"` |
| F8 libSQL 查询失败 | `libsql_client.query_cases` 抛 RuntimeError | 自动 fallback `references/case_library.json`，`_calc.engine="libsql-fallback"` |
| F13 sandbox_error | runCode 返回 error | 输出降级对象，`_calc.engine="sandbox_error"` |
| F15 案例库被篡改 | case_library.json 总条数 < 5 | case_matcher 启动 assert 校验，触发即停 |
| H1 | 文保约束信息缺失 | 默认假设"文保周边密集区" + 标注【待校准】 |
| S1 | Top3 为空（无相似度 ≥ 0.4 的案例） | 仅依据 H1 判灯；`Top3案例=[]`；`S1_相似度分=0` |
| S2 | 根因映射置信度 < 0.3 | `S2_归因分` 标低值；`根因重现判断=false`；不影响 H1 红灯 |

### 降级对象 schema（F1, F13, F15）

```json
{
  "agent": "agent5-失败案例",
  "状态": "沙箱不可用 | sandbox_error | 案例库被篡改",
  "原因": "...",
  "已就绪字段": {...},
  "未执行": ["libsql_client.query_cases", "case_matcher.match"],
  "建议动作": "稍后重试；如持续失败，检查 EdgeOne 项目 sandbox 配额与 region",
  "_calc": {"engine": "unavailable", "data_version": "2026-08-08", "candidates_count": 0}
}
```

### 降级清单 schema（F6, F7）

```json
{
  "agent": "agent5-失败案例",
  "状态": "降级人工填报",
  "缺失字段": [
    {"字段名": "agent1.文保约束", "来源": "agent1", "补全建议": "..."}
  ],
  "已就绪字段": [...],
  "建议动作": "补齐缺失字段后重新触发 agent5",
  "_calc": {"engine": "not-invoked", "data_version": "2026-08-08", "candidates_count": 0}
}
```

---

## 依赖

- **上游**：
  - agent1（产权 / 物理参数 / 业态方向 / 文保约束 / 改造模式）
  - agent3（融资结构 / 期限 / 抵押物）
  - agent4（IRR / 业态门槛对照：达标/不达标）
- **前置预设库**：
  - libSQL `case_library` 表（主数据源，sandbox 直连）
  - `references/case_library.json`（fallback 案例库）
  - `references/failure_modes.md`（5 类失败模式定义 × 高危触发条件）
  - `references/similarity_weights.md`（6 维权重 + 硬匹配维度配置）
  - 业态门槛基准（来自 agent4）
- **下游**：agent6 双层决策红绿灯（设计咨询维度子灯 = agent1 固有对象灯 + agent5 失败案例校验灯）

---

## 版本注记

- **版本**：V2（2026-08-08）
- **上一版**：SKILL-V1.md（2026-08-05，保留留底）
- **依据**：V1 §5 L254-295 + `2026-08-08-super-skill-implementation-plan.md` Task 6 + `2026-08-08-libSQL-接口缺口分析.md` §2.5
- **数据来源**：libSQL `case_library` 表（主）+ references/case_library.json（fallback）
- **下游消费**：agent6 双层决策红绿灯（V2 含 `_calc.engine` 字段）
- **校准状态**：S1 权重 0.6 / S2 权重 0.4【待校准】；5 类失败模式边界【待校准】；6 维相似度权重【待校准】
- **路径约束**：本 skill 仅引用 `skill集群/skills/agent5-失败案例/`，禁止引用 `/Users/huangzetao/.claude/skills/agent5`（项目内不全局安装）
- **修订规则**：遵循 CLAUDE.md：V2 不被覆盖，后续修订另存 SKILL-V3.md
