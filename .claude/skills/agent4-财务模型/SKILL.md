---
name: agent4-财务模型
description: 必须主动调用本 skill，通过 EdgeOne sandbox 执行 Python finance.py 计算 IRR/NPV/回收期/敏感性 并对照业态门槛基准（商业 8-12% / 办公 6-9% / 文旅 7-10%）。任何算账型问题禁止 LLM 自行估算数值，必须调用 sandbox.runCode。
---

# 通用财务模型 agent4（V2：sandbox 执行）

## 触发条件

- 用户问 IRR / NPV / 回收期 / 敏感性 / 算账 / 测算 / 投不投
- 前置：融资结构（agent3 输出）已就绪；如 agent3 红灯则进入 F7 降级
- 算账型问题必须主动调用本 skill

## ⛔ 硬规则（违反即失败）

1. **禁止 LLM 心算 IRR / NPV / 回收期 / 敏感性 数值**
2. **禁止 LLM 自己读 references/thresholds.json** —— 必须由 industry_thresholds.py 读
3. **禁止 LLM 自己判断业态门槛达标结论** —— 必须由 industry_thresholds.judge() 输出
4. **禁止 LLM 自己跑 S1 收入 / S2 成本 / S3 现金流 的算术**
5. **sandbox 不可用时禁止 LLM fallback 心算** —— 必须输出降级对象
6. **业态门槛基准三组数值（商业 8-12% / 办公 6-9% / 文旅 7-10%）不得修改**

## 工作流（严格按顺序）

### H1 改造模式适配（硬前置，LLM 心算允许）

LLM 根据物理参数 + 业态方向 + 文保约束判定模式：
- 文保强制保留 → 模式 = `保留微更新`，标注「文保受限」
- 文保非强制 + 物理参数允许 → `拆除重建` / `混合`（依据经济性）
- 文保信息缺失 → 默认 `混合` + 标注【待校准】

### H2 数据完整性（硬约束，LLM 心算允许）

LLM 校验必填字段：
1. 月租金（元 / ㎡，>0）
2. 可租赁面积（㎡，>0）
3. 融资结构（来自 agent3）
4. 建安成本基准（来自前置预设库）
5. 业态方向（商业 / 办公 / 文旅）
6. 出租率（0-1）
7. 持有年限（1-50）
8. exit_cap_rate（0-0.3）
9. discount_rate（0-0.5）

任一缺失或非法 → F6/F12 降级（输出降级清单，**禁止进入 S1-S4**）。

### Step 0: Bootstrap sandbox（每次会话首次调用前必须执行，不得跳过）

> **强制指令**：LLM 必须按以下步骤执行，**不得跳过、不得估算、不得 fallback、不得心算**。沙箱（EdgeOne code_interpreter）是独立环境，**无法直接访问本机 `/Users/...` 路径**，必须通过 `Read` + `mcp__edgeone__files_write` 把 4 个文件中转写入 `/tmp/finance/`。**未完成 Step 0 不得进入 S1-S4。**

#### 0.1 读取 4 个源文件（用 Read 工具，路径绝对路径）

LLM 必须依次调用 `Read` 工具读取以下 4 个文件（**不得使用 mcp__edgeone__files_list / mcp__edgeone__files_read，因为沙箱无法访问本机路径**）：

```
Read({ file_path: ".claude/skills/agent4-财务模型/scripts/finance.py" })
Read({ file_path: ".claude/skills/agent4-财务模型/scripts/cashflow.py" })
Read({ file_path: ".claude/skills/agent4-财务模型/scripts/industry_thresholds.py" })
Read({ file_path: ".claude/skills/agent4-财务模型/references/thresholds.json" })
```

读取后必须将每个文件的**完整源码内容**保存在 LLM 上下文里，准备传给 files_write。

#### 0.2 写入沙箱（用 mcp__edgeone__files_write 工具）

LLM 必须依次调用 `mcp__edgeone__files_write` 工具把 4 个文件内容写到沙箱 `/tmp/finance/`：

```
mcp__edgeone__files_write({
  path: "/tmp/finance/finance.py",
  content: "<Step 0.1 Read 读到的 finance.py 完整源码>"
})

mcp__edgeone__files_write({
  path: "/tmp/finance/cashflow.py",
  content: "<Step 0.1 Read 读到的 cashflow.py 完整源码>"
})

mcp__edgeone__files_write({
  path: "/tmp/finance/industry_thresholds.py",
  content: "<Step 0.1 Read 读到的 industry_thresholds.py 完整源码>"
})

mcp__edgeone__files_write({
  path: "/tmp/finance/references/thresholds.json",
  content: "<Step 0.1 Read 读到的 thresholds.json 完整内容>"
})
```

