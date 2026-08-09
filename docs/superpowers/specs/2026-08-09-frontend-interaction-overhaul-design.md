# 前端交互改造设计文档

| 字段 | 值 |
|------|-----|
| 文档版本 | v1.0 |
| 创建日期 | 2026-08-09 |
| 状态 | Draft — 等待用户审阅 |
| 作者 | Claude Code(brainstorming session) |
| 改造范围 | 仅前端 `src/`,后端 0 改动 |
| 实施分阶段 | 4 阶段(删除 → 扩字段 → 口径修复 → 测试) |

---

## 摘要

针对"万象更芯 · 智算营城"(EdgeOne Makers + Claude Agent SDK + super-skill 多 agent 编排)前端,做一次聚焦于交互层的改造,达成三个目标:

1. **强制逐项输入 super-skill + 6 agent 所需的人为输入端数据** — 从现有 5 粗字段扩到 22 字段(19 P0 + 3 P1),软警告机制允许跳过但告知降级后果
2. **强制按 super-skill 流程跑完 agent1→agent6** — 删除 `IntakeGoal` 4 选 1,固定全流程
3. **完全删除 EdgeOne Makers 模板自带的自由聊天框** — 删除 `ChatInput` 组件,删 `WelcomeScreen` 包装层,删 preset chips

后端 `agents/` + `cloud-functions/` + `.claude/skills/` **完全不改**。

---

## 背景与现状

### 项目定位

- 仓库:`/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team`
- 产品:UI 标题"万象更芯 · 智算营城"
- 技术栈:React 18 + Vite 5 + TypeScript(前端)+ EdgeOne Makers Cloud Functions / Agent Functions(后端)+ libSQL / 智谱 embedding(数据)
- 部署:EdgeOne Makers(ProjectId `makers-jln25ogdp6vg`),已上线跑通

### 当前交互结构

页面是**三列水平布局**:

```
┌────────────────────────────────────────────────────────────────┐
│ CityScene 全屏背景层                                            │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │   .stage (flex-row)                                       │  │
│ │ ┌──────────┐ ┌────────────────────┐ ┌────────────────┐  │  │
│ │ │ Sidebar  │ │ chatPanel          │ │ dock (400px)   │  │  │
│ │ │ 会话列表 │ │  header            │ │ Tab:智能体/    │  │  │
│ │ │          │ │  PipelineBar       │ │     Trace/代码 │  │  │
│ │ │ + 新建   │ │  ChatWindow        │ │                │  │  │
│ │ │          │ │   └ WelcomeScreen  │ │ AgentPane 6tab │  │  │
│ │ │          │ │     └ IntakeWizard │ │                │  │  │
│ │ │          │ │  ChatInput         │ │                │  │  │
│ │ │          │ │  SuggestActions    │ │                │  │  │
│ │ └──────────┘ └────────────────────┘ └────────────────┘  │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 当前用户旅程

1. 进入页面 → ChatWindow 检测 messages 为空 → 渲染 WelcomeScreen → 内嵌 IntakeWizard
2. 用户填 5 字段(城市/现状/规模/方向/目标)— 全部必填,无法跳过
3. 提交 → `composeProjectPrompt` 拼装 → `sendMessageStream` → SSE 流
4. 后端 super-skill 跑 6 agent → 前端 PipelineBar 节点依次 done
5. report_ready SSE → ReportModal 弹出
6. 任意时刻 ChatInput 仍可用,可自由聊天绕过 wizard

### 关键事实

| 维度 | 现状 | 与三诉求的差距 |
|------|------|---------------|
| IntakeWizard 字段数 | 5 个粗字段(城市/现状/规模/方向/目标) | 6 个 skill 真正需要 22 个 P0+P1 字段,大量数字字段在 `scale` 自由文本里被 LLM 抽取,精度无保障 |
| `goal` 字段(4 选 1) | `full`/`finance`/`model`/`risk`,后三个就是单 agent 路径 | 直接违背诉求 2 |
| 底部 `ChatInput` | 自由 textarea + 3 preset chip + 发送/停止/清除按钮 | 直接违背诉求 1+2(用户可绕过 wizard) |
| PipelineBar 6 节点 | 已经全部只读可视化 | 诉求 2 在这层已经满足 |
| SuggestActions 3 按钮 | view_agent × 6 / export_report / rerun_agent | rerun_agent 文案需改 |
| 业态口径 | IntakeWizard 5 chip vs 6 skill 期望的 6 业态枚举 — 错位 | 隐藏 bug |
| 试点城市 | agent2 H1(15 市级)vs agent3 H4(15 省级)— 双名单 | 用户要求硬阻断非试点 |

---

## 1. 整体架构与用户旅程

### 1.1 三阶段状态机

引入顶层状态 `uiStage: 'intake' | 'running' | 'review'`,替换当前散落 App.tsx 的 `messages.length===0` / `loading` / `suggestActions.length>0` 隐式判断。

```
┌─ uiStage = 'intake' ───────────────────────────────────────┐
│ - 用户首次进入 or 点"新建项目"                              │
│ - IntakeWizard 占据 chatPanel 中部                          │
│ - PipelineBar 显示但 6 节点全灰                             │
│ - chatPanel 底部 无 ChatInput(已删除)                     │
│ - 用户填字段,可跳过(软警告,city 除外)                   │
│ - 点"开始测算" → 组装 prompt → 发送 → 进入 running         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─ uiStage = 'running' ──────────────────────────────────────┐
│ - IntakeWizard 隐藏,ChatWindow 显示                        │
│ - SSE 流式回答 + 6 agent 依次输出                           │
│ - PipelineBar 节点依次 standby → running → done             │
│ - chatPanel header 显示 StopButton(替代原 ChatInput 里的) │
│ - chatPanel 底部 无 ChatInput,只显示 SuggestActions(若已推送)│
│ - 后端 super-skill 自动驱动 agent1→agent6                  │
└─────────────────────────────────────────────────────────────┘
                              ↓ (report_ready SSE 到达)
