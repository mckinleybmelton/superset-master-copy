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
"""Server-side filter policy for embedded analytics kit guests."""

from __future__ import annotations

from typing import Any

from superset.embedded.kit import (
    is_embedded_analytics_kit_enabled,
    KIT_RESOURCE_TYPES,
    resolve_published_filters,
)
from superset.errors import SupersetErrorType
from superset.exceptions import SupersetSecurityException
from superset.security.guest_token import GuestTokenResourceType
from superset.utils import json


def resource_types(resources: list[Any] | None) -> set[str]:
    return {str(item.get("type")) for item in resources or []}


def kit_resources(resources: list[Any] | None) -> list[Any]:
    return [
        item for item in resources or [] if str(item.get("type")) in KIT_RESOURCE_TYPES
    ]


def apply_resolved_filters(queries: list[Any], applied: list[dict[str, Any]]) -> None:
    """Replace client filters on published columns with the resolved predicates.

    Locked predicates are always written, even when the client omitted them
    or sent a different value. Simple ``{col, op, val}`` clauses are used so
    guest RLS stays on its own path.
    """
    locked_cols = {item["col"] for item in applied if item.get("mode") == "locked"}
    controlled_cols = {
        item["col"] for item in applied if item.get("mode") == "controllable"
    }
    managed = locked_cols | controlled_cols
    for query in queries:
        existing = [
            clause
            for clause in (getattr(query, "filter", None) or [])
            if _col_name(clause) not in managed
        ]
        for item in applied:
            if item.get("missing"):
                continue
            existing.append({"col": item["col"], "op": item["op"], "val": item["val"]})
        query.filter = existing


def _col_name(clause: Any) -> str:
    if isinstance(clause, dict):
        col = clause.get("col")
    else:
        col = getattr(clause, "col", None)
    if isinstance(col, dict):
        return str(col.get("column_name") or col.get("sqlExpression") or "")
    return str(col or "")


def _requested_from_queries(
    queries: list[Any], published: list[dict[str, Any]]
) -> dict[str, Any]:
    by_col = {
        str(item.get("column") or item.get("key")): str(item.get("key"))
        for item in published
    }
    requested: dict[str, Any] = {}
    for query in queries:
        for clause in getattr(query, "filter", None) or []:
            name = _col_name(clause)
            key = by_col.get(name)
            if not key:
                continue
            value = (
                clause.get("val")
                if isinstance(clause, dict)
                else getattr(clause, "val", None)
            )
            requested[key] = value
    return requested


def apply_embedded_guest_query_policy(  # noqa: C901
    query_context: Any,
) -> list[dict[str, str]]:
    """Enforce kit guest rules on a chart-data query context.

    Dashboard guests are unchanged. Explore tokens are denied on this generic
    endpoint. Chart tokens keep the saved chart and receive locked filters
    from the token, then the operator default.

    Returns ignored filters. Raises SupersetSecurityException on a refusal.
    """
    # pylint: disable=import-outside-toplevel
    try:
        from superset import security_manager

        guest = security_manager.get_current_guest_user_if_guest()
    except RuntimeError:
        # Chart-data unit tests construct a command outside an app context.
        # Dashboard and non-guest requests are unchanged.
        return []
    from superset.embedded.usage import record_embed_event

    if guest is None:
        return []
    resources = list(guest.resources or [])
    kinds = resource_types(resources)
    if not kinds & KIT_RESOURCE_TYPES:
        return []
    if not is_embedded_analytics_kit_enabled():
        _deny("Embedded analytics kit is disabled")
    if GuestTokenResourceType.EXPLORE.value in kinds:
        explore_id = _resource_id(resources, GuestTokenResourceType.EXPLORE.value)
        record_embed_event(
            embed_uuid=explore_id or "",
            embed_kind="explore",
            event="failure",
            failure_reason="token_rejected",
            username=(guest.guest_token.get("user") or {}).get("username"),
        )
        _deny(
            "Explore embeds can't run chart data this way.",
            SupersetErrorType.EMBED_EXPLORE_CHART_DATA_DENIED,
        )
    if GuestTokenResourceType.CHART.value not in kinds:
        return []

    embed_id = _resource_id(resources, GuestTokenResourceType.CHART.value)
    embed = _find_chart_embed(embed_id)
    if embed is None:
        _deny("Embedded chart was not found")
    slice_ = getattr(query_context, "slice_", None)
    if slice_ is None or getattr(slice_, "id", None) != embed.chart_id:
        record_embed_event(
            embed_uuid=str(embed.uuid),
            embed_kind="chart",
            event="failure",
            failure_reason="dataset_not_in_scope",
        )
        _deny("Guest token does not authorize this chart")
    if not security_manager._guest_token_allows_dataset(  # noqa: SLF001
        getattr(slice_, "datasource_id", None)
    ):
        record_embed_event(
            embed_uuid=str(embed.uuid),
            embed_kind="chart",
            event="failure",
            failure_reason="dataset_not_in_scope",
        )
        _deny(
            "This embed can't use that dataset.",
            SupersetErrorType.EMBED_DATASET_NOT_IN_SCOPE,
        )

    published = _load_json_list(embed.filters)
    token_locked = guest.guest_token.get("locked_filters") or {}
    requested = _requested_from_queries(query_context.queries or [], published)
    # Also honor a top-level hint the SPA may set before the query runs.
    hint = getattr(query_context, "embedded_requested_filters", None) or {}
    requested.update(hint)
    applied, ignored = resolve_published_filters(published, token_locked, requested)
    if any(item.get("missing") and item.get("mode") == "locked" for item in applied):
        _deny("Locked filter has no value")
    _strip_client_sql(query_context)
    apply_resolved_filters(query_context.queries or [], applied)
    query_context.ignored_filters = ignored
    record_embed_event(
        embed_uuid=str(embed.uuid),
        embed_kind="chart",
        event="query",
        username=(guest.guest_token.get("user") or {}).get("username"),
    )
    return ignored


def _find_chart_embed(embed_id: str | None) -> Any:
    from superset.daos.embedded_kit import EmbeddedChartDAO

    if not embed_id:
        return None
    return EmbeddedChartDAO.find_by_id(embed_id)


def _resource_id(resources: list[Any], kind: str) -> str | None:
    for item in resources:
        if str(item.get("type")) == kind:
            return str(item.get("id"))
    return None


def _load_json_list(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def _strip_client_sql(query_context: Any) -> None:
    """Drop client SQL extras and SQL adhoc filters. Saved simple filters stay."""
    form_data = getattr(query_context, "form_data", None)
    if isinstance(form_data, dict):
        extras = form_data.get("extras")
        if isinstance(extras, dict):
            extras.pop("where", None)
            extras.pop("having", None)
        adhoc = form_data.get("adhoc_filters")
        if isinstance(adhoc, list):
            form_data["adhoc_filters"] = [
                item
                for item in adhoc
                if not (
                    isinstance(item, dict)
                    and (
                        str(item.get("expressionType", "")).upper() == "SQL"
                        or item.get("sqlExpression")
                    )
                )
            ]
    for query in getattr(query_context, "queries", None) or []:
        extras = getattr(query, "extras", None)
        if isinstance(extras, dict):
            extras.pop("where", None)
            extras.pop("having", None)


def _deny(
    message: str,
    error_type: SupersetErrorType = SupersetErrorType.DASHBOARD_SECURITY_ACCESS_ERROR,
) -> None:
    from superset.errors import ErrorLevel, SupersetError

    raise SupersetSecurityException(
        SupersetError(
            message=message,
            error_type=error_type,
            level=ErrorLevel.ERROR,
        )
    )