**注意**：
- `thresholds.json` 必须写到 `/tmp/finance/references/thresholds.json`（子目录），industry_thresholds.py 通过相对路径 `references/thresholds.json` 加载
- 每个 files_write 调用必须独立确认成功（exitCode=0 / 无 error），失败立即重试 1 次，仍失败则进入 F1 降级
- **禁止只写部分文件**（4 个文件必须全部写入）

#### 0.3 安装依赖（用 mcp__edgeone__commands 工具）

LLM 必须调用 `mcp__edgeone__commands` 安装 numpy-financial：

```
mcp__edgeone__commands({
  cmd: "pip install --quiet \"numpy-financial>=0.9,<2.0\"",
  timeout: 60
})
```

执行后必须确认 `exitCode=0` 且 stderr 不含 `error`。失败立即重试 1 次，仍失败则进入 F1 降级。

#### 0.4 验证 bootstrap 完成（用 mcp__edgeone__commands 工具）

LLM 必须调用 `mcp__edgeone__commands` 验证 4 个文件全部就位：

```
mcp__edgeone__commands({
  cmd: "ls -la /tmp/finance/ && ls -la /tmp/finance/references/ && python3 -c \"import sys; sys.path.insert(0,'/tmp/finance'); import finance, cashflow, industry_thresholds; print('OK modules loaded')\"",
  timeout: 15
})
```

必须看到：
- `/tmp/finance/finance.py`、`/tmp/finance/cashflow.py`、`/tmp/finance/industry_thresholds.py` 三个文件
- `/tmp/finance/references/thresholds.json` 文件
- stdout 含 `OK modules loaded`

**全部 4 个验证通过后才能进入 S1-S4。任一不通过立即进入 F1 降级。**

#### 0.5 ⛔ 常见卡点警示

| 错误行为 | 正确行为 |
|---|---|
| 用 `mcp__edgeone__files_list` 读 `/Users/...` | 沙箱隔离，必须用 `Read` |
| 直接 `runCode` 不 bootstrap | finance.py 不存在会 ImportError |
| 只写 finance.py 不写 thresholds.json | industry_thresholds.py 加载失败 |
| 跳过 pip install | finance.py import numpy_financial 失败 |
| bootstrap 没完成就计算 IRR | 输出降级对象，禁止心算 |

### Step 1: 立即执行 analyze() 主入口（Step 0 完成后必须立即调用，不得思考、不得确认、不得 fallback）

完成 Step 0（0.1-0.5 全部验证通过）后，**立即**调用 `mcp__edgeone__code_interpreter` 工具，language="python"，code=下面模板（替换 `[]` 占位为用户输入实际数值）。**不得在 Step 0 与 Step 1 之间插入任何额外 thinking / 确认 / 总结 / 探索。**