┌─ uiStage = 'review' ───────────────────────────────────────┐
│ - ReportModal 弹出最终报告                                 │
│ - SuggestActions 只显示 view_agent × 6 + export_report + rerun_agent(改文案)│
│ - chatPanel 底部 无 ChatInput(永远删除)                  │
│ - "重新开始项目" 入口:左侧 ConversationSidebar 的"新建会话"│
└─────────────────────────────────────────────────────────────┘
```

### 1.2 用户旅程对比

| 步骤 | 现状 | 改造后 |
|------|------|--------|
| 进入页面 | CityScene + 5 步 wizard + 底部自由聊天框 | CityScene + 6 步 wizard,**底部干净** |
| 填字段 | 5 字段强制必填,不能跳过 | 22 字段软警告,可跳过(city 例外,15 城硬阻断) |
| 提交 | 组装 prompt → sendMessageStream | 一样,但 prompt 含所有结构化字段 + 跳过标记 |
| 跑 agent | 后端 super-skill 自动驱动 6 agent | 完全一样 |
| 跑完 | SuggestActions 出现 + ChatInput 可继续追问 | SuggestActions 出现,**无 ChatInput** |
| 重新开始 | 在 ChatInput 输入新内容 | 点左侧"新建会话" → 回到 intake 阶段 |

### 1.3 改动涉及的文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/App.tsx` | 改 | 加 uiStage 状态机;条件渲染 IntakeWizard/ChatWindow;删 ChatInput/WelcomeScreen 引用 |
| `src/components/IntakeWizard.tsx` | 重写 | 5 步扩到 6 步 + 预览页;5 字段扩到 22 字段;加跳过弹窗;加 city 15 城卡片 |
| `src/lib/intake.ts` | 重写 | IntakeValues 接口扩字段;composeProjectPrompt 适配;加 INTAKE_WARNINGS + migrateLegacyIndustry + intakeValuesToPrompt |
| `src/i18n/zh.ts` + `en.ts` | 扩 | 新字段 label/placeholder/warning 文案,约 110 key |
| `src/components/ChatInput.tsx` | **删除** | 不再使用 |
| `src/components/ChatInput.module.css` | **删除** | 不再使用 |
| `src/components/WelcomeScreen.tsx` | **删除** | IntakeWizard 由 App.tsx 直接挂载 |
| `src/components/WelcomeScreen.module.css` | **删除**(如存在) | 同上 |
| `src/components/ChatWindow.tsx` | 改 | 不再渲染 WelcomeScreen |
| `src/components/IntakeWarningModal.tsx` | **新增** | 软警告弹窗组件 |
| `src/components/StopButton.tsx` | **新增** | 替代 ChatInput 里的停止生成按钮,挂 header |
| `src/components/SuggestActions.tsx` | 改 | rerun_agent 文案改"重新测算(全流程)" |
| `src/components/ConversationSidebar.tsx` | 改 | "新建会话"按钮回调清空 + 切 intake 阶段 |
| `src/types.ts` | 改 | 加 IntakeWarning 类型;移除 IntakeGoal |

后端 `agents/` + `cloud-functions/` + `.claude/skills/` **全部不改**。

---

## 2. 字段清单(22 字段)

### 2.1 总览

去重后,6 个 skill 实际期望的人为输入端字段共 **22 个**(19 P0 + 3 P1)。

- **P0** = skill 端会触发 H 硬约束阻断或 F 降级路径的字段
- **P1** = 缺失时 LLM 给默认值兜底,精度有损但不阻断

### 2.2 字段表(按 IntakeWizard 6 步分组)

#### Step 1:基础地理(2 字段)

| # | key | label | 类型 | 必填 | 对应 agent | 跳过/留空后果 |
|---|-----|-------|------|------|------------|---------------|
| 1 | `city` | 项目所在城市 | 15 城卡片网格单选 | **P0 hard(硬阻断)** | agent2 H1 维度1 / agent3 H4 / agent5 | 前端阻断,无法进入下一步 |
| 2 | `location` | 区位(行政区/园区/地块名) | 文本 | P0(软警告) | agent1 物理参数.区位 / agent5 region | agent5 案例相似度 S1 降权 |

#### Step 2:业权与现状(4 字段)

| # | key | label | 类型 | 必填 | 对应 agent | 跳过/留空后果 |
|---|-----|-------|------|------|------------|---------------|
| 3 | `owner_type` | 业主资质 | 单选:国企/民企/混合所有制 | P0 | agent1 + agent2 H1 维度4 | agent2 H1 维度4 不符 → 政策全部"不适用" |
| 4 | `property_cert` | 不动产证号 | 文本 | P0 | agent1 H1(F1 阻断) | agent1 H1 直接无法判定 green → 默认 yellow |
| 5 | `heritage_level` | 文保等级 | 单选:无文保/建控地带/核心保护 | P0 | agent1 H2(F4 阻断) / agent5 | agent1 H2 阻断 → 默认 red |
| 6 | `current_status` | 项目现状描述 | 文本(free text,简短) | P0 | 全部 agent(上下文) | 各 agent 缺上下文 |

#### Step 3:物理参数(3 字段)

| # | key | label | 类型 | 必填 | 对应 agent | 跳过/留空后果 |
|---|-----|-------|------|------|------------|---------------|
| 7 | `building_area` | 建筑面积(㎡) | 数字 >0 | P0 | agent1 + agent3/4(隐含) | agent1 S2 降级 |
| 8 | `structure_type` | 结构类型 | 单选:框架/砖混/木结构/钢结构/其他 | P0 | agent1 + agent5 | agent5 案例匹配缺维度 |
| 9 | `height_m` | 层高(m) | 数字 >0 | P1 | agent1 物理参数 | agent1 S2 降级,可由 LLM 估 |

#### Step 4:业态与改造模式(2 字段)

| # | key | label | 类型 | 必填 | 对应 agent | 跳过/留空后果 |
|---|-----|-------|------|------|------------|---------------|
| 10 | `industry` | 拟改造业态方向 | 单选:**6 业态枚举**(商业/办公/文旅/工业仓储/居住/公共服务) | P0 | agent1 业态方向 + agent2 H1 维度5 + agent3 user_industry + agent4 industry + agent5 industry | 多 agent 同时降级 |
| 11 | `renovation_mode` | 改造模式 | 单选:拆除重建/保留微更新/混合 | P0 | agent2 项目类型 + agent4 + agent5 改造模式 | agent2 H1 项目类型不符 → 政策全不适用 |

