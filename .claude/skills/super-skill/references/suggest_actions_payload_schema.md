# suggest_actions payload schema（references/suggest_actions_payload_schema.md）

> super-skill 在 agent6 完成后通过 `sseQueue` 推送的 **7 按钮组** payload schema。
>
> 配套：架构设计 §3.2 + SKILL.md suggest_actions 章节。

---

## 1. 完整 schema

```typescript
interface SuggestActionsPayload {
  actions: SuggestAction[];
}

interface SuggestAction {
  id: string;            // 唯一标识，前端通过 id 区分点击事件
  emoji: string;         // 按钮 emoji（视觉标识）
  title: string;         // 按钮标题（≤ 8 字）
  description: string;   // 按钮描述（≤ 20 字，鼠标悬停 tooltip）
}

// 7 按钮（固定顺序：5 view_agent + 1 export_report + 1 rerun_agent）
const ACTIONS: SuggestAction[] = [
  {id: "view_agent1", emoji: "🏠", title: "固有对象识别", description: "查看 agent1 三色灯判定"},
  {id: "view_agent3", emoji: "💰", title: "多元融资",     description: "查看 agent3 融资方案"},
  {id: "view_agent4", emoji: "📊", title: "财务模型",     description: "查看 agent4 IRR/NPV 测算"},
  {id: "view_agent5", emoji: "⚠️", title: "失败案例",     description: "查看 agent5 Top3 风险案例"},
  {id: "view_agent6", emoji: "🚦", title: "双层决策",     description: "查看 agent6 顶层灯 + 四维子灯"},
  {id: "export_report", emoji: "📄", title: "导出报告",   description: "生成投资人/政府/业主/内部决策版报告"},
  {id: "rerun_agent",   emoji: "🔄", title: "重新跑某个 agent", description: "调整参数后重跑"},
];
```

---

## 2. 触发时机

| 时机 | 推送内容 |
|---|---|
| agent6 完成（正常全流程） | suggest_actions × 1（7 按钮） |
| agent6 完成（H1 短路：agent1 red） | suggest_actions × 1（7 按钮，但 agent3/4 按钮 description 标「已跳过」） |
| agent6 完成（H2 短路：agent3 red） | suggest_actions × 1（7 按钮，但 agent4 按钮 description 标「已跳过」） |
| agent6 完成（子集模式） | suggest_actions × 1（仅包含调用的 agent 按钮 + export_report + rerun_agent） |
| agent6 完成（追加模式） | suggest_actions × 1（仅包含新增 agent 按钮 + export_report + rerun_agent） |

**不推送时机**：
- 单 agent 模式（super-skill 未触发，由子 skill 自身输出，无 suggest_actions）
- super-skill 失败（F1-F5）
- agent6 未完成（用户中断）

---

## 3. 前端动作映射

| action.id | 前端动作 |
|---|---|
| `view_agent1` | 切换右窗格 Tab 到「🏠 agent1」（显示 agent1_output JSON） |
| `view_agent3` | 切换右窗格 Tab 到「💰 agent3」（显示 agent3_output JSON） |
| `view_agent4` | 切换右窗格 Tab 到「📊 agent4」（显示 agent4_output JSON） |
| `view_agent5` | 切换右窗格 Tab 到「⚠️ agent5」（显示 agent5_output JSON） |
| `view_agent6` | 切换右窗格 Tab 到「🚦 决策」（默认聚焦，显示 agent6 顶层灯 + 四维子灯） |
| `export_report` | 弹出报告类型选择器（投资人版 / 政府版 / 业主版 / 内部决策版）→ 用户选择后 super-skill 调 agent6 渲染 HTML → 推 `report_ready` 事件 → 前端弹 ReportModal |
| `rerun_agent` | 弹出 agent 选择器（agent1-6）→ 用户选择后 super-skill 进入追加模式，只重跑选中的 agent + agent6 |

---

## 4. agent6 默认聚焦

前端窗格默认聚焦 **agent6 决策 Tab**（不是 agent1）。理由：
- agent6 是顶层结论，用户最关心
- 其他 Tab 是细节展开（用户主动点开查看）
- 符合 super-skill 设计原则（结论优先 → 论证细节次之）

---

## 5. 完整推送伪代码

