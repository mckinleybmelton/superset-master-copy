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
"""Explore lite runs a real dataset query and leaves dashboard guests alone."""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from flask import g, Response
from pytest_mock import MockerFixture
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from superset.connectors.sqla.models import SqlaTable, SqlMetric, TableColumn
from superset.embedded.explore_query import run_explore_snapshot
from superset.embedded.kit import kit_guest_blocks_sql
from superset.exceptions import SupersetSecurityException
from superset.explore.form_data.api import ExploreFormDataRestApi
from superset.explore.permalink.api import ExplorePermalinkRestApi
from superset.models.core import Database
from superset.security.guest_token import GuestUser
from superset.security.manager import SupersetSecurityManager
from superset.utils import json
from superset.utils.core import override_user
from tests.unit_tests.conftest import with_feature_flags


def _guest(resource_type: str, **claims: Any) -> GuestUser:
    token: dict[str, Any] = {
        "iat": 0.0,
        "exp": 1.0,
        "user": {"username": "guest"},
        "resources": [{"type": resource_type, "id": "embed-1"}],
        "rls_rules": claims.get("rls_rules", []),
    }
    if "datasets" in claims:
        token["datasets"] = claims["datasets"]
    if "locked_filters" in claims:
        token["locked_filters"] = claims["locked_filters"]
    return GuestUser(token, [])  # type: ignore[arg-type]


def _embed() -> SimpleNamespace:
    return SimpleNamespace(
        uuid="embed-1",
        viz_types=json.dumps(
            [
                "table",
                "big_number_total",
                "echarts_timeseries_bar",
                "echarts_timeseries_line",
                "echarts_area",
                "pie",
            ]
        ),
        filters=json.dumps(
            [
                {
                    "key": "channel",
                    "column": "channel",
                    "mode": "locked",
                    "op": "==",
                    "default": "store",
                }
            ]
        ),
    )


@with_feature_flags(EMBEDDED_SUPERSET=True, EMBEDDED_ANALYTICS_KIT=False)
def test_flag_off_dashboard_guest_keeps_explore_and_sql_paths(app: Any) -> None:
    """Dashboard guests are not denied when the kit flag is off.

    EMBEDDED_SUPERSET is on, so this principal is a guest. The kit flag is
    off. Explore permalink, Explore form data, and a SQL raise_for_access
    call stay on the previous path. Chart guests are still denied.
    """
    from superset import is_feature_enabled, security_manager

    assert is_feature_enabled("EMBEDDED_ANALYTICS_KIT") is False
    assert is_feature_enabled("EMBEDDED_SUPERSET") is True
    dashboard = _guest("dashboard")
    chart = _guest("chart")
    assert kit_guest_blocks_sql(dashboard) is False
    assert kit_guest_blocks_sql(chart) is True

    with app.test_request_context():
        g.user = dashboard
        assert security_manager.is_guest_user() is True
        form_api = ExploreFormDataRestApi()
        form_api.response_403 = lambda: Response(status=403)
        assert form_api.block_embedded_guests() is None
        permalink_api = ExplorePermalinkRestApi()
        permalink_api.response_403 = lambda: Response(status=403)
        assert permalink_api.block_embedded_guests() is None

        g.user = chart
        denied_form = form_api.block_embedded_guests()
        denied_permalink = permalink_api.block_embedded_guests()
        assert denied_form is not None
        assert denied_form.status_code == 403
        assert denied_permalink is not None
        assert denied_permalink.status_code == 403

    dashboard_manager = MagicMock()
    dashboard_manager.get_current_guest_user_if_guest.return_value = dashboard
    dashboard_manager.is_guest_user.return_value = True
    sql_denial = ""
    try:
        SupersetSecurityManager.raise_for_access(dashboard_manager, sql="SELECT 1")
    except SupersetSecurityException as ex:
        sql_denial = str(ex)
    assert "cannot execute SQL" not in sql_denial

    chart_manager = MagicMock()
    chart_manager.get_current_guest_user_if_guest.return_value = chart
    with pytest.raises(SupersetSecurityException, match="cannot execute SQL"):
        SupersetSecurityManager.raise_for_access(chart_manager, sql="SELECT 1")


def test_explore_snapshot_rejects_sql_and_other_datasets() -> None:
    dataset = MagicMock()
    dataset.id = 42
    dataset.get_query_result.side_effect = AssertionError("query should not run")
    guest = _guest("explore", datasets=[42])
    with pytest.raises(ValueError, match="SQL"):
        run_explore_snapshot(_embed(), dataset, guest, {"sql": "select 1"})
    other = _guest("explore", datasets=[7])
    with pytest.raises(SupersetSecurityException, match="dataset"):
        run_explore_snapshot(
            _embed(),
            dataset,
            other,
            {"vizType": "table", "dimensions": ["region"], "metrics": ["revenue"]},
        )
    dataset.get_query_result.assert_not_called()


def test_explore_snapshot_returns_rows_and_keeps_locked_and_rls_predicates(
    mocker: MockerFixture,
) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE sales (region TEXT, channel TEXT, amount INTEGER)")
        )
        connection.execute(
            text(
                "INSERT INTO sales (region, channel, amount) VALUES "
                "('east', 'web', 10), ('east', 'store', 7), ('west', 'web', 5)"
            )
        )
    database = Database(database_name="sales", sqlalchemy_uri="sqlite://")

    @contextmanager
    def mock_get_sqla_engine(
        catalog: str | None = None,
        schema: str | None = None,
        **kwargs: Any,
    ) -> Any:
        yield engine

    mocker.patch.object(database, "get_sqla_engine", new=mock_get_sqla_engine)
    mocker.patch(
        "superset.connectors.sqla.models.security_manager.get_rls_filters",
        return_value=[],
    )
    from superset.connectors.sqla import models as sqla_models

    real_flag = sqla_models.is_feature_enabled

    def flag(name: str, *args: Any, **kwargs: Any) -> bool:
        if name == "EMBEDDED_SUPERSET":
            return True
        return real_flag(name, *args, **kwargs)

    mocker.patch.object(sqla_models, "is_feature_enabled", side_effect=flag)

    dataset = SqlaTable(
        database=database,
        schema=None,
        table_name="sales",
        columns=[
            TableColumn(column_name="region", type="TEXT"),
            TableColumn(column_name="channel", type="TEXT"),
            TableColumn(column_name="amount", type="INTEGER"),
        ],
        metrics=[SqlMetric(metric_name="revenue", expression="SUM(amount)")],
    )
    dataset.id = 42
    guest = _guest(
        "explore",
        datasets=[42],
        locked_filters={"channel": "web"},
        rls_rules=[{"dataset": None, "clause": "region = 'east'"}],
    )
    with override_user(guest):
        payload = run_explore_snapshot(
            _embed(),
            dataset,
            guest,
            {
                "vizType": "table",
                "dimensions": ["region"],
                "metrics": ["revenue"],
                "filters": [
                    {"column": "channel", "operator": "==", "value": "store"},
                    {"column": "amount", "operator": ">=", "value": 8},
                ],
            },
        )

    assert payload["data"]
    assert payload["data"][0]["revenue"] == 10
    sql = payload["sql"].lower()
    assert "web" in sql
    assert "store" not in sql
    assert "region" in sql
    assert "east" in sql
    assert "amount" in sql