> **第 4 步关键修复**:用 6 业态枚举替换现有 5 chip(保障性租赁住房/长租公寓/文创园区/商业办公/产业园区),解决口径错位。

#### Step 5:资金面(4 字段)

| # | key | label | 类型 | 必填 | 对应 agent | 跳过/留空后果 |
|---|-----|-------|------|------|------------|---------------|
| 12 | `investment` | 总投资(万元) | 数字 >0 | P0 | agent3 H1 + agent4 | agent3 H1 资本金门槛无法校验 → F4 降级 |
| 13 | `capital_ratio` | 自有资金比例(%) | 滑块 0-100 | P0 | agent3 H1 硬约束(25-30%) | agent3 H1 硬约束无法判定 → 直接 red |
| 14 | `mortgage_type` | 抵押物类型 | 单选:土地使用权/运营权/收益权/经营权/收费权/组合 | P0 | agent3 H2 硬约束 | agent3 H2 直接 red |
| 15 | `mortgage_value` | 抵押物估值(万元) | 数字 ≥0 | P0 | agent3 S4 还款覆盖率 | agent3 还款覆盖率无法算 → yellow |

#### Step 6:财务与退出(6 字段,3 P0 + 3 P1)

| # | key | label | 类型 | 必填 | 对应 agent | 跳过/留空后果 |
|---|-----|-------|------|------|------------|---------------|
| 16 | `monthly_rent` | 月租金(元/㎡) | 数字 >0 | P0 | agent4 H2 + agent3 baseline_rent | agent4 H2 必填 → F6/F12 降级,IRR 无法算 |
| 17 | `leasable_area` | 可租赁面积(㎡) | 数字 >0 | P0 | agent3 S4 + agent4 H2 | 同上 |
| 18 | `holding_years` | 持有年限(年) | 数字 1-50 | P0 | agent3 S3 + agent4 H2 + agent5 financing | agent4 现金流时序无法算 |
| 19 | `exit_strategy` | 退出策略 | 单选:整体出售/单层散售/REITs/持有到期 | P0 | agent3 S3 + agent5 financing | agent3 退出策略空 → F4 降级 |
| 20 | `occupancy` | 出租率(%) | 滑块 0-100,默认 85 | **P1** | agent4 H2 | 缺失用 85% 兜底 |
| 21 | `exit_cap_rate` | 退出 cap rate(%) | 数字 0-30,默认 4.5 | **P1** | agent4 H2 | 缺失用 4.5% 兜底 |
| 22 | `discount_rate` | 折现率(%) | 数字 0-50,默认 8 | **P1** | agent4 H2 | 缺失用 8% 兜底 |

### 2.3 字段→agent 反向索引

| Agent | 直接消费的字段 |
|-------|----------------|
| agent1 | city, location, owner_type, property_cert, heritage_level, current_status, building_area, structure_type, height_m, industry, renovation_mode |
| agent2 | city, owner_type, industry, renovation_mode, investment(隐含), current_status |
| agent3 | city(→user_region), industry(→user_industry), investment, capital_ratio, mortgage_type, mortgage_value, monthly_rent(→baseline_rent), leasable_area, holding_years, exit_strategy |
| agent4 | industry, renovation_mode, monthly_rent, leasable_area, holding_years, occupancy, exit_cap_rate, discount_rate |
| agent5 | location(→region), industry, building_area(→scale), owner_type(→property_type), heritage_level, structure_type, renovation_mode, holding_years, exit_strategy |
| agent6 | 不消费 intake 字段(只聚合下游) |
| super-skill | 不消费单独字段(把所有字段拼成 project_description) |

### 2.4 字段类型分布

| 类型 | 数量 |
|------|------|
| 文本(短) | 4(city 用卡片网格,其他 3 个文本输入) |
| 单选(enum) | 9 |
| 数字(整数/小数) | 9 |

---

## 3. IntakeWizard 重构

### 3.1 步数与字段分配

```
Step 1  基础地理       (2 字段)
Step 2  业权与现状     (4 字段)
Step 3  物理参数       (3 字段)
Step 4  业态与改造模式 (2 字段)
Step 5  资金面         (4 字段)
Step 6  财务与退出     (6 字段,3 P0 + 3 P1,带"高级参数"分隔)
Step 7  预览与提交     (全字段网格 + 缺失警告)
```

### 3.2 每步 UI 形态

详细 ASCII mockup 见 brainstorming 对话记录。要点:

- **Step 1**:15 城卡片网格(硬阻断)+ location 文本框
- **Step 2**:owner_type/heritage_level 卡片单选 + property_cert/current_status 文本
- **Step 3**:building_area/height_m 数字输入 + structure_type 5 卡片
- **Step 4**:industry 6 业态卡片 + renovation_mode 3 卡片
- **Step 5**:investment/mortgage_value 数字 + capital_ratio 滑块(25-30% 绿色高亮) + mortgage_type 6 卡片
- **Step 6**:monthly_rent/leasable_area/holding_years 数字 + exit_strategy 4 卡片 + 高级参数分隔 + occupancy 滑块 + exit_cap_rate/discount_rate 数字(默认值显式标注)
- **Step 7**:全字段网格预览,缺失字段红色标注,顶部 banner 显示"X 个关键字段缺失,继续将触发降级",底部 [返回填写] / [继续测算]

### 3.3 跳过机制(诉求 1 软警告)

| 字段类型 | 用户尝试跳过 | 弹窗 | 是否允许继续 |
|----------|------------|------|------------|
| **P0 hard(city)** | 触发 | 弹窗"必须选 15 城之一" | 不允许 |
| **P0 软警告** | 触发 | 逐字段弹窗,显示具体降级路径 | 允许(用户确认后) |
| **P1** | 触发 | 简短提示"将用默认值 X" | 允许 |
| **i18n 必填校验** | 输入非法(数字越界) | 红字 inline 提示 | 不允许,需修正 |

### 3.4 进度与导航

- 顶部进度条:6 圆点 + 当前高亮,鼠标悬停可看步骤名
- 主按钮文案随步数:`下一步` → ... → `预览并提交`
- 副按钮:`← 上一步`(step>0)、`跳过此步`(允许跳过当前步)
- 不允许跨步跳跃