```typescript
// super-skill 在 agent6 完成后调用
function pushSuggestActions(
  sseQueue: SseQueue,
  mode: "full" | "subset" | "append",
  skippedAgents: string[] = [],
  invokedAgents: string[] = []
) {
  const baseActions: SuggestAction[] = [
    {id: "view_agent1", emoji: "🏠", title: "固有对象识别", description: _buildDesc("agent1", skippedAgents)},
    {id: "view_agent3", emoji: "💰", title: "多元融资",     description: _buildDesc("agent3", skippedAgents)},
    {id: "view_agent4", emoji: "📊", title: "财务模型",     description: _buildDesc("agent4", skippedAgents)},
    {id: "view_agent5", emoji: "⚠️", title: "失败案例",     description: _buildDesc("agent5", skippedAgents)},
    {id: "view_agent6", emoji: "🚦", title: "双层决策",     description: "查看 agent6 顶层灯 + 四维子灯"},
    {id: "export_report", emoji: "📄", title: "导出报告",   description: "生成投资人/政府/业主/内部决策版报告"},
    {id: "rerun_agent",   emoji: "🔄", title: "重新跑某个 agent", description: "调整参数后重跑"},
  ];

  // 子集 / 追加模式下，过滤未调用的 agent 按钮
  let actions = baseActions;
  if (mode === "subset" || mode === "append") {
    actions = baseActions.filter(a =>
      a.id === "export_report" ||
      a.id === "rerun_agent" ||
      invokedAgents.includes(a.id.replace("view_", ""))
    );
  }

  sseQueue.enqueue({
    type: "suggest_actions",
    payload: {actions}
  });
}

function _buildDesc(agentId: string, skippedAgents: string[]): string {
  if (skippedAgents.includes(agentId)) {
    return `（已跳过）`;
  }
  const descMap: Record<string, string> = {
    agent1: "查看 agent1 三色灯判定",
    agent3: "查看 agent3 融资方案",
    agent4: "查看 agent4 IRR/NPV 测算",
    agent5: "查看 agent5 Top3 风险案例",
  };
  return descMap[agentId] || "";
}
```

---

## 6. 与 agent_output 事件的协作

`suggest_actions` 是**最后一击**（agent6 完成后推送），与 `agent_output` 事件配合：

```
agent1 完成 → 推 agent_output(agent1) × 1
agent2 完成 → 推 agent_output(agent2) × 1
agent3 完成 → 推 agent_output(agent3) × 1
agent4 完成 → 推 agent_output(agent4) × 1
agent5 完成 → 推 agent_output(agent5) × 1
agent6 完成 → 推 agent_output(agent6) × 1
            ↓
            推 suggest_actions × 1（7 按钮，最后一击）
            ↓
            用户点按钮 → 前端切 Tab 或弹报告
```

前端规则：
- `agent_output` 事件 → 累积到右窗格「Agent 输出」状态（按 agent_id 索引）
- `suggest_actions` 事件 → 渲染底部按钮组（用户主动点选）
- 用户点 `view_agent<N>` 按钮 → 切右窗格 Tab
- 用户点 `export_report` 按钮 → 弹报告类型选择器
- 用户点 `rerun_agent` 按钮 → 弹 agent 选择器

---

## 7. report_ready 事件（按需触发）

```typescript
// 用户点 export_report 按钮 → 弹报告类型选择器 → 用户选择「投资人版」
// → super-skill 调 agent6 渲染 HTML → 推送：
sseQueue.enqueue({
  type: "report_ready",
  payload: {
    report_type: "投资人版",  // "投资人版" | "政府版" | "业主版" | "内部决策版"
    html_content: "<html><head>...</head><body>...</body></html>"
  }
});

// 前端收到 report_ready → 弹 ReportModal 显示 html_content
```

---

## 8. 失败模式

| 编号 | 触发条件 | 处置 |
|---|---|---|
| F1 | sseQueue 推送失败（如网络断开） | suggest_actions 事件丢失，不重发；用户可手动点右窗格 Tab 切换查看 agent 输出 |
| F2 | 用户点 export_report 但 agent6 渲染 HTML 失败 | super-skill 推送错误事件，前端弹 toast「报告渲染失败」 |
| F3 | 用户点 rerun_agent 但指定 agent 失败（如 sandbox 不可用） | super-skill 推送错误事件，前端弹 toast「agent 重跑失败」 |

---

## 9. 版本

- V1（references/suggest_actions_payload_schema.md）：2026-08-08
- 配套：SKILL.md suggest_actions 章节 + 架构设计 §3.2
