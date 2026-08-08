"""
libsql_client.py - sandbox 内 Python 直连 libSQL HTTP API

由 agents/chat/_tools.ts 在 prepareSandbox 阶段写入 /tmp/finance/libsql_client.py。
环境变量 LIBSQL_URL / LIBSQL_RO_TOKEN 由 _tools.ts 从 context.env 透传。

Whitelist:
  finance_products, mortgage_thresholds, negative_list,
  pilot_cities, case_library, industry_thresholds
"""
import os
import json
import urllib.request

SQL_TABLE_WHITELIST = {
    "finance_products", "mortgage_thresholds", "negative_list",
    "pilot_cities", "case_library", "industry_thresholds",
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
    """解析 libSQL /v2/pipeline 响应为 dict 列表。"""
    results = data.get("results", [])
    if not results:
        return []
    rows_response = results[0].get("results", {})
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


def execute_sql(table, columns=None, where=None, limit=1000):
    """
    封装 libSQL HTTP /v2/pipeline SELECT 调用。
    table 必须在白名单内；limit 上限 1000。
    """
    sql, args = _build_select_sql(table, columns, where, limit)

    body = json.dumps({
        "requests": [{"statement": sql, "args": args}],
    }).encode("utf-8")

    req = urllib.request.Request(
        _libsql_endpoint(), data=body, headers=_auth_headers(), method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return _parse_libsql_response(data)


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
