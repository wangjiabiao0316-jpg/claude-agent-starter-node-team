-- =============================================================================
-- 2026-08-08-init_libsql_schema.sql
-- super-skill 项目 libSQL 业务表初始化（6 张表）
--   1. industry_thresholds   业态 IRR 门槛（商业 8-12% / 办公 6-9% / 文旅 7-10%）
--   2. finance_products      多元融资工具（6 条：专项债 / REITs / 政策性银行贷 /
--                            商业银行贷 / 保险资金产业基金 / 房地产信托）
--   3. mortgage_thresholds   抵押率阈值（6 类抵押物）
--   4. negative_list         政策性资金负面清单（8 条）
--   5. pilot_cities          专项债自审自发 15 城试点
--   6. case_library          失败案例库（25 条）
-- 目标库：EdgeOne Makers libSQL（sqld v0.24.x）
-- 协议参考：https://docs.turso.tech/sdk/http/reference  (POST /v2/pipeline)
-- =============================================================================

-- 1. industry_thresholds  ----------------------------------------------------
DROP TABLE IF EXISTS industry_thresholds;
CREATE TABLE industry_thresholds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  industry    TEXT    NOT NULL UNIQUE,
  floor       REAL    NOT NULL,
  ceiling     REAL    NOT NULL,
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 2. finance_products  -------------------------------------------------------
DROP TABLE IF EXISTS finance_products;
CREATE TABLE finance_products (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name                TEXT    NOT NULL,
  name                     TEXT,
  category_label           TEXT,
  category                 TEXT,
  interest_rate            REAL,
  cost_min                 REAL,
  cost_max                 REAL,
  term_years               INTEGER,
  term_min                 INTEGER,
  term_max                 INTEGER,
  approval_rate            REAL,
  capital_ratio_min        REAL,
  max_loan_ratio           REAL,
  applicable_regions       TEXT,
  applicable_industries    TEXT,
  negative_list_applied    INTEGER,
  created_at               TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 3. mortgage_thresholds  ----------------------------------------------------
DROP TABLE IF EXISTS mortgage_thresholds;
CREATE TABLE mortgage_thresholds (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  mortgage_type     TEXT    NOT NULL UNIQUE,
  threshold_value   REAL    NOT NULL,
  threshold_label   TEXT,
  max_ratio         REAL,
  created_at        TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 4. negative_list  ----------------------------------------------------------
DROP TABLE IF EXISTS negative_list;
CREATE TABLE negative_list (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_label  TEXT    NOT NULL,
  category_type   TEXT    NOT NULL,
  value_label     TEXT    NOT NULL,
  value_code      TEXT,
  created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 5. pilot_cities  -----------------------------------------------------------
DROP TABLE IF EXISTS pilot_cities;
CREATE TABLE pilot_cities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  city          TEXT    NOT NULL UNIQUE,
  tier_label    TEXT,
  tier_code     TEXT,
  created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 6. case_library  -----------------------------------------------------------
DROP TABLE IF EXISTS case_library;
CREATE TABLE case_library (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id         TEXT    NOT NULL UNIQUE,
  region          TEXT    NOT NULL,
  industry        TEXT    NOT NULL,
  scale           INTEGER NOT NULL,
  property_type   TEXT,
  physical_params TEXT,
  financing       TEXT,
  failure_mode    TEXT    NOT NULL,
  root_cause      TEXT    NOT NULL,
  remediation     TEXT,
  created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- DML（按每张表 INSERT；单引号已转义为 ''；嵌套对象存 JSON 字符串）
-- =============================================================================

-- 1. industry_thresholds (3 rows) --------------------------------------------
INSERT INTO industry_thresholds (industry, floor, ceiling) VALUES ('商业', 0.08, 0.12);
INSERT INTO industry_thresholds (industry, floor, ceiling) VALUES ('办公', 0.06, 0.09);
INSERT INTO industry_thresholds (industry, floor, ceiling) VALUES ('文旅', 0.07, 0.10);

-- 2. finance_products (6 rows) -----------------------------------------------
INSERT INTO finance_products (
  tool_name, name, category_label, category,
  interest_rate, cost_min, cost_max,
  term_years, term_min, term_max,
  approval_rate, capital_ratio_min, max_loan_ratio,
  applicable_regions, applicable_industries, negative_list_applied
) VALUES
  ('专项债 - 自审自发', '专项债-自审自发', '政策性资金/专项债', 'policy',
   0.028, 0.028, 0.028,
   20, 20, 20,
   0.75, 0.30, 0.70,
   '北京/上海/江苏/浙江/安徽/福建/山东/湖南/广东/四川/雄安/河北/江西/湖北/重庆',
   '存量基础设施提质/产业升级/文旅', 1),
  ('REITs - 基础设施试点', 'REITs-基础设施试点', '政策性资金/REITs', 'policy',
   0.045, 0.045, 0.045,
   25, 25, 25,
   0.55, 0.25, 0.80,
   '全国（试点优先）',
   '存量基础设施/商业/办公', 1),
  ('银行开发贷 - 政策性银行', '银行开发贷-政策性', '银行贷款/政策性', 'commercial',
   0.036, 0.036, 0.036,
   8, 8, 8,
   0.65, 0.25, 0.60,
   '全国',
   '商业/办公/文旅', 0),
  ('银行开发贷 - 商业银行', '银行开发贷-商业', '银行贷款/商业', 'commercial',
   0.052, 0.052, 0.052,
   5, 5, 5,
   0.55, 0.25, 0.50,
   '全国',
   '商业/办公', 0),
  ('保险资金 - 产业基金', '保险资金-产业基金', '基金/保险资金', 'commercial',
   0.055, 0.055, 0.055,
   10, 10, 10,
   0.50, 0.30, 0.55,
   '全国',
   '商业/文旅/产业升级', 0),
  ('信托融资 - 房地产信托', '信托融资-房地产', '信托', 'commercial',
   0.085, 0.085, 0.085,
   3, 3, 3,
   0.35, 0.30, 0.40,
   '全国',
   '商业/办公', 0);

-- 3. mortgage_thresholds (6 rows) --------------------------------------------
INSERT INTO mortgage_thresholds (mortgage_type, threshold_value, threshold_label, max_ratio) VALUES
  ('土地使用权', 0.70, '70%', 0.70),
  ('运营权',     0.50, '50%', 0.50),
  ('收益权',     0.55, '55%', 0.55),
  ('经营权',     0.55, '55%', 0.55),
  ('收费权',     0.50, '50%', 0.50),
  ('组合',       0.60, '60%', 0.60);

-- 4. negative_list (8 rows) --------------------------------------------------
INSERT INTO negative_list (category_label, category_type, value_label, value_code) VALUES
  ('业主',     'owner',       '房地产开发失信主体名单', '失信主体'),
  ('业主',     'owner',       '被列入失信被执行人',     '失信被执行'),
  ('项目类型', 'project_type', '鬼城/空城写字楼',       '鬼城写字楼'),
  ('项目类型', 'project_type', '违规别墅',              '违规别墅'),
  ('业态',     'industry',    '高污染化工',             '高污染化工'),
  ('业态',     'industry',    '过剩产能行业',           '过剩产能'),
  ('区域',     'region',      '生态红线区',             '生态红线'),
  ('区域',     'region',      '自然保护区核心区',       '自然保护区');

-- 5. pilot_cities (15 rows) --------------------------------------------------
INSERT INTO pilot_cities (city, tier_label, tier_code) VALUES
  ('北京', '一线',   'tier1'),
  ('上海', '一线',   'tier1'),
  ('江苏', '强二线', 'tier2'),
  ('浙江', '强二线', 'tier2'),
  ('安徽', '强二线', 'tier2'),
  ('福建', '强二线', 'tier2'),
  ('山东', '强二线', 'tier2'),
  ('湖南', '强二线', 'tier2'),
  ('广东', '一线',   'tier1'),
  ('四川', '强二线', 'tier2'),
  ('雄安', '其他',   'tier3'),
  ('河北', '强二线', 'tier2'),
  ('江西', '强二线', 'tier2'),
  ('湖北', '强二线', 'tier2'),
  ('重庆', '强二线', 'tier2');

-- 6. case_library (25 rows) --------------------------------------------------
-- physical_params / financing 字段存原始 JSON 字符串，方便 sandbox 还原嵌套结构。
INSERT INTO case_library
  (case_id, region, industry, scale, property_type, physical_params, financing, failure_mode, root_cause, remediation)
VALUES
  ('case-2024-001', '上海', '商业', 3000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 8, "持有年限": 12, "退出策略": "REITs"}',
   '招商失败', '可租赁面积 3000㎡ 低于商业业态最低门槛 5000㎡，区位客流评级 D 级',
   '调整业态方向至门槛更低的业态或重新评估区位客流提升路径'),
  ('case-2024-002', '上海', '商业', 8000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "拆除重建"}',
   '{"融资期限": 5, "持有年限": 20, "退出策略": "REITs"}',
   '退出受阻', '融资期限 5 年与持有年限 20 年严重错配，资产属性禁止 REITs 退出',
   '重设融资期限与持有年限匹配或调整为整体转让/散售'),
  ('case-2024-003', '上海', '商业', 12000, '独立产权商业空间',
   '{"文保等级": "核心保护", "结构类型": "砖混", "改造模式": "保留微更新"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '改造超预算', '文保核心保护区强制保留，改造模式收敛为保留微更新，改造成本 1.6× 基准',
   '拆分非文保区域独立测算或调整业态方向降低文保约束冲击'),
  ('case-2024-004', '上海', '商业', 10000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '业态误判', '业态方向为商业但 IRR 7.0% 低于商业业态门槛下限 8.0%',
   '调整业态方向至 IRR 达标的业态或优化租金假设提升 IRR'),
  ('case-2024-005', '上海', '商业', 15000, '独立产权商业空间',
   '{"文保等级": "建控地带", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '施工引发周边协调失败', '文保周边密集区，施工扰动评估为高风险，居民密集+交通导流难度高',
   '分阶段施工降低扰动，建立居民沟通机制，制定交通导流方案'),
  ('case-2024-006', '北京', '商业', 4500,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 8, "持有年限": 10, "退出策略": "REITs"}',
   '招商失败', '可租赁面积 4500㎡ 接近商业业态最低门槛，区位客流评级 D 级',
   '调整业态方向至门槛更低的业态或引入主力店提升客流'),
  ('case-2024-007', '北京', '商业', 18000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "拆除重建"}',
   '{"融资期限": 6, "持有年限": 15, "退出策略": "REITs"}',
   '退出受阻', '融资期限 6 年与持有年限 15 年错配，退出策略受阻',
   '调整融资期限至 10 年以上或调整为散售退出'),
  ('case-2024-008', '北京', '商业', 20000, '独立产权商业空间',
   '{"文保等级": "核心保护", "结构类型": "砖混", "改造模式": "保留微更新"}',
   '{"融资期限": 12, "持有年限": 12, "退出策略": "整体转让"}',
   '改造超预算', '文保核心保护区，改造模式收敛，改造成本 1.7× 基准',
   '拆分非文保区域独立测算或调整改造模式'),
  ('case-2024-009', '上海', '办公', 5000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '业态误判', '业态方向为办公但 IRR 5.5% 低于办公业态门槛下限 6.0%',
   '调整业态方向或优化租金假设提升 IRR'),
  ('case-2024-010', '上海', '办公', 8000,  '独立产权商业空间',
   '{"文保等级": "建控地带", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 8, "持有年限": 12, "退出策略": "散售"}',
   '施工引发周边协调失败', '文保建控地带，密集区施工扰动评估为高风险',
   '分阶段施工，建立居民沟通机制'),
  ('case-2024-011', '深圳', '商业', 6000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "拆除重建"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '招商失败', '区位客流评级 D 级，招商前置条件缺失',
   '引入主力店提升客流或加强交通接驳'),
  ('case-2024-012', '深圳', '办公', 10000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 5, "持有年限": 12, "退出策略": "REITs"}',
   '退出受阻', '融资期限 5 年与持有年限 12 年错配',
   '调整融资期限至 8 年以上'),
  ('case-2024-013', '上海', '文旅', 8000,  '独立产权商业空间',
   '{"文保等级": "核心保护", "结构类型": "砖混", "改造模式": "保留微更新"}',
   '{"融资期限": 12, "持有年限": 15, "退出策略": "REITs"}',
   '改造超预算', '文保核心保护区，改造模式收敛，改造成本 1.8× 基准',
   '调整改造模式或拆分非文保区域独立测算'),
  ('case-2024-014', '上海', '文旅', 12000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '业态误判', '业态方向为文旅但 IRR 6.5% 低于文旅业态门槛下限 7.0%',
   '调整业态方向或优化运营收入假设提升 IRR'),
  ('case-2024-015', '北京', '文旅', 15000, '独立产权商业空间',
   '{"文保等级": "建控地带", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '施工引发周边协调失败', '文保周边密集区，施工扰动评估为高风险',
   '分阶段施工，建立居民沟通机制'),
  ('case-2024-016', '广州', '商业', 4000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '招商失败', '可租赁面积 4000㎡ 接近商业业态最低门槛，区位客流薄弱',
   '引入主力店或加强交通接驳'),
  ('case-2024-017', '广州', '办公', 7000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 8, "持有年限": 12, "退出策略": "整体转让"}',
   '退出受阻', '融资期限 8 年与持有年限 12 年轻度错配，退出策略路径不清晰',
   '调整退出策略或重设融资期限'),
  ('case-2024-018', '深圳', '商业', 14000, '独立产权商业空间',
   '{"文保等级": "建控地带", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '改造超预算', '建控地带改造模式受限，改造成本 1.55× 基准',
   '调整改造模式或拆分非文保区域独立测算'),
  ('case-2024-019', '上海', '商业', 9000,  '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '招商失败', '区位客流评级 C 级偏低，主力店招商落地困难',
   '引入主力店或加强交通接驳'),
  ('case-2024-020', '北京', '商业', 11000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '业态误判', '业态方向为商业但 IRR 7.5% 接近门槛下限 8.0%，业态选择存疑',
   '调整业态方向或优化租金假设'),
  ('case-2024-021', '深圳', '文旅', 18000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 12, "持有年限": 12, "退出策略": "REITs"}',
   '施工引发周边协调失败', '密集区施工扰动评估为高风险',
   '分阶段施工，建立居民沟通机制'),
  ('case-2024-022', '上海', '办公', 12000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '招商失败', '办公市场供过于求，可租赁面积增长过快',
   '调整业态方向或引入联合办公模式'),
  ('case-2024-023', '北京', '办公', 9000,  '独立产权商业空间',
   '{"文保等级": "核心保护", "结构类型": "砖混", "改造模式": "保留微更新"}',
   '{"融资期限": 12, "持有年限": 15, "退出策略": "REITs"}',
   '改造超预算', '文保核心保护区，改造模式收敛，改造成本 1.65× 基准',
   '调整改造模式或拆分非文保区域独立测算'),
  ('case-2024-024', '广州', '文旅', 22000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '业态误判', '业态方向为文旅但 IRR 6.8% 低于文旅业态门槛下限 7.0%',
   '调整业态方向或优化运营收入假设'),
  ('case-2024-025', '深圳', '办公', 13000, '独立产权商业空间',
   '{"文保等级": "无文保", "结构类型": "框架", "改造模式": "混合"}',
   '{"融资期限": 10, "持有年限": 10, "退出策略": "REITs"}',
   '退出受阻', '办公资产属性禁止 REITs 退出，退出策略路径不清晰',
   '调整退出策略为整体转让或散售');

-- =============================================================================
-- 验证（可选 SELECT COUNT）
-- =============================================================================
-- SELECT 'industry_thresholds' AS t, COUNT(*) AS n FROM industry_thresholds
-- UNION ALL SELECT 'finance_products',     COUNT(*) FROM finance_products
-- UNION ALL SELECT 'mortgage_thresholds',  COUNT(*) FROM mortgage_thresholds
-- UNION ALL SELECT 'negative_list',        COUNT(*) FROM negative_list
-- UNION ALL SELECT 'pilot_cities',         COUNT(*) FROM pilot_cities
-- UNION ALL SELECT 'case_library',         COUNT(*) FROM case_library;