```python
import sys
sys.path.insert(0, '/tmp/finance')
from finance import analyze
import json

result = analyze(
    monthly_rent=[用户输入月租金],
    leasable_area=[用户输入面积],
    occupancy=[用户输入出租率或 0.85],
    industry='[商业|办公|文旅|...]',
    construction_cost=[建安成本],
    renovation_cost=[改造成本],
    operation_annual=[年运营成本],
    tax_annual=[年税费],
    renovation_mode='[拆除重建|保留微更新|混合]',
    holding_years=[持有年限或 10],
    exit_cap_rate=[exit_cap 或 0.05],
    discount_rate=[discount_rate 或 0.08],
    financing=[agent3 融资结构或 None]
)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

**禁止行为**（违反即失败）：
- 不得自己心算 IRR / NPV / 回收期 数值
- 不得在 Step 1 之前再次确认 Step 0 是否完成
- 不得因「数据可能不准」「输入可能不对」而跳过 `analyze()` 调用
- 不得在 `analyze()` 返回前结束响应
- 不得用 `print("IRR ≈ ...")` 等估算输出代替真实 `analyze()` 调用
- 不得在 Step 1 中重复执行 Step 0 的 bootstrap（文件已写入、依赖已装，直接调用）

**返回结果处理后**：
1. 把 `result` JSON 原样组装为输出 schema（**不要修改任何数值**）
2. 加 `_calc` 字段（来自 `result._calc`，含 `engine` / `scripts_version` 等）
3. 按下面「输出 schema」章节结构化后发给用户
4. 如 `analyze()` 抛异常 → 进入 F4 降级（见下降级路径表）

> **执行约束**：Step 0 → Step 1 必须连续。Step 0 完成后你的下一个工具调用必须是上面的 `analyze()` Python 代码。如发现自己即将结束响应或返回纯文本结论，**立即**改为调用 Step 1。

### S1-S4 通过 sandbox 执行（LLM 必须调用，禁止心算）

LLM 拼接 kwargs，调用 `sandbox.runCode`：

```python
import sys
sys.path.insert(0, '/tmp/finance')
from finance import analyze
import json
result = analyze(
    monthly_rent=80,
    leasable_area=10000,
    occupancy=0.85,
    industry='商业',
    construction_cost=30000000,
    renovation_cost=8000000,
    operation_annual=1500000,
    tax_annual=1200000,
    renovation_mode='保留微更新',
    holding_years=10,
    exit_cap_rate=0.05,
    discount_rate=0.08,
    financing={...}  # 来自 agent3
)
print(json.dumps(result, ensure_ascii=False))
```

执行前确保 sandbox 已就绪：
1. `sandbox.commands.run('ls /tmp', {timeout: 10})` 至少成功 1 次（最多 3 次重试）
2. `sandbox.files.write('/tmp/finance/finance.py', ...)` 写入 4 个文件：finance.py / cashflow.py / industry_thresholds.py / references/thresholds.json
3. `sandbox.commands.run('pip install --quiet "numpy-financial>=0.9,<2.0"', {timeout: 60})` （首次冷启动）

执行：`sandbox.runCode(code_string, {language: 'python', timeout: 30})`

### 输出 schema（与 finance.py 返回结构一致）

```json
{
  "agent": "agent4-财务模型",
  "改造模式": "拆除重建 | 保留微更新 | 混合",
  "收入测算": {...},
  "成本测算": {...},
  "现金流时序": [...],
  "财务指标": {"IRR": "10.20%", "NPV": ..., "回收期": ..., "敏感性分析": "..."},
  "业态门槛对照": {"业态": "商业", "门槛区间": "8-12%", "达标结论": "达标"},
  "关键假设": "...",
  "依据": [...],
  "_calc": {"engine": "numpy-financial", "scripts_version": "V2", ...}
}
```

LLM 解析 sandbox 输出 JSON，原样组装为输出 schema，**不得修改数值**。

## 失败降级路径

| 节点 | 失败条件 | 处理 |
|---|---|---|
| F1 沙箱不可用 | `ls /tmp` 三次失败 | 输出降级对象（见 §4.2） |
| F4 计算超时 | runCode 30s 未返回 | 输出降级对象（见 §4.3） |
| F6/H2 字段缺失 | 必填字段缺 | 输出降级清单（见 §4.4） |
| F7 agent3 未就绪 | 融资结构为空 | 输出降级清单（同 F6，缺失字段=融资结构） |
| F8 业态不在门槛表 | 用户业态=住宅/工业等 | finance.py 自动兜底，达标结论=无法判定 |
| F9 IRR 不收敛 | 全负现金流等 | finance.py 自动兜底，IRR=null |
| F12 数值越界 | 月租金≤0、出租率>1 等 | 视同 F6 字段非法 |

> 完整失败降级矩阵见 `2026-08-08-agent4-财务模型-V2-design.md` §4.1。

## 降级对象 schema（F1, F13, F15）

```json
{
  "agent": "agent4-财务模型",
  "状态": "沙箱不可用 | sandbox_error | 门槛数据被篡改",
  "原因": "...",
  "已就绪字段": {...},
  "未执行": ["S1 收入测算", "S2 成本测算", "S3 现金流时序", "S4 财务指标"],
  "建议动作": "稍后重试；如持续失败，检查 EdgeOne 项目 sandbox 配额与 region",
  "_calc": {"engine": "unavailable", "scripts_version": "V2", "kernel_session": null}
}
```

## 降级清单 schema（F6, F7, F12）

```json
{
  "agent": "agent4-财务模型",
  "状态": "降级人工填报",
  "缺失字段": [
    {"字段名": "月租金", "来源": "用户输入", "补全建议": "..."}
  ],
  "已就绪字段": [...],
  "建议动作": "补齐缺失字段后重新触发 agent4",
  "_calc": {"engine": "not-invoked", "scripts_version": "V2"}
}
```

## 关键约束

1. 业态门槛基准不得自行修改（来源 V1 §3 L176 / §4 L245）
2. 关键假设必须显式标注【待校准】
3. 输出依据必须列出引用的库
4. 流程顺序：H1 → H2 → sandbox（S1-S4）→ 业态门槛对照（脚本完成）
5. 降级路径必须输出缺失清单或原因，不得静默跳过

## 依赖

- **上游**：agent3 多元融资渠道（融资结构）
- **下游**：agent6 双层决策红绿灯（投资拓展维度子灯）

## 版本注记

- **版本**：V2（2026-08-08）
- **依据**：V1 §4 L200-252 + `2026-08-08-agent4-财务模型-V2-design.md`
- **下游消费**：agent6 双层决策红绿灯（V2 含 `_calc.engine` 字段）
- **校准状态**：业态门槛基准【待校准】（来源 V1 §3 L176 / §4 L245）
- **修订规则**：遵循 CLAUDE.md，V2 不被覆盖，后续修订另存 -V3
