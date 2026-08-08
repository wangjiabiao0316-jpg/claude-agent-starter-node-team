# agent4 通用财务模型 V2 · 意图捕获文档（intent-V2.md）

> 本文件对应 agent4-财务模型 V2 的 skill-creator 阶段 1「意图捕获」。
> V2 关键变更：算账执行从 LLM 心算下沉到 EdgeOne sandbox Python finance.py。
> V1 intent.md（2026-08-05）不动，本文件为 V2 增量。

---

## 0. 文档定位与范围

intent-V2.md 是 V2 的「意图契约」，面向 skill-creator 捕获问卷（4 项：做什么 / 何时触发 / 输出格式 / 失败降级）。V1 的所有契约保留，本文件仅记录 V2 增量。

---

## 1. 做什么（What）— V2 增量

### 1.1 V1 不变部分

V1 intent.md §1.1-1.5 的核心任务定义、流水线分段（H1/H2/S1-S4）、业态门槛基准、上下文依赖、输出契约边界，V2 全部保留，不重复抄录。

### 1.2 V2 算账执行位置变更

| 项 | V1 | V2 |
|---|---|---|
| IRR / NPV / 回收期 / 敏感性 计算 | LLM 心算 | `sandbox.runCode('from finance import analyze; ...', {language:'python'})` |
| 业态门槛 lookup | SKILL.md 硬编码表 | `references/thresholds.json` + `industry_thresholds.py` 读取 |
| 输出 `_calc` 元信息 | 无 | `{engine, scripts_version, kernel_session, numpy_financial_version}` |

### 1.3 V2 新增文件清单（与 V1 共存）

- `scripts/finance.py`（主入口 `analyze()`）
- `scripts/cashflow.py`（S1/S2/S3 构造）
- `scripts/industry_thresholds.py`（门槛 lookup + judge）
- `scripts/requirements.txt`（numpy-financial>=0.9,<2.0）
- `references/thresholds.json`（业态门槛数据源）

---

## 2. 何时触发（When）— V2 不变

V1 intent.md §2 触发关键词、前置条件、near-miss 全部保留。V2 触发逻辑不变。

---

## 3. 输出格式（How / Output Schema）— V2 增量

### 3.1 V1 schema 保留

V1 intent.md §3.1 的 JSON schema 字段顺序与类型全部保留。

### 3.2 V2 新增 `_calc` 字段

```json
{
  ...V1 schema...,
  "_calc": {
    "engine": "numpy-financial | python-bisection | unavailable | timeout-at-30s | sandbox_error | not-invoked",
    "numpy_financial_version": "0.9.x | null",
    "scripts_version": "V2",
    "kernel_session": "injected_by_sandbox | null"
  }
}
```

`_calc.engine` 取值映射：
- `numpy-financial`：sandbox 跑通且 numpy-financial 可用
- `python-bisection`：sandbox 跑通但 numpy-financial 装失败，二分法兜底
- `unavailable`：沙箱冷启动失败（F1）
- `sandbox_error`：runCode 返回 error（F13）
- `timeout-at-30s`：runCode 30s 未返回（F4）
- `not-invoked`：H2 数据缺失，未进入 S1-S4（F6/F7/F12）

### 3.3 输出示例（V2 完整流水线）

参见 `evals/fixtures/eval-6-full-pipeline.json` 的 `expected` 字段。

---

## 4. 失败/降级路径（Failure & Degradation）— V2 扩展

### 4.1 V1 失败路径保留

V1 intent.md §4.1（H1 文保）、§4.2（H2 数据缺失）、§4.3（库缺失）全部保留。

### 4.2 V2 新增失败路径

参见 `2026-08-08-agent4-财务模型-V2-design.md` §4.1 完整失败矩阵（F1-F15）。关键 V2 增量：

| 失败节点 | V1 是否覆盖 | V2 处理 |
|---|---|---|
| F1 沙箱不可用 | 否 | 输出降级对象，`_calc.engine="unavailable"`，禁止 LLM 心算 |
| F3 pip install 失败 | 否 | finance.py try import 兜底二分法，`_calc.engine="python-bisection"` |
| F4 runCode 超时 | 否 | 输出部分降级对象，`_calc.engine="timeout-at-30s"` |
| F8 业态不在门槛表 | 否 | finance.py 捕获 KeyError，达标结论=无法判定 |
| F9 IRR 不收敛 | 否 | 二分法兜底无解，IRR=null |
| F13 sandbox_error | 否 | 输出降级对象，`_calc.engine="sandbox_error"` |
| F15 门槛数据被篡改 | 否 | finance.py assert 校验，触发即停 |

---

## 5. 关键假设清单（V2 新增 _calc 元信息）

V1 intent.md §5 全部保留。V2 在每个输出对象的 `_calc` 字段中标注算法引擎，便于 agent6 翻译与审计追溯。

---

## 6. 与 agent6 的契约（V2 修订）

agent4 V2 输出比 V1 多 `_calc` 字段。agent6 双层决策红绿灯修订规则：

| `_calc.engine` | 业态门槛对照.达标结论 | agent6 子灯 |
|---|---|---|
| numpy-financial | 优 | 绿（agent3 也绿时） |
| numpy-financial | 达标 | 黄 |
| numpy-financial | 不达标 | 红 |
| python-bisection | * | 黄（强制，标 IRR 算法兜底） |
| timeout-at-30s | * | 黄 + 列入条件推进 |
| unavailable / sandbox_error | * | 红（agent4 无法测算） |
| not-invoked（H2 失败） | * | 跟随 V1 逻辑 |

---

## 7. 版本注记

| 项 | 值 |
|---|---|
| 版本 | V2（2026-08-08） |
| 上一版 | V1 intent.md（2026-08-05） |
| 写作依据 | V1 §4 L200-252 + `2026-08-08-agent4-财务模型-V2-design.md` |
| 下游消费 | agent6 双层决策红绿灯（V2 含 `_calc.engine` 字段） |
| 上游依赖 | agent1（物理参数 + 业态方向 + 文保约束）+ agent3（融资结构）+ EdgeOne sandbox（Python runtime + numpy-financial） |
| 校准状态 | 业态门槛基准三组数值【待校准】 |
| 修订规则 | 遵循 CLAUDE.md：V2 不被覆盖，后续修订另存 intent-V3.md |
