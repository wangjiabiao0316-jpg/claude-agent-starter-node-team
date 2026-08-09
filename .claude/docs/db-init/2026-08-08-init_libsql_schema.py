#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2026-08-08-init_libsql_schema.py
================================
读取同目录 2026-08-08-init_libsql_schema.sql，按 statement 拆分，
通过 libSQL /v2/pipeline HTTP API（RW token）逐条执行，
最后用 RO token 跑 COUNT 校验 6 张表行数。

依赖：仅 Python 3.8+ 标准库（urllib + json + os + sys）。
不修改仓库代码，只读写数据库。
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable

# macOS Python 默认不带根证书 → 用 certifi 提供的 CA bundle
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()  # fallback

# ---------------------------------------------------------------------------
# 路径
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
SQL_FILE = HERE / "2026-08-08-init_libsql_schema.sql"
ENV_FILE = Path("/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.env")

TABLES = [
    "industry_thresholds",
    "finance_products",
    "mortgage_thresholds",
    "negative_list",
    "pilot_cities",
    "case_library",
]
EXPECTED_ROWS = {
    "industry_thresholds": 3,
    "finance_products": 6,
    "mortgage_thresholds": 6,
    "negative_list": 8,
    "pilot_cities": 15,
    "case_library": 25,
}


# ---------------------------------------------------------------------------
# .env 加载（最简实现，避免依赖 python-dotenv）
# ---------------------------------------------------------------------------
def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        raise FileNotFoundError(f".env not found: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


# ---------------------------------------------------------------------------
# SQL 拆分器（处理 -- 注释 + 单引号字符串 + '' 转义）
# ---------------------------------------------------------------------------
def split_sql(sql_text: str) -> list[str]:
    # 1) 去掉整行注释
    cleaned_lines: list[str] = []
    for line in sql_text.splitlines():
        if line.lstrip().startswith("--"):
            continue
        cleaned_lines.append(line)
    cleaned = "\n".join(cleaned_lines)

    # 2) 按分号拆分（跟踪单引号 + 处理 '' 转义）
    statements: list[str] = []
    buf: list[str] = []
    in_str = False
    i = 0
    n = len(cleaned)
    while i < n:
        c = cleaned[i]
        if c == "'" and i + 1 < n and cleaned[i + 1] == "'":
            buf.append("''")
            i += 2
            continue
        if c == "'":
            in_str = not in_str
            buf.append(c)
            i += 1
            continue
        if c == ";" and not in_str:
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


# ---------------------------------------------------------------------------
# libSQL /v2/pipeline
# ---------------------------------------------------------------------------
def pipeline(
    url: str,
    token: str,
    statements: Iterable[str | tuple[str, list[Any]]],
    tag: str = "",
) -> list[dict]:
    """执行一组 statement；返回每个的结果对象列表。"""
    requests: list[dict] = []
    for s in statements:
        if isinstance(s, tuple):
            sql, args = s
        else:
            sql, args = s, []
        # sqld 协议：integer/float 的 value 字段是字符串
        tagged = []
        for a in args:
            if a is None:
                tagged.append({"type": "null"})
            elif isinstance(a, bool):
                tagged.append({"type": "integer", "value": "1" if a else "0"})
            elif isinstance(a, int):
                tagged.append({"type": "integer", "value": str(a)})
            elif isinstance(a, float):
                tagged.append({"type": "float", "value": repr(a)})
            else:
                tagged.append({"type": "text", "value": str(a)})
        requests.append({"type": "execute", "stmt": {"sql": sql, "args": tagged}})
    requests.append({"type": "close"})

    body = json.dumps({"requests": requests}).encode("utf-8")
    endpoint = url.rstrip("/") + "/v2/pipeline"
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"[{tag}] HTTP {e.code}: {detail}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"[{tag}] URLError: {e.reason}") from e

    return payload.get("results", [])


def check_results(results: list[dict], tag: str, expected_count: int) -> bool:
    """遍历 sqld 响应，遇到 error 立即返回 False。"""
    if len(results) != expected_count:
        print(f"  [{tag}] WARN: 期望 {expected_count} 个结果，实际 {len(results)} 个")
    ok = True
    for idx, r in enumerate(results):
        if r.get("type") == "error":
            err = r.get("error", {})
            print(f"  [{tag}] stmt#{idx} ERROR code={err.get('code')} msg={err.get('message')}")
            ok = False
        elif r.get("type") == "ok":
            resp = r.get("response", {})
            if resp.get("type") == "execute":
                affected = resp.get("result", {}).get("affected_row_count", 0)
                if affected > 0:
                    print(f"  [{tag}] stmt#{idx} ok, affected={affected}")
                else:
                    print(f"  [{tag}] stmt#{idx} ok")
    return ok


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main() -> int:
    # 1) 加载 .env
    env = load_env(ENV_FILE)
    url = env.get("LIBSQL_URL")
    rw = env.get("LIBSQL_RW_TOKEN")
    ro = env.get("LIBSQL_RO_TOKEN")
    if not url or not rw or not ro:
        print("ENV 缺失：LIBSQL_URL / LIBSQL_RW_TOKEN / LIBSQL_RO_TOKEN 任一为空", file=sys.stderr)
        return 2

    print(f"[env] LIBSQL_URL        = {url}")
    print(f"[env] LIBSQL_RW_TOKEN   = {rw[:24]}...({len(rw)} chars)")
    print(f"[env] LIBSQL_RO_TOKEN   = {ro[:24]}...({len(ro)} chars)")
    print()

    # 2) ping（RO token 跑一条 SELECT 1，确认网络通+token 有效）
    print("[ping] RO token SELECT 1 ...")
    try:
        pr = pipeline(url, ro, [("SELECT 1 AS v", [])], tag="ping-ro")
        if not check_results(pr, "ping-ro", expected_count=2):  # execute + close
            print("[ping] RO token 不可用，终止", file=sys.stderr)
            return 3
    except RuntimeError as e:
        print(f"[ping] RO token 失败：{e}", file=sys.stderr)
        return 3

    # 3) ping RW（CREATE TABLE IF NOT EXISTS tmp_ping_$$）
    print("[ping] RW token CREATE/DROP 临时表 ...")
    try:
        pr = pipeline(
            url,
            rw,
            [
                "CREATE TABLE IF NOT EXISTS __rw_ping_2026 (id INTEGER PRIMARY KEY);",
                "DROP TABLE IF EXISTS __rw_ping_2026;",
            ],
            tag="ping-rw",
        )
        if not check_results(pr, "ping-rw", expected_count=3):
            print("[ping] RW token 写权限校验失败 — 请检查 LIBSQL_RW_TOKEN 是否为 read_write 策略", file=sys.stderr)
            return 4
    except RuntimeError as e:
        print(f"[ping] RW token 失败：{e}", file=sys.stderr)
        return 4
    print()

    # 4) 拆分 + 执行 SQL
    sql_text = SQL_FILE.read_text(encoding="utf-8")
    statements = split_sql(sql_text)
    print(f"[split] 共 {len(statements)} 条 statement（含 6 个 DROP + 6 个 CREATE + DML）")

    # 4a) DDL（DROP + CREATE），分两批避免误判
    ddl = [s for s in statements if s.upper().startswith(("DROP TABLE", "CREATE TABLE"))]
    print(f"\n[ddl] 执行 {len(ddl)} 条 DDL ...")
    res_ddl = pipeline(url, rw, ddl, tag="ddl")
    ddl_ok = check_results(res_ddl, "ddl", expected_count=len(ddl) + 1)  # +close

    if not ddl_ok:
        print("\n[ddl] DDL 失败，终止 DML", file=sys.stderr)
        return 5

    # 4b) DML（INSERT），逐条执行便于定位错误
    dml = [s for s in statements if s.upper().startswith("INSERT")]
    print(f"\n[dml] 逐条执行 {len(dml)} 条 INSERT ...")
    dml_fail = 0
    # 一次性发送（sqld 支持批量），但仍按整体结果检查
    res_dml = pipeline(url, rw, dml, tag="dml")
    if len(res_dml) != len(dml) + 1:
        print(f"  [dml] WARN: 期望 {len(dml)+1} 个结果，实际 {len(res_dml)} 个")
    for idx, r in enumerate(res_dml[:-1]):  # 最后一个是 close
        if r.get("type") == "error":
            err = r.get("error", {})
            print(f"  [dml] INSERT#{idx} ERROR code={err.get('code')} msg={err.get('message')}")
            print(f"         SQL: {dml[idx][:120]}...")
            dml_fail += 1
        else:
            affected = r.get("response", {}).get("result", {}).get("affected_row_count", 0)
            if idx < 5 or idx >= len(dml) - 3:
                print(f"  [dml] INSERT#{idx} ok affected={affected}")
    if len(dml) > 8:
        print(f"  [dml] ... 中间 {len(dml) - 8} 条已省略详细日志 ...")
    print(f"\n[dml] 完成：成功 {len(dml) - dml_fail} / {len(dml)}")

    # 5) COUNT 校验（用 RO token，模拟生产路径）
    print("\n[verify] 6 张表 SELECT COUNT(*)（用 RO token）...")
    count_sqls = [f"SELECT COUNT(*) AS n FROM {t}" for t in TABLES]
    res_cnt = pipeline(url, ro, count_sqls, tag="count")
    all_match = True
    for idx, t in enumerate(TABLES):
        r = res_cnt[idx]
        if r.get("type") != "ok":
            print(f"  {t}: ERROR {r.get('error', {}).get('message')}")
            all_match = False
            continue
        rows = r.get("response", {}).get("result", {}).get("rows", [])
        n = int(rows[0][0].get("value", "0")) if rows and rows[0] else 0
        expected = EXPECTED_ROWS[t]
        status = "OK" if n == expected else "MISMATCH"
        print(f"  {t:<22} rows={n:<3} expected={expected:<3} {status}")
        if n != expected:
            all_match = False

    # 6) 每张表抽样 1 行
    print("\n[sample] 每张表抽样 1 行 ...")
    sample_sqls = [f"SELECT * FROM {t} LIMIT 1" for t in TABLES]
    res_sample = pipeline(url, ro, sample_sqls, tag="sample")
    for idx, t in enumerate(TABLES):
        r = res_sample[idx]
        if r.get("type") != "ok":
            print(f"  {t}: ERROR {r.get('error', {}).get('message')}")
            continue
        result = r.get("response", {}).get("result", {})
        cols = [c.get("name") for c in result.get("cols", [])]
        rows = result.get("rows", [])
        if not rows:
            print(f"  {t}: (empty)")
            continue
        row_obj = {}
        for ci, cell in enumerate(rows[0]):
            col_name = cols[ci] if ci < len(cols) else f"col_{ci}"
            row_obj[col_name] = cell.get("value")
        # 省略超长字段
        preview = {k: (v[:60] + "...") if isinstance(v, str) and len(v) > 60 else v
                   for k, v in row_obj.items()}
        print(f"  {t}: {json.dumps(preview, ensure_ascii=False)}")

    print("\n[done]", "全部成功 ✓" if (ddl_ok and dml_fail == 0 and all_match) else "存在不一致 ✗")
    return 0 if (ddl_ok and dml_fail == 0 and all_match) else 6


if __name__ == "__main__":
    sys.exit(main())
