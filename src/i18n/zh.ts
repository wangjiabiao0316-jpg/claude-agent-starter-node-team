const zh = {
  // Header
  "app.title": "问牛工",
  "app.subtitle": "万象更芯 · 智算营城",
  "agents.title": "七大 Agent 工作区",
  "agents.eyebrow": "AGENTS WORKSPACE",

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
  "welcome.foot": "SEVEN AGENTS · ONE DECISION · POWERED BY EDGEONE MAKERS",

  // Product home (点击 logo / 产品名进入的产品首页)
  // 板块一·产品简介(hero 区复用上面 welcome.* 的 eyebrow/title/subtitle)
  "home.eyebrow": "产品简介 · PRODUCT OVERVIEW",
  "home.introTitle": "什么是「万象更芯」",
  "home.intro": "面向城市更新项目的运营前置决策智能体。输入项目区位、产权、规模与改造方向,系统串联七大智能体(前置闸门 / 政策应答 / 多元融资 / 通用财务 / 失败校验 / 建造判别 / 双层决策),覆盖咨询、投资、建设、运营全阶段,自动产出可上会的红绿灯判定与论证材料。",
  // 板块二·产品价值(三张卡)
  "home.valueTitle": "产品价值",
  "home.value1Title": "咨投建运全阶段覆盖",
  "home.value1Text": "从产权文保筛查到融资方案、财务测算、失败案例对标,一条链路给出上会就绪度,告别多工具拼接。",
  "home.value2Title": "三色灯硬规则闸门",
  "home.value2Text": "产权清晰度、文保规划、资本金比例、抵押物合规等硬约束先行判定,任一红灯即终止,避免算到一半才发现不合规。",
  "home.value3Title": "沙箱算账而非心算",
  "home.value3Text": "IRR / NPV / DSCR / 回收期由 EdgeOne 沙箱执行 Python 财务引擎计算,对照业态门槛基准,杜绝 LLM 估算偏差。",
  "home.value4Title": "人机协商迭代",
  "home.value4Text": "报告并非终点——可重新运行某个智能体、补充条件再次分析,人在回路中持续打磨上会结论。",
  // 板块三·使用方法(四步)
  "home.usageTitle": "使用方法",
  "home.usage1": "点击下方「开始使用」进入采集向导。",
  "home.usage2": "按五步引导填写项目条件(城市 / 区位 · 现状产权 · 规模指标 · 改造方向 · 测算目标),可选填、可返回修改。",
  "home.usage3": "确认描述后发送,七大智能体依依赖关系串并行执行,结果汇总为顶层红绿灯与分维度报告。",
  "home.usage4": "在右侧 Dock 切换查看各智能体明细,一键导出上会报告或重新运行某个环节。",
  "home.usage5": "基于报告结果重新运行某环节,或补充条件再次分析,持续打磨上会结论。",
  // 流程图节点的短标签(图示用,完整说明 hover 显示,见 home.usage1~5)
  "home.usageLabel1": "进入向导",
  "home.usageLabel2": "五步采集",
  "home.usageLabel3": "智能体执行",
  "home.usageLabel4": "查看报告",
  "home.usageLabel5": "迭代分析",
  "home.cta": "开始使用",

  // Preset questions
  "preset.1": "使用终端命令检查当前系统时间和操作系统版本。",
  "preset.2": "创建 /tmp/fib.py，写入计算斐波那契数列前 10 项的 Python 代码并执行，将结果打印出来。",
  "preset.4": "访问 https://edgeone.ai 并总结页面内容。",
  "preset.screenshotEdgeOne": "截取 edgeone.ai 的网页图片。",
  "preset.skill.sandboxAlgorithms": "计算斐波那契数列前 20 个，并给出执行结果。",

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
  "aria.stopGeneration": "停止生成",

  // ─── Floating bottom-right action badges ─────────────────────────────
  "floatingLink.deploy": "一键部署",
  "floatingLink.github": "GitHub",

  // === 改造引入:IntakeWizard 22 字段 + 软警告 + 15 城 ===
  "wizard.previewStep": "预览并提交",
  "wizard.previewAndSubmit": "预览并提交",
  "wizard.continueSubmit": "继续测算",
  "wizard.returnToFill": "返回填写",
  "wizard.previewShowPrompt": "查看发送给智能体的完整 prompt",
  "wizard.previewMissing": "⚠️ {n} 个关键字段未填,继续将触发降级",
  "wizard.sectionRequired": "必填项",
  "wizard.sectionAdvanced": "高级参数(可选,缺省将用行业默认值)",

  "wizard.qCity": "📍 你的项目所在城市(必须从 15 试点城市中选择)",
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

  // === V3.0 六屏单屏导航 ===
  "nav.home": "产品首页",
  "nav.management": "项目管理",
  "nav.agents": "智能体群",
  "nav.conclusion": "综合结论",

  // 项目管理屏
  "management.eyebrow": "PROJECT SUMMARY",
  "management.title": "项目资产摘要",
  "management.emptyTitle": "暂无项目",
  "management.emptyHint": "点击右侧「创建新项目」开始建立档案",
  "management.summaryHint": "点击左侧项目可进入其综合结论屏，查看七智能体输出与决策结论。",
  "management.updatedAt": "最近更新",
  "management.createLabel": "创建新项目",
  "management.createFoot": "SEVEN AGENTS · ONE DECISION",

  // 新建项目过渡屏
  "transition.eyebrow": "NEW PROJECT",
  "transition.title": "创建新项目",
  "transition.subtitle": "运营前置视角下的城市更新财务与决策智能体",
  "transition.step1Title": "建立档案",
  "transition.step1Desc": "填写 22 项项目字段，建立城市更新项目资产档案",
  "transition.step2Title": "整理资料",
  "transition.step2Desc": "补充产权、文保、财务等关键信息，准备进入智能体",
  "transition.step3Title": "进入 Agent",
  "transition.step3Desc": "七智能体编排执行，输出三色灯决策结论",
  "transition.cta": "进入 Agent →",
  "transition.sideTitle": "创建前准备清单",
  "transition.check1": "项目区位与城市（15 试点城市）",
  "transition.check2": "产权类型与文保等级",
  "transition.check3": "物理参数（面积 / 结构 / 高度）",
  "transition.check4": "资金面（投资 / 资本金 / 抵押）",
  "transition.check5": "财务与退出策略",

  // 综合结论屏
  "conclusion.eyebrow": "DECISION CONCLUSION",
  "conclusion.title": "综合结论",
  "conclusion.emptyTitle": "暂无决策报告",
  "conclusion.emptyHint": "请先在「智能体」屏提交项目，等待七智能体编排完成后生成报告。",
  "conclusion.download": "下载 HTML",
  "conclusion.chatTitle": "分析过程",
} as const;

export default zh;
