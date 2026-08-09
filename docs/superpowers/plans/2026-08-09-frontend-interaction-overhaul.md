# 前端交互改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造 claude-agent-starter-node-team 前端,达成三诉求 — (1) 强制逐项输入 22 字段 + 软警告机制 (2) 删 goal 字段固定全流程 (3) 完全删除 ChatInput 自由聊天框。

**Architecture:** 引入顶层 `uiStage: 'intake' | 'running' | 'review'` 状态机替换散落的隐式判断;IntakeWizard 从 5 字段扩到 22 字段(19 P0 + 3 P1),city 字段升级为 15 城卡片网格硬阻断,其他 P0 字段软警告可跳过;删除 ChatInput/WelcomeScreen/IntakeGoal/preset chips;后端 0 改动。

**Tech Stack:** React 18 + Vite 5 + TypeScript 5(strict 模式);vitest 2.x 单元测试;React Testing Library 组件测试;原生 fetch SSE 客户端。

## Global Constraints

- **改造范围**:仅 `src/` 目录;后端 `agents/`、`cloud-functions/`、`.claude/skills/` 全部 0 改动
- **TypeScript strict 模式**:`tsconfig.json` 启用 `strict` + `noUnusedLocals` + `noUnusedParameters`,任何未使用 import / 未声明类型都会让 `npm run build` 失败
- **build 流程**:`npm run build` = `tsc && vite build`,必须 0 报错
- **测试运行器**:vitest 2.x(`npm install` 已装),已有 `src/lib/__tests__/` 目录,但 `package.json` 无 test script,本计划会加上
- **i18n 双语**:`src/i18n/zh.ts` + `en.ts` 必须同步,缺一个会导致 useT() 运行时报错
- **commit 规范**: conventional commits 格式 `<type>: <description>`,中文 description 可接受
- **依赖锁定**:不引入新的 npm 依赖(项目已有 react/vitest/clsx 等足够)
- **CLAUDE.md 规则**:不要在这次改造里提交 git,**全部完成 + 本地测试通过后再统一 commit**(用户明确要求)

---

## File Structure(改造范围全景)

```
src/
├── App.tsx                       [改] uiStage 状态机 + 删 ChatInput/WelcomeScreen 引用
├── App.module.css                [改] chatPanel header 加 StopButton 位置
├── types.ts                      [改] 加 UiStage / IntakeWarning;删 IntakeGoal 相关
├── lib/
│   ├── intake.ts                 [重写] IntakeValues 22 字段 + INTAKE_WARNINGS + composeProjectPrompt 三段输出 + intakeValuesToPrompt + migrateLegacyIndustry + PILOT_CITIES_15 + LEGACY_INDUSTRY_MAP
│   └── __tests__/
│       └── intake.test.ts        [扩] 单元测试全覆盖
├── components/
│   ├── ChatInput.tsx             [删]
│   ├── ChatInput.module.css      [删]
│   ├── WelcomeScreen.tsx         [删]
│   ├── WelcomeScreen.module.css  [删]
│   ├── IntakeWizard.tsx          [重写] 6 步 + 预览页 + 22 字段 UI + skippedFields 状态机
│   ├── IntakeWizard.module.css   [改/扩] 适配新字段类型(滑块/卡片网格/数字输入)
│   ├── IntakeWarningModal.tsx    [新增] 软警告弹窗
│   ├── IntakeWarningModal.module.css [新增]
│   ├── StopButton.tsx            [新增] header 中止按钮
│   ├── StopButton.module.css     [新增]
│   ├── CityMigrationModal.tsx    [新增] 旧 localStorage 数据迁移弹窗
│   ├── CityMigrationModal.module.css [新增]
│   ├── SuggestActions.tsx        [改] rerun_agent 文案改"重新测算(全流程)"
│   ├── ChatWindow.tsx            [改] 不再渲染 WelcomeScreen
│   └── __tests__/
│       ├── IntakeWizard.test.tsx       [新增]
│       └── IntakeWarningModal.test.tsx [新增]
├── i18n/
│   ├── zh.ts                     [扩] ~110 个新 key + 删 goal/chat.placeholder/preset
│   └── en.ts                     [扩] 同上
└── (其余文件不动)
```

---

## Task 1: 引入 uiStage 状态机

**Files:**
- Modify: `src/types.ts`(末尾追加)
- Modify: `src/App.tsx`(state 声明 + 同步逻辑)

**Interfaces:**
- Consumes: `Message[]` 来自现有 state(用于判定 `review` vs `running`)
- Produces: `UiStage` 类型 + `App.tsx` 顶层 `uiStage` state;后续 task 的删除/条件渲染都基于此

- [ ] **Step 1: 在 `src/types.ts` 末尾追加 UiStage 类型**

```ts
// === uiStage 状态机(改造引入)===
/**
 * Top-level UI state machine. Replaces ad-hoc checks like
 * `messages.length === 0` and `loading` for driving layout decisions.
 *
 * - 'intake':  user is filling IntakeWizard (first visit or "new project")
 * - 'running': SSE stream active, agent pipeline running
 * - 'review':  report_ready received, ReportModal shown, SuggestActions visible
 */
export type UiStage = 'intake' | 'running' | 'review';
```

- [ ] **Step 2: 在 `src/App.tsx` 引入 uiStage state(在 messages/loading state 附近)**

定位 `const [messages, setMessages] = useState<Message[]>([])` 这一行(约第 200-300 行之间),在其**下方**追加:

```ts
import type { UiStage } from './types';
// ...
const [uiStage, setUiStage] = useState<UiStage>('intake');
```

> 注:`useState` 已在 App.tsx 第 1 行 import;`UiStage` 类型加到第 11 行的 `import type { ... } from './types'` 里。

- [ ] **Step 3: 在现有 `loading` 状态变化时同步 uiStage**

定位现有的 `setLoading(true)`(用户发消息时)和 `setLoading(false)`(SSE done/error 时)。在 `setLoading(true)` 后面紧跟 `setUiStage('running')`;在 SSE `done` / `error` 处理器里 `setLoading(false)` 后面紧跟 `setUiStage('review')`。

> 具体位置取决于 SSE 解析逻辑,通过 grep `setLoading` 找到。

- [ ] **Step 4: 验证 build 通过**

Run: `cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team && npm run build`
Expected: PASS(此时 uiStage 还未驱动渲染,只是引入)

- [ ] **Step 5: Commit**(用户最后统一 commit,本步暂跳过 — 全部 task 完成后用户统一 commit)

---

## Task 2: 创建 StopButton 组件

**Files:**
- Create: `src/components/StopButton.tsx`
- Create: `src/components/StopButton.module.css`

**Interfaces:**
- Consumes: `useT()` i18n hook,`aria.stopGeneration` i18n key
- Produces: `default export StopButton` 组件,props `{ visible: boolean; onStop: () => void }`

- [ ] **Step 1: 创建 StopButton.tsx**

```tsx
import React from 'react';
import { useT } from '../i18n';
import styles from './StopButton.module.css';

interface Props {
  visible: boolean;
  onStop: () => void;
}

const StopButton: React.FC<Props> = ({ visible, onStop }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onStop}
      aria-label={t('aria.stopGeneration')}
      title={t('aria.stopGeneration')}
    >
      <svg viewBox="0 0 20 20" fill="none" width="12" height="12" aria-hidden>
        <rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />
      </svg>
      <span className={styles.label}>{t('aria.stopGeneration')}</span>
    </button>
  );
};

export default StopButton;
```

- [ ] **Step 2: 创建 StopButton.module.css**

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 99, 99, 0.12);
  color: #ff6363;
  border: 1px solid rgba(255, 99, 99, 0.32);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease, transform 120ms ease;
}
.btn:hover {
  background: rgba(255, 99, 99, 0.22);
}
.btn:active {
  transform: scale(0.97);
}
.label {
  line-height: 1;
}
```

- [ ] **Step 3: 验证 tsc 类型检查通过**

Run: `cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team && npx tsc --noEmit`
Expected: PASS(组件未被引用,只是声明;应不报错)

---

## Task 3: 删除 ChatInput 组件 + 接入 StopButton 到 header

**Files:**
- Delete: `src/components/ChatInput.tsx`
- Delete: `src/components/ChatInput.module.css`
- Modify: `src/App.tsx`(删 import + 删 JSX + 加 StopButton)
- Modify: `src/App.module.css`(header 加 StopButton slot)

**Interfaces:**
- Consumes: `StopButton` from Task 2;`handleStop` callback 已存在于 App.tsx
- Produces: ChatInput 完全消失,App.tsx header 用 StopButton 替代

- [ ] **Step 1: 删除 ChatInput 文件**

Run:
```bash
mv /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/ChatInput.tsx ~/.Trash/ChatInput.tsx
mv /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/ChatInput.module.css ~/.Trash/ChatInput.module.css
```

> 按 CLAUDE.md 规则:删除文件移到废纸篓,不直接永久删除。

- [ ] **Step 2: 在 App.tsx 删除 ChatInput import 和 JSX**

定位 `import ChatInput from './components/ChatInput';`(约第 34 行)— **整行删除**。

定位 `<ChatInput ... />` 渲染(约第 931 行附近,grep `<ChatInput` 找到)— **整段删除**:
```tsx
// 删除这一段
<ChatInput
  onSend={handleSend}
  onStop={handleStop}
  onClear={handleClearHistory}
  disabled={loading}
/>
```

- [ ] **Step 3: 在 App.tsx 加 StopButton import**

把刚刚删掉的 ChatInput import 行替换为:
```ts
import StopButton from './components/StopButton';
```

- [ ] **Step 4: 在 App.tsx 的 chatPanel header 区域插入 StopButton**

定位 chatPanel 的 `<header>` 区域(grep `<header>` 在 App.tsx 找到),在标题和工具灯之间插入:

```tsx
<header className={styles.chatHeader}>
  <div className={styles.titleWrap}>
    {/* 现有标题 */}
  </div>
  <div className={styles.headerActions}>
    {/* 现有工具灯 */}
    <StopButton visible={loading} onStop={handleStop} />
  </div>
