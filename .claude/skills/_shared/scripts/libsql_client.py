"""
libsql_client.py - sandbox 内 Python 直连 libSQL HTTP API

注入方式：每个 agent (agent2/agent3/agent5) 通过自己的 Step 0 bootstrap：
  1. 用 Read 工具读 .claude/skills/_shared/scripts/libsql_client.py 源码
  2. 用 mcp__edgeone__files_write 写到 /tmp/finance/libsql_client.py
  3. 用 mcp__edgeone__commands export LIBSQL_URL LIBSQL_RO_TOKEN
  4. 用 mcp__edgeone__commands 跑 import 验证

⚠️ 历史说明（2026-08-09 修订）：原假设 agents/chat/_tools.ts::prepareSandbox
会自动注入此文件，但该函数从未被 chat/index.ts 调用（架构死代码，已删除）。
各 agent 必须自己 bootstrap，不能再依赖 prepareSandbox。

Whitelist (8 张表):
  业务参数表 6 张: finance_products, mortgage_thresholds, negative_list,
                   pilot_cities, case_library, industry_thresholds
  政策知识库 2 张: kb_chunks_meta, kb_records
"""
import os
import json
import urllib.request

SQL_TABLE_WHITELIST = {
    "finance_products", "mortgage_thresholds", "negative_list",
    "pilot_cities", "case_library", "industry_thresholds",
    # Policy knowledge base (kb_chunks_meta + kb_records)
    "kb_chunks_meta", "kb_records",
}

SQL_KEYWORD_BLOCKLIST = ("insert", "update", "delete", "drop", "create",
                         "alter", "truncate", "grant", "revoke", "attach", "pragma")


def _check_env():
    url = os.environ.get("LIBSQL_URL")
    if not url:
        raise RuntimeError("LIBSQL_URL not set in sandbox env")
    token = os.environ.get("LIBSQL_RO_TOKEN")
    if not token:
        raise RuntimeError("LIBSQL_RO_TOKEN not set in sandbox env")
    return url, token


def _libsql_endpoint():
    url, _ = _check_env()
    return url.rstrip("/") + "/v2/pipeline"


def _auth_headers():
    _, token = _check_env()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _build_select_sql(table, columns=None, where=None, limit=1000):
    """构造 SELECT 语句 + 参数列表。"""
    if table not in SQL_TABLE_WHITELIST:
        raise ValueError(f"table not in whitelist: {table}")

    cols = ", ".join(columns) if columns else "*"
    where_clause = ""
    args = []
    if where:
        conds = []
        for col, val in where.items():
            args.append(val)
            conds.append(f"{col} = ?")
        where_clause = "WHERE " + " AND ".join(conds)
    safe_limit = min(int(limit), 1000)

    # 规整空格：用 join 过滤空段，避免 WHERE 为空时出现两个空格
    sql_parts = [f"SELECT {cols} FROM {table}"]
    if where_clause:
        sql_parts.append(where_clause)
    sql_parts.append(f"LIMIT {safe_limit}")
    sql = " ".join(sql_parts)
    sql_lower = sql.lower()
    for kw in SQL_KEYWORD_BLOCKLIST:
        if kw in sql_lower and kw not in table.lower():
            # 允许表名含关键字字符（如 "update_log"），但禁止 SQL 关键字
            # 简单检查：关键字前后非字母数字才算
            import re
            pattern = rf"\b{kw}\b"
            if re.search(pattern, sql_lower):
                raise ValueError(f"forbidden SQL keyword detected: {kw}")
    return sql, args


