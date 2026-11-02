const en = {
  // Header
  "app.title": "问牛工",
  "app.subtitle": "Urban Core · AI Decision Engine",
  "agents.title": "七大 Agent 工作区",
  "agents.eyebrow": "AGENTS WORKSPACE",

  // Empty state
  "empty.title": "Claude Agent Starter",
  "empty.hint": "I'm a Claude assistant running on EdgeOne. I can call sandbox tools, persist session memory, and help you with debugging, file management, code execution, and web browsing.",
  "empty.features": "Sandbox Tools · Store Memory · Observability",

  // Welcome screen
  "welcome.eyebrow": "CSCEC 1st AI Competition · Scenario Track",
  "welcome.title": "Urban Core · AI Decision Engine",
  "welcome.subtitle": "An operation-first urban renewal finance & decision intelligence (full lifecycle)",
  "welcome.guide": "No need to write it all at once — follow the five-step guide below to fill in each project condition (location · condition & ownership · scale · direction · goal), and we'll compose the full review prompt for you.",

  // Intake wizard (step-by-step guided input)
  "wizard.step": "Step",
  "wizard.qCurrent": "What is the current condition and ownership status?",
  "wizard.qCurrentPh": "e.g. 1990s factory buildings, clear ownership, no heritage limits",
  "wizard.qScale": "Scale metrics (area / investment / equity)?",
  "wizard.qScalePh": "e.g. ~50,000 sqm, ~300M CNY total investment, 40% equity",
  "wizard.qDirection": "What is the intended renewal direction?",
  "wizard.dir1": "Subsidised rental housing",
  "wizard.dir2": "Long-term rental apartments",
  "wizard.dir3": "Cultural-creative park",
  "wizard.dir4": "Commercial office",
  "wizard.dir5": "Industrial park",
  "wizard.dirOther": "Other",
  "wizard.dirCustomPh": "Type your direction, e.g. community elderly-care centre",
  "wizard.back": "Back",
  "wizard.next": "Next",
  "wizard.generate": "Compose description",
  "wizard.send": "Send to agents",
  "wizard.restart": "Start over",
  "wizard.previewTitle": "Review your project description (go back to edit before sending)",
  "welcome.ex1Title": "🚦 Full Decision Review",
  "welcome.ex1Text": "I have a redevelopment project in Nanshan, Shenzhen: a 1990s factory site of ~50,000 sqm with clear ownership, to be converted into subsidised rental housing. Please run the full review and two-layer decision.",
  "welcome.ex2Title": "💰 Financing Mix",
  "welcome.ex2Text": "A commercial building in Xihu, Hangzhou will be converted into long-term rental apartments. Total investment ~300M CNY with 40% equity. Please design a diversified financing plan.",
  "welcome.ex3Title": "📊 Financial Model",
  "welcome.ex3Text": "An old factory in Chengdu becomes a cultural-creative park: 180M CNY capex, 28M annual rent, 9M annual opex. Please calculate IRR and NPV.",
  "welcome.ex4Title": "⚠️ Failure Case Match",
  "welcome.ex4Text": "For an urban-village renewal project in Guangzhou, match the top-3 similar failure cases and highlight key risks and mitigations.",
  "welcome.foot": "SEVEN AGENTS · ONE DECISION · POWERED BY EDGEONE MAKERS",

  // Product home (the product landing page reached by clicking logo / title)
  // Section 1 · Overview (hero reuses welcome.* eyebrow/title/subtitle above)
  "home.eyebrow": "PRODUCT OVERVIEW",
  "home.introTitle": "What is Urban Core",
  "home.intro": "An operation-first decision intelligence agent for urban-renewal projects. Enter location, ownership, scale and renovation direction; seven agents (asset gate / policy / financing / financial model / failure validation / build check / two-layer decision) run across the full consulting–investment–construction–operation lifecycle and produce a review-ready traffic-light verdict with supporting evidence.",
  // Section 2 · Value (three cards)
  "home.valueTitle": "Product Value",
  "home.value1Title": "Full-lifecycle coverage",
  "home.value1Text": "From heritage & ownership screening to financing, financial modelling and failure-case benchmarking — one pipeline delivers review-readiness instead of stitching tools.",
  "home.value2Title": "Hard-rule traffic-light gate",
  "home.value2Text": "Ownership clarity, heritage, capital-ratio and collateral compliance are checked first; any red light halts the run before you waste compute on a non-compliant deal.",
  "home.value3Title": "Sandboxed accounting, not guesswork",
  "home.value3Text": "IRR / NPV / DSCR / payback are computed by a Python financial engine in the EdgeOne sandbox against industry-hurdle benchmarks — no LLM arithmetic drift.",
  "home.value4Title": "Human-in-the-loop iteration",
  "home.value4Text": "A report isn't the end — rerun any agent or refine conditions and re-analyse, keeping the human in the loop to sharpen the review conclusion.",
  // Section 3 · How to use (four steps)
  "home.usageTitle": "How to Use",
  "home.usage1": "Click \"Get Started\" below to open the intake wizard.",
  "home.usage2": "Fill the five-step project conditions (city · location · ownership & condition · scale · direction & goal). All optional fields can be edited or revisited.",
  "home.usage3": "Send the description; the seven agents run in dependency order and aggregate into a top-level traffic light plus per-dimension reports.",
  "home.usage4": "Switch the right-side Dock to inspect each agent, export the review report, or rerun any stage.",
  "home.usage5": "Rerun a stage from its results, or add conditions and re-analyse — keep sharpening the review conclusion.",
  // Flow node short labels (for the diagram; full text shown on hover via home.usage1~5)
  "home.usageLabel1": "Open wizard",
  "home.usageLabel2": "5-step intake",
  "home.usageLabel3": "Agents run",
  "home.usageLabel4": "Review report",
  "home.usageLabel5": "Iterate",
  "home.cta": "Get Started",

  // Preset questions
  "preset.1": "Use terminal commands to check the current system time and OS version.",
  "preset.2": "Create /tmp/fib.py, write Python code to calculate the first 10 Fibonacci numbers, execute it, and print the result.",
  "preset.4": "Visit https://edgeone.ai and summarize the page content.",
  "preset.screenshotEdgeOne": "Take a screenshot of edgeone.ai.",
  "preset.skill.sandboxAlgorithms": "Calculate the first 20 Fibonacci numbers and provide the execution result.",

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
  "aria.stopGeneration": "Stop generation",

  // ─── Floating bottom-right action badges ─────────────────────────────
  "floatingLink.deploy": "Deploy",
  "floatingLink.github": "GitHub",

  // === Added for: IntakeWizard 22 fields + soft warnings + 15 pilot cities ===
  "wizard.previewStep": "Preview & submit",
  "wizard.previewAndSubmit": "Preview & submit",
  "wizard.continueSubmit": "Continue calculation",
  "wizard.returnToFill": "Return to fill",
  "wizard.previewShowPrompt": "View the full prompt sent to the agents",
  "wizard.previewMissing": "⚠️ {n} key fields are empty — continuing will trigger degradation",
  "wizard.sectionRequired": "Required",
  "wizard.sectionAdvanced": "Advanced parameters (optional; industry defaults will be used if omitted)",

  "wizard.qCity": "📍 Project city (must be one of the 15 pilot cities)",
  "wizard.qCityPilotHint": "Non-pilot cities cannot start the super-skill calculation flow",
  "wizard.qLocation": "🗺️ Location (administrative district / park / plot name)",
  "wizard.qLocationPh": "e.g., Nanshan Tech Park",

  "wizard.field.location.label": "Location",
  "wizard.field.location.placeholder": "e.g., Nanshan Tech Park",

  "wizard.field.owner_type.label": "Owner Type",
  "wizard.field.property_cert.label": "Property Certificate Number",
  "wizard.field.property_cert.placeholder": "e.g., Yue (2024) Shenzhen Real Estate No. 0000XXX",
  "wizard.field.heritage_level.label": "Heritage Status",
  "wizard.field.current_status.label": "Current Condition Description",
  "wizard.field.current_status.placeholder": "e.g., 1990s old factory, clear title, 30% vacancy",

  "wizard.field.building_area.label": "Building Area (sqm)",
  "wizard.field.building_area.placeholder": "e.g., 50000",
  "wizard.field.structure_type.label": "Structure Type",
  "wizard.field.height_m.label": "Floor Height (m)",
  "wizard.field.height_m.placeholder": "e.g., 4.5",
  "wizard.field.height_m.hint": "(Optional) If missing, LLM will estimate",

  "wizard.field.industry.label": "Target Industry (must match one of the 6 industries)",
  "wizard.field.industry.f8Hint": "⚠️ This industry has no dedicated threshold table in the agent4 financial model — F8 fallback (lenient thresholds) will be triggered, reducing IRR accuracy.",
  "wizard.field.renovation_mode.label": "Renovation Mode",

  "wizard.field.investment.label": "Total Investment (10k CNY)",
  "wizard.field.investment.placeholder": "e.g., 30000",
  "wizard.field.capital_ratio.label": "Self-owned Capital Ratio (%)",
  "wizard.field.capital_ratio.hint": "H1 hard constraint: 25–30% is the green safe zone; other ranges will be flagged yellow or red by agent3",
  "wizard.field.capital_ratio.safe": "✓ Currently in the H1 safe zone (25–30%)",
  "wizard.field.mortgage_type.label": "Collateral Type",
  "wizard.field.mortgage_value.label": "Collateral Valuation (10k CNY)",
  "wizard.field.mortgage_value.placeholder": "e.g., 25000",

  "wizard.field.monthly_rent.label": "Monthly Rent (CNY/sqm)",
  "wizard.field.monthly_rent.placeholder": "e.g., 120",
  "wizard.field.leasable_area.label": "Leasable Area (sqm)",
  "wizard.field.leasable_area.placeholder": "e.g., 35000",
  "wizard.field.holding_years.label": "Holding Period (years, 1–50)",
  "wizard.field.holding_years.placeholder": "e.g., 15",
  "wizard.field.exit_strategy.label": "Exit Strategy",

  "wizard.field.occupancy.label": "Occupancy Rate (%) — default 85",
  "wizard.field.exit_cap_rate.label": "Exit Cap Rate (%) — default 4.5",
  "wizard.field.exit_cap_rate.placeholder": "e.g., 4.5",
  "wizard.field.discount_rate.label": "Discount Rate (%) — default 8",
  "wizard.field.discount_rate.placeholder": "e.g., 8",

  // Soft warning modal
  "wizard.warningTitle": "Accuracy Will Degrade",
  "wizard.warningSeverityBlocker": "Blocker",
  "wizard.warningSeverityDegraded": "Default value",
  "wizard.warningConsequence": "Consequence",
  "wizard.warningTechRef": "Technical reference",
  "wizard.warningSuggestion": "Suggestion",
  "wizard.warningReturn": "Return to fill",
  "wizard.warningConfirmSkip": "Skip anyway",

  // Pilot city migration
  "wizard.cityNotInList": "My city is not in the list...",
  "wizard.cityMigrationTitle": "Non-pilot city",
  "wizard.cityMigrationBody": "Your previously entered city {city} is not in the 15 pilot cities list (agent2 H1 dimension 1). Please choose from the 15 cities, or pick the nearest pilot city as a proxy (results for reference only).",
  "wizard.cityMigrationAck": "Got it",

  // === V3.0 six-screen single-page nav ===
  "nav.home": "Product",
  "nav.management": "Projects",
  "nav.agents": "Agent Swarm",
  "nav.conclusion": "Conclusion",

  // Project management screen
  "management.eyebrow": "PROJECT SUMMARY",
  "management.title": "Project Summary",
  "management.emptyTitle": "No projects yet",
  "management.emptyHint": "Click \"New Project\" on the right to start",
  "management.summaryHint": "Select a project on the left to open its decision conclusion.",
  "management.updatedAt": "Last updated",
  "management.createLabel": "New Project",
  "management.createFoot": "SEVEN AGENTS · ONE DECISION",

  // New project transition screen
  "transition.eyebrow": "NEW PROJECT",
  "transition.title": "New Project",
  "transition.subtitle": "Operation-first urban renewal finance & decision agent",
  "transition.step1Title": "Build Profile",
  "transition.step1Desc": "Fill 22 fields to build the project asset profile",
  "transition.step2Title": "Organize Materials",
  "transition.step2Desc": "Add ownership, heritage and finance details before entering the agents",
  "transition.step3Title": "Enter Agents",
  "transition.step3Desc": "Seven agents orchestrate and output the traffic-light verdict",
  "transition.cta": "Enter Agents →",
  "transition.sideTitle": "Pre-creation Checklist",
  "transition.check1": "Location & city (15 pilot cities)",
  "transition.check2": "Ownership type & heritage level",
  "transition.check3": "Physical parameters (area / structure / height)",
  "transition.check4": "Funding (investment / equity / mortgage)",
  "transition.check5": "Finance & exit strategy",

  // Conclusion screen
  "conclusion.eyebrow": "DECISION CONCLUSION",
  "conclusion.title": "Decision Conclusion",
  "conclusion.emptyTitle": "No decision report yet",
  "conclusion.emptyHint": "Submit a project on the Agents screen first; the report is generated after the seven-agent run.",
  "conclusion.download": "Download HTML",
  "conclusion.chatTitle": "Analysis Process",
} as const;

export default en;