### 3.5 提交流程

```
Step 7 点"继续测算"
    ↓
composeProjectPrompt(intakeValues, skippedFields, defaultFields)
    ↓
onSend(prompt) → App.handleSend
    ↓
sendMessageStream → 后端 /chat
    ↓
uiStage: 'intake' → 'running'
    ↓
IntakeWizard 卸载,ChatWindow + PipelineBar 进入工作状态
```

### 3.6 移动端适配

- ≤768px:每步全屏卡片,字段垂直堆叠,字号 16px(避免 iOS 缩放)
- 滑块用原生 input[type=range]
- 单选卡片从 3 列变 1 列

---

## 4. 软警告弹窗机制

### 4.1 弹窗触发状态机

**核心原则:逐字段弹窗,不批量弹。**

```
用户点 [下一步] 或 [跳过此步]
    ↓
检查当前步 P0 字段
找出所有"为空 + 未被标记 skippedConfirmed"的字段
    ↓
   字段列表为空?
   ┌──┴──┐
  是     否
   │     │
   │     ↓
   │   弹窗显示第一个未确认跳过的 P0 字段
   │     │
   │   ┌─┴──────────────┐
   │   │ [返回填写]      │ → 关闭弹窗,留在当前步,焦点回该字段
   │   │ [继续跳过]      │ → skippedFields.add(fieldKey),关闭弹窗,
   │   │                  递归检查下一个 P0 字段
   │   └────────────────┘
   ↓
进入下一步
```

**关键点:**
- skipped 字段会记住用户的决定,**当前步内不再重复弹**
- 用户回到这一步后,skipped 状态保留
- 如果用户主动填了值,skipped 状态自动清除
- 跨步离开再回来,skipped 状态保留

### 4.2 数据结构

```ts
// src/types.ts 新增
export interface IntakeWarning {
  fieldKey: string;
  fieldName: string;
  severity: 'blocker' | 'degraded';
  consequence: string;
  technicalRef: string;
  suggestion: string;
}
```

```ts
// src/lib/intake.ts 新增
export const INTAKE_WARNINGS: Record<string, Omit<IntakeWarning, 'fieldName'>> = {
  city: {
    fieldKey: 'city',
    severity: 'blocker',
    consequence: '前端阻断 — 必须从 15 试点城市之一选择,否则无法启动 super-skill 测算流程。',
    technicalRef: 'agent2 H1 维度1',
    suggestion: '从 15 城卡片网格中选择项目所在城市。',
  },
  location: { /* ... */ },
  owner_type: { /* ... */ },
  // ... 共 22 条
};
```

### 4.3 IntakeWarningModal 组件 API

```tsx
interface IntakeWarningModalProps {
  warning: IntakeWarning | null;
  onConfirmSkip: () => void;
  onReturnToFill: () => void;
}
```

UI 结构:
- 标题:`⚠️ 准确度会下降`
- 字段名 + fieldKey
- 三段:【后果】【技术参照】【建议】
- 双按钮:[📋 返回填写] / [继续跳过 →]
- ESC 键 / 点击遮罩 = "返回填写"

### 4.4 composeProjectPrompt 输出格式

```ts
// src/lib/intake.ts 升级
export interface ComposedPromptInput {
  values: IntakeValues;
  skippedFields: Set<string>;
  defaultFields: Record<string, string>; // P1 用默认值兜底
}

export function composeProjectPrompt(input: ComposedPromptInput): string | null {
  // 输出格式:
  // 【已填信息】
  // - 城市:X
  // - 区位:Y
  // - ...
  //
  // 【用户主动跳过的字段 — 准确度会下降】
  // - 字段 A:用户未提供
  // - ...
  //
  // 【用默认值的字段】
  // - 出租率:85%(默认)
  //
  // 请按 super-skill 完整上会测算流程,从 agent1 到 agent6 全部输出。
  // 对跳过的字段,各 agent 按既定降级路径处理,并在报告里标注"用户未提供"。
}
```

### 4.5 边界 case 处理

| 情况 | 处理 |
|------|------|
| 数字字段输入非法(字母、空格) | inline 红字"请输入数字",不弹窗,不允许下一步 |
| 数字字段越界(capital_ratio = 150) | inline 红字"范围 0-100",不弹窗 |
| 单选字段未选 + 用户没看过任何选项 | 弹窗(等同"跳过") |
| 文本字段只有空格 | trim 后视为空,走弹窗流程 |
| 用户连续点"跳过" 5 次 | 第 5 次弹窗文案升级为"已跳过 5 个关键字段,准确度大幅下降,确定继续吗?" |
| 用户从 Step 6 退回 Step 5 改字段 | skippedFields 保留;若该字段已填值,自动清除 skipped 标记 |
| 用户点"预览并提交"且未填 P0 字段超过 8 个 | 预览页顶部加红色 banner:"超过 8 个关键字段缺失,建议返回填写" |
| 字段填了又清空 | 重新视为空,需再次确认跳过 |

---

## 5. 删除项的具体改动

### 5.1 删除清单

| 删除项 | 文件位置 | 删除原因 |
|--------|---------|---------|
| `ChatInput` 组件 | `src/components/ChatInput.tsx` + `.module.css` | 诉求 3 |
| `IntakeValues.goal` 字段 | `src/lib/intake.ts` + `src/types.ts` | 诉求 2 |
| `IntakeGoal` 类型 | `src/lib/intake.ts` | 诉求 2 |
| IntakeWizard 原 Step 4(goal 选择) | `src/components/IntakeWizard.tsx` | 诉求 2 |
| preset chips(`preset.project.full/finance/irr`) | i18n | ChatInput 删除后这些一起没 |
| `chat.placeholder` / `chat.hint` 等 chat 输入相关 i18n | i18n | 同上 |
| `WelcomeScreen` 包装层 | `src/components/WelcomeScreen.tsx` + `.module.css` | uiStage 接管后由 App.tsx 直接挂载 |

### 5.2 goal 字段删除细节

```ts
// 改造前
export type IntakeGoal = 'full' | 'finance' | 'model' | 'risk';
export interface IntakeValues {
  // ...
  goal: IntakeGoal;
}

// 改造后:IntakeGoal 类型整型删除
// goal 字段从 IntakeValues 移除
```

