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
"""Run a saved chart for an embedded guest. The client does not supply form data."""

from __future__ import annotations

import logging
from typing import Any

from superset.commands.chart.data.get_data_command import ChartDataCommand
from superset.commands.chart.exceptions import (
    ChartDataCacheLoadError,
    ChartDataQueryFailedError,
)
from superset.common.query_context_factory import QueryContextFactory
from superset.embedded.explore_query import ExploreQueryError
from superset.models.core import Theme
from superset.models.slice import Slice
from superset.utils import json
from superset.utils.error_sanitization import redact_sensitive_query_fields

logger = logging.getLogger(__name__)


def host_filters(body: Any) -> dict[str, Any]:
    """Read host filter values. Form data in the body is ignored."""
    if not isinstance(body, dict):
        return {}
    filters = body.get("filters")
    if not isinstance(filters, dict):
        return {}
    return dict(filters)


def load_saved_query_context(chart: Slice) -> Any:
    """Build the query from the chart row, never from a client payload."""
    query_context = chart.get_query_context()
    if query_context is not None:
        # The guest chart check requires the saved chart id. A stored query
        # context can omit it; the client is not allowed to supply it.
        form_data = dict(getattr(query_context, "form_data", None) or {})
        form_data["slice_id"] = chart.id
        query_context.form_data = form_data
        query_context.slice_ = chart
        return query_context
    # A chart saved before a query context exists still has viz form data.
    # Build the query from that form data instead of loading it as a query
    # context payload.
    form_data = dict(chart.form_data or {})
    form_data["slice_id"] = chart.id
    metric = form_data.get("metric")
    metrics = form_data.get("metrics") or ([metric] if metric else [])
    columns = form_data.get("groupby") or form_data.get("columns") or []
    factory = QueryContextFactory()
    query_context = factory.create(
        current_slice=chart,
        datasource={"id": chart.datasource_id, "type": chart.datasource_type},
        queries=[
            {
                "columns": columns,
                "metrics": metrics,
                "filters": [],
                "row_limit": form_data.get("row_limit") or 100,
                "is_timeseries": False,
            }
        ],
        form_data=form_data,
    )
    query_context.slice_ = chart
    return query_context


def run_saved_chart(embed: Any, body: Any) -> dict[str, Any]:
    """Execute the saved chart and return its form data plus query rows.

    ``body`` may carry ``filters`` for published keys. A ``form_data`` entry is
    discarded so the viz type and series colors stay the ones stored on the chart.
    """
    # pylint: disable=import-outside-toplevel
    from superset import db

    chart = db.session.query(Slice).filter(Slice.id == embed.chart_id).one_or_none()
    if chart is None:
        raise ExploreQueryError("Saved chart was not found.")
    query_context = load_saved_query_context(chart)
    query_context.embedded_requested_filters = host_filters(body)
    command = ChartDataCommand(query_context)
    try:
        command.validate()
        result = command.run()
    except (ChartDataCacheLoadError, ChartDataQueryFailedError) as ex:
        logger.warning("Embedded chart query failed: %s", ex)
        raise ExploreQueryError("The chart query failed.") from ex
    queries = list(result.get("queries") or [])
    redact_sensitive_query_fields(queries)
    for query in queries:
        query.pop("query", None)
        query.pop("stacktrace", None)
    return {
        "form_data": chart.form_data,
        "slice_name": chart.slice_name,
        "queries": queries,
        "ignored_filters": list(getattr(query_context, "ignored_filters", []) or []),
    }


def saved_theme(theme_id: int | None) -> dict[str, Any] | None:
    """Return the named theme JSON stored for this embed, if it still exists."""
    if not theme_id:
        return None
    # pylint: disable=import-outside-toplevel
    from superset import db

    theme = db.session.query(Theme).filter(Theme.id == theme_id).one_or_none()
    if theme is None or not theme.json_data:
        return None
    try:
        parsed = json.loads(theme.json_data)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None