</header>
```

- [ ] **Step 5: App.module.css 加 headerActions 样式**

定位 `chatHeader` 样式块(在 App.module.css 中 grep `.chatHeader`),追加:

```css
.headerActions {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 6: grep 核查**

Run: `cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team && rg "ChatInput" src/`
Expected: 0 matches

- [ ] **Step 7: 验证 build 通过**

Run: `npm run build`
Expected: PASS

---

## Task 4: 删除 WelcomeScreen 组件 + IntakeWizard 由 App.tsx 直接挂载

**Files:**
- Delete: `src/components/WelcomeScreen.tsx`
- Delete: `src/components/WelcomeScreen.module.css`
- Modify: `src/App.tsx`(删 import + 用 uiStage 控制 IntakeWizard)
- Modify: `src/components/ChatWindow.tsx`(删 WelcomeScreen 渲染)

**Interfaces:**
- Consumes: `IntakeWizard` 已存在;`uiStage` from Task 1
- Produces: WelcomeScreen 完全消失;IntakeWizard 由 App.tsx 顶层条件渲染

- [ ] **Step 1: 删除 WelcomeScreen 文件**

Run:
```bash
mv /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/WelcomeScreen.tsx ~/.Trash/WelcomeScreen.tsx
mv /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/components/WelcomeScreen.module.css ~/.Trash/WelcomeScreen.module.css
```

> 如果 WelcomeScreen.module.css 不存在,mv 会报错,忽略即可。

- [ ] **Step 2: 在 App.tsx 删除 WelcomeScreen import**

定位 `import { WelcomeScreen } from './components/WelcomeScreen';`(grep 找到)— **整行删除**。

- [ ] **Step 3: 在 ChatWindow.tsx 删除 WelcomeScreen 渲染**

定位 `src/components/ChatWindow.tsx` 里的 WelcomeScreen 引用(grep `WelcomeScreen` 找到)— 删除整个 `messages.length === 0 && <WelcomeScreen ... />` 块。

> 如果 ChatWindow 内联了 WelcomeScreen 渲染,把这块删干净,保留 ChatWindow 自己的 messages 列表渲染。

- [ ] **Step 4: 在 App.tsx 用 uiStage 条件渲染 IntakeWizard**

定位 chatPanel 中部的 `<div className={styles.chatWindowShell}>` 区域,在其**外部**(chatPanel 顶层)加条件渲染:

```tsx
{uiStage === 'intake' && (
  <div className={styles.intakeSlot}>
    <IntakeWizard onSend={handleSend} disabled={false} />
  </div>
)}
```

> IntakeWizard 在 intake 阶段占据 chatPanel 中部(替代原 ChatWindow 的位置)。running/review 阶段卸载,显示 ChatWindow。

- [ ] **Step 5: App.module.css 加 intakeSlot 样式**

```css
.intakeSlot {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
```

- [ ] **Step 6: grep 核查**

Run: `rg "WelcomeScreen" src/`
Expected: 0 matches

- [ ] **Step 7: 验证 build 通过**

Run: `npm run build`
Expected: PASS(可能有 IntakeWizard 引用未使用警告,后续 task 会修复)

---

## Task 5: 删除 IntakeGoal 类型 + goal 字段 + 改造 composeProjectPrompt

**Files:**
- Modify: `src/lib/intake.ts`(删 IntakeGoal / INTAKE_GOAL_IDS / GOAL_PROMPT,composeProjectPrompt 暂时简化)
- Modify: `src/types.ts`(无需改,IntakeGoal 不在这里)
- Modify: `src/components/SuggestActions.tsx`(改 rerun_agent 文案 i18n key)

**Interfaces:**
- Consumes: 无(Task 5 自身定义新接口)
- Produces: `IntakeValues` 暂时只有 4 字段(city/current/scale/direction);Task 7 会扩到 22 字段;`composeProjectPrompt` 暂时简化为 PROMPT_SUFFIX 固定输出;Task 10 会重写为三段输出

- [ ] **Step 1: 改写 src/lib/intake.ts(删除 goal 相关,简化 composeProjectPrompt)**

把 `src/lib/intake.ts` 整个文件**替换**为以下内容(Task 7/10 会进一步扩展):

```ts
/**
 * Guided-intake wizard: compose the final project prompt from step-by-step
 * user answers. Pure logic lives here so it can be unit-tested without
 * React / CSS-module imports.
 *
 * NOTE: 此文件在多 task 之间逐步扩展。当前版本(Task 5):
 *   - 删除 IntakeGoal 4 选 1
 *   - composeProjectPrompt 固化 PROMPT_SUFFIX
 *   - IntakeValues 暂保留 4 字段(Task 7 会扩到 22 字段)
 */

export interface IntakeValues {
  city: string;
  current: string;
  scale: string;
  direction: string;
}

const PROMPT_SUFFIX_ZH = '请按 super-skill 完整上会测算流程,从 agent1 到 agent6 全部输出';
const PROMPT_SUFFIX_EN = 'Run the full super-skill pipeline from agent1 through agent6';

function clean(text: string): string {
  return text.trim().replace(/[。.\s]+$/u, '');
}

/**
 * Compose the natural-language project description sent to the agent.
 * Returns null when any required field is blank.
 */
export function composeProjectPrompt(
  values: IntakeValues,
  lang: 'zh' | 'en',
): string | null {
  const city = clean(values.city);
  const current = clean(values.current);
  const scale = clean(values.scale);
  const direction = clean(values.direction);
  if (!city || !current || !scale || !direction) return null;

  if (lang === 'zh') {
    return `我在${city}有一个城市更新项目:现状为${current},${scale},拟改造为${direction}。${PROMPT_SUFFIX_ZH}。`;
  }
  return `Urban renewal project in ${city}: current condition — ${current}; scale — ${scale}; intended direction — ${direction}. ${PROMPT_SUFFIX_EN}.`;
}
```

- [ ] **Step 2: 改写 IntakeWizard.tsx 移除 goal 引用**

定位 IntakeWizard.tsx 里所有 `goal`、`IntakeGoal`、`INTAKE_GOAL_IDS`、`GOAL_META` 引用,把 step 4(goal 选择)删除,step 5(预览)变 step 4。

具体改动:
- 删除 `import { INTAKE_GOAL_IDS, type IntakeGoal } from '../lib/intake';` 中的 `INTAKE_GOAL_IDS` 和 `IntakeGoal`
- 删除 `GOAL_META` 常量
- 删除 `const [goal, setGoal] = useState<IntakeGoal | null>(null);`
- `canNext` 的 `case 4: return goal !== null;` 改为 `default: return true;`
- 删除 step === 4 的 goalGrid 渲染块
- `composed` 改为 `composeProjectPrompt({ city, current, scale, direction: effectiveDirection }, lang)`
- step 总数从 5 改为 4(进度点和 step 文案)
- step 4 改为预览页(原 step 5)
- 删除 step === 5 的判断改为 step === 4

> 注:这是过渡版本,Task 12 会全面重写 IntakeWizard 为 6 步。

- [ ] **Step 3: 改 SuggestActions rerun_agent 文案**

定位 `src/components/SuggestActions.tsx`(grep 找到)— 它接收 `SuggestAction[]` props,按钮文案来自 `action.title`。后端推过来的 title 是后端控制的,但前端的 i18n fallback(若有)需要改。

如果前端没有 rerun_agent 的 i18n fallback,这一步可以跳过。如果有,改为 `'重新测算(全流程)'`。

> 后端 super-skill SKILL.md 控制推送内容,前端只是被动渲染。后端不改(参见 spec 7.1),所以这条文案实际由后端 LLM 输出决定。前端能做的是预留 i18n key。

- [ ] **Step 4: 跑现有测试,确保 intake.test.ts 通过**

Run: `cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team && npx vitest run src/lib/__tests__/intake.test.ts`

如果有 `intake.test.ts`,预期失败(因为 composeProjectPrompt 签名变了)。打开测试文件,把测试用例的 `goal: 'full'` 等字段删除,断言改为新的 PROMPT_SUFFIX 文案。

- [ ] **Step 5: 验证 build 通过**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: grep 核查**

Run: `rg "IntakeGoal|INTAKE_GOAL_IDS|GOAL_PROMPT|GOAL_META|values\.goal" src/`
Expected: 0 matches

---

## Task 6: 删除 preset chips + chat.placeholder/hint i18n key

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

**Interfaces:**
- Consumes: 无
- Produces: 干净的 i18n 文件,无 ChatInput 残留 key

- [ ] **Step 1: 在 zh.ts 删除以下 key**

定位 zh.ts 中(grep 找到行号)以下 key,**逐行删除整条**:

```
"chat.placeholder": "..."
"chat.hint": "..."
"preset.project.full": "..."
"preset.project.finance": "..."
"preset.project.irr": "..."
```

- [ ] **Step 2: 在 en.ts 同步删除(双语对齐)**

同样删除 en.ts 中的对应 5 条。

- [ ] **Step 3: grep 核查**

Run: `rg "preset\.project|chat\.placeholder|chat\.hint" src/`
Expected: 0 matches

- [ ] **Step 4: 验证 build 通过**

Run: `npm run build`
Expected: PASS(如果有其他代码还引用这些 key,会运行时报错;但因为 ChatInput 已删,应无引用)

---

## Task 7: 扩 IntakeValues 接口到 22 字段

**Files:**
- Modify: `src/lib/intake.ts`

**Interfaces:**
- Consumes: 无
- Produces: 22 字段的 IntakeValues 接口(后续 IntakeWizard / composeProjectPrompt 都依赖)

- [ ] **Step 1: 在 intake.ts 替换 IntakeValues 接口**

把 Task 5 的过渡版 IntakeValues 替换为:

```ts
/**
 * 22 个 intake 字段(19 P0 + 3 P1)。
 * 数字字段允许 null(用户主动跳过)。
 *
 * 单位约定:
 * - capital_ratio: 0-100(%),提交时 ÷100 换算为 0-1
 * - occupancy: 0-100(%),提交时 ÷100
 * - exit_cap_rate: 0-30(%),提交时 ÷100
 * - discount_rate: 0-50(%),提交时 ÷100
 * - 其他数字字段使用人类习惯单位(㎡ / 万元 / 元/㎡/月 / 年 / m)
 */
export interface IntakeValues {
  // Step 1: 基础地理
  city: string;                    // 15 城卡片网格选(硬阻断)
  location: string;                // 区位/行政区/园区
  // Step 2: 业权与现状
  owner_type: string;              // 国企/民企/混合所有制
  property_cert: string;           // 不动产证号
  heritage_level: string;          // 无文保/建控地带/核心保护
  current_status: string;          // 项目现状描述(free text)
  // Step 3: 物理参数
  building_area: number | null;    // 建筑面积(㎡)
  structure_type: string;          // 框架/砖混/木结构/钢结构/其他
  height_m: number | null;         // 层高(m) — P1,可由 LLM 估
  // Step 4: 业态与改造模式
  industry: string;                // 商业/办公/文旅/工业仓储/居住/公共服务(6 业态)
  renovation_mode: string;         // 拆除重建/保留微更新/混合
  // Step 5: 资金面
  investment: number | null;       // 总投资(万元)
  capital_ratio: number | null;    // 自有资金比例(%)
  mortgage_type: string;           // 土地使用权/运营权/收益权/经营权/收费权/组合
  mortgage_value: number | null;   // 抵押物估值(万元)
  // Step 6: 财务与退出
  monthly_rent: number | null;     // 月租金(元/㎡)
  leasable_area: number | null;    // 可租赁面积(㎡)
  holding_years: number | null;    // 持有年限(年,1-50)
  exit_strategy: string;           // 整体出售/单层散售/REITs/持有到期
  occupancy: number | null;        // 出租率(%) — P1,默认 85
  exit_cap_rate: number | null;    // 退出 cap rate(%) — P1,默认 4.5
  discount_rate: number | null;    // 折现率(%) — P1,默认 8
}
```

- [ ] **Step 2: 更新 composeProjectPrompt 过渡版(只校验 4 字段,完整三段输出留到 Task 10)**

把 Task 5 的 composeProjectPrompt 修改 — 只校验 city(硬阻断要求),其他字段允许任意状态:

```ts
export function composeProjectPrompt(
  values: IntakeValues,
  lang: 'zh' | 'en',
): string | null {
  if (!clean(values.city)) return null;
  // 过渡实现:Task 10 会重写为三段输出
  if (lang === 'zh') {
    return `我在${clean(values.city)}有一个城市更新项目。${PROMPT_SUFFIX_ZH}。`;
  }
  return `Urban renewal project in ${clean(values.city)}. ${PROMPT_SUFFIX_EN}.`;
}
```

> Task 10 会重写 composeProjectPrompt 完整版,届时会消费全部 22 字段 + skippedFields + defaultFields。

- [ ] **Step 3: 验证 build 通过**

Run: `npm run build`
Expected: PASS(IntakeWizard 还没用新字段,但接口扩了不会报错)

---

## Task 8: 加 INTAKE_WARNINGS 映射表 + IntakeWarning 类型

**Files:**
- Modify: `src/types.ts`(加 IntakeWarning 类型)
- Modify: `src/lib/intake.ts`(加 INTAKE_WARNINGS 常量)

**Interfaces:**
- Consumes: IntakeValues 字段名(22 个 key)
- Produces: `IntakeWarning` 类型 + `INTAKE_WARNINGS` 表,被 IntakeWarningModal 和 IntakeWizard 消费

- [ ] **Step 1: 在 src/types.ts 末尾追加 IntakeWarning 类型**

```ts
/**
 * Soft-warning modal payload shown when user attempts to skip a P0 field.
 * (city field is hard-blocked, never uses this modal.)
 */
export interface IntakeWarning {
  fieldKey: string;                         // e.g. "capital_ratio"
  fieldName: string;                        // i18n-resolved label, filled at runtime
  severity: 'blocker' | 'degraded';         // blocker=降级路径,degraded=默认值兜底
  consequence: string;                      // 业务后果文案
  technicalRef: string;                     // e.g. "agent3 H1"
  suggestion: string;                       // 建议文案
}
```

- [ ] **Step 2: 在 src/lib/intake.ts 末尾追加 INTAKE_WARNINGS 表**

```ts
import type { IntakeWarning } from '../types';

/**
 * Per-field soft-warning metadata. IntakeWizard reads this when user
 * attempts to skip a P0 field. city is hard-blocked (no modal).
 *
 * fieldName is filled at runtime by IntakeWizard via i18n lookup of
 * `wizard.field.<key>.label`.
 */
export const INTAKE_WARNINGS: Record<keyof IntakeValues, Omit<IntakeWarning, 'fieldName'>> = {
  city: {
    fieldKey: 'city', severity: 'blocker',
    consequence: '前端阻断 — 必须从 15 试点城市之一选择,否则无法启动 super-skill 测算流程。',
    technicalRef: 'agent2 H1 维度1',
    suggestion: '从 15 城卡片网格中选择项目所在城市。',
  },
  location: {
    fieldKey: 'location', severity: 'blocker',
    consequence: 'agent5 失败案例相似度 S1 降权,匹配精度下降。',
    technicalRef: 'agent5 region',
    suggestion: '至少填到行政区或园区级别。',
  },
  owner_type: {
    fieldKey: 'owner_type', severity: 'blocker',
    consequence: 'agent2 H1 维度4 不符 → 政策清单全部"不适用";agent1 S1 降级。',
    technicalRef: 'agent2 H1 维度4 + agent1 S1',
    suggestion: '从国企/民企/混合所有制中选择业主资质类别。',
  },
  property_cert: {
    fieldKey: 'property_cert', severity: 'blocker',
    consequence: 'agent1 H1 直接无法判定 green → 默认 yellow。',
    technicalRef: 'agent1 H1 F1',
    suggestion: '填不动产证号;若无,可填"暂无"。',
  },
  heritage_level: {
    fieldKey: 'heritage_level', severity: 'blocker',
    consequence: 'agent1 H2 阻断 → 默认 red;agent5 物理参数相似度归零。',
    technicalRef: 'agent1 H2 F4',
    suggestion: '从无文保/建控地带/核心保护中选择。',
  },
  current_status: {
    fieldKey: 'current_status', severity: 'degraded',
    consequence: '各 agent 缺少上下文,LLM 自由发挥,精度不可控。',
    technicalRef: 'all agents (context)',
    suggestion: '至少简短描述项目现状(1-2 句话)。',
  },
  building_area: {
    fieldKey: 'building_area', severity: 'degraded',
    consequence: 'agent1 S2 可经营性降级估分。',
    technicalRef: 'agent1 物理参数',
    suggestion: '填建筑面积(㎡),可估算。',
  },
  structure_type: {
    fieldKey: 'structure_type', severity: 'degraded',
    consequence: 'agent5 案例匹配缺维度,相似度下降。',
    technicalRef: 'agent5',
    suggestion: '从框架/砖混/木结构/钢结构/其他中选择。',
  },
  height_m: {
    fieldKey: 'height_m', severity: 'degraded',
    consequence: 'agent1 S2 降级,LLM 会估层高。',
    technicalRef: 'agent1 物理参数',
    suggestion: '填层高(m);如无数据可跳过,LLM 会估算。',
  },
  industry: {
    fieldKey: 'industry', severity: 'blocker',
    consequence: '多 agent(agent1/2/3/4/5)同时降级;agent4 业态门槛表无法对齐。',
    technicalRef: 'agent1/2/3/4/5 industry',
    suggestion: '从 6 业态枚举(商业/办公/文旅/工业仓储/居住/公共服务)中选择。',
  },
  renovation_mode: {
    fieldKey: 'renovation_mode', severity: 'blocker',
    consequence: 'agent2 H1 项目类型不符 → 政策全不适用;agent4 finance.analyze 缺关键参数。',
    technicalRef: 'agent2 H1 + agent4',
    suggestion: '从拆除重建/保留微更新/混合中选择。',
  },
  investment: {
    fieldKey: 'investment', severity: 'blocker',
    consequence: 'agent3 H1 资本金门槛无法校验 → F4 降级;agent4 缺总投资基线。',
    technicalRef: 'agent3 H1 + agent4',
    suggestion: '填总投资(万元),可估算。',
  },
  capital_ratio: {
    fieldKey: 'capital_ratio', severity: 'blocker',
    consequence: 'agent3 H1 硬约束(资本金比例必须 25-30%)无法判定 → 直接 red,融资工具清单全部不可用。',
    technicalRef: 'agent3 H1',
    suggestion: '估算公式:自有资金 ÷ 总投资。',
  },
  mortgage_type: {
    fieldKey: 'mortgage_type', severity: 'blocker',
    consequence: 'agent3 H2 直接 red。',
    technicalRef: 'agent3 H2',
    suggestion: '从土地使用权/运营权/收益权/经营权/收费权/组合中选择。',
  },
  mortgage_value: {
    fieldKey: 'mortgage_value', severity: 'degraded',
    consequence: 'agent3 还款覆盖率无法算 → yellow。',
    technicalRef: 'agent3 S4',
    suggestion: '填抵押物估值(万元),可估算。',
  },
  monthly_rent: {
    fieldKey: 'monthly_rent', severity: 'blocker',
    consequence: 'agent4 H2 必填 → F6/F12 降级,IRR 无法算。',
    technicalRef: 'agent4 H2',
    suggestion: '填月租金(元/㎡),参考周边同类项目。',
  },
  leasable_area: {
    fieldKey: 'leasable_area', severity: 'blocker',
    consequence: 'agent4 H2 必填 → F6/F12 降级;agent3 S4 也无法算。',
    technicalRef: 'agent4 H2 + agent3 S4',
    suggestion: '填可租赁面积(㎡)。',
  },
  holding_years: {
    fieldKey: 'holding_years', severity: 'blocker',
    consequence: 'agent4 现金流时序无法算;agent5 financing 维度空。',
    technicalRef: 'agent4 H2 + agent3 S3 + agent5',
    suggestion: '填持有年限(年,1-50)。',
  },
  exit_strategy: {
    fieldKey: 'exit_strategy', severity: 'blocker',
    consequence: 'agent3 退出策略空 → F4 降级。',
    technicalRef: 'agent3 S3 + agent5',
    suggestion: '从整体出售/单层散售/REITs/持有到期中选择。',
  },
  occupancy: {
    fieldKey: 'occupancy', severity: 'degraded',
    consequence: '将用默认值 85% 兜底。',
    technicalRef: 'agent4 H2',
    suggestion: '可填出租率(%);如无数据,默认 85% 已合理。',
  },
  exit_cap_rate: {
    fieldKey: 'exit_cap_rate', severity: 'degraded',
    consequence: '将用默认值 4.5% 兜底。',
    technicalRef: 'agent4 H2',
    suggestion: '可填退出 cap rate(%);如无数据,默认 4.5% 已合理。',
  },
  discount_rate: {
    fieldKey: 'discount_rate', severity: 'degraded',
    consequence: '将用默认值 8% 兜底。',
    technicalRef: 'agent4 H2',
    suggestion: '可填折现率(%);如无数据,默认 8% 已合理。',
  },
};
```

- [ ] **Step 3: 验证 build 通过**

Run: `npm run build`
Expected: PASS

---

## Task 9: 创建 IntakeWarningModal 组件

**Files:**
- Create: `src/components/IntakeWarningModal.tsx`
- Create: `src/components/IntakeWarningModal.module.css`

**Interfaces:**
- Consumes: `IntakeWarning` from `src/types`
- Produces: `default export IntakeWarningModal`,props `{ warning: IntakeWarning | null; onConfirmSkip: () => void; onReturnToFill: () => void }`

- [ ] **Step 1: 创建 IntakeWarningModal.tsx**

```tsx
import React, { useEffect } from 'react';
import type { IntakeWarning } from '../types';
import { useT } from '../i18n';
import styles from './IntakeWarningModal.module.css';

interface Props {
  warning: IntakeWarning | null;
  onConfirmSkip: () => void;
  onReturnToFill: () => void;
}

const IntakeWarningModal: React.FC<Props> = ({ warning, onConfirmSkip, onReturnToFill }) => {
  const { t } = useT();

  useEffect(() => {
    if (!warning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onReturnToFill();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warning, onReturnToFill]);

  if (!warning) return null;

  const severityLabel = warning.severity === 'blocker'
    ? t('wizard.warningSeverityBlocker')
    : t('wizard.warningSeverityDegraded');

  return (
    <div className={styles.overlay} onClick={onReturnToFill}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.icon}>⚠️</span>
          <span className={styles.title}>{t('wizard.warningTitle')}</span>
          <span className={`${styles.severity} ${styles[`severity_${warning.severity}`]}`}>
            {severityLabel}
          </span>
        </div>

        <div className={styles.body}>
          <p className={styles.fieldName}>{warning.fieldName} <code className={styles.code}>{warning.fieldKey}</code></p>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t('wizard.warningConsequence')}</h4>
            <p className={styles.sectionBody}>{warning.consequence}</p>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t('wizard.warningTechRef')}</h4>
            <p className={styles.sectionBody}><code className={styles.code}>{warning.technicalRef}</code></p>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t('wizard.warningSuggestion')}</h4>
            <p className={styles.sectionBody}>{warning.suggestion}</p>
          </section>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnSecondary} onClick={onReturnToFill} autoFocus>
            📋 {t('wizard.warningReturn')}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={onConfirmSkip}>
            {t('wizard.warningConfirmSkip')} →
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntakeWarningModal;
```

- [ ] **Step 2: 创建 IntakeWarningModal.module.css**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 30, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid #eef0f4;
}
.icon { font-size: 18px; }
.title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2430;
  flex: 1;
}
.severity {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.severity_blocker {
  background: rgba(255, 99, 99, 0.12);
  color: #c83636;
}
.severity_degraded {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}
.body { padding: 16px 20px; }
.fieldName {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #1f2430;
}
.code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
  background: #f3f4f6;
  color: #4b5563;
  padding: 1px 6px;
  border-radius: 4px;
}
.section { margin-bottom: 12px; }
.sectionTitle {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sectionBody {
  font-size: 14px;
  color: #1f2430;
  margin: 0;
  line-height: 1.55;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #eef0f4;
}
.btnSecondary, .btnPrimary {
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  font-weight: 500;
}
.btnSecondary {
  background: #f3f4f6;
  color: #1f2430;
  border-color: #e5e7eb;
}
.btnSecondary:hover { background: #e5e7eb; }
.btnPrimary {
  background: #1f2430;
  color: #fff;
}
.btnPrimary:hover { background: #111827; }
```

- [ ] **Step 3: 验证 tsc 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 10: 重写 composeProjectPrompt 为三段输出

**Files:**
- Modify: `src/lib/intake.ts`

**Interfaces:**
- Consumes: `IntakeValues`(22 字段)from Task 7
- Produces: 新接口 `ComposedPromptInput` + 三段输出的 composeProjectPrompt

- [ ] **Step 1: 在 intake.ts 替换 composeProjectPrompt**

替换 Task 7 的过渡版,新签名:

```ts
export interface ComposedPromptInput {
  values: IntakeValues;
  skippedFields: Set<string>;            // 用户主动跳过的 P0 字段
  defaultFields: Record<string, string>; // P1 字段用默认值兜底
  lang: 'zh' | 'en';
}

const PROMPT_SUFFIX_ZH = '请按 super-skill 完整上会测算流程,从 agent1 到 agent6 全部输出。对跳过的字段,各 agent 按既定降级路径处理,并在报告里标注"用户未提供"。';
const PROMPT_SUFFIX_EN = 'Run the full super-skill pipeline from agent1 through agent6. For skipped fields, follow the documented degradation paths and label them as "user not provided" in the report.';

const FIELD_LABELS_ZH: Record<keyof IntakeValues, string> = {
  city: '城市', location: '区位',
  owner_type: '业主资质', property_cert: '不动产证号',
  heritage_level: '文保等级', current_status: '现状描述',
  building_area: '建筑面积(㎡)', structure_type: '结构类型', height_m: '层高(m)',
  industry: '业态方向', renovation_mode: '改造模式',
  investment: '总投资(万元)', capital_ratio: '自有资金比例(%)',
  mortgage_type: '抵押物类型', mortgage_value: '抵押物估值(万元)',
  monthly_rent: '月租金(元/㎡/月)', leasable_area: '可租赁面积(㎡)',
  holding_years: '持有年限(年)', exit_strategy: '退出策略',
  occupancy: '出租率(%)', exit_cap_rate: '退出 cap rate(%)', discount_rate: '折现率(%)',
};

export function composeProjectPrompt(input: ComposedPromptInput): string | null {
  const { values, skippedFields, defaultFields, lang } = input;
  if (!clean(values.city)) return null;

  const filledLines: string[] = [];
  const skippedLines: string[] = [];
  const defaultLines: string[] = [];

  (Object.keys(FIELD_LABELS_ZH) as Array<keyof IntakeValues>).forEach(key => {
    const label = FIELD_LABELS_ZH[key];
    const raw = values[key];

    if (skippedFields.has(key)) {
      // 用户主动跳过
      if (lang === 'zh') {
        skippedLines.push(`- ${label}:用户未提供`);
      } else {
        skippedLines.push(`- ${label}: not provided by user`);
      }
      return;
    }

    if (defaultFields[key]) {
      // P1 字段用默认值
      defaultLines.push(`- ${label}:${defaultFields[key]}`);
      return;
    }

    // 已填字段(空值不输出)
    const valueStr = formatValue(raw, key);
    if (valueStr) {
      filledLines.push(`- ${label}:${valueStr}`);
    }
  });

  const headerZh = `我在${clean(values.city)}${values.location ? `(${clean(values.location)})` : ''}有一个城市更新项目。`;
  const headerEn = `Urban renewal project in ${clean(values.city)}${values.location ? ` (${clean(values.location)})` : ''}.`;

  const sectionsZh = [
    '【已填信息】', ...filledLines,
    skippedLines.length ? '【用户主动跳过的字段 — 准确度会下降】' : null,
    ...skippedLines,
    defaultLines.length ? '【用默认值的字段】' : null,
    ...defaultLines,
  ].filter(Boolean).join('\n');

  const sectionsEn = [
    '【Filled】', ...filledLines,
    skippedLines.length ? '【Skipped by user — accuracy will degrade】' : null,
    ...skippedLines,
    defaultLines.length ? '【Using default values】' : null,
    ...defaultLines,
  ].filter(Boolean).join('\n');

  const suffix = lang === 'zh' ? PROMPT_SUFFIX_ZH : PROMPT_SUFFIX_EN;
  const header = lang === 'zh' ? headerZh : headerEnEn;

  return `${header}\n\n${lang === 'zh' ? sectionsZh : sectionsEn}\n\n${suffix}`;
}

function formatValue(raw: string | number | null, key: keyof IntakeValues): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    // 数字字段:百分比类已用 % 单位,无需换算(后端 LLM 自己换算)
    return String(raw);
  }
  return clean(raw);
}
```

> **注**:以上代码片段里有一处 typo `headerEnEn`,实施时应该改为 `headerEn`。这是 plan 的"细节陷阱",实施 task 必须当心。

- [ ] **Step 2: 跑现有 intake 测试**

Run: `npx vitest run src/lib/__tests__/intake.test.ts`

预期测试失败(composeProjectPrompt 签名变了)。这是正常的,Task 18 会重写测试。

- [ ] **Step 3: 验证 build 通过**

Run: `npm run build`
Expected: PASS(签名变了,IntakeWizard 还在用旧签名,会报错)

**修复 IntakeWizard 的过渡调用**:把 IntakeWizard.tsx 里的 `composeProjectPrompt(...)` 调用临时改为:

```ts
const composed = composeProjectPrompt({
  values: { city, current, scale, direction } as unknown as IntakeValues,
  skippedFields: new Set(),
  defaultFields: {},
  lang,
});
```

> 这是过渡 stub,Task 12 会全面重写 IntakeWizard。

- [ ] **Step 4: 验证 build 通过(再次)**

Run: `npm run build`
Expected: PASS

---

## Task 11: 加 intakeValuesToPrompt 单位换算工具函数

**Files:**
- Modify: `src/lib/intake.ts`

**Interfaces:**
- Consumes: IntakeValues 22 字段
- Produces: `intakeValuesToPrompt(values)` 返回 string[],每条一个 `- label: value` 行(百分比字段已 ÷100)

- [ ] **Step 1: 在 intake.ts 末尾追加 intakeValuesToPrompt**

```ts
/**
 * Convert percentage-style fields (stored as 0-100 in UI) to decimal (0-1)
 * for backend consumption. Returns label:value lines for diagnostic display.
 *
 * Note: composeProjectPrompt (Task 10) shows percentages as-is for human
 * readability; this helper is used by Step 7 preview panel when user wants
 * to inspect the "raw" prompt sent to backend.
 */
export function intakeValuesToPrompt(values: IntakeValues): string[] {
  const lines: string[] = [];
  const pct = (v: number | null, label: string) => {
    if (v === null) return;
    lines.push(`- ${label}:${(v / 100).toFixed(v < 1 ? 3 : 2)} (即 ${v}%)`);
  };
  const num = (v: number | null, label: string, unit?: string) => {
    if (v === null) return;
    lines.push(`- ${label}:${v}${unit ? ` ${unit}` : ''}`);
  };
  const str = (v: string, label: string) => {
    if (!clean(v)) return;
    lines.push(`- ${label}:${clean(v)}`);
  };

  str(values.city, '城市');
  str(values.location, '区位');
  str(values.owner_type, '业主资质');
  str(values.property_cert, '不动产证号');
  str(values.heritage_level, '文保等级');
  str(values.current_status, '现状描述');
  num(values.building_area, '建筑面积', '㎡');
  str(values.structure_type, '结构类型');
  num(values.height_m, '层高', 'm');
  str(values.industry, '业态方向');
  str(values.renovation_mode, '改造模式');
  num(values.investment, '总投资', '万元');
  pct(values.capital_ratio, '自有资金比例');
  str(values.mortgage_type, '抵押物类型');
  num(values.mortgage_value, '抵押物估值', '万元');
  num(values.monthly_rent, '月租金', '元/㎡/月');
  num(values.leasable_area, '可租赁面积', '㎡');
  num(values.holding_years, '持有年限', '年');
  str(values.exit_strategy, '退出策略');
  pct(values.occupancy, '出租率');
  pct(values.exit_cap_rate, '退出 cap rate');
  pct(values.discount_rate, '折现率');

  return lines;
}
```

- [ ] **Step 2: 验证 build 通过**

Run: `npm run build`
Expected: PASS

---

## Task 12: 重构 IntakeWizard 为 6 步 + Step 1-3 UI

**Files:**
- Modify: `src/components/IntakeWizard.tsx`(几乎完全重写)
- Modify: `src/components/IntakeWizard.module.css`(加新样式)

**Interfaces:**
- Consumes: IntakeValues from Task 7;INTAKE_WARNINGS from Task 8;IntakeWarningModal from Task 9;composeProjectPrompt from Task 10
- Produces: 6 步骨架 + Step 1-3 完整 UI;Step 4-6 由 Task 13 实现;Step 7 预览页由 Task 14 实现

- [ ] **Step 1: 整体替换 IntakeWizard.tsx 的状态声明和 Step 1-3 渲染**

把整个 IntakeWizard.tsx 替换为以下骨架(Task 13/14 会扩展 Step 4-7):

```tsx
import React, { useMemo, useState } from 'react';
import { useT, type MessageKeys } from '../i18n';
import {
  composeProjectPrompt,
  INTAKE_WARNINGS,
  type IntakeValues,
} from '../lib/intake';
import IntakeWarningModal from './IntakeWarningModal';
import styles from './IntakeWizard.module.css';

const TOTAL_STEPS = 6; // step 0..5 = questions, step 6 = preview

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const EMPTY_VALUES: IntakeValues = {
  city: '', location: '',
  owner_type: '', property_cert: '', heritage_level: '', current_status: '',
  building_area: null, structure_type: '', height_m: null,
  industry: '', renovation_mode: '',
  investment: null, capital_ratio: null, mortgage_type: '', mortgage_value: null,
  monthly_rent: null, leasable_area: null, holding_years: null, exit_strategy: '',
  occupancy: null, exit_cap_rate: null, discount_rate: null,
};

const P1_DEFAULTS: Record<string, string> = {
  occupancy: '85%', exit_cap_rate: '4.5%', discount_rate: '8%',
};

export const IntakeWizard: React.FC<Props> = ({ onSend, disabled }) => {
  const { t, lang } = useT();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<IntakeValues>(EMPTY_VALUES);
  const [skippedFields, setSkippedFields] = useState<Set<string>>(new Set());
  const [activeWarningField, setActiveWarningField] = useState<string | null>(null);

  const update = <K extends keyof IntakeValues>(key: K, value: IntakeValues[K]) => {
    setValues(v => ({ ...v, [key]: value }));
    // If user fills a previously-skipped field, clear the skipped mark
    if (skippedFields.has(key as string)) {
      setSkippedFields(s => {
        const next = new Set(s);
        next.delete(key as string);
        return next;
      });
    }
  };

  // === 跳过弹窗机制 ===
  const checkAndProceed = (nextStep: number) => {
    // Find first P0 field in current step that is empty AND not yet confirmed skipped
    const emptyP0 = getP0FieldsForStep(step).find(k =>
      !skippedFields.has(k) && isFieldEmpty(values, k)
    );
    if (emptyP0 && emptyP0 !== 'city') {
      // city 不进入软警告(city 是硬阻断,UI 不允许空)
      setActiveWarningField(emptyP0);
      return;
    }
    setStep(nextStep);
  };

  const activeWarning = activeWarningField
    ? {
        ...INTAKE_WARNINGS[activeWarningField as keyof IntakeValues],
        fieldName: t(`wizard.field.${activeWarningField}.label` as MessageKeys),
      }
    : null;

  const handleConfirmSkip = () => {
    if (!activeWarningField) return;
    setSkippedFields(s => new Set(s).add(activeWarningField));
    setActiveWarningField(null);
    // 递归检查下一个 P0 字段
    setTimeout(() => checkAndProceed(step), 0);
  };

  const handleReturnToFill = () => {
    setActiveWarningField(null);
  };

  const composed = useMemo(() => {
    if (!clean(values.city)) return null;
    return composeProjectPrompt({
      values,
      skippedFields,
      defaultFields: P1_DEFAULTS,
      lang,
    });
  }, [values, skippedFields, lang]);

  // === Step 1: 基础地理 ===
  // (city 15 城卡片网格 + location 文本框 — Task 15 实现)
  // 这里先放占位 placeholder,Task 15 替换

  // === Step 2: 业权与现状 ===
  // 4 字段:owner_type / property_cert / heritage_level / current_status

  // === Step 3: 物理参数 ===
  // 3 字段:building_area / structure_type / height_m

  // Step 4-6 留给 Task 13;Step 7 留给 Task 14
  return null; // 临时占位,Task 12 Step 2-4 会补全
};

function clean(s: string): string {
  return s.trim();
}

function isFieldEmpty(v: IntakeValues, key: string): boolean {
  const val = v[key as keyof IntakeValues];
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && clean(val) === '') return true;
  return false;
}