`composeProjectPrompt` 改造:
```ts
// 改造前
const goalSuffix: Record<IntakeGoal, string> = {
  full: '请完整上会测算',
  finance: '请给出多元融资方案',
  // ...
};

// 改造后:固定文案
const PROMPT_SUFFIX = '请按 super-skill 完整上会测算流程,从 agent1 到 agent6 全部输出';
```

### 5.3 ChatInput 删除细节

```tsx
// App.tsx 改造前
import ChatInput from './components/ChatInput';
// ...
<ChatInput onSend={handleSend} onStop={handleStop} onClear={handleClearHistory} disabled={loading} />

// 改造后
// import ChatInput 删除
// <ChatInput ... /> 整行删除
// 加 uiStage 条件渲染 IntakeWizard
{uiStage === 'intake' && <IntakeWizard onSend={handleSend} disabled={false} />}
```

### 5.4 StopButton 重新分配位置

原 ChatInput 里的"停止生成"按钮(loading 时显示)移到 **chatPanel 顶部 header**:

```
┌─ chatPanel header ────────────────────────────────────┐
│  ⬡ 万象更芯 · 智算营城        ⏹ 停止   ⚙ 设置        │
└────────────────────────────────────────────────────────┘
```

理由:用户视线最先到,紧急中止场景不用找;与 PipelineBar 的 running 状态视觉联动;不占聊天消息区。

实现:新增 `StopButton` 组件,`disabled={!loading}` 时隐藏。

### 5.5 "清除历史"按钮的去向

原 ChatInput 里的"清除历史"按钮,移到 **ConversationSidebar 的会话项右键菜单 / 长按菜单**(移动端)。

理由:使用频率低,从主 UI 移除合理。

### 5.6 preset chips 处理

**全部删除,不再保留 preset。**

理由:preset 的本质是"绕过 wizard 快速触发 agent",与"必须按 wizard 逐项输入"的核心诉求直接冲突。

### 5.7 WelcomeScreen 处理

```
当前:    ChatWindow → WelcomeScreen → IntakeWizard
改造后:  App.tsx (uiStage === 'intake') → IntakeWizard (直接挂载)
```

- `WelcomeScreen.tsx` 完全删除
- `ChatWindow.tsx` 里的 `messages.length === 0 && <WelcomeScreen ... />` 删除
- App.tsx 用 uiStage 控制 IntakeWizard 显隐

### 5.8 SuggestActions 处理

| action.id | 当前行为 | 改造后 |
|-----------|---------|--------|
| `view_agent<id>` × 6 | 切换右侧 AgentPane tab 查看 | **保留,不动** |
| `export_report` | no-op(后端 SSE report_ready 驱动) | **保留,不动** |
| `rerun_agent` | 重发最近一条 user message = 重跑全部 6 agent | **保留,但改文案为"重新测算(全流程)"** |

后端 super-skill 推送的 7 个按钮里**没有"只跑 agent N"的按钮**(super-skill 设计就是全流程的),所以前端保留 7 个按钮即可。

### 5.9 grep 核查清单

提交前全文 grep 以下关键字,**应 0 命中**:
- `ChatInput`
- `WelcomeScreen`
- `IntakeGoal`
- `values.goal` / `intake.goal` / `intakeValues.goal`
- `wizard.qGoal` / `wizard.goalFull` / `wizard.goalFinance` / `wizard.goalModel` / `wizard.goalRisk`
- `goal === 'full'` / `goal === 'finance'` / `goal === 'model'` / `goal === 'risk'`
- `chat.placeholder` / `chat.hint`
- `preset.project.full` / `preset.project.finance` / `preset.project.irr`

### 5.10 删除代码量预估

| 文件 | 操作 | 行数变化 |
|------|------|---------|
| `src/components/ChatInput.tsx` | 删除 | -120 行 |
| `src/components/ChatInput.module.css` | 删除 | -200 行 |
| `src/components/WelcomeScreen.tsx` | 删除 | -50 行 |
| `src/components/WelcomeScreen.module.css` | 删除 | -80 行 |
| `src/App.tsx` | 改 | -10 行 + 5 行 |
| `src/components/ChatWindow.tsx` | 改 | -3 行 |
| `src/lib/intake.ts` | 改 | -10 行 |
| `src/i18n/zh.ts` + `en.ts` | 改 | -25 行 |
| **总计** | | **-490 行(净减),+ 5 行(StopButton 入口)** |

---

## 6. 口径冲突修复

### 6.1 业态口径:5 chip → 6 业态枚举

#### 6.1.1 冲突详情

| 来源 | 业态枚举 |
|------|---------|
| 现有 IntakeWizard 5 chip | 保障性租赁住房 / 长租公寓 / 文创园区 / 商业办公 / 产业园区 |
| agent1 / agent2 / agent5 | 商业 / 办公 / 文旅 / 工业仓储 / 居住 / 公共服务(6 业态) |
| agent3 user_industry | 商业 / 办公 / 文旅(只 3 类) |
| agent4 industry | 商业 / 办公 / 文旅(只 3 类,其他触发 F8 兜底) |

#### 6.1.2 修复方案

用 **6 业态枚举**替换 IntakeWizard 的 5 chip,与 agent1/2/3/5 主流口径对齐。

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  🛍️  商业   │ │  🏢  办公   │ │  🎭  文旅   │
└─────────────┘ └─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 🏭 工业仓储 │ │  🏠  居住   │ │ 🏥 公共服务 │
└─────────────┘ └─────────────┘ └─────────────┘
```

#### 6.1.3 兼容旧 5 chip 的迁移

```ts
// src/lib/intake.ts 新增
export const LEGACY_INDUSTRY_MAP: Record<string, string> = {
  '保障性租赁住房': '居住',
  '长租公寓':       '居住',
  '文创园区':       '文旅',
  '商业办公':       '办公',
  '产业园区':       '工业仓储',
};

