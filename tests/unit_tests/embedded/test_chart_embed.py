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
"""Saved chart embeds ignore client form data and keep locked filters."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

from pytest_mock import MockerFixture

from superset.embedded.chart_embed import host_filters, run_saved_chart


def test_host_filters_drop_client_form_data() -> None:
    filters = host_filters(
        {
            "form_data": {"viz_type": "pie", "color_scheme": "d3Category10"},
            "filters": {"region": "west"},
        }
    )
    assert filters == {"region": "west"}
    assert host_filters(["not", "an", "object"]) == {}


def test_saved_chart_uses_stored_form_data_and_reports_ignored_filters(
    mocker: MockerFixture,
) -> None:
    saved = {
        "viz_type": "big_number_total",
        "color_scheme": "supersetColors",
        "slice_id": 3,
    }
    chart = MagicMock()
    chart.form_data = saved
    query_context = SimpleNamespace(queries=[], embedded_requested_filters=None)
    chart.get_query_context.return_value = query_context

    class _Query:
        def filter(self, *_args: Any, **_kwargs: Any) -> "_Query":
            return self

        def one_or_none(self) -> Any:
            return chart

    mocker.patch("superset.db.session.query", return_value=_Query())
    command = MagicMock()

    def _validate() -> None:
        query_context.ignored_filters = [{"key": "status", "reason": "unknown_key"}]

    command.validate.side_effect = _validate
    command.run.return_value = {
        "queries": [{"data": [{"revenue": 10}], "query": "select secret"}],
    }
    mocker.patch(
        "superset.embedded.chart_embed.ChartDataCommand",
        return_value=command,
    )

    payload = run_saved_chart(
        SimpleNamespace(chart_id=3),
        {
            "form_data": {"viz_type": "pie", "color_scheme": "d3Category10"},
            "filters": {"status": "open"},
        },
    )

    assert payload["form_data"]["viz_type"] == "big_number_total"
    assert payload["form_data"]["color_scheme"] == "supersetColors"
    assert payload["queries"][0]["data"][0]["revenue"] == 10
    assert "query" not in payload["queries"][0]
    assert payload["ignored_filters"] == [{"key": "status", "reason": "unknown_key"}]
    assert query_context.embedded_requested_filters == {"status": "open"}
    command.validate.assert_called_once()
