# 6 维相似度权重 + 硬匹配维度配置（agent5 references）

> 来源：V1 §5 L287-288 + super-skill-implementation-plan.md Task 6 Step 5 + 2026-08-08-6agent-盘点与分类.md §2.6。
> 本文件为静态规则文档，由 case_matcher.py 在 sandbox 内读取。
> **6 维相似度权重【待校准】**（来源 V1 §5 L287-288，agent5 仅落地）。

---

## 0. 文档定位

| 项 | 内容 |
|---|---|
| 用途 | agent5-失败案例 V2 sandbox 内 case_matcher.py 的 6 维相似度权重配置参考 |
| 数据来源 | V1 §5 L287-288（S1 权重 0.6 / S2 权重 0.4）+ 2026-08-08-super-skill-implementation-plan.md Task 6 Step 5 |
| 校准状态 | 6 维权重【待校准】；硬匹配维度【待校准】 |
| 版本 | V2（2026-08-08） |

---

## 1. 6 维相似度权重配置

| 维度 | 字段名 | 权重 | 匹配方式 | 备注 |
|---|---|---|---|---|
| 1 | region（区域） | **0.0** | 硬匹配（必须等，已 SQL WHERE 预筛） | 区域不同直接 filter 掉 |
| 2 | industry（业态） | **0.0** | 硬匹配（必须等，已 SQL WHERE 预筛） | 业态不同直接 filter 掉 |
| 3 | scale（规模） | **0.2** | 软加权（_normalize_scale 分档） | < 1000 → 0.2; < 5000 → 0.4; < 20000 → 0.6; < 50000 → 0.8; ≥ 50000 → 1.0 |
| 4 | property_type（产权类型） | **0.2** | 软加权（向量化后余弦相似度） | 字符串 hash → [0,1] → cosine |
| 5 | physical_params（物理参数） | **0.3** | 软加权（dict 向量化后余弦） | 含 文保等级/结构类型/改造模式 |
| 6 | financing（融资结构） | **0.3** | 软加权（dict 向量化后余弦） | 含 融资期限/持有年限/退出策略 |

**权重总和**：0.0 + 0.0 + 0.2 + 0.2 + 0.3 + 0.3 = **1.0**（归一化）

---

## 2. 硬匹配维度（HARD_MATCH）

| 维度 | 处理 | 原因 |
|---|---|---|
| region | SQL WHERE 预筛（libsql_client.query_cases 已做） | 不同区域的项目特征无可比性（北上深 vs 三线城市） |
| industry | SQL WHERE 预筛（libsql_client.query_cases 已做） | 不同业态的失败模式根因不通用（商业 vs 办公 vs 文旅） |

**实现位置**：`libsql_client.query_cases(features, top_k)` 内部执行
```sql
SELECT * FROM case_library WHERE region = ? AND industry = ? LIMIT 200
```

---

## 3. 相似度阈值

| 阈值名 | 数值 | 用途 |
|---|---|---|
| SIMILARITY_INCLUSIVE_THRESHOLD | 0.4 | < 0.4 不纳入 Top3 |
| HIGH_SIMILARITY_THRESHOLD | 0.7 | ≥ 0.7 视为高相似度（用于根因重现判定） |
| RECONSIDER_THRESHOLD | 0.8 | ≥ 0.8 + 根因重现 → 校验灯 yellow |

---

## 4. 综合分公式

按 V1 §5 L287-288：

```
综合分 = S1 × 0.6 + S2 × 0.4

其中：
  S1 = 6 维加权相似度（本文件 §1 配置）
  S2 = 失败模式归因分（Top3 中高危命中数 / Top3 总数）
```

---

## 5. 业态门槛基准（V1 §3 L176 / §4 L245，用于"业态误判"高危判定）

| 业态 | IRR 下限 | IRR 上限 | 数据来源 |
|---|---|---|---|
| 商业 | **8%** | **12%** | V1 §3 L176 / §4 L245 |
| 办公 | **6%** | **9%** | V1 §3 L176 / §4 L245 |
| 文旅 | **7%** | **10%** | V1 §3 L176 / §4 L245 |

> 业态门槛基准由 agent4 维护，agent5 仅消费 agent4 输出的"达标/不达标"结论。

---

## 6. 改造超预算阈值

| 阈值名 | 数值 | 数据来源 |
|---|---|---|
| RENOVATION_OVER_BUDGET_RATIO | **1.5×** | V1 §5 高危触发条件（文保核心保护区 + 改造模式收敛致成本 > 1.5× 基准） |

---

## 7. case_matcher.py 配置同步

case_matcher.py 顶部 `WEIGHTS` dict 与本文件 §1 一致：

```python
WEIGHTS = {
    "region": 0.0,         # 硬匹配
    "industry": 0.0,       # 硬匹配
    "scale": 0.2,
    "property_type": 0.2,
    "physical_params": 0.3,
    "financing": 0.3,
}
HARD_MATCH = ["region", "industry"]
```

修改权重时**必须同时修改本文件 + case_matcher.py**（一致性约束）。

---

## 8. 版本注记

| 项 | 值 |
|---|---|
| 版本 | V2（2026-08-08） |
| 数据来源 | V1 §5 L287-288 + super-skill-implementation-plan.md Task 6 Step 5 |
| 校准状态 | 6 维权重【待校准】；硬匹配维度【待校准】；3 个相似度阈值【待校准】 |
| 修订规则 | 遵循 CLAUDE.md，本文件不被覆盖，变更另存 similarity_weights-V2.md |
