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
"""Run an Explore lite snapshot against the published dataset."""

from __future__ import annotations

import logging
from typing import Any, cast

from superset.common.db_query_status import QueryStatus
from superset.common.query_object import QueryObject
from superset.embedded.kit import resolve_published_filters, validate_explore_snapshot
from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from superset.exceptions import SupersetSecurityException
from superset.models.embedded_kit import DEFAULT_EXPLORE_VIZ_TYPES
from superset.utils import json
from superset.utils.core import QueryObjectFilterClause

logger = logging.getLogger(__name__)

EXPLORE_ROW_LIMIT = 1000


class ExploreQueryError(Exception):
    """The dataset query failed. The message is safe to show to a guest."""


def run_explore_snapshot(
    embed: Any,
    dataset: Any,
    guest: Any,
    body: dict[str, Any],
) -> dict[str, Any]:
    """Execute a snapshot and return rows plus the SQL that was run.

    The token dataset allowlist, published columns, saved metrics, locked
    filters, and guest RLS are applied before the warehouse sees the query.
    Snapshot filters can only add predicates. Callers that return this payload
    to the browser must drop ``sql``.
    """
    _require_dataset_allowlist(dataset, guest)
    allowed_viz = (
        json.loads(embed.viz_types)
        if embed.viz_types
        else list(DEFAULT_EXPLORE_VIZ_TYPES)
    )
    columns = {column.column_name for column in dataset.columns}
    metrics = {metric.metric_name for metric in dataset.metrics}
    snapshot, ignored_state = validate_explore_snapshot(
        body,
        allowed_viz=allowed_viz,
        columns=columns,
        metrics=metrics,
    )
    if not snapshot.get("metrics"):
        return {
            "message": "Choose a metric.",
            "snapshot": snapshot,
            "ignored_state": ignored_state,
            "ignored_filters": [],
            "data": [],
            "rowcount": 0,
            "sql": "",
        }

    published = json.loads(embed.filters) if embed.filters else []
    applied, ignored_filters, extra_filters = _snapshot_filters(
        published,
        (guest.guest_token or {}).get("locked_filters"),
        snapshot.get("filters") or [],
    )
    if any(item.get("missing") and item.get("mode") == "locked" for item in applied):
        _deny("A locked filter has no value")

    query_filters: list[QueryObjectFilterClause] = [
        {"col": item["col"], "op": str(item["op"]), "val": item["val"]}
        for item in applied
        if item.get("val") is not None
    ]
    query_filters.extend(cast(list[QueryObjectFilterClause], extra_filters))
    query_object = QueryObject(
        datasource=dataset,
        columns=list(snapshot.get("dimensions") or []),
        metrics=list(snapshot.get("metrics") or []),
        filters=query_filters,
        row_limit=EXPLORE_ROW_LIMIT,
        is_timeseries=False,
    )
    result = dataset.get_query_result(query_object)
    if result.status != QueryStatus.SUCCESS:
        logger.warning("Explore lite query failed: %s", result.error_message)
        raise ExploreQueryError("The dataset query failed.")
    records = [
        {key: _json_cell(value) for key, value in row.items()}
        for row in result.df.to_dict(orient="records")
    ]
    return {
        "snapshot": snapshot,
        "ignored_state": ignored_state,
        "ignored_filters": ignored_filters,
        "data": records,
        "rowcount": len(records),
        "sql": result.query or "",
    }


def _require_dataset_allowlist(dataset: Any, guest: Any) -> None:
    """Chart and explore tokens must list this dataset. Anything else is denied."""
    allowed = (getattr(guest, "guest_token", None) or {}).get("datasets")
    dataset_id = getattr(dataset, "id", None)
    if (
        not isinstance(allowed, list)
        or not all(isinstance(item, int) for item in allowed)
        or dataset_id not in allowed
    ):
        _deny("This embed can't use that dataset.")


def _snapshot_filters(
    published: list[dict[str, Any]],
    token_locked: dict[str, Any] | None,
    snapshot_filters: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, str]], list[dict[str, Any]]]:
    """Return applied published filters, ignored keys, and extra narrowing filters.

    A snapshot filter on a published column is resolved through the published
    filter (locked values win). A snapshot filter on another published column
    is an extra predicate and cannot replace a locked one.
    """
    requested: dict[str, Any] = {}
    published_columns = set()
    for item in published:
        column = str(item.get("column") or item.get("key") or "")
        published_columns.add(column)
    for item in snapshot_filters:
        column = str(item.get("column") or "")
        for published_item in published:
            key = str(published_item.get("key") or "")
            published_column = str(
                published_item.get("column") or published_item.get("key") or ""
            )
            if column == published_column or column == key:
                requested[key] = item.get("value")
    applied, ignored = resolve_published_filters(published, token_locked, requested)
    extra = [
        {
            "col": item["column"],
            "op": item.get("operator") or "==",
            "val": item.get("value"),
        }
        for item in snapshot_filters
        if str(item.get("column") or "") not in published_columns
    ]
    return applied, ignored, extra


def _deny(message: str) -> None:
    raise SupersetSecurityException(
        SupersetError(
            error_type=SupersetErrorType.EMBED_DATASET_NOT_IN_SCOPE,
            message=message,
            level=ErrorLevel.ERROR,
        )
    )


def _json_cell(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and value != value:
        return None
    return value
