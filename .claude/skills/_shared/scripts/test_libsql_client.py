"""Tests for libsql_client.py - sandbox Python SQL client."""
import os
import json
import pytest
from unittest.mock import patch, MagicMock
from libsql_client import (
    execute_sql, query_cases, SQL_TABLE_WHITELIST,
    _parse_libsql_response, _build_select_sql
)


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


class TestWhitelist:
    def test_finance_products_in_whitelist(self):
        assert "finance_products" in SQL_TABLE_WHITELIST

    def test_users_not_in_whitelist(self):
        assert "users" not in SQL_TABLE_WHITELIST

    def test_all_six_tables_in_whitelist(self):
        expected = {"finance_products", "mortgage_thresholds", "negative_list",
                    "pilot_cities", "case_library", "industry_thresholds"}
        assert expected.issubset(SQL_TABLE_WHITELIST)


class TestExecuteSql:
    def test_rejects_non_whitelist_table(self):
        with pytest.raises(ValueError, match="whitelist"):
            execute_sql("users")

    def test_accepts_whitelist_table(self, monkeypatch):
        monkeypatch.setenv("LIBSQL_URL", "https://fake.libsql.example.com")
        monkeypatch.setenv("LIBSQL_RO_TOKEN", "fake-token")
        body_str = json.dumps({
            "results": [{"results": {"cols": [], "rows": []}}]
        })
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


class TestParseResponse:
    def test_empty_result(self):
        result = _parse_libsql_response({"results": [{"results": {"cols": [], "rows": []}}]})
        assert result == []

    def test_single_row(self):
        resp = {"results": [{"results": {
            "cols": [{"name": "id"}, {"name": "name"}],
            "rows": [
                [{"type": "text", "value": "c1"}, {"type": "text", "value": "Case A"}]
            ]
        }}]}
        result = _parse_libsql_response(resp)
        assert result == [{"id": "c1", "name": "Case A"}]


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