def _parse_libsql_response(data):
    """解析 libSQL /v2/pipeline 响应为 dict 列表。

    支持两种响应形态：
    1. 真实 sqld（生产）：results[0].response.result.{cols,rows}
    2. 历史简化 mock：results[0].results.{cols,rows}（旧测试 fixture）
    """
    results = data.get("results", [])
    if not results:
        return []
    first = results[0] or {}

    # 错误响应：results[0] = {"type": "error", "error": {...}}
    if first.get("type") == "error":
        err = first.get("error", {})
        raise RuntimeError(f"libSQL error: {err.get('message', '?')} (code={err.get('code', '?')})")

    # 真实 sqld 响应：results[0].response.result.{cols,rows}
    rows_response = {}
    response = first.get("response")
    if isinstance(response, dict) and response.get("type") == "execute":
        result_obj = response.get("result", {})
        if isinstance(result_obj, dict):
            rows_response = result_obj
    # 兼容旧 mock 格式：results[0].results.{cols,rows}
    if not rows_response and isinstance(first.get("results"), dict):
        rows_response = first["results"]

    cols_list = [c.get("name") for c in rows_response.get("cols", [])]
    rows = rows_response.get("rows", [])
    parsed = []
    for row in rows:
        item = {}
        for i, col_name in enumerate(cols_list):
            cell = row[i] if i < len(row) else None
            value = cell.get("value") if isinstance(cell, dict) else cell
            item[col_name] = value
        parsed.append(item)
    return parsed


def _tag_arg(v):
    """sqld /v2/pipeline expects each arg as {type, value}; integers are sent
    as their string representation (per libSQL binary protocol)."""
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": "1" if v else "0"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": str(v)}
    return {"type": "text", "value": str(v)}


def _execute_pipeline(sql, args):
    """Send a single SQL statement to libSQL /v2/pipeline and return parsed rows.

    Formats the request body per sqld v0.24.x contract:
      {"requests": [{"type": "execute", "stmt": {"sql": "...", "args": [tagged,...]}}, {"type": "close"}]}
    Each positional arg MUST be tagged as {type, value} (see _tag_arg).
    """
    tagged_args = [_tag_arg(a) for a in (args or [])]
    body = json.dumps({
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": tagged_args}},
            {"type": "close"},
        ],
    }).encode("utf-8")

    req = urllib.request.Request(
        _libsql_endpoint(), data=body, headers=_auth_headers(), method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return _parse_libsql_response(data)


def execute_sql(table, columns=None, where=None, limit=1000):
    """
    封装 libSQL HTTP /v2/pipeline SELECT 调用。
    table 必须在白名单内；limit 上限 1000。
    """
    sql, args = _build_select_sql(table, columns, where, limit)
    return _execute_pipeline(sql, args)


def query_cases(features, top_k=3):
    """
    agent5 专用：先 SQL 预筛（region + industry），再返回候选列表。
    实际相似度计算由 case_matcher.py 完成（避免循环依赖）。
    """
    candidates = execute_sql(
        "case_library",
        where={"region": features["region"], "industry": features["industry"]},
        limit=200,
    )
    return candidates[:top_k]


# ============================================================
# Policy knowledge base helpers (kb_chunks_meta + kb_records)
# ============================================================

def query_kb_by_keyword(keyword, top_k=10):
    """按关键词检索 kb_chunks_meta（content LIKE）。

    Args:
        keyword: 搜索关键词（如 "REITs" / "专项债自审自发" / "958 号文"）
        top_k: 最多返回行数（默认 10，硬上限 200）

    Returns:
        list of dict, 每条含 {chunk_id, kb_id, chunk_type, clause_label, content}.
        命中数为 0 时返回空列表；libSQL 不可用时抛 RuntimeError。
    """
    safe_k = max(1, min(int(top_k), 200))
    sql = (
        "SELECT chunk_id, kb_id, chunk_type, clause_label, content "
        "FROM kb_chunks_meta "
        "WHERE content LIKE ? COLLATE NOCASE "
        "LIMIT ?"
    )
    args = [f"%{keyword}%", safe_k]
    return _execute_pipeline(sql, args)


def query_kb_by_source(kb_source, top_k=50):
    """按 kb_source 桶过滤 kb_records（KB01-REITs / KB03-专项债 等）。

    Args:
        kb_source: 桶标识（如 "KB01", "KB03"）
        top_k: 最多返回行数（默认 50）

    Returns:
        list of dict, 每条含 {kb_id, title, category, source_url, source_date, ...}.
    """
    return execute_sql(
        "kb_records",
        where={"kb_source": kb_source},
        limit=top_k,
    )


def query_kb_by_category(category, top_k=50):
    """按 category 字段过滤 kb_records（如 "政策法规库 / REITs 政策"）."""
    return execute_sql(
        "kb_records",
        where={"category": category},
        limit=top_k,
    )
