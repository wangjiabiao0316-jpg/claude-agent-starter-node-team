"""Tests for libsql_client.py - sandbox Python SQL client.

Updated 2026-08-09: mock fixtures use real sqld v0.24.x response shape
(`results[0].response.result.{cols,rows}`) per libSQL /v2/pipeline contract.
Also covers new kb_chunks_meta / kb_records whitelist entries and the
query_kb_by_keyword / query_kb_by_source / query_kb_by_category helpers.
"""
import os
import json
import pytest
from unittest.mock import patch, MagicMock
from libsql_client import (
    execute_sql, query_cases,
    query_kb_by_keyword, query_kb_by_source, query_kb_by_category,
    SQL_TABLE_WHITELIST,
    _parse_libsql_response, _build_select_sql, _tag_arg,
)


def _sqld_response(cols, rows):
    """Build a real-shape sqld /v2/pipeline success response."""
    return {
        "results": [
            {
                "type": "ok",
                "response": {
                    "type": "execute",
                    "result": {"cols": cols, "rows": rows},
                },
            },
            {"type": "close"},
        ]
    }


class TestBuildSelectSql:
    def test_simple_select(self):
        sql, args = _build_select_sql("finance_products")
        assert sql == "SELECT * FROM finance_products LIMIT 1000"
        assert args == []

    def test_select_with_columns(self):
        sql, args = _build_select_sql("finance_products", columns=["id", "name"])
        assert sql == "SELECT id, name FROM finance_products LIMIT 1000"

    def test_select_with_where(self):
        sql, args = _build_select_sql("case_library",
                                       where={"region": "shanghai", "industry": "商业"})
        assert "WHERE region = ? AND industry = ?" in sql
        assert args == ["shanghai", "商业"]

    def test_select_with_limit(self):
        sql, args = _build_select_sql("case_library", limit=50)
        assert "LIMIT 50" in sql


class TestTagArg:
    def test_none(self):
        assert _tag_arg(None) == {"type": "null"}

    def test_int(self):
        assert _tag_arg(42) == {"type": "integer", "value": "42"}

    def test_float(self):
        assert _tag_arg(3.14) == {"type": "float", "value": "3.14"}

    def test_str(self):
        assert _tag_arg("hi") == {"type": "text", "value": "hi"}

    def test_bool(self):
        assert _tag_arg(True) == {"type": "integer", "value": "1"}
        assert _tag_arg(False) == {"type": "integer", "value": "0"}


class TestWhitelist:
    def test_finance_products_in_whitelist(self):
        assert "finance_products" in SQL_TABLE_WHITELIST

    def test_users_not_in_whitelist(self):
        assert "users" not in SQL_TABLE_WHITELIST

    def test_all_business_tables_in_whitelist(self):
        """业务表 6 张（agent3/agent5 用）."""
        expected = {"finance_products", "mortgage_thresholds", "negative_list",
                    "pilot_cities", "case_library", "industry_thresholds"}
        assert expected.issubset(SQL_TABLE_WHITELIST)

    def test_kb_tables_in_whitelist(self):
        """政策知识库表 2 张（新增）."""
        assert "kb_chunks_meta" in SQL_TABLE_WHITELIST
        assert "kb_records" in SQL_TABLE_WHITELIST

    def test_total_table_count(self):
        """白名单一共 8 张表."""
        assert len(SQL_TABLE_WHITELIST) >= 8


class TestExecuteSql:
    def test_rejects_non_whitelist_table(self):
        with pytest.raises(ValueError, match="whitelist"):
            execute_sql("users")

    def test_accepts_whitelist_table(self, monkeypatch):
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        body_str = json.dumps(_sqld_response([], []))
        mock_response = MagicMock()
        # `with urlopen(...) as resp:` -> __enter__ must return the mock itself
        mock_response.__enter__.return_value = mock_response
        # read() returns bytes, then .decode("utf-8") returns the JSON string
        mock_response.read.return_value.decode.return_value = body_str
        mock_response.status = 200
        with patch('urllib.request.urlopen', return_value=mock_response):
            result = execute_sql("finance_products", limit=10)
            assert result == []

    def test_missing_env_raises(self, monkeypatch):
        monkeypatch.delenv("LIBSQL_URL", raising=False)
        monkeypatch.delenv("LIBSQL_RO_TOKEN", raising=False)
        with pytest.raises(RuntimeError, match="LIBSQL_URL"):
            execute_sql("finance_products")

    def test_request_body_uses_sqld_v24_shape(self, monkeypatch):
        """确认 request body 是 {requests:[{type:execute, stmt:{sql, args:[tagged]}}]}."""
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        body_str = json.dumps(_sqld_response([], []))
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_response.read.return_value.decode.return_value = body_str
        with patch('urllib.request.urlopen', return_value=mock_response) as mock_open:
            execute_sql("case_library", where={"region": "shanghai"})
            sent_bytes = mock_open.call_args[0][0].data
            sent = json.loads(sent_bytes.decode("utf-8"))
            assert "requests" in sent
            assert sent["requests"][0]["type"] == "execute"
            assert "stmt" in sent["requests"][0]
            assert sent["requests"][0]["stmt"]["args"] == [
                {"type": "text", "value": "shanghai"}
            ]