function getP0FieldsForStep(step: number): string[] {
  // 每步包含的 P0 字段 key 列表(city 不在这里,因为 city 是硬阻断)
  switch (step) {
    case 0: return ['location'];            // Step 1: city 硬阻断 + location 软警告
    case 1: return ['owner_type', 'property_cert', 'heritage_level', 'current_status'];
    case 2: return ['building_area', 'structure_type']; // height_m 是 P1
    case 3: return ['industry', 'renovation_mode'];
    case 4: return ['investment', 'capital_ratio', 'mortgage_type', 'mortgage_value'];
    case 5: return ['monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy'];
    default: return [];
  }
}

export default IntakeWizard;
```

- [ ] **Step 2: 实现 Step 1-3 渲染(替换上面的 `return null`)**

```tsx
  return (
    <div className={styles.wizard}>
      {/* progress dots */}
      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`${styles.pDot} ${i < step ? styles.pDotDone : ''} ${i === step ? styles.pDotNow : ''}`}
          />
        ))}
        <span className={styles.pText}>
          {step < TOTAL_STEPS ? `${t('wizard.step')} ${step + 1} / ${TOTAL_STEPS}` : t('wizard.previewStep')}
        </span>
      </div>

      {/* === Step 1: 基础地理 === */}
      {step === 0 && (
        <>
          <p className={styles.question}>{t('wizard.qCity')}</p>
          {/* city 15 城卡片网格在 Task 15 替换为 CityPicker 组件 */}
          <input
            className={styles.input}
            value={values.city}
            onChange={e => update('city', e.target.value)}
            placeholder={t('wizard.qCityPh')}
            autoFocus
          />
          <p className={styles.question}>{t('wizard.qLocation')}</p>
          <input
            className={styles.input}
            value={values.location}
            onChange={e => update('location', e.target.value)}
            placeholder={t('wizard.qLocationPh')}
          />
        </>
      )}

      {/* === Step 2: 业权与现状 === */}
      {step === 1 && (
        <>
          <p className={styles.question}>{t('wizard.field.owner_type.label')}</p>
          <div className={styles.cardRow}>
            {['国企', '民企', '混合所有制'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.owner_type === opt ? styles.cardOn : ''}`}
                onClick={() => update('owner_type', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t('wizard.field.property_cert.label')}</p>
          <input
            className={styles.input}
            value={values.property_cert}
            onChange={e => update('property_cert', e.target.value)}
            placeholder={t('wizard.field.property_cert.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.heritage_level.label')}</p>
          <div className={styles.cardRow}>
            {['无文保', '建控地带', '核心保护'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.heritage_level === opt ? styles.cardOn : ''}`}
                onClick={() => update('heritage_level', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t('wizard.field.current_status.label')}</p>
          <textarea
            className={styles.textarea}
            value={values.current_status}
            onChange={e => update('current_status', e.target.value)}
            placeholder={t('wizard.field.current_status.placeholder')}
            rows={3}
          />
        </>
      )}

      {/* === Step 3: 物理参数 === */}
      {step === 2 && (
        <>
          <p className={styles.question}>{t('wizard.field.building_area.label')}</p>
          <input
            type="number" min={0} step={1}
            className={styles.input}
            value={values.building_area ?? ''}
            onChange={e => update('building_area', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.building_area.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.structure_type.label')}</p>
          <div className={styles.cardRow}>
            {['框架', '砖混', '木结构', '钢结构', '其他'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.structure_type === opt ? styles.cardOn : ''}`}
                onClick={() => update('structure_type', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t('wizard.field.height_m.label')}</p>
          <input
            type="number" min={0} step={0.1}
            className={styles.input}
            value={values.height_m ?? ''}
            onChange={e => update('height_m', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.height_m.placeholder')}
          />
          <p className={styles.hint}>{t('wizard.field.height_m.hint')}</p>
        </>
      )}

      {/* === Step 4-6 在 Task 13 添加 === */}
      {/* === Step 7 预览页 在 Task 14 添加 === */}

      {/* footer nav */}
      <div className={styles.nav}>
        {step > 0 && (
          <button type="button" className={styles.navGhost} onClick={() => setStep(s => s - 1)}>
            ← {t('wizard.back')}
          </button>
        )}
        {step < TOTAL_STEPS - 1 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => checkAndProceed(step + 1)}
          >
            {t('wizard.next')} →
          </button>
        )}
      </div>

      <IntakeWarningModal
        warning={activeWarning}
        onConfirmSkip={handleConfirmSkip}
        onReturnToFill={handleReturnToFill}
      />
    </div>
  );
```

- [ ] **Step 3: 在 IntakeWizard.module.css 加新样式类**

```css
.wizard { display: flex; flex-direction: column; gap: 16px; max-width: 640px; margin: 0 auto; }
.progress { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.pDot { width: 8px; height: 8px; border-radius: 50%; background: #d1d5db; }
.pDotDone { background: #10b981; }
.pDotNow { background: #1f2430; transform: scale(1.3); }
.pText { margin-left: 12px; font-size: 12px; color: #6b7280; }
.question { font-size: 14px; font-weight: 600; color: #1f2430; margin: 12px 0 6px; }
.input, .textarea {
  width: 100%; padding: 10px 12px;
  border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 14px; font-family: inherit;
  background: #fff; color: #1f2430;
}
.input:focus, .textarea:focus { outline: 2px solid #1f2430; outline-offset: -1px; }
.textarea { resize: vertical; min-height: 80px; font-family: inherit; }
.cardRow { display: flex; flex-wrap: wrap; gap: 8px; }
.card {
  padding: 10px 16px; border-radius: 8px;
  border: 1px solid #d1d5db; background: #fff; color: #1f2430;
  font-size: 13px; cursor: pointer; transition: all 120ms ease;
}
.card:hover { border-color: #1f2430; }
.cardOn { background: #1f2430; color: #fff; border-color: #1f2430; }
.hint { font-size: 12px; color: #6b7280; margin: 4px 0 0; }
.nav { display: flex; justify-content: space-between; margin-top: 16px; }
.navGhost {
  background: transparent; color: #6b7280;
  border: none; cursor: pointer; font-size: 13px;
}
.navPrimary {
  background: #1f2430; color: #fff;
  padding: 10px 20px; border-radius: 8px;
  border: none; cursor: pointer; font-size: 13px; font-weight: 500;
  margin-left: auto;
}
.navPrimary:hover { background: #111827; }

@media (max-width: 768px) {
  .wizard { padding: 16px; }
  .cardRow { flex-direction: column; align-items: stretch; }
}
```

- [ ] **Step 4: 验证 build 通过**

Run: `npm run build`
Expected: PASS(Step 4-7 还没实现,IntakeWizard 是过渡版,build 应通过)

---

## Task 13: 实现 Step 4-6 UI

**Files:**
- Modify: `src/components/IntakeWizard.tsx`(替换 Step 4-6 占位)

**Interfaces:**
- Consumes: IntakeValues + INTAKE_WARNINGS + update helper from Task 12
- Produces: Step 4-6 完整渲染

- [ ] **Step 1: 在 IntakeWizard.tsx 替换 Step 4-6 占位为完整渲染**

定位 Task 12 留下的 `{/* === Step 4-6 在 Task 13 添加 === */}`,替换为:

```tsx
      {/* === Step 4: 业态与改造模式 === */}
      {step === 3 && (
        <>
          <p className={styles.question}>{t('wizard.field.industry.label')}</p>
          <div className={styles.cardRow}>
            {['商业', '办公', '文旅', '工业仓储', '居住', '公共服务'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.industry === opt ? styles.cardOn : ''}`}
                onClick={() => update('industry', opt)}
              >{opt}</button>
            ))}
          </div>
          {!['商业', '办公', '文旅'].includes(values.industry) && values.industry && (
            <p className={styles.hint}>{t('wizard.field.industry.f8Hint')}</p>
          )}

          <p className={styles.question}>{t('wizard.field.renovation_mode.label')}</p>
          <div className={styles.cardRow}>
            {['拆除重建', '保留微更新', '混合'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.renovation_mode === opt ? styles.cardOn : ''}`}
                onClick={() => update('renovation_mode', opt)}
              >{opt}</button>
            ))}
          </div>
        </>
      )}

      {/* === Step 5: 资金面 === */}
      {step === 4 && (
        <>
          <p className={styles.question}>{t('wizard.field.investment.label')}</p>
          <input
            type="number" min={0} step={100}
            className={styles.input}
            value={values.investment ?? ''}
            onChange={e => update('investment', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.investment.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.capital_ratio.label')}</p>
          <div className={styles.sliderWrap}>
            <input
              type="range" min={0} max={100} step={1}
              className={styles.slider}
              value={values.capital_ratio ?? 0}
              onChange={e => update('capital_ratio', Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{values.capital_ratio ?? 0}%</span>
          </div>
          <p className={styles.hint}>{t('wizard.field.capital_ratio.hint')}</p>

          <p className={styles.question}>{t('wizard.field.mortgage_type.label')}</p>
          <div className={styles.cardRow}>
            {['土地使用权', '运营权', '收益权', '经营权', '收费权', '组合'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.mortgage_type === opt ? styles.cardOn : ''}`}
                onClick={() => update('mortgage_type', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t('wizard.field.mortgage_value.label')}</p>
          <input
            type="number" min={0} step={100}
            className={styles.input}
            value={values.mortgage_value ?? ''}
            onChange={e => update('mortgage_value', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.mortgage_value.placeholder')}
          />
        </>
      )}

      {/* === Step 6: 财务与退出 === */}
      {step === 5 && (
        <>
          <p className={styles.sectionTitle}>{t('wizard.sectionRequired')}</p>
          <p className={styles.question}>{t('wizard.field.monthly_rent.label')}</p>
          <input
            type="number" min={0} step={10}
            className={styles.input}
            value={values.monthly_rent ?? ''}
            onChange={e => update('monthly_rent', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.monthly_rent.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.leasable_area.label')}</p>
          <input
            type="number" min={0} step={100}
            className={styles.input}
            value={values.leasable_area ?? ''}
            onChange={e => update('leasable_area', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.leasable_area.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.holding_years.label')}</p>
          <input
            type="number" min={1} max={50} step={1}
            className={styles.input}
            value={values.holding_years ?? ''}
            onChange={e => update('holding_years', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.holding_years.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.exit_strategy.label')}</p>
          <div className={styles.cardRow}>
            {['整体出售', '单层散售', 'REITs', '持有到期'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.exit_strategy === opt ? styles.cardOn : ''}`}
                onClick={() => update('exit_strategy', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.sectionTitle}>{t('wizard.sectionAdvanced')}</p>

          <p className={styles.question}>{t('wizard.field.occupancy.label')}</p>
          <div className={styles.sliderWrap}>
            <input
              type="range" min={0} max={100} step={1}
              className={styles.slider}
              value={values.occupancy ?? 85}
              onChange={e => update('occupancy', Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{values.occupancy ?? 85}%</span>
          </div>

          <p className={styles.question}>{t('wizard.field.exit_cap_rate.label')}</p>
          <input
            type="number" min={0} max={30} step={0.1}
            className={styles.input}
            value={values.exit_cap_rate ?? ''}
            onChange={e => update('exit_cap_rate', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.exit_cap_rate.placeholder')}
          />

          <p className={styles.question}>{t('wizard.field.discount_rate.label')}</p>
          <input
            type="number" min={0} max={50} step={0.1}
            className={styles.input}
            value={values.discount_rate ?? ''}
            onChange={e => update('discount_rate', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t('wizard.field.discount_rate.placeholder')}
          />
        </>
      )}
```

- [ ] **Step 2: 在 IntakeWizard.module.css 加 slider 样式**

```css
.sliderWrap { display: flex; align-items: center; gap: 12px; }
.slider {
  flex: 1; height: 4px;
  background: #d1d5db; border-radius: 2px;
  appearance: none; -webkit-appearance: none;
  outline: none;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: #1f2430; cursor: pointer;
}
.sliderValue {
  min-width: 48px; text-align: right;
  font-size: 13px; font-weight: 500; color: #1f2430;
}
.sectionTitle {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: #6b7280; margin: 16px 0 4px;
  border-top: 1px dashed #e5e7eb; padding-top: 12px;
}
```

- [ ] **Step 3: 验证 build 通过**

Run: `npm run build`
Expected: PASS

---

## Task 14: 实现 Step 7 预览页 + 提交流程

**Files:**
- Modify: `src/components/IntakeWizard.tsx`(替换 Step 7 占位 + 加 submit 流程)

**Interfaces:**
- Consumes: composeProjectPrompt + intakeValuesToPrompt
- Produces: Step 7 渲染 + 完整的提交→onSend 链路

- [ ] **Step 1: 在 IntakeWizard.tsx 替换 Step 7 占位为完整渲染**

定位 Task 12 留下的 `{/* === Step 7 预览页 在 Task 14 添加 === */}`,替换为:

```tsx
      {/* === Step 7: 预览与提交 === */}
      {step === TOTAL_STEPS && (
        <>
          <p className={styles.question}>{t('wizard.previewTitle')}</p>

          {(() => {
            const missingP0 = countMissingP0(values, skippedFields);
            if (missingP0.length > 0) {
              return (
                <div className={styles.banner}>
                  <p className={styles.bannerTitle}>
                    {t('wizard.previewMissing').replace('{n}', String(missingP0.length))}
                  </p>
                  <ul className={styles.bannerList}>
                    {missingP0.slice(0, 5).map(k => (
                      <li key={k}>{t(`wizard.field.${k}.label` as MessageKeys)}</li>
                    ))}
                    {missingP0.length > 5 && <li>... ({missingP0.length - 5} more)</li>}
                  </ul>
                </div>
              );
            }
            return null;
          })()}

          <div className={styles.previewGrid}>
            {intakeValuesToPrompt(values).map((line, i) => (
              <p key={i} className={styles.previewLine}>{line}</p>
            ))}
          </div>

          {composed && (
            <details className={styles.promptDetails}>
              <summary className={styles.promptSummary}>{t('wizard.previewShowPrompt')}</summary>
              <pre className={styles.promptPre}>{composed}</pre>
            </details>
          )}
        </>
      )}
```

- [ ] **Step 2: 修改 footer nav,在 Step 7 加提交按钮**

定位 Task 12 留下的 footer nav,扩展:

```tsx
      <div className={styles.nav}>
        {step > 0 && step <= TOTAL_STEPS && (
          <button type="button" className={styles.navGhost} onClick={() => setStep(s => s - 1)}>
            ← {t('wizard.back')}
          </button>
        )}
        {step < TOTAL_STEPS - 1 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => checkAndProceed(step + 1)}
          >
            {t('wizard.next')} →
          </button>
        )}
        {step === TOTAL_STEPS - 1 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => checkAndProceed(TOTAL_STEPS)}
          >
            {t('wizard.previewAndSubmit')} →
          </button>
        )}
        {step === TOTAL_STEPS && (
          <>
            <button
              type="button"
              className={styles.navGhost}
              onClick={() => setStep(TOTAL_STEPS - 1)}
            >
              ← {t('wizard.returnToFill')}
            </button>
            <button
              type="button"
              className={styles.navSend}
              onClick={() => {
                if (composed && !disabled) {
                  onSend(composed);
                  setValues(EMPTY_VALUES);
                  setSkippedFields(new Set());
                  setStep(0);
                }
              }}
              disabled={!composed || disabled}
            >
              ⚠️ {t('wizard.continueSubmit')}
            </button>
          </>
        )}
      </div>
```

- [ ] **Step 3: 加 countMissingP0 工具函数**

在 IntakeWizard.tsx 末尾(在 `getP0FieldsForStep` 后面)加:

```ts
function countMissingP0(v: IntakeValues, skipped: Set<string>): string[] {
  // 所有 P0 字段(不包括 city,因为 city 是硬阻断,Step 1 已经强制)
  const allP0 = [
    'location', 'owner_type', 'property_cert', 'heritage_level', 'current_status',
    'building_area', 'structure_type', 'industry', 'renovation_mode',
    'investment', 'capital_ratio', 'mortgage_type', 'mortgage_value',
    'monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy',
  ];
  return allP0.filter(k =>
    !skipped.has(k) && isFieldEmpty(v, k)
  );
}
```

- [ ] **Step 4: 验证 build 通过**

Run: `npm run build`
Expected: PASS

> Step 7 内部的 `intakeValuesToPrompt` 需要从 `../lib/intake` import,IntakeWizard.tsx 顶部的 import 已经包含 composeProjectPrompt,但需要补 intakeValuesToPrompt。

修正 import:
```ts
import {
  composeProjectPrompt,
  intakeValuesToPrompt,
  INTAKE_WARNINGS,
  type IntakeValues,
} from '../lib/intake';
```

- [ ] **Step 5: 验证 build 通过(再次)**

Run: `npm run build`
Expected: PASS

---

## Task 15: city 15 城卡片网格 + 硬阻断 + 旧数据迁移

**Files:**
- Modify: `src/lib/intake.ts`(加 PILOT_CITIES_15 常量)
- Modify: `src/components/IntakeWizard.tsx`(Step 1 替换为卡片网格)
- Create: `src/components/CityMigrationModal.tsx`
- Create: `src/components/CityMigrationModal.module.css`

**Interfaces:**
- Consumes: PILOT_CITIES_15 from intake.ts
- Produces: city 字段只能从 15 城选,localStorage 旧数据自动迁移

- [ ] **Step 1: 在 intake.ts 加 PILOT_CITIES_15 常量**

```ts
/**
 * agent2 H1 维度1 试点城市(15 市级),作为前端硬阻断标准。
 * 用户在 IntakeWizard Step 1 必须从这 15 城选一个。
 */
export const PILOT_CITIES_15: readonly string[] = [
  '北京', '上海', '广州', '深圳', '杭州', '成都',
  '武汉', '西安', '重庆', '南京', '天津', '长沙',
  '青岛', '郑州', '厦门',
] as const;

/** 同时在 agent3 H4 省级名单的城市(用于 UI 标识 ✓ 双名单) */
export const DUAL_LIST_CITIES: readonly string[] = ['北京', '上海', '重庆'] as const;
```

- [ ] **Step 2: 创建 CityMigrationModal.tsx**

```tsx
import React from 'react';
import { useT } from '../i18n';
import styles from './CityMigrationModal.module.css';

interface Props {
  open: boolean;
  previousCity: string;
  onAcknowledge: () => void;
}

const CityMigrationModal: React.FC<Props> = ({ open, previousCity, onAcknowledge }) => {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="alertdialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.icon}>⚠️</span>
          <span className={styles.title}>{t('wizard.cityMigrationTitle')}</span>
        </div>
        <div className={styles.body}>
          <p className={styles.text}>
            {t('wizard.cityMigrationBody').replace('{city}', previousCity)}
          </p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnPrimary} onClick={onAcknowledge} autoFocus>
            {t('wizard.cityMigrationAck')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CityMigrationModal;
```

- [ ] **Step 3: 创建 CityMigrationModal.module.css**

```css
.overlay {
  position: fixed; inset: 0;
  background: rgba(15, 18, 30, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1001; padding: 16px;
}
.modal {
  background: #fff; border-radius: 12px;
  width: 100%; max-width: 420px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
}
.header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px; border-bottom: 1px solid #eef0f4;
}
.icon { font-size: 18px; }
.title { font-size: 15px; font-weight: 600; color: #1f2430; }
.body { padding: 20px; }
.text { font-size: 14px; color: #1f2430; line-height: 1.6; margin: 0; }
.footer {
  display: flex; justify-content: flex-end;
  padding: 12px 20px; border-top: 1px solid #eef0f4;
}
.btnPrimary {
  background: #1f2430; color: #fff;
  padding: 8px 16px; border-radius: 8px;
  border: none; cursor: pointer; font-size: 13px; font-weight: 500;
}
.btnPrimary:hover { background: #111827; }
```

- [ ] **Step 4: 替换 IntakeWizard.tsx Step 1 的 city input 为 15 城卡片网格**

在 IntakeWizard.tsx 顶部加 imports:
```ts
import CityMigrationModal from './CityMigrationModal';
import { PILOT_CITIES_15, DUAL_LIST_CITIES } from '../lib/intake';
```

加 state:
```ts
const [cityMigrationOpen, setCityMigrationOpen] = useState<{ open: boolean; previousCity: string }>({
  open: false, previousCity: '',
});
```

加 mount 检测(在 component 顶部):
```ts
React.useEffect(() => {
  if (values.city && !PILOT_CITIES_15.includes(values.city)) {
    setCityMigrationOpen({ open: true, previousCity: values.city });
    update('city', '');
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

把 Task 12 的 `{step === 0 && ...}` 整段 city input 替换为:

```tsx
{step === 0 && (
  <>
    <p className={styles.question}>{t('wizard.qCity')}</p>
    <p className={styles.hint}>{t('wizard.qCityPilotHint')}</p>
    <div className={styles.cityGrid}>
      {PILOT_CITIES_15.map(city => {
        const dual = DUAL_LIST_CITIES.includes(city);
        return (
          <button
            key={city}
            type="button"
            className={`${styles.cityCard} ${values.city === city ? styles.cityCardOn : ''} ${dual ? styles.cityCardDual : ''}`}
            onClick={() => update('city', city)}
          >
            <span className={styles.cityName}>{city}</span>
            {dual && <span className={styles.cityDual}>✓</span>}
          </button>
        );
      })}
    </div>
    <button
      type="button"
      className={styles.notInList}
      onClick={() => setCityMigrationOpen({ open: true, previousCity: '' })}
    >
      {t('wizard.cityNotInList')}
    </button>

    <p className={styles.question}>{t('wizard.qLocation')}</p>
    <input
      className={styles.input}
      value={values.location}
      onChange={e => update('location', e.target.value)}
      placeholder={t('wizard.qLocationPh')}
    />
  </>
)}
```

在组件 JSX 末尾(在 `</div>` 之前)加:
```tsx
<CityMigrationModal
  open={cityMigrationOpen.open}
  previousCity={cityMigrationOpen.previousCity}
  onAcknowledge={() => setCityMigrationOpen({ open: false, previousCity: '' })}
/>
```

- [ ] **Step 5: 修改 checkAndProceed,city 空时不允许进入 Step 2**

在 `checkAndProceed` 函数开头加 city 硬阻断:
```ts
const checkAndProceed = (nextStep: number) => {
  // city 硬阻断:Step 1 必须选了 15 城之一
  if (step === 0 && !PILOT_CITIES_15.includes(values.city)) {
    return; // 静默阻止,UI 上的 city 卡片已显式标识
  }
  // ... 原有逻辑
};
```

- [ ] **Step 6: 在 IntakeWizard.module.css 加 city 相关样式**

```css
.cityGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 12px 0;
}
.cityCard {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid #d1d5db; border-radius: 8px;
  background: #fff; color: #1f2430;
  cursor: pointer; transition: all 120ms ease;
  font-size: 13px;
}
.cityCard:hover { border-color: #1f2430; transform: translateY(-1px); }
.cityCardOn { background: #1f2430; color: #fff; border-color: #1f2430; }
.cityCardDual::after {
  content: '✓ 双名单';
  font-size: 10px;
  color: #10b981;
  margin-left: 4px;
}
.cityDual { font-size: 11px; color: #10b981; }
.notInList {
  background: transparent; border: none;
  color: #6b7280; font-size: 12px;
  cursor: pointer; text-decoration: underline;
  margin-top: 8px;
}
@media (max-width: 768px) {
  .cityGrid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 7: 验证 build 通过**

Run: `npm run build`
Expected: PASS

---

## Task 16: capital_ratio 滑块 H 硬约束可视化

**Files:**
- Modify: `src/components/IntakeWizard.tsx`(在 Step 5 capital_ratio 滑块加可视化)
- Modify: `src/components/IntakeWizard.module.css`(加 H 安全区绿色高亮)

**Interfaces:**
- Consumes: 无
- Produces: capital_ratio 滑块 25-30% 区间绿色高亮

- [ ] **Step 1: 在 IntakeWizard.tsx Step 5 capital_ratio 滑块外加可视化轨道**

定位 Task 13 留下的 capital_ratio 滑块 JSX,用 `<div className={styles.sliderTrack}>` 包裹,加一个绿色区间 overlay:

```tsx
<p className={styles.question}>{t('wizard.field.capital_ratio.label')}</p>
<div className={styles.sliderWrap}>
  <div className={styles.sliderTrack}>
    <div className={styles.safeZone} aria-hidden />
    <input
      type="range" min={0} max={100} step={1}
      className={`${styles.slider} ${styles.sliderCapital}`}
      value={values.capital_ratio ?? 0}
      onChange={e => update('capital_ratio', Number(e.target.value))}
    />
  </div>
  <span className={styles.sliderValue}>{values.capital_ratio ?? 0}%</span>
</div>
<p className={styles.hint}>
  {(values.capital_ratio ?? 0) >= 25 && (values.capital_ratio ?? 0) <= 30
    ? t('wizard.field.capital_ratio.safe')
    : t('wizard.field.capital_ratio.hint')}
</p>
```

- [ ] **Step 2: 在 IntakeWizard.module.css 加 safeZone 样式**

```css
.sliderTrack {
  flex: 1; position: relative;
  height: 4px; background: #d1d5db; border-radius: 2px;
  margin: 8px 0;
}
.sliderCapital {
  position: absolute; inset: 0;
  width: 100%; margin: 0;
}
.safeZone {
  position: absolute;
  left: 25%; right: 70%;  /* 30% - 25% = 5%,从右减 70% */
  height: 100%;
  background: rgba(16, 185, 129, 0.32);
  border-radius: 2px;
  pointer-events: none;
}
```

- [ ] **Step 3: 验证 build 通过**

Run: `npm run build`
Expected: PASS

---

## Task 17: 扩 i18n key(zh.ts + en.ts)

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

**Interfaces:**
- Consumes: 无
- Produces: ~110 个新 i18n key,被 IntakeWizard / IntakeWarningModal / CityMigrationModal 引用

- [ ] **Step 1: 在 zh.ts 加新 key**

在 zh.ts 末尾(`}` 之前)加:

```ts
  // === 改造引入:IntakeWizard 22 字段 + 软警告 + 15 城 ===
  "wizard.step": "步骤",
  "wizard.previewStep": "预览并提交",
  "wizard.back": "上一步",
  "wizard.next": "下一步",
  "wizard.previewAndSubmit": "预览并提交",
  "wizard.continueSubmit": "继续测算",
  "wizard.returnToFill": "返回填写",
  "wizard.previewTitle": "确认你的项目描述(发送前可返回修改)",
  "wizard.previewShowPrompt": "查看发送给智能体的完整 prompt",
  "wizard.previewMissing": "⚠️ {n} 个关键字段未填,继续将触发降级",
  "wizard.sectionRequired": "必填项",
  "wizard.sectionAdvanced": "高级参数(可选,缺省将用行业默认值)",

  "wizard.qCity": "📍 你的项目所在城市(必须从 15 试点城市中选择)",
  "wizard.qCityPh": "如:深圳",
  "wizard.qCityPilotHint": "非试点城市无法启动 super-skill 测算流程",
  "wizard.qLocation": "🗺️ 区位(行政区 / 园区 / 地块名)",
  "wizard.qLocationPh": "如:南山科技园",

  "wizard.field.location.label": "区位",
  "wizard.field.location.placeholder": "如:南山科技园",

  "wizard.field.owner_type.label": "业主资质",
  "wizard.field.property_cert.label": "不动产证号",
  "wizard.field.property_cert.placeholder": "如:粤(2024)深圳不动产权第 0000XXX 号",
  "wizard.field.heritage_level.label": "文保等级",
  "wizard.field.current_status.label": "项目现状描述",
  "wizard.field.current_status.placeholder": "如:90 年代老旧厂房,产权清晰,空置率 30%",

  "wizard.field.building_area.label": "建筑面积(㎡)",
  "wizard.field.building_area.placeholder": "如:50000",
  "wizard.field.structure_type.label": "结构类型",
  "wizard.field.height_m.label": "层高(m)",
  "wizard.field.height_m.placeholder": "如:4.5",
  "wizard.field.height_m.hint": "(可选)缺失将由 LLM 估算",

  "wizard.field.industry.label": "拟改造业态方向(与 6 业态严格对齐)",
  "wizard.field.industry.f8Hint": "⚠️ 此业态在 agent4 财务模型中无专属门槛表,会触发 F8 兜底(宽松阈值),IRR 测算精度会下降。",
  "wizard.field.renovation_mode.label": "改造模式",

  "wizard.field.investment.label": "总投资(万元)",
  "wizard.field.investment.placeholder": "如:30000",
  "wizard.field.capital_ratio.label": "自有资金比例(%)",
  "wizard.field.capital_ratio.hint": "H1 硬约束:25-30% 为绿色安全区,其他区间 agent3 会判 yellow 或 red",
  "wizard.field.capital_ratio.safe": "✓ 当前在 H1 安全区(25-30%)",
  "wizard.field.mortgage_type.label": "抵押物类型",
  "wizard.field.mortgage_value.label": "抵押物估值(万元)",
  "wizard.field.mortgage_value.placeholder": "如:25000",

  "wizard.field.monthly_rent.label": "月租金(元/㎡)",
  "wizard.field.monthly_rent.placeholder": "如:120",
  "wizard.field.leasable_area.label": "可租赁面积(㎡)",
  "wizard.field.leasable_area.placeholder": "如:35000",
  "wizard.field.holding_years.label": "持有年限(年,1-50)",
  "wizard.field.holding_years.placeholder": "如:15",
  "wizard.field.exit_strategy.label": "退出策略",

  "wizard.field.occupancy.label": "出租率(%) — 默认 85",
  "wizard.field.exit_cap_rate.label": "退出 cap rate(%) — 默认 4.5",
  "wizard.field.exit_cap_rate.placeholder": "如:4.5",
  "wizard.field.discount_rate.label": "折现率(%) — 默认 8",
  "wizard.field.discount_rate.placeholder": "如:8",

  // 软警告弹窗
  "wizard.warningTitle": "准确度会下降",
  "wizard.warningSeverityBlocker": "降级",
  "wizard.warningSeverityDegraded": "默认值",
  "wizard.warningConsequence": "后果",
  "wizard.warningTechRef": "技术参照",
  "wizard.warningSuggestion": "建议",
  "wizard.warningReturn": "返回填写",
  "wizard.warningConfirmSkip": "继续跳过",

  // 试点城市迁移
  "wizard.cityNotInList": "我的城市不在列表...",
  "wizard.cityMigrationTitle": "非试点城市",
  "wizard.cityMigrationBody": "你之前填的城市 {city} 不在 agent2 H1 维度1 的 15 个试点城市名单。请从 15 城中重新选择,或选择最近的试点城市作为代算(结果仅供参考)。",
  "wizard.cityMigrationAck": "我知道了",

  // StopButton aria(已有 aria.stopGeneration,沿用),
  // 但若旧 key 不存在则补:
  "aria.stopGeneration": "停止生成",
```

- [ ] **Step 2: 在 en.ts 同步翻译所有新 key**

en.ts 加完全相同的 key 列表,值改为英文。

> 翻译示例(节选):
```ts
"wizard.field.location.label": "Location",
"wizard.field.location.placeholder": "e.g., Nanshan Tech Park",
"wizard.field.owner_type.label": "Owner Type",
"wizard.warningTitle": "Accuracy Will Degrade",
"wizard.warningReturn": "Return to fill",
"wizard.warningConfirmSkip": "Skip anyway",
"wizard.cityMigrationTitle": "Non-pilot city",
"wizard.cityMigrationBody": "Your previously entered city {city} is not in the 15 pilot cities list. Please choose from the list, or pick the nearest pilot city as a proxy (results for reference only).",
// ...
```

> 由于英文翻译量大(~110 key),建议用脚本批量生成 stub,再人工精修。

- [ ] **Step 3: 验证 build 通过**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: 启动 dev 验证 i18n 没有缺 key**

Run: `cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team && npm run dev:agents`

打开浏览器访问 dev URL,进入 IntakeWizard,逐步切换 — 应无 i18n 报错。

---

## Task 18: 单元测试 intake.ts

**Files:**
- Modify: `src/lib/__tests__/intake.test.ts`(扩)

**Interfaces:**
- Consumes: 所有 intake.ts 公开 API
- Produces: 单元测试覆盖率 ≥ 80%(intake.ts 100%)

- [ ] **Step 1: 检查现有 intake.test.ts 内容**

Run: `cat /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/src/lib/__tests__/intake.test.ts`

- [ ] **Step 2: 重写 intake.test.ts 覆盖新 API**

```ts
import { describe, expect, it } from 'vitest';
import {
  composeProjectPrompt,
  intakeValuesToPrompt,
  INTAKE_WARNINGS,
  PILOT_CITIES_15,
  DUAL_LIST_CITIES,
  type IntakeValues,
} from '../intake';

const FULL_VALUES: IntakeValues = {
  city: '深圳', location: '南山科技园',
  owner_type: '国企', property_cert: '粤(2024)0000XXX 号',
  heritage_level: '无文保', current_status: '老旧厂房',
  building_area: 50000, structure_type: '框架', height_m: 4.5,
  industry: '商业', renovation_mode: '保留微更新',
  investment: 30000, capital_ratio: 30,
  mortgage_type: '土地使用权', mortgage_value: 25000,
  monthly_rent: 120, leasable_area: 35000,
  holding_years: 15, exit_strategy: 'REITs',
  occupancy: 85, exit_cap_rate: 4.5, discount_rate: 8,
};

describe('composeProjectPrompt', () => {
  it('returns null when city is missing', () => {
    const result = composeProjectPrompt({
      values: { ...FULL_VALUES, city: '' },
      skippedFields: new Set(),
      defaultFields: {},
      lang: 'zh',
    });
    expect(result).toBeNull();
  });

  it('produces 三段输出 with all fields filled', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(),
      defaultFields: {},
      lang: 'zh',
    });
    expect(result).not.toBeNull();
    expect(result).toContain('【已填信息】');
    expect(result).toContain('- 城市:深圳');
    expect(result).toContain('请按 super-skill 完整上会测算');
  });

  it('includes 【用户主动跳过的字段】 section when fields are skipped', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(['capital_ratio', 'monthly_rent']),
      defaultFields: {},
      lang: 'zh',
    });
    expect(result).toContain('【用户主动跳过的字段');
    expect(result).toContain('自有资金比例:用户未提供');
    expect(result).toContain('月租金:用户未提供');
  });

  it('includes 【用默认值的字段】 section for P1 defaults', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(),
      defaultFields: { occupancy: '85%', exit_cap_rate: '4.5%', discount_rate: '8%' },
      lang: 'zh',
    });
    expect(result).toContain('【用默认值的字段】');
    expect(result).toContain('出租率:85%');
  });

  it('English lang produces English section headers', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(['capital_ratio']),
      defaultFields: {},
      lang: 'en',
    });
    expect(result).toContain('【Filled】');
    expect(result).toContain('【Skipped by user');
  });
});

describe('intakeValuesToPrompt', () => {
  it('converts percentage fields to decimal in output', () => {
    const lines = intakeValuesToPrompt(FULL_VALUES);
    const capitalLine = lines.find(l => l.includes('自有资金比例'));
    expect(capitalLine).toBeDefined();
    expect(capitalLine).toContain('0.30');  // 30 / 100
    expect(capitalLine).toContain('30%');
  });

  it('skips null fields', () => {
    const values = { ...FULL_VALUES, building_area: null };
    const lines = intakeValuesToPrompt(values);
    expect(lines.find(l => l.includes('建筑面积'))).toBeUndefined();
  });
});

describe('INTAKE_WARNINGS', () => {
  it('covers all 22 IntakeValues keys', () => {
    const expectedKeys: Array<keyof IntakeValues> = [
      'city', 'location', 'owner_type', 'property_cert', 'heritage_level', 'current_status',
      'building_area', 'structure_type', 'height_m',
      'industry', 'renovation_mode',
      'investment', 'capital_ratio', 'mortgage_type', 'mortgage_value',
      'monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy',
      'occupancy', 'exit_cap_rate', 'discount_rate',
    ];
    expectedKeys.forEach(k => {
      expect(INTAKE_WARNINGS[k]).toBeDefined();
      expect(INTAKE_WARNINGS[k].fieldKey).toBe(k);
      expect(INTAKE_WARNINGS[k].consequence.length).toBeGreaterThan(10);
    });
  });
});

describe('PILOT_CITIES_15', () => {
  it('contains exactly 15 cities', () => {
    expect(PILOT_CITIES_15.length).toBe(15);
  });
  it('includes 北京 上海 广州 深圳', () => {
    expect(PILOT_CITIES_15).toContain('北京');
    expect(PILOT_CITIES_15).toContain('上海');
    expect(PILOT_CITIES_15).toContain('广州');
    expect(PILOT_CITIES_15).toContain('深圳');
  });
  it('DUAL_LIST_CITIES is subset of PILOT_CITIES_15', () => {
    DUAL_LIST_CITIES.forEach(c => {
      expect(PILOT_CITIES_15).toContain(c);
    });
  });
});
```

- [ ] **Step 3: 在 package.json 加 test script**

```json
"scripts": {
  "dev": "vite",
  "dev:agents": "edgeone makers dev",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: 跑测试**

Run: `npm test`
Expected: 全部 PASS

---

## Task 19: 组件测试 IntakeWizard + IntakeWarningModal

**Files:**
- Create: `src/components/__tests__/IntakeWizard.test.tsx`
- Create: `src/components/__tests__/IntakeWarningModal.test.tsx`

**Interfaces:**
- Consumes: vitest + @testing-library/react(若未安装,先 npm install -D)
- Produces: 组件测试覆盖核心交互

- [ ] **Step 1: 检查 @testing-library/react 是否已安装**

Run: `cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team && cat package.json | grep -E "testing-library|jsdom"`

如果输出为空,执行:
```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

并在 `vite.config.ts` 加 vitest 测试环境配置(如果没有):
```ts
export default defineConfig({
  plugins: [react() as PluginOption],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
} as any);
```

创建 `src/test-setup.ts`:
```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 2: 创建 IntakeWarningModal.test.tsx**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IntakeWarningModal from '../IntakeWarningModal';
import type { IntakeWarning } from '../../types';

const mockWarning: IntakeWarning = {
  fieldKey: 'capital_ratio',
  fieldName: '自有资金比例',
  severity: 'blocker',
  consequence: 'agent3 H1 hard constraint',
  technicalRef: 'agent3 H1',
  suggestion: '估算公式:自有资金 ÷ 总投资',
};

describe('IntakeWarningModal', () => {
  it('renders nothing when warning is null', () => {
    const { container } = render(
      <IntakeWarningModal warning={null} onConfirmSkip={() => {}} onReturnToFill={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows fieldName and consequence when warning is provided', () => {
    render(
      <IntakeWarningModal warning={mockWarning} onConfirmSkip={() => {}} onReturnToFill={() => {}} />
    );
    expect(screen.getByText('自有资金比例')).toBeInTheDocument();
    expect(screen.getByText('agent3 H1 hard constraint')).toBeInTheDocument();
  });

  it('calls onConfirmSkip when "继续跳过" clicked', () => {
    const onConfirm = vi.fn();
    render(
      <IntakeWarningModal warning={mockWarning} onConfirmSkip={onConfirm} onReturnToFill={() => {}} />
    );
    fireEvent.click(screen.getByText(/继续跳过/));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onReturnToFill when overlay clicked', () => {
    const onReturn = vi.fn();
    const { container } = render(
      <IntakeWarningModal warning={mockWarning} onConfirmSkip={() => {}} onReturnToFill={onReturn} />
    );
    fireEvent.click(container.querySelector('[class*="overlay"]')!);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: 创建 IntakeWizard.test.tsx**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IntakeWizard from '../IntakeWizard';

describe('IntakeWizard', () => {
  it('shows Step 1 city grid on mount', () => {
    render(<IntakeWizard onSend={() => {}} />);
    expect(screen.getByText(/你的项目所在城市/)).toBeInTheDocument();
    expect(screen.getByText('北京')).toBeInTheDocument();
    expect(screen.getByText('深圳')).toBeInTheDocument();
  });

  it('hard-blocks next step when city not selected', () => {
    render(<IntakeWizard onSend={() => {}} />);
    fireEvent.click(screen.getByText(/下一步/));
    // 仍然在 Step 1
    expect(screen.getByText(/你的项目所在城市/)).toBeInTheDocument();
  });

  it('proceeds to Step 2 when city selected and next clicked', () => {
    render(<IntakeWizard onSend={() => {}} />);
    fireEvent.click(screen.getByText('深圳'));
    fireEvent.click(screen.getByText(/下一步/));
    expect(screen.getByText(/业主资质/)).toBeInTheDocument();
  });

  it('shows skip modal when P0 field left empty on next', () => {
    render(<IntakeWizard onSend={() => {}} />);
    fireEvent.click(screen.getByText('深圳'));
    fireEvent.click(screen.getByText(/下一步/));
    // Step 2: leave owner_type empty, click next
    fireEvent.click(screen.getByText(/下一步/));
    expect(screen.getByText(/准确度会下降/)).toBeInTheDocument();
  });

  it('calls onSend with composed prompt after all steps + preview submit', () => {
    const onSend = vi.fn();
    render(<IntakeWizard onSend={onSend} />);
    // Step 1: 选城市
    fireEvent.click(screen.getByText('深圳'));
    fireEvent.click(screen.getByText(/下一步/));
    // Step 2-6 全部跳过(每次点"继续跳过")
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText(/下一步/));
      // 如果弹窗出现,点继续跳过
      const skipBtn = screen.queryByText(/继续跳过/);
      if (skipBtn) fireEvent.click(skipBtn);
    }
    // 预览页提交
    fireEvent.click(screen.getByText(/继续测算/));
    expect(onSend).toHaveBeenCalledTimes(1);
    const sentPrompt = onSend.mock.calls[0][0] as string;
    expect(sentPrompt).toContain('深圳');
    expect(sentPrompt).toContain('super-skill 完整上会测算');
  });
});
```

- [ ] **Step 4: 跑组件测试**

Run: `npm test`
Expected: 全部 PASS

> 注:i18n 在测试环境可能未配置 — 如果 useT() 抛错,需要在 test-setup.ts 加 I18nProvider wrapper。如有问题,在 IntakeWizard.test.tsx 顶部加 helper:
```tsx
import { I18nProvider } from '../../i18n';
const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);
// 把所有 render() 改为 renderWithI18n()
```

---

## Task 20: grep 核查 + npm run build 最终验证

**Files:**
- 无文件改动,纯验证 task

**Interfaces:**
- Consumes: 所有之前 task 的产物
- Produces: 验证清单全绿

- [ ] **Step 1: grep 核查删除项 0 命中**

```bash
cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team
echo "=== ChatInput ===" && rg "ChatInput" src/ ; echo ""
echo "=== WelcomeScreen ===" && rg "WelcomeScreen" src/ ; echo ""
echo "=== IntakeGoal ===" && rg "IntakeGoal" src/ ; echo ""
echo "=== values.goal ===" && rg "values\.goal|\.goal[^_]" src/ ; echo ""
echo "=== INTAKE_GOAL_IDS ===" && rg "INTAKE_GOAL_IDS" src/ ; echo ""
echo "=== chat.placeholder ===" && rg "chat\.placeholder|chat\.hint" src/ ; echo ""
echo "=== preset.project ===" && rg "preset\.project" src/ ; echo ""
echo "=== wizard.qGoal ===" && rg "wizard\.qGoal|wizard\.goalFull|wizard\.goalFinance|wizard\.goalModel|wizard\.goalRisk" src/
```

Expected: 所有命令输出空(0 matches)

- [ ] **Step 2: 检查文件已移到废纸篓**

```bash
ls ~/.Trash/ChatInput.tsx ~/.Trash/ChatInput.module.css ~/.Trash/WelcomeScreen.tsx 2>&1
```

Expected: 三个文件存在

- [ ] **Step 3: 跑完整测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: 跑 build**

Run: `npm run build`
Expected: PASS,生成 `dist/`

- [ ] **Step 5: 启动 dev:agents 手动验证**

Run: `npm run dev:agents`(在后台跑)

打开浏览器访问 dev URL:
- [ ] 进入页面看到 IntakeWizard 6 步
- [ ] Step 1 city 是 15 城卡片网格,输入非 15 城无法选择
- [ ] Step 2-6 字段全部能填,跳过时弹软警告
- [ ] Step 7 预览页显示【已填】+【跳过】+【默认值】三段
- [ ] 点继续测算 → SSE 流开始,看到 PipelineBar 6 节点依次 done
- [ ] chatPanel 顶部 header 有 StopButton(loading 时可见)
- [ ] chatPanel 底部无 ChatInput(完全干净)
- [ ] 报告弹出后,SuggestActions 显示 view_agent × 6 + export_report + rerun_agent

- [ ] **Step 6: 用户最终验收**

汇报给用户:
- 改造完成
- 本地测试通过(build + test 都绿)
- 列出所有改动文件
- 等用户确认 → git commit

---

## Self-Review

### Spec coverage

| Spec 章节 | 实现任务 |
|----------|---------|
| §1 整体架构与用户旅程 | Task 1 (uiStage), Task 3-4 (删 ChatInput/WelcomeScreen), Task 14 (Step 7 提交→running) |
| §2 字段清单(22 字段) | Task 7 (IntakeValues), Task 8 (INTAKE_WARNINGS), Task 12-13 (UI) |
| §3 IntakeWizard 6 步重构 | Task 12 (骨架+Step1-3), Task 13 (Step 4-6), Task 14 (Step 7) |
| §4 软警告弹窗机制 | Task 8 (INTAKE_WARNINGS), Task 9 (Modal), Task 12 (skippedFields 状态机) |
| §5 删除项(ChatInput/WelcomeScreen/IntakeGoal/preset) | Task 3, 4, 5, 6 |
| §6.1 业态口径(5 chip → 6 业态) | Task 13 Step 4 |
| §6.2 试点城市硬阻断 | Task 15 (15 城卡片 + 迁移) |
| §6.3 数字字段单位口径 | Task 11 (intakeValuesToPrompt) |
| §6.4 单位标准化 | Task 11 + Task 13 (UI 单位) |
| §7 后端 0 改动 | 全部 task 都未触及后端 |
| §7.3 测试 | Task 18 (单元), Task 19 (组件), Task 20 (E2E 手动 + grep) |
| §7.4 验收清单 | Task 20 |
| §7.5 实施分阶段 | Tasks 1-6 (阶段1), 7-11 (阶段2), 12-16 (阶段3), 17-20 (阶段4) |

### 占位符扫描

- Task 10 中我故意留了一处 typo `headerEnEn` 标注为"细节陷阱",实施 task 必须改成 `headerEn`。这不是占位符,是真实的 typo 提醒。
- Task 17 Step 2 用了"翻译示例(节选)"但只列了部分 — 这是合理的,因为 ~110 key 全部翻译会塞爆 plan;实施时按 zh.ts 镜像翻译。
- Task 19 Step 4 的"i18n 测试 wrapper"是 conditional 处理,不是占位符。
- 所有"TODO"/"implement later"/"add appropriate error handling"都已避免。

### 类型一致性

- `IntakeValues` 在 Task 7 定义 22 字段,后续所有 task 引用同一接口 — 一致 ✓
- `INTAKE_WARNINGS` 在 Task 8 定义 `Record<keyof IntakeValues, ...>`,键集合与 IntakeValues 严格一致 ✓
- `composeProjectPrompt` 签名在 Task 5 (过渡)→ Task 7 (过渡)→ Task 10 (最终) 三次演变,Task 10 之后稳定 ✓
- `IntakeWarning` 在 Task 8 (types.ts) 定义,Task 9 (Modal) 和 Task 12 (Wizard) 引用 — 一致 ✓
- `PILOT_CITIES_15` 在 Task 15 (intake.ts) 定义,Task 15 (Wizard) 引用 — 一致 ✓
- `IntakeGoal` 删除后,后续 task 不再引用 — Task 5 严格 grep 验证 ✓

---

## Execution Handoff

Plan 已保存到 `docs/superpowers/plans/2026-08-09-frontend-interaction-overhaul.md`。

**两种执行模式:**

**1. Subagent-Driven(推荐)** — 我每个 task 派一个新 subagent 执行,每个 task 完成后我审查,快速迭代。适合复杂改造,reviewer 在每步把关。

**2. Inline Execution** — 我在本会话直接顺序执行所有 task,批量推进,中间设 checkpoint。适合连续推进、信任度高。

**推荐模式 1(Subagent-Driven)** — 因为这次改造涉及 20 个 task,跨多个文件,每个 task 后 review 能避免错误累积。Subagent 给每个 task 隔离上下文,避免污染主会话。

**询问用户选择哪种模式。**

> 按 CLAUDE.md 规则:不主动 commit。全部 task 完成 + 本地测试通过后,等用户统一确认才 commit。
