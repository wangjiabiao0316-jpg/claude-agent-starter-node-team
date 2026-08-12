# 交接说明 · 产品首页 + Logo 跳转（最终版）

本次新增「点击 Logo / 产品名跳转产品首页」功能。产品首页为固定展示页，含三大板块：**产品简介、产品价值（粒子动画）、使用方法（时间轴）**。

---

## 一、产品首页结构

```
┌─ Hero 区 ─────────────────────────────┐
│  中建集团首届 AI 大赛 · 场景命题赛道      │
│        万象更芯 · 智算营城               │
│  运营前置视角下的城市更新财务和决策智能体  │
└────────────────────────────────────────┘

┌─ 板块一·产品简介 ─────────────────────┐
│  什么是「万象更芯」+ 一段产品介绍        │
└────────────────────────────────────────┘

┌─ 板块二·产品价值(粒子动画) ────────────┐
│  Canvas 粒子形态变换动画:               │
│  六边形logo → 四芒星 → 三色灯 → 网格    │
│  → 衔尾蛇,粒子是演变过程,矢量logo是最终  │
│  形态(聚拢后浮现+发光+炸开进入下一个)    │
│  字幕随形态轮播对应价值点               │
└────────────────────────────────────────┘

┌─ 板块三·使用方法(时间轴) ──────────────┐
│  左侧贯穿轴线 + 图标在轴上 + 右侧文字:   │
│  ① 进入向导 → ② 五步采集 → ③ 智能体执行 │
│  → ④ 查看报告 → ⑤ 迭代分析              │
└────────────────────────────────────────┘

         [ 开始使用 ]  ← 点击进入采集向导
   SIX AGENTS · ONE DECISION · POWERED BY EDGEONE MAKERS
```

---

## 二、改动文件清单

### 新增（4 个）
- `src/components/ProductHome.tsx` — 产品首页组件
- `src/components/ProductHome.module.css` — 产品首页样式（深色科技风）
- `src/components/ParticleField.tsx` — 粒子形态变换动画（Canvas 2D）
- `src/components/ParticleField.module.css` — 粒子动画容器样式

### 修改（4 个）
- `src/types.ts` — `UiStage` 联合类型新增 `'home'` 值
- `src/App.tsx` — 4 处改动：
  - 顶部 import `ProductHome`
  - `uiStage` 初始值由 `'intake'` 改为 `'home'`（产品首页成为首屏入口）
  - header 的 logo + 产品名包成可点击 `<button>`，点击 `setUiStage('home')`
  - `chatWindowShell` 条件渲染新增 `'home'` 分支，渲染 `<ProductHome onStart={...}/>`
- `src/App.module.css` — 新增 `.logoBtn` 样式（可点击区域 + 银色辉光 hover）
- `src/i18n/zh.ts` + `src/i18n/en.ts` — 各新增 `home.*` 文案 key（中英双语）

---

## 三、如何运行

```bash
npm install          # 安装依赖
cp .env.example .env # 复制环境变量模板,按需填入 API Key
npm run dev          # 启动前端开发服务器(默认 http://localhost:5173)
```

> 完整 Agent 链路（含后端）用 `npm run dev:agents`（需先 `npm i -g edgeone`）。
> 仅看产品首页 UI 用 `npm run dev` 即可，无需配置后端。

---

## 四、验证要点

1. **首屏即产品首页**：刷新页面，应直接看到 hero 区 + 简介 + 粒子动画 + 时间轴 + 「开始使用」按钮。
2. **Logo 跳转**：在采集向导 / 对话 / 报告任一状态下，点击左上角六边形 logo 或产品名，回到产品首页（hover 有银色辉光）。
3. **开始使用**：产品首页点「开始使用」→ 进入采集向导（IntakeWizard 五步引导）。
4. **粒子动画**：产品价值板块的粒子在五种形态间循环（混沌→聚拢→矢量logo发光→炸开），字幕同步切换。
5. **时间轴**：使用方法板块为左侧贯穿轴线 + 图标 + 右侧文字，轴线有流光。
6. **中英切换**：点右上角中/EN 切换，产品首页全部内容双语联动。

---

## 五、粒子动画说明（ParticleField）

板块二的产品价值用粒子形态变换动画演示，逻辑：
- **五个形态**：六边形（产品logo）→ 四芒星（咨投建运）→ 三色灯 → 网格（沙箱算账）→ 衔尾蛇（人机协商）
- **四阶段循环**：混沌（粒子满屏随机飞舞）→ 聚拢（一阶插值 ease-out 收敛）→ 发光（矢量logo浮现+辉光渐强）→ 炸开（随机方向爆发进入下一形态）
- **粒子是演变过程，实心矢量 logo 是最终形态**：聚拢后期矢量 logo 跟着浮现，发光到峰值后炸开
- **性能**：粒子数按画布尺寸自适应（1000-2500），用 requestAnimationFrame，组件卸载自动清理
- **可调参数**（在 `ParticleField.tsx` 顶部）：
  - `CHAOS_MS / GATHER_MS / GLOW_MS`：四阶段时长
  - `easeK`：聚拢收敛速度（一阶插值系数，越大越快）
  - `burst`：爆发强度（triggerBurst 里）
  - `SHAPES`：五个形态的图形绘制（每个形态的 draw 函数）

---

## 六、注意事项

- **首屏入口已变更**：原首屏是采集向导（`'intake'`），现改为产品首页（`'home'`）。
  - 如需改回首屏 = 采集向导：把 `src/App.tsx` 里 `useState<UiStage>('home')` 改回 `'intake'` 即可，其余逻辑不受影响。
- **现有聊天流程零回归**：`intake → running → review` 三态切换逻辑完全保留，仅新增 `'home'` 一个分支值。
- **视觉风格**：严格沿用项目 monochrome tech 主题（黑+银+毛玻璃）。粒子动画里**三色灯形态是唯一的彩色**（绿/黄/红，呼应项目的三色灯语义），其余形态均为银白色。
- **文案来源**：
  - hero 区复用现有 `welcome.*` 文案（原零引用的孤儿 key，本次激活）
  - 三块正文为新增 `home.*` key，内容基于项目真实业务（六智能体 / 三色灯闸门 / 沙箱算账 / 五步引导 / 人机协商迭代）
  - **文案措辞建议复核**：价值和使用方法的文案是基于仓库事实加工的表达，可按需调整 `src/i18n/zh.ts`/`en.ts` 里的 `home.*` key

---

## 七、回滚

所有改动可一键回滚：
1. `src/App.tsx` 的 `useState<UiStage>('home')` 改回 `'intake'`
2. header 的 `<button className={styles.logoBtn}>` 还原为原 `<span className={styles.logo}>` 结构
3. `chatWindowShell` 条件渲染还原为原二选一三元
4. 删除 `src/components/ProductHome.tsx`、`ProductHome.module.css`、`ParticleField.tsx`、`ParticleField.module.css`
5. `src/types.ts` 的 `UiStage` 去掉 `'home'`
6. `src/i18n/zh.ts`/`en.ts` 删除 `home.*` 区块
