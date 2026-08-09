# agent5 失败案例 V2 · 意图捕获文档（intent-V2.md）

> 本文件对应 agent5-失败案例 V2 的 skill-creator 阶段 1「意图捕获」。
> V2 关键变更：相似度计算 + 失败模式归因 从 LLM 心算下沉到 EdgeOne sandbox Python `case_matcher.py`；案例库从 LLM 上下文心算改为 sandbox 直连 libSQL `case_library` 表（HTTP `/v2/pipeline`）。
> V1 intent.md（2026-08-05）保留为 `intent-V1.md`，本文件为 V2 增量，按 CLAUDE.md 不覆盖原文件。

---

## 0. 文档定位与范围

intent-V2.md 是 V2 的「意图契约」，面向 skill-creator 捕获问卷（4 项：做什么 / 何时触发 / 输出格式 / 失败降级）。V1 §1-7 的契约保留，本文件仅记录 V2 增量与变更点。

| 项 | V1 → V2 |
|---|---|
| 算法位置 | LLM 心算 → sandbox `case_matcher.py` |
| 案例库数据源 | LLM 上下文 → sandbox 直连 libSQL `case_library` 表（fallback references/case_library.json） |
| 输出 `_calc` | 无 → `{engine, data_version, kernel_session}` |
| 失败降级 | 仅 H1 降级 → 新增 F1 沙箱不可用 / F8 libSQL 查询失败 / F15 案例库被篡改 |

---

## 1. 做什么（What）— V2 增量

### 1.1 V1 不变部分

V1 intent.md §1.1-1.7 的核心任务定义、5 类失败模式分段（招商失败 / 退出受阻 / 改造超预算 / 业态误判 / 施工引发周边协调失败）、业态门槛联动、上下文依赖、输出契约边界，V2 全部保留，不重复抄录。

### 1.2 V2 算账执行位置变更

| 项 | V1 | V2 |
|---|---|---|
| 6 维特征向量构造 | LLM 心算 | `sandbox.runCode('from case_matcher import match; ...', {language:'python'})` |
| 余弦相似度计算 | LLM 心算 | `case_matcher._cosine_sim` 实现 |
| Top3 排序 | LLM 心算 | `case_matcher.match()` 返回 |
| 失败模式归因 | LLM 心算 | `case_matcher._classify_failure` 实现 |
| 高危触发判定 | LLM 心算 | `case_matcher._check_high_risk` 实现 |
| 案例库查询 | LLM 上下文 | `libsql_client.query_cases(features, top_k=10)` |

### 1.3 V2 新增文件清单（与 V1 共存）

- `scripts/case_matcher.py`（主入口 `match()`）
- `scripts/libsql_client.py`（共享模块，agent3/agent5 自己 Step 0 bootstrap 注入到 `/tmp/finance/`，不再依赖 prepareSandbox）
- `references/failure_modes.md`（5 类失败模式定义 × 高危触发条件，静态规则文档）
- `references/similarity_weights.md`（6 维权重 + 硬匹配维度配置，静态规则文档）
- `references/case_library.json`（libSQL 查询失败时的 fallback 案例库，覆盖 5 类失败模式 × 不同 region/industry，建议 15-30 条样本）

### 1.4 V2 sandbox 数据源策略

按 `2026-08-08-libSQL-接口缺口分析.md` §2.5：

```
项目特征对象（region / industry / scale / property_type / physical_params / financing）
    ↓
libsql_client.query_cases(features, top_k=10)
    ↓ 内部执行 execute_sql("case_library", where={region, industry}, limit=200)
Top-K 候选案例（已做 SQL 预筛 region + industry）
    ↓
case_matcher._similarity(project, case)
    ↓ 6 维加权相似度（scale / property_type / physical_params / financing 4 维软加权 + region/industry 已硬匹配）
scored 案例列表
    ↓
Top3 + 失败模式归因 + 高危触发判定
    ↓
校验灯 + Top3 + 失败模式 + 规避建议（schema 输出）
```

---

## 2. 何时触发（When）— V2 不变

V1 intent.md §2 触发关键词族（失败案例校验 / 失败模式归因 / 相似案例检索）、前置条件 C1-Cn、should-not-trigger near-miss 全部保留。V2 触发逻辑不变。

---

## 3. 输出格式（How / Output Schema）— V2 增量

### 3.1 V1 schema 保留

V1 intent.md §3.1 的 JSON schema 字段（`agent` / `校验灯` / `Top3案例` / `根因重现判断` / `命中判据` / `规避建议` / `案例库依据` / `关键假设`）全部保留，V2 仅追加 `_calc` 字段。

### 3.2 V2 新增 `_calc` 字段

```json
{
  ...V1 schema...,
  "_calc": {
    "engine": "case-matcher-v2 | libsql-fallback | unavailable | sandbox_error | timeout-at-30s | not-invoked",
    "data_version": "2026-08-08",
    "kernel_session": "injected_by_sandbox | null",
    "candidates_count": 0
  }
}
```

`_calc.engine` 取值映射：