class TestParseResponse:
    def test_empty_result_real_sqld_shape(self):
        result = _parse_libsql_response(_sqld_response([], []))
        assert result == []

    def test_single_row_real_sqld_shape(self):
        resp = _sqld_response(
            cols=[{"name": "id"}, {"name": "name"}],
            rows=[
                [{"type": "text", "value": "c1"}, {"type": "text", "value": "Case A"}]
            ],
        )
        result = _parse_libsql_response(resp)
        assert result == [{"id": "c1", "name": "Case A"}]

    def test_legacy_mock_shape_still_works(self):
        """兼容旧的 results[0].results.{cols,rows} mock 格式."""
        resp = {"results": [{"results": {
            "cols": [{"name": "id"}],
            "rows": [[{"type": "text", "value": "x"}]],
        }}]}
        result = _parse_libsql_response(resp)
        assert result == [{"id": "x"}]

    def test_error_response_raises(self):
        resp = {"results": [{"type": "error", "error": {"message": "boom", "code": "X"}}]}
        with pytest.raises(RuntimeError, match="boom"):
            _parse_libsql_response(resp)


class TestQueryCases:
    def test_returns_top_k(self):
        features = {"region": "shanghai", "industry": "商业", "scale": 10000,
                    "property_type": "旧厂房", "physical_params": {}, "financing": {}}
        with patch('libsql_client.execute_sql') as mock_exec:
            mock_exec.return_value = [
                {"case_id": "c1", "region": "shanghai", "industry": "商业"},
                {"case_id": "c2", "region": "shanghai", "industry": "商业"},
                {"case_id": "c3", "region": "shanghai", "industry": "商业"},
            ]
            cases = query_cases(features, top_k=2)
            assert len(cases) <= 2


class TestQueryKb:
    def test_keyword_search_returns_chunks(self, monkeypatch):
        """query_kb_by_keyword 应发送 LIKE '%关键词%' 查询并返回 chunk 列表."""
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        resp = _sqld_response(
            cols=[
                {"name": "chunk_id"}, {"name": "kb_id"}, {"name": "chunk_type"},
                {"name": "clause_label"}, {"name": "content"},
            ],
            rows=[[
                {"type": "text", "value": "KB01-001#c0"},
                {"type": "text", "value": "KB01-001"},
                {"type": "text", "value": "summary"},
                {"type": "text", "value": None},
                {"type": "text", "value": "国家发改委 958 号文..."},
            ]],
        )
        body_str = json.dumps(resp)
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_response.read.return_value.decode.return_value = body_str
        with patch('urllib.request.urlopen', return_value=mock_response) as mock_open:
            result = query_kb_by_keyword("958", top_k=5)
            assert len(result) == 1
            assert result[0]["chunk_id"] == "KB01-001#c0"
            assert result[0]["content"] == "国家发改委 958 号文..."
            # verify LIKE pattern in request
            sent = json.loads(mock_open.call_args[0][0].data.decode("utf-8"))
            sql = sent["requests"][0]["stmt"]["sql"]
            assert "LIKE" in sql.upper()
            assert sent["requests"][0]["stmt"]["args"][0] == {"type": "text", "value": "%958%"}
            assert sent["requests"][0]["stmt"]["args"][1] == {"type": "integer", "value": "5"}

    def test_keyword_top_k_clamped_to_max(self, monkeypatch):
        """top_k 超过 200 应被截到 200."""
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        body_str = json.dumps(_sqld_response([], []))
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_response.read.return_value.decode.return_value = body_str
        with patch('urllib.request.urlopen', return_value=mock_response) as mock_open:
            query_kb_by_keyword("x", top_k=99999)
            sent = json.loads(mock_open.call_args[0][0].data.decode("utf-8"))
            assert sent["requests"][0]["stmt"]["args"][1] == {"type": "integer", "value": "200"}

    def test_filter_by_kb_source(self, monkeypatch):
        """query_kb_by_source 应通过 execute_sql 走白名单等值查询."""
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        body_str = json.dumps(_sqld_response(
            cols=[{"name": "kb_id"}, {"name": "title"}],
            rows=[[{"type": "text", "value": "KB01-001"},
                   {"type": "text", "value": "国家发改委 958 号文"}]],
        ))
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_response.read.return_value.decode.return_value = body_str
        with patch('urllib.request.urlopen', return_value=mock_response):
            result = query_kb_by_source("KB01", top_k=10)
            assert len(result) == 1
            assert result[0]["kb_id"] == "KB01-001"

    def test_filter_by_category(self, monkeypatch):
        """query_kb_by_category 走白名单等值查询."""
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        body_str = json.dumps(_sqld_response([], []))
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_response.read.return_value.decode.return_value = body_str
        with patch('urllib.request.urlopen', return_value=mock_response) as mock_open:
            query_kb_by_category("政策法规库 / REITs 政策")
            sent = json.loads(mock_open.call_args[0][0].data.decode("utf-8"))
            sql = sent["requests"][0]["stmt"]["sql"]
            assert "category = ?" in sql