export function migrateLegacyIndustry(old: string): string {
  return LEGACY_INDUSTRY_MAP[old] ?? old;
}
```

历史 localStorage 里的 `direction` 字段在 IntakeWizard 挂载时调用 `migrateLegacyIndustry` 做迁移。

#### 6.1.4 兼容 agent4 F8 兜底

agent4 业态门槛表只支持商业/办公/文旅。**这是 agent4 自身的降级路径,前端不修**。

用户在 Step 4 选了"居住/工业仓储/公共服务"时,字段下方 inline 提示(灰字):
> ⚠️ 此业态在 agent4 财务模型中无专属门槛表,会触发 F8 兜底(宽松阈值),IRR 测算精度会下降。

不阻断,只是知情提示。

#### 6.1.5 用户填了"具体业态"的通道

如果用户嫌 6 业态太抽象,可在 **Step 2 的 `current_status` 文本框**里补充:
> "现状:90 年代老旧厂房,计划改造为长租公寓(居住类)..."

LLM 在 project_description 里能"看见"并传给各 agent 做细化。

### 6.2 试点城市硬阻断

#### 6.2.1 阻断规则

**用 agent2 H1 维度1 的 15 个市级名单作为前端硬阻断标准**:

```
agent2 H1 维度1 试点城市(15 个):
北京 / 上海 / 广州 / 深圳 / 杭州 / 成都 /
武汉 / 西安 / 重庆 / 南京 / 天津 / 长沙 /
青岛 / 郑州 / 厦门
```

理由:
- 简单清晰(15 个具体城市,用户一目了然)
- agent2 H1 维度1 是硬约束,前端阻断与之严格对齐
- agent3 H4 是省级粒度,粒度太粗,前端不基于它阻断
- 15 城中大部分所在省份同时落在 agent3 H4 名单,选这 15 城基本能保证 agent2 + agent3 双通过

#### 6.2.2 city 字段升级为 15 城卡片网格

```
┌─ Step 1: 选择试点城市 ────────────────────────────────┐
│                                                          │
│   📍 你的项目必须在以下 15 个试点城市之一               │
│   (非试点城市无法启动 super-skill 测算流程)            │
│                                                          │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│   │ 🏛️ 北京  │ │ 🏙️ 上海  │ │ 🌉 重庆  │                │
│   │ ✓ 双名单 │ │ ✓ 双名单 │ │ ✓ 双名单 │                │
│   └──────────┘ └──────────┘ └──────────┘                │
│   ... (共 15 个城市卡片)                                 │
│                                                          │
│   🗺️  区位(行政区 / 园区 / 地块名)  *                  │
│   [_________________________________]                    │
│                                                          │
│                              [ 跳过区位 ] [ 下一步 ]    │
└──────────────────────────────────────────────────────────┘
```

✓ 双名单标识:北京/上海/重庆(既是 agent2 市级,所在直辖市也落在 agent3 省级)。

#### 6.2.3 非试点城市的兜底入口

city 字段不允许自由输入,只能从 15 卡片选。如果用户坚持要测不在 15 城的项目,提供"我的城市不在列表"链接(很小,灰色),点击后弹窗:

```
┌─ ⚠️ 非试点城市 ────────────────────────────────────┐
│                                                      │
│   super-skill 测算流程依赖 agent2 政策应答的 15 个   │
│   试点城市资格判定。非试点城市会触发 H1 维度1 阻断, │
│   政策清单全部"不适用",整个测算无法给出有效结论。   │
│                                                      │
│   如果你认为你的城市应该被支持,可以:                │
│   1. 联系运营团队申请加入试点                        │
│   2. 选择最近的试点城市作为代算(结果仅供参考)      │
│                                                      │
│                          [ 我知道了 ]               │
└──────────────────────────────────────────────────────┘
```

弹窗只有一个按钮"我知道了",关闭后回到 Step 1,**不进入下一步**。

#### 6.2.4 city 字段状态机

| 字段 | 必填 | 跳过弹窗 | 硬阻断条件 |
|------|------|---------|----------|
| `city` | **P0 hard** | **不允许跳过** | 必须从 15 城卡片选一个 |
| `location` | P0 soft | 允许跳过(软警告) | 无 |
| 其他 18 P0 字段 | P0 soft | 允许跳过(软警告) | 无 |
| 3 个 P1 字段 | P1 | 允许跳过(用默认值) | 无 |

**city 是唯一硬阻断字段,其他 P0 字段保持第 4 节的软警告机制。**

#### 6.2.5 历史 localStorage 数据迁移

如果旧会话的 `city` 字段值不在 15 城名单(罕见,但可能):
- IntakeWizard 挂载时检测
- 显示弹窗"你之前填的城市 X 不在试点名单,请重新选择"
- 清空 city 字段,让用户重新选

```ts
const PILOT_CITIES_15 = ['北京', '上海', '广州', '深圳', '杭州', '成都',
                         '武汉', '西安', '重庆', '南京', '天津', '长沙',
                         '青岛', '郑州', '厦门'];

useEffect(() => {
  if (values.city && !PILOT_CITIES_15.includes(values.city)) {
    showCityMigrationModal();
    setValues(v => ({ ...v, city: '' }));
  }
}, []);
```

### 6.3 数字字段单位口径

#### 6.3.1 冲突

agent3/agent4 SKILL.md 用小数(capital_ratio 0-1, occupancy 0-1, exit_cap_rate 0-0.3, discount_rate 0-0.5),但人类习惯用百分比。

#### 6.3.2 修复方案

**前端 UI 用 %,提交时换算成小数。**

```ts
// src/lib/intake.ts 新增
export function intakeValuesToPrompt(values: IntakeValues): string[] {
  const lines: string[] = [];

  if (values.capital_ratio != null) {
    lines.push(`- 自有资金比例:${(values.capital_ratio / 100).toFixed(2)} (即 ${values.capital_ratio}%)`);
  }
  if (values.occupancy != null) {
    lines.push(`- 出租率:${(values.occupancy / 100).toFixed(2)}`);
  }
  if (values.exit_cap_rate != null) {
    lines.push(`- 退出 cap rate:${(values.exit_cap_rate / 100).toFixed(3)}`);
  }
  if (values.discount_rate != null) {
    lines.push(`- 折现率:${(values.discount_rate / 100).toFixed(2)}`);
  }
  // ...
  return lines;
}
```

#### 6.3.3 滑块控件范围

| 字段 | UI 滑块范围 | 步进 | 提交时换算 |
|------|------------|------|-----------|
| capital_ratio | 0-100 % | 1 | ÷100 |
| occupancy | 0-100 % | 1 | ÷100 |
| exit_cap_rate | 0-30 % | 0.1 | ÷100 |
| discount_rate | 0-50 % | 0.1 | ÷100 |

#### 6.3.4 H 硬约束的可视化(capital_ratio 25-30%)

`capital_ratio` 滑块在 25-30% 区间用绿色高亮,其他区间用黄色:

```
0%─────────25%─30%──────────100%
   黄色区间   绿色    黄色区间
