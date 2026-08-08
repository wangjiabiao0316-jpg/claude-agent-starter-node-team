const en = {
  // Header
  "app.title": "Urban Core · AI Decision Engine",
  "app.subtitle": "Operation-first urban renewal finance & decision agent · EdgeOne Makers",

  // Empty state
  "empty.title": "Claude Agent Starter",
  "empty.hint": "I'm a Claude assistant running on EdgeOne. I can call sandbox tools, persist session memory, and help you with debugging, file management, code execution, and web browsing.",
  "empty.features": "Sandbox Tools · Store Memory · Observability",

  // Welcome screen
  "welcome.eyebrow": "CSCEC 1st AI Competition · Scenario Track",
  "welcome.title": "Urban Core · AI Decision Engine",
  "welcome.subtitle": "An operation-first urban renewal finance & decision intelligence (full lifecycle)",
  "welcome.guide": "Describe your project in natural language — city/location, current condition & ownership, scale metrics, and intended renewal direction. Six agents will orchestrate policy, financing, financial modelling, risk cases and the two-layer decision for you.",
  "welcome.ex1Title": "🚦 Full Decision Review",
  "welcome.ex1Text": "I have a redevelopment project in Nanshan, Shenzhen: a 1990s factory site of ~50,000 sqm with clear ownership, to be converted into subsidised rental housing. Please run the full review and two-layer decision.",
  "welcome.ex2Title": "💰 Financing Mix",
  "welcome.ex2Text": "A commercial building in Xihu, Hangzhou will be converted into long-term rental apartments. Total investment ~300M CNY with 40% equity. Please design a diversified financing plan.",
  "welcome.ex3Title": "📊 Financial Model",
  "welcome.ex3Text": "An old factory in Chengdu becomes a cultural-creative park: 180M CNY capex, 28M annual rent, 9M annual opex. Please calculate IRR and NPV.",
  "welcome.ex4Title": "⚠️ Failure Case Match",
  "welcome.ex4Text": "For an urban-village renewal project in Guangzhou, match the top-3 similar failure cases and highlight key risks and mitigations.",
  "welcome.foot": "SIX AGENTS · ONE DECISION · POWERED BY EDGEONE MAKERS",

  // Chat input
  "chat.placeholder": "Describe your urban renewal project: city/location · condition & ownership · scale · direction…  ⏎ Send · Shift+⏎ Newline",
  "chat.hint": "Six-agent orchestration · Policy / Financing / Finance / Risk / Decision · Powered by EdgeOne Makers",

  // Preset questions
  "preset.1": "Use terminal commands to check the current system time and OS version.",
  "preset.2": "Create /tmp/fib.py, write Python code to calculate the first 10 Fibonacci numbers, execute it, and print the result.",
  "preset.4": "Visit https://edgeone.ai and summarize the page content.",
  "preset.screenshotEdgeOne": "Take a screenshot of edgeone.ai.",
  "preset.skill.sandboxAlgorithms": "Calculate the first 20 Fibonacci numbers and provide the execution result.",
  "preset.project.full": "Run a full decision review for an urban renewal project: a 40,000 sqm factory-to-housing conversion in Yangpu, Shanghai.",
  "preset.project.finance": "Design a diversified financing plan for a stock-renewal project with 250M CNY total investment and 35% equity.",
  "preset.project.irr": "Calculate IRR and NPV: 150M capex, 22M annual rent, 8M annual opex.",

  // Skill indicators
  "skill.sandboxAlgorithms": "Sandbox Algorithms",

  // Tool indicators
  "tool.commands": "Commands",
  "tool.files": "Files",
  "tool.codeRunner": "Code Runner",
  "tool.browser": "Browser",

  // Web search activity (in-bubble chip)
  "webSearch.error.wsaMissing": "Web search unavailable — needs a {0} API key",
  "webSearch.error.wsaCta": "Get a key",

  // Status & errors
  "status.error": "Request failed. Please check if the backend service is running.",
  "status.stopped": "⏹ *Generation stopped*",
  "status.backendError": "Backend abort request failed. The server may still be running.",

  // Debug panel
  "debug.title": "Trace",
  "debug.events": "events",
  "debug.clear": "Clear",
  "debug.empty": "Waiting for SSE events...",
  "debug.emptyHint": "After sending a message, all raw backend data will be displayed here.",

  // Language toggle
  "lang.switch": "中文",

  // Sidebar
  "sidebar.label": "Conversation list",
  "sidebar.title": "Chats",
  "sidebar.newChat": "New chat",
  "sidebar.loading": "Loading conversations...",
  "sidebar.loadMore": "Load more",
  "sidebar.loadingMore": "Loading...",
  "sidebar.emptyTitle": "No conversations yet",
  "sidebar.emptyHint": "Click \"New chat\" to start your first conversation.",
  "sidebar.delete": "Delete conversation",
  "sidebar.deleteConfirm": "Permanently delete this conversation? This cannot be undone.",

  // Aria labels (button hover/screen-reader)
  "aria.send": "Send",
  "aria.clearHistory": "Clear history",
  "aria.stopGeneration": "Stop generation",

  // ─── Floating bottom-right action badges ─────────────────────────────
  "floatingLink.deploy": "Deploy",
  "floatingLink.github": "GitHub",
} as const;

export default en;