| engine 值 | 含义 | 校验灯倾向 |
|---|---|---|
| `case-matcher-v2` | libSQL 直连查询成功 + 6 维相似度计算成功 | 正常 red/yellow/green |
| `libsql-fallback` | libSQL 查询失败，fallback `references/case_library.json` | 正常 + WARN 提示数据可能滞后 |
| `unavailable` | 沙箱冷启动失败（F1） | red（保守）+ 降级对象 |
| `sandbox_error` | runCode 返回 error（F13） | red（保守）+ 降级对象 |
| `timeout-at-30s` | runCode 30s 未返回（F4） | yellow（保守）+ 降级对象 |
| `not-invoked` | 上游字段缺失，未进入主流程（F6/F7） | red + 降级清单 |

### 3.3 输出示例（V2 完整流水线 — H1 命中招商失败）

```json
{
  "agent": "agent5-失败案例",
  "校验灯": "red",
  "Top3案例": [
    {
      "case_id": "case-2024-001",
      "相似度": 0.85,
      "失败模式": "招商失败",
      "根因": "可租赁面积 3000㎡ 低于商业业态最低门槛 5000㎡，区位客流评级 D 级"
    }
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
  "_calc": {
    "engine": "case-matcher-v2",
    "data_version": "2026-08-08",
    "kernel_session": "injected_by_sandbox",
    "candidates_count": 7
  }
}
```

---

## 4. 失败/降级路径（Failure & Degradation）— V2 扩展

### 4.1 V1 失败路径保留

V1 intent.md §4 的 H1 字段缺失 / 案例库不可访问 / Top3 为空 / 根因映射置信度低等场景全部保留。

### 4.2 V2 新增失败路径

| 失败节点 | 触发条件 | 处理 |
|---|---|---|
| F1 沙箱不可用 | `mcp__edgeone__commands ls /tmp` 三次失败 | 输出降级对象，`_calc.engine="unavailable"`，禁止 LLM 心算相似度 |
| F4 计算超时 | runCode 30s 未返回 | 输出部分降级对象，`_calc.engine="timeout-at-30s"`，校验灯默认 yellow（保守） |
| F8 libSQL 查询失败 | `libsql_client.query_cases` 抛 RuntimeError 或 HTTP 4xx/5xx | 自动 fallback `references/case_library.json`；`_calc.engine="libsql-fallback"`；输出 WARN 提示数据可能滞后 |
| F13 sandbox_error | runCode 返回 error | 输出降级对象，`_calc.engine="sandbox_error"` |
| F15 案例库被篡改 | case_library.json 总条数 < 5 或字段缺失 | case_matcher 启动 assert 校验，触发即停 |

---

## 5. 关键假设清单（V2 新增 _calc 元信息）

V1 intent.md §5 全部保留。V2 在每个输出对象的 `_calc` 字段中标注算法引擎与数据版本，便于 agent6 翻译与审计追溯。

| 假设项 | V1 锚定值 | V2 处置 |
|---|---|---|
| S1 权重 | 0.6（V1 §5 L287-288） | 落地为 case_matcher.py 配置，不动 |
| S2 权重 | 0.4（V1 §5 L287-288） | 落地为 case_matcher.py 配置，不动 |
| 相似度纳入阈值 | 0.4 | 落地为 case_matcher.py 配置 |
| 高相似度阈值 | 0.7 | 落地为 case_matcher.py 配置 |
| 改造超预算阈值 | 1.5× 基准 | 落地为 failure_modes.md 静态规则 |
| 业态门槛基准 | 商业 8-12% / 办公 6-9% / 文旅 7-10% | 来自 agent4，agent5 仅消费 |

---

## 6. 与 agent6 的契约（V2 修订）

agent5 V2 输出比 V1 多 `_calc` 字段。agent6 双层决策红绿灯修订规则：

| `_calc.engine` | 校验灯 | agent6 子灯 |
|---|---|---|
| case-matcher-v2 | red | red（设计咨询维度强风险） |
| case-matcher-v2 | yellow | yellow（条件推进） |
| case-matcher-v2 | green | green / yellow（取决于 agent1） |
| libsql-fallback | red | red + 列入条件推进「案例库需刷新」 |
| libsql-fallback | yellow | yellow + 列入条件推进 |
| unavailable / sandbox_error | * | red（agent5 失败，保守） |
| timeout-at-30s | * | yellow + 列入条件推进 |
| not-invoked | * | 跟随 V1 逻辑 |

---

## 7. 版本注记

| 项 | 值 |
|---|---|
| 版本 | V2（2026-08-08） |
| 上一版 | intent-V1.md（2026-08-05） |
| 写作依据 | V1 §5 L254-295 + `2026-08-08-super-skill-implementation-plan.md` Task 6 + `2026-08-08-libSQL-接口缺口分析.md` §2.5 |
| 下游消费 | agent6 双层决策红绿灯（V2 含 `_calc.engine` 字段） |
| 上游依赖 | agent1（物理参数 + 业态方向 + 文保约束）+ agent3（融资结构）+ agent4（IRR/业态门槛对照）+ EdgeOne sandbox（Python runtime + libsql_client.py） |
| 校准状态 | S1 权重 0.6 / S2 权重 0.4【待校准】；5 类失败模式边界【待校准】；6 维相似度权重【待校准】 |
| 修订规则 | 遵循 CLAUDE.md：V2 不被覆盖，后续修订另存 intent-V3.md |
| 路径约束 | 本 skill 仅引用 `skill集群/skills/agent5-失败案例/`，禁止引用 `/Users/huangzetao/.claude/skills/agent5`（项目内不全局安装） |