```

让用户**视觉上**看到 H1 硬约束的"安全区",但不阻止用户填 10%(后端 red 是用户的选择)。

### 6.4 单位标准化

| 字段 | UI 单位 | 提交文案示例 |
|------|---------|-------------|
| building_area | ㎡ | 50000 ㎡ |
| height_m | m | 4.5 m |
| investment | 万元 | 30000 万元 |
| mortgage_value | 万元 | 25000 万元 |
| monthly_rent | 元/㎡/月 | 120 元/㎡/月 |
| leasable_area | ㎡ | 35000 ㎡ |
| holding_years | 年 | 15 年 |

---

## 7. 后端是否需要改 + 测试与验收

### 7.1 后端 0 改动确认

| 后端文件 | 是否需要改 | 原因 |
|---------|----------|------|
| `agents/chat/index.ts` | ❌ 不改 | 接收 user_input: string,前端发什么 prompt 都能消化 |
| `agents/chat/_stream.ts` | ❌ 不改 | SSE 事件类型前端已对齐 |
| `agents/chat/_tools.ts` | ❌ 不改 | sandbox 启动逻辑不依赖 intake 字段 |
| `agents/stop/index.ts` | ❌ 不改 | 中止信号链路不变 |
| `agents/_libsql.ts` | ❌ 不改 | SQL 白名单 + 向量检索不变 |
| `agents/_model.ts` | ❌ 不改 | 模型路由不变 |
| `cloud-functions/*` | ❌ 不改 | CRUD 接口不变 |
| `.claude/skills/super-skill/SKILL.md` | ❌ 不改 | super-skill 读 project_description 自然语言 |
| `.claude/skills/agent1~6-*/SKILL.md` | ❌ 不改 | 各 agent 输入由 LLM 从 project_description 抽取 |

### 7.2 关键安全性核查

| 风险点 | 核查结果 |
|--------|---------|
| 前端 prompt 长度(22 字段 ≈ 1-2KB)是否触及后端上限? | ✅ 不触及,EdgeOne Cloud Functions 默认请求 body 上限 1MB |
| composeProjectPrompt 多段输出是否影响 LLM 抽取精度? | ✅ 反而提升 — LLM 能"看见"用户主动跳过哪些字段 |
| SSE event 类型是否需要扩展? | ❌ 不需要 — 现有 text_delta/agent_output/suggest_actions/report_ready 已覆盖 |
| `/log-message` 是否需要改? | ❌ 不改 — 它只消费单条 message,不读 intake 结构 |
| 后端是否需要校验"15 城硬阻断"? | ❌ 不需要 — 前端硬阻断,后端继续按 agent2 H1 自己判定(双保险) |

### 7.3 测试策略

#### 7.3.1 单元测试(vitest)

| 测试文件 | 覆盖范围 |
|---------|---------|
| `src/lib/__tests__/intake.test.ts`(扩) | composeProjectPrompt 22 字段输出 / INTAKE_WARNINGS 全覆盖 / intakeValuesToPrompt 单位换算 / migrateLegacyIndustry 旧 chip → 新 6 业态 |
| `src/lib/__tests__/pipeline.test.ts`(已存在) | 6 agent 状态机不变 |
| `src/lib/__tests__/api.test.ts`(新增,如不存在) | sendMessageStream SSE 解析 |

#### 7.3.2 组件测试(React Testing Library)

| 测试文件 | 覆盖范围 |
|---------|---------|
| `src/components/__tests__/IntakeWizard.test.tsx`(新) | 6 步渲染 / 字段必填校验 / 跳过弹窗触发 / 软警告 vs 硬阻断 / city 15 城卡片选择 |
| `src/components/__tests__/IntakeWarningModal.test.tsx`(新) | 弹窗显示 / [返回填写] / [继续跳过] / skippedFields 状态 |
| `src/components/__tests__/StopButton.test.tsx`(新) | disabled 状态隐藏 / loading 时显示 |
| `src/components/__tests__/SuggestActions.test.tsx`(扩) | rerun_agent 新文案 |

#### 7.3.3 集成测试(Playwright E2E)

| 测试场景 | 步骤 |
|---------|------|
| 完整旅程(全部字段都填) | 进页面 → 6 步填完 → 提交 → SSE 流 → PipelineBar 6 节点 done → ReportModal 弹出 |
| 软警告旅程(故意跳过 3 个 P0) | 6 步中跳过 capital_ratio / monthly_rent / holding_years → 弹窗逐个确认 → 提交 → 后端跑出降级报告 |
| 硬阻断旅程(尝试非 15 城) | city 字段尝试输入"苏州" → UI 不允许 → 点"我的城市不在列表" → 弹窗提示 → 阻断 |
| 旧会话迁移(localStorage 有 5 chip 数据) | 进页面 → 检测到 legacy industry → 自动迁移 → IntakeWizard 显示新 6 业态 |

### 7.4 验收清单

#### 诉求 1:强制逐项输入(22 字段)

- [ ] IntakeWizard Step 1-6 共展示 22 个字段(19 P0 + 3 P1)
- [ ] city 字段为 15 城卡片网格(硬阻断)
- [ ] 18 个 P0 软警告字段跳过时弹窗(逐字段)
- [ ] 3 个 P1 字段跳过时显示默认值,无弹窗
- [ ] 弹窗文案引用 INTAKE_WARNINGS 表的具体降级路径
- [ ] skippedFields 状态在步内/跨步保留
- [ ] Step 7 预览页显示缺失字段红色标注 + 后果清单
- [ ] composeProjectPrompt 输出【已填信息】+【用户主动跳过】+【用默认值的字段】三段

#### 诉求 2:强制 super-skill 全流程

- [ ] IntakeValues 接口移除 goal 字段
- [ ] IntakeGoal 类型删除
- [ ] composeProjectPrompt 固定输出 PROMPT_SUFFIX = "请按 super-skill 完整上会测算流程..."
- [ ] i18n 删除 wizard.qGoal / wizard.goalFull 等 9 个 key
- [ ] SuggestActions rerun_agent 文案改为"重新测算(全流程)"
- [ ] 全文 grep `IntakeGoal` / `values.goal` → 0 命中

#### 诉求 3:隐藏 ChatInput

- [ ] src/components/ChatInput.tsx 删除
- [ ] src/components/ChatInput.module.css 删除
- [ ] src/components/WelcomeScreen.tsx 删除
- [ ] src/components/WelcomeScreen.module.css 删除(如存在)
- [ ] App.tsx 不再 import 上述组件
- [ ] App.tsx 用 uiStage 控制 IntakeWizard 显隐
- [ ] StopButton 新组件挂在 chatPanel header
- [ ] 全文 grep `ChatInput` / `WelcomeScreen` → 0 命中
- [ ] 全文 grep `chat.placeholder` / `preset.project.*` → 0 命中

#### 业态口径修复

- [ ] Step 4 用 6 业态枚举替换原 5 chip
- [ ] LEGACY_INDUSTRY_MAP 函数 + IntakeWizard 挂载时迁移
- [ ] 旧 5 chip 数据自动迁移到新枚举
- [ ] 选"居住/工业仓储/公共服务"时 inline 提示 F8 兜底

#### 试点城市硬阻断

- [ ] city 字段从 datalist 升级为 15 城卡片网格
- [ ] "我的城市不在列表"链接 + 弹窗
- [ ] 旧 localStorage 中 city 不在 15 城 → 迁移弹窗 + 清空

### 7.5 实施分阶段

| 阶段 | 工作内容 | 输出 |
|------|---------|------|
| **阶段 1:删除类改动** | 删 ChatInput / WelcomeScreen / goal / preset chips;加 StopButton 到 header;加 uiStage 状态机 | App.tsx 干净,IntakeWizard 仍是 5 字段,能跑通 |
| **阶段 2:IntakeWizard 扩字段** | 5 → 22 字段;6 步 + 预览页;IntakeWarningModal;INTAKE_WARNINGS 映射表;i18n 110 key | 完整字段采集,但 city 仍是 datalist |
| **阶段 3:口径修复 + 硬阻断** | 5 chip → 6 业态;migrateLegacyIndustry;city 升级 15 城卡片网格;滑块 + H 硬约束可视化 | 完整功能 |
| **阶段 4:测试 + 验收** | 单元测试 + 组件测试 + E2E 三场景;跑全 grep 核查清单;npm run build 0 报错 | 可发布 |

每个阶段独立 commit,如果某阶段 build 失败,git revert 到上一阶段。

### 7.6 风险与回滚

| 风险 | 缓解 |
|------|------|
| i18n 110 key 漏译 | 用 zh.ts / en.ts 对照表批量生成;review 时用 grep 核查每个 field key 都有 5 个文案 |
| composeProjectPrompt 多段输出让 LLM 误判 | 在 prompt 里用清晰的【已填信息】/【用户主动跳过的字段】分隔,LLM 能区分 |
| 用户跳过太多字段导致后端 red 链 | Step 7 预览页加红色 banner"超过 8 个关键字段缺失,建议返回填写",但不强制阻断 |
| 旧 localStorage 数据迁移失败 | migrateLegacyIndustry 默认 fallback 到 '其他';city 不在 15 城时清空 + 弹窗 |
| ChatInput 删除导致 onStop / onClear 无处挂载 | StopButton 放 header;ClearHistory 放 ConversationSidebar 长按菜单 |
| TypeScript strict 模式 build 失败 | 阶段 2 完成后立即跑 npm run build,补类型;阶段 4 最终 build 0 报错 |

### 7.7 最终交付物

- 改造后的 src/ 完整代码
- 单元测试覆盖率 ≥ 80%(intake.ts 纯函数 100%)
- E2E 三场景通过
- 全 grep 核查清单 0 命中
- npm run build 0 报错,输出 dist/
- EdgeOne Makers 部署成功,公网域名访问正常

---

## 附录 A:关键文件绝对路径清单

| 文件 | 用途 |
|------|------|
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/App.tsx` | 主壳子 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/App.module.css` | 三列布局 CSS |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/ChatInput.tsx` | 待删除 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/WelcomeScreen.tsx` | 待删除 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/IntakeWizard.tsx` | 重写 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/PipelineBar.tsx` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/AgentPane.tsx` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/SuggestActions.tsx` | 改文案 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/ReportModal.tsx` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/ConversationSidebar.tsx` | 改"新建会话"回调 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/lib/intake.ts` | 重写 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/lib/pipeline.ts` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/types.ts` | 改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/i18n/zh.ts` | 扩 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/i18n/en.ts` | 扩 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/super-skill/SKILL.md` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/agent1-固有对象/SKILL.md` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/agent2-政策应答/SKILL.md` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/agent3-多元融资/SKILL.md` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/agent4-财务模型/SKILL.md` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/agent5-失败案例/SKILL.md` | 不改 |
| `/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.claude/skills/agent6-双层决策/SKILL.md` | 不改 |

## 附录 B:15 试点城市完整名单

```
北京 / 上海 / 广州 / 深圳 / 杭州 / 成都 /
武汉 / 西安 / 重庆 / 南京 / 天津 / 长沙 /
青岛 / 郑州 / 厦门
```

## 附录 C:6 业态枚举与具体业态的映射

| 用户选 6 业态 | 在 current_status 描述里补充具体业态 |
|---------------|--------------------------------------|
| 居住 | 长租公寓 / 保障性租赁住房 / 普通住宅 |
| 文旅 | 文创园区 / 历史街区 / 旅游商业 |
| 工业仓储 | 产业园区 / 仓储物流 |
| 商业 | 购物中心 / 商业街 |
| 办公 | 商办楼宇 / 联合办公 |
| 公共服务 | 社区配套 / 教育医疗 |

---

**文档结束**
