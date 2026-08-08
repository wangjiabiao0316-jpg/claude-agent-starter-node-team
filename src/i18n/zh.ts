const zh = {
  // Header
  "app.title": "万象更芯 · 智算营城",
  "app.subtitle": "运营前置视角下的城市更新财务和决策智能体 · EdgeOne Makers",

  // Empty state
  "empty.title": "Claude Agent Starter",
  "empty.hint": "我是运行在 EdgeOne 上的 Claude 助手。我可以调用沙箱工具、持久化会话记忆，并帮助你进行调试、文件管理、代码执行和网页浏览。",
  "empty.features": "沙箱工具 · 会话记忆 · 可观测性",

  // Welcome screen
  "welcome.eyebrow": "中建集团首届 AI 大赛 · 场景命题赛道",
  "welcome.title": "万象更芯 · 智算营城",
  "welcome.subtitle": "运营前置视角下的城市更新财务和决策智能体（咨投建运全阶段）",
  "welcome.guide": "不需要一次写全 —— 跟着下方五步引导逐项填写项目条件（城市/区位 · 现状产权 · 规模指标 · 改造方向 · 测算目标），自动组装成完整的上会描述。",

  // Intake wizard (step-by-step guided input)
  "wizard.step": "步骤",
  "wizard.previewStep": "确认并发送",
  "wizard.qCity": "你的项目在哪个城市 / 区位？",
  "wizard.qCityPh": "如：深圳 · 南山区",
  "wizard.qCurrent": "项目现状与产权情况如何？",
  "wizard.qCurrentPh": "如：90 年代老旧厂房，产权清晰，无文保限制",
  "wizard.qScale": "规模指标（面积 / 投资 / 自有资金）？",
  "wizard.qScalePh": "如：占地约 5 万㎡，总投资约 3 亿元，自有资金 40%",
  "wizard.qDirection": "拟改造方向是？",
  "wizard.dir1": "保障性租赁住房",
  "wizard.dir2": "长租公寓",
  "wizard.dir3": "文创园区",
  "wizard.dir4": "商业办公",
  "wizard.dir5": "产业园区",
  "wizard.dirOther": "其他方向",
  "wizard.dirCustomPh": "请输入你的改造方向，如：社区养老中心",
  "wizard.qGoal": "这次想让智能体算什么？",
  "wizard.goalFull": "🚦 完整上会测算",
  "wizard.goalFullDesc": "六智能体全流程：政策、融资、财务、风险到双层决策",
  "wizard.goalFinance": "💰 多元融资方案",
  "wizard.goalFinanceDesc": "资本金与贷款结构的组合设计",
  "wizard.goalModel": "📊 财务模型测算",
  "wizard.goalModelDesc": "IRR、NPV、现金流等核心指标",
  "wizard.goalRisk": "⚠️ 失败案例匹配",
  "wizard.goalRiskDesc": "Top3 相似失败案例与风险提示",
  "wizard.back": "上一步",
  "wizard.next": "下一步",
  "wizard.generate": "生成项目描述",
  "wizard.send": "发送给智能体",
  "wizard.restart": "重新填写",
  "wizard.previewTitle": "确认你的项目描述（发送前可返回修改）",
  "welcome.ex1Title": "🚦 完整上会测算",
  "welcome.ex1Text": "我在深圳南山区有一个旧改项目：现状为 90 年代老旧厂房，占地约 5 万㎡，产权清晰，拟改造为保障性租赁住房。请做完整的上会测算与双层决策。",
  "welcome.ex2Title": "💰 多元融资方案",
  "welcome.ex2Text": "杭州西湖区存量商业楼宇改长租公寓项目，总投资约 3 亿元，自有资金占比 40%，请帮我设计多元融资方案。",
  "welcome.ex3Title": "📊 财务模型测算",
  "welcome.ex3Text": "成都一处老旧厂区拟改造为文创园区：改造投入约 1.8 亿元，预估年租金收入 2800 万元、年运营成本 900 万元，请测算 IRR 和 NPV。",
  "welcome.ex4Title": "⚠️ 失败案例匹配",
  "welcome.ex4Text": "广州城中村改造项目，请帮我匹配 Top3 相似失败案例，并提示主要风险点与规避建议。",
  "welcome.foot": "SIX AGENTS · ONE DECISION · POWERED BY EDGEONE MAKERS",

  // Chat input
  "chat.placeholder": "描述你的城市更新项目：城市/区位 · 现状与产权 · 规模 · 拟改造方向…  ⏎ 发送 · Shift+⏎ 换行",
  "chat.hint": "六智能体协同 · 政策 / 融资 / 财务 / 风险 / 双层决策 · EdgeOne Makers 驱动",

  // Preset questions
  "preset.1": "使用终端命令检查当前系统时间和操作系统版本。",
  "preset.2": "创建 /tmp/fib.py，写入计算斐波那契数列前 10 项的 Python 代码并执行，将结果打印出来。",
  "preset.4": "访问 https://edgeone.ai 并总结页面内容。",
  "preset.screenshotEdgeOne": "截取 edgeone.ai 的网页图片。",
  "preset.skill.sandboxAlgorithms": "计算斐波那契数列前 20 个，并给出执行结果。",
  "preset.project.full": "帮我做一个城市更新项目的完整上会测算：上海杨浦区老旧厂房改造为保障房，占地 4 万㎡。",
  "preset.project.finance": "总投资 2.5 亿、自有资金 35% 的存量改造项目，帮我设计多元融资方案。",
  "preset.project.irr": "改造投入 1.5 亿、年租金 2200 万、运营成本 800 万，帮我测算 IRR 与 NPV。",

  // Skill indicators
  "skill.sandboxAlgorithms": "沙箱算法执行",

  // Tool indicators
  "tool.commands": "命令行",
  "tool.files": "文件",
  "tool.codeRunner": "代码运行",
  "tool.browser": "浏览器",

  // Web search activity (in-bubble chip)
  "webSearch.error.wsaMissing": "搜索不可用，需配置 {0} API Key",
  "webSearch.error.wsaCta": "获取 Key",

  // Debug panel
  "debug.title": "Trace",
  "debug.events": "事件",
  "debug.clear": "清除",
  "debug.empty": "等待 SSE 事件...",
  "debug.emptyHint": "发送消息后，所有原始后端数据将在此处显示。",

  // Status & errors
  "status.error": "请求失败，请检查后端服务是否正常运行。",
  "status.stopped": "⏹ *已停止生成*",
  "status.backendError": "后端中止请求失败，服务器可能仍在运行。",

  // Language toggle
  "lang.switch": "English",

  // Sidebar
  "sidebar.label": "会话列表",
  "sidebar.title": "会话",
  "sidebar.newChat": "新建聊天",
  "sidebar.loading": "正在加载会话...",
  "sidebar.loadMore": "加载更多",
  "sidebar.loadingMore": "加载中...",
  "sidebar.emptyTitle": "暂无会话",
  "sidebar.emptyHint": "点击「新建聊天」开始第一段对话。",
  "sidebar.delete": "删除会话",
  "sidebar.deleteConfirm": "确定要永久删除这个会话吗？此操作不可恢复。",

  // Aria labels (button hover/screen-reader)
  "aria.send": "发送",
  "aria.clearHistory": "清除历史",
  "aria.stopGeneration": "停止生成",

  // ─── Floating bottom-right action badges ─────────────────────────────
  "floatingLink.deploy": "一键部署",
  "floatingLink.github": "GitHub",
} as const;

export default zh;
