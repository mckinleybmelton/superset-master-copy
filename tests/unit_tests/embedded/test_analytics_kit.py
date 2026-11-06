# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""Release-bar checks for the embedded analytics kit that do not need a database."""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from marshmallow import ValidationError

from superset.embedded.kit import (
    guest_display_label,
    guest_label_hash,
    referrer_allowed,
    resolve_published_filters,
    validate_allowed_domains,
    validate_explore_snapshot,
)
from superset.embedded.policy import apply_resolved_filters
from superset.embedded.usage import summarize_usage
from superset.security.api import GuestTokenCreateSchema


def test_locked_filter_keeps_token_value_when_client_sends_another() -> None:
    applied, ignored = resolve_published_filters(
        [
            {
                "key": "account_id",
                "column": "account_id",
                "mode": "locked",
                "op": "==",
                "default": "A-1",
            }
        ],
        {"account_id": "A-100"},
        {"account_id": "OTHER", "status": "open"},
    )
    assert applied[0]["val"] == "A-100"
    assert {"key": "account_id", "reason": "not_allowed"} in ignored
    assert {"key": "status", "reason": "unknown_key"} in ignored

    query = SimpleNamespace(
        filter=[{"col": "account_id", "op": "==", "val": "OTHER"}],
        extras={},
    )
    apply_resolved_filters([query], applied)
    assert {"col": "account_id", "op": "==", "val": "A-100"} in query.filter
    assert all(item.get("val") != "OTHER" for item in query.filter)


def test_omitted_locked_filter_still_applied() -> None:
    applied, ignored = resolve_published_filters(
        [
            {
                "key": "account_id",
                "column": "account_id",
                "mode": "locked",
                "op": "==",
                "default": "A-1",
            }
        ],
        {},
        {},
    )
    assert ignored == []
    assert applied[0]["val"] == "A-1"


def test_explore_snapshot_rejects_sql_metric() -> None:
    with pytest.raises(ValueError, match="SQL"):
        validate_explore_snapshot(
            {"vizType": "table", "metrics": [{"sqlExpression": "COUNT(*)"}]},
            allowed_viz=["table"],
            columns={"id"},
            metrics={"count"},
        )


def test_explore_snapshot_keeps_published_fields_only() -> None:
    snapshot, ignored = validate_explore_snapshot(
        {
            "vizType": "table",
            "dimensions": ["region", "secret_sql"],
            "metrics": ["count"],
            "filters": [{"column": "region", "operator": "==", "value": "east"}],
        },
        allowed_viz=["table", "pie"],
        columns={"region"},
        metrics={"count"},
    )
    assert snapshot["dimensions"] == ["region"]
    assert snapshot["metrics"] == ["count"]
    assert any(item["field"] == "secret_sql" for item in ignored)


def test_chart_token_requires_datasets_dashboard_token_does_not() -> None:
    schema = GuestTokenCreateSchema()
    schema.load(
        {
            "resources": [{"type": "dashboard", "id": "abc"}],
            "rls": [],
        }
    )
    with pytest.raises(ValidationError) as exc:
        schema.load(
            {
                "resources": [{"type": "chart", "id": "embed-1"}],
                "rls": [],
            }
        )
    assert "datasets" in exc.value.messages


def test_usage_summary_hides_username_and_token() -> None:
    now = datetime.utcnow()
    rows = [
        SimpleNamespace(
            event="mint",
            failure_reason=None,
            created_at=now,
            guest_hash="a1b2c3d4eeee",
        ),
        SimpleNamespace(
            event="load",
            failure_reason=None,
            created_at=now,
            guest_hash=None,
        ),
        SimpleNamespace(
            event="query",
            failure_reason=None,
            created_at=now - timedelta(minutes=1),
            guest_hash=None,
        ),
        SimpleNamespace(
            event="failure",
            failure_reason="origin_rejected",
            created_at=now - timedelta(minutes=2),
            guest_hash=None,
        ),
    ]
    summary = summarize_usage(rows, range_key="7d")
    assert summary["tokens_minted"] == 1
    assert summary["loads"] == 1
    assert summary["queries"] == 1
    assert summary["failed_loads"] == 1
    assert summary["failures"]["origin_rejected"] == 1
    assert "username" not in summary
    assert "stan" not in str(summary)
    label = guest_display_label(guest_label_hash("stan", "embed-1"))
    assert label.startswith("Guest ")
    assert "stan" not in label
    assert len(label.split()[1]) == 8


def test_referrer_matches_a_stored_host_without_a_scheme() -> None:
    assert referrer_allowed(
        "http://127.0.0.1:8765/kit",
        ["127.0.0.1:8765"],
        allow_empty=False,
    )
    assert referrer_allowed(
        "https://portal.example.com/app",
        ["portal.example.com"],
        allow_empty=False,
    )
    assert not referrer_allowed(
        "http://evil.test/",
        ["127.0.0.1:8765"],
        allow_empty=False,
    )
    assert not referrer_allowed(None, ["portal.example.com"], allow_empty=False)


def test_chart_domains_reject_empty_list() -> None:
    message = validate_allowed_domains([])
    assert message is not None
    assert "at least one domain" in message
    assert validate_allowed_domains(["https://portal.example.com"]) is None
    assert validate_allowed_domains(["https://portal.example.com/path"]) is not None
