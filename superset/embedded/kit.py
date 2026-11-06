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
"""Pure helpers for the embedded analytics kit.

Dashboard embed behavior does not go through these helpers.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from superset.security.guest_token import GuestTokenResourceType

KIT_RESOURCE_TYPES = {
    GuestTokenResourceType.CHART.value,
    GuestTokenResourceType.EXPLORE.value,
}
CHROME_KEYS = {
    "colorBgContainer",
    "colorText",
    "colorTextSecondary",
    "colorBorder",
    "fontFamily",
    "borderRadius",
}
USAGE_RETENTION_DAYS = 90
_HOST_RE = re.compile(r"^[A-Za-z0-9.-]+(?::\d+)?$")


def is_embedded_analytics_kit_enabled() -> bool:
    """True only when both embed flags are on."""
    # pylint: disable=import-outside-toplevel
    from superset import is_feature_enabled

    return is_feature_enabled("EMBEDDED_SUPERSET") and is_feature_enabled(
        "EMBEDDED_ANALYTICS_KIT"
    )


def validate_allowed_domains(domains: list[str]) -> str | None:
    """Return an error message, or None when the list is acceptable.

    Chart and Explore embeds require at least one host. Empty, paths, and
    wildcards are rejected. An optional scheme is stripped before storage.
    """
    if not domains:
        return (
            "Add at least one domain. Chart and Explore embeds cannot be "
            "opened from any site."
        )
    for raw in domains:
        candidate = (raw or "").strip()
        if not candidate or "*" in candidate:
            return (
                "Add at least one domain. Chart and Explore embeds cannot be "
                "opened from any site."
            )
        parsed = urlparse(candidate if "://" in candidate else f"//{candidate}")
        host = parsed.hostname or ""
        if parsed.path not in ("", "/") or parsed.query or parsed.params:
            return (
                "Add at least one domain. Chart and Explore embeds cannot be "
                "opened from any site."
            )
        port = f":{parsed.port}" if parsed.port else ""
        normalized = f"{host}{port}"
        if not host or not _HOST_RE.match(normalized):
            return (
                "Add at least one domain. Chart and Explore embeds cannot be "
                "opened from any site."
            )
    return None


def referrer_allowed(
    referrer: str | None,
    domains: list[str],
    *,
    allow_empty: bool,
) -> bool:
    """Same host comparison the dashboard embed shell uses.

    ``allow_empty`` is true only for dashboards, where an empty list means
    any origin. Chart and explore embeds pass false and fail closed.
    """
    # pylint: disable=import-outside-toplevel
    from flask_wtf.csrf import same_origin

    if not domains:
        return allow_empty
    for domain in domains:
        if same_origin(referrer, domain):
            return True
    return False


def normalize_domains(domains: list[str]) -> str:
    """Comma-separated host list stored on the embed row."""
    cleaned: list[str] = []
    for raw in domains:
        candidate = raw.strip()
        parsed = urlparse(candidate if "://" in candidate else f"//{candidate}")
        port = f":{parsed.port}" if parsed.port else ""
        cleaned.append(f"{parsed.hostname}{port}")
    return ",".join(cleaned)


def guest_label_hash(username: str | None, embed_uuid: str) -> str | None:
    """SHA-256 of username plus embed id. None when the token has no username."""
    if not username:
        return None
    digest = hashlib.sha256(f"{username}{embed_uuid}".encode("utf-8")).hexdigest()
    return digest


def guest_display_label(guest_hash: str | None) -> str:
    prefix = (guest_hash or "")[:8]
    return f"Guest {prefix}".rstrip()


def filter_chrome(chrome: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    """Keep the chrome allowlist. Return applied tokens and ignored key names."""
    if not chrome:
        return {}, []
    applied = {key: value for key, value in chrome.items() if key in CHROME_KEYS}
    ignored = sorted(key for key in chrome if key not in CHROME_KEYS)
    return applied, ignored


def value_in_bounds(value: Any, bounds: dict[str, Any] | None) -> bool:
    if not bounds:
        return True
    if "values" in bounds:
        allowed = bounds["values"]
        if isinstance(value, list):
            return all(item in allowed for item in value)
        return value in allowed
    if "min" in bounds or "max" in bounds:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return False
        if "min" in bounds and number < float(bounds["min"]):
            return False
        if "max" in bounds and number > float(bounds["max"]):
            return False
        return True
    if "earliest" in bounds or "latest" in bounds:
        # Time bounds compare ISO strings. A dict {from, to} checks both ends.
        if isinstance(value, dict):
            start = str(value.get("from", ""))
            end = str(value.get("to", ""))
            earliest = str(bounds.get("earliest", ""))
            latest = str(bounds.get("latest", "9999"))
            return (not earliest or start >= earliest) and (not latest or end <= latest)
        text = str(value)
        earliest = str(bounds.get("earliest", ""))
        latest = str(bounds.get("latest", "9999"))
        return (not earliest or text >= earliest) and (not latest or text <= latest)
    return True


def resolve_published_filters(  # noqa: C901
    published: list[dict[str, Any]],
    token_locked: dict[str, Any] | None,
    requested: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Merge published filters with the token and the iframe request.

    Locked values come from the token, then the operator default. The iframe
    cannot replace a locked value. Controllable values outside bounds are
    dropped and the operator default is applied instead.

    Returns ``(applied, ignored)``. ``applied`` entries are
    ``{col, op, val, key, mode}``.
    """
    token_locked = token_locked or {}
    requested = requested or {}
    published_keys = {item.get("key") for item in published}
    applied: list[dict[str, Any]] = []
    ignored: list[dict[str, str]] = []

    for item in published:
        key = str(item.get("key") or "")
        column = str(item.get("column") or key)
        mode = item.get("mode") or "locked"
        op = item.get("op") or "=="
        default = item.get("default")
        bounds = item.get("bounds")
        if mode == "locked":
            if key in token_locked:
                value = token_locked[key]
            else:
                value = default
            if key in requested and requested[key] != value:
                ignored.append({"key": key, "reason": "not_allowed"})
            if value is None and key not in token_locked:
                # A locked filter with no value cannot be applied. Callers
                # that save configs must reject this; query time refuses it
                # by omitting the predicate only when the caller checks
                # ``missing_lock``.
                applied.append(
                    {
                        "key": key,
                        "col": column,
                        "op": op,
                        "val": None,
                        "mode": "locked",
                        "missing": True,
                    }
                )
            else:
                applied.append(
                    {
                        "key": key,
                        "col": column,
                        "op": op,
                        "val": value,
                        "mode": "locked",
                        "missing": False,
                    }
                )
            continue
        if key in requested:
            candidate = requested[key]
            if value_in_bounds(candidate, bounds):
                applied.append(
                    {
                        "key": key,
                        "col": column,
                        "op": op,
                        "val": candidate,
                        "mode": "controllable",
                        "missing": False,
                    }
                )
            else:
                ignored.append({"key": key, "reason": "out_of_bounds"})
                applied.append(
                    {
                        "key": key,
                        "col": column,
                        "op": op,
                        "val": default,
                        "mode": "controllable",
                        "missing": default is None,
                    }
                )
        elif default is not None:
            applied.append(
                {
                    "key": key,
                    "col": column,
                    "op": op,
                    "val": default,
                    "mode": "controllable",
                    "missing": False,
                }
            )

    for key in requested:
        if key not in published_keys:
            ignored.append({"key": str(key), "reason": "unknown_key"})
    return applied, ignored


def validate_explore_snapshot(  # noqa: C901
    body: dict[str, Any],
    *,
    allowed_viz: list[str],
    columns: set[str],
    metrics: set[str],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Accept an Explore lite snapshot. Reject SQL. Drop unknown fields.

    Raises ValueError when the body carries SQL. Returns the kept snapshot
    and ignored state entries.
    """
    if not isinstance(body, dict):
        raise ValueError("Snapshot must be an object")
    if _contains_sql(body):
        raise ValueError("SQL is not allowed in Explore lite")
    ignored: list[dict[str, str]] = []
    viz = body.get("vizType") or body.get("viz_type")
    if viz not in allowed_viz:
        ignored.append({"field": "vizType", "reason": "not_allowed"})
        viz = allowed_viz[0] if allowed_viz else None
    dimensions = [
        name
        for name in (body.get("dimensions") or [])
        if isinstance(name, str) and name in columns
    ]
    for name in body.get("dimensions") or []:
        if name not in columns:
            ignored.append({"field": str(name), "reason": "not_allowed"})
    kept_metrics = [
        name
        for name in (body.get("metrics") or [])
        if isinstance(name, str) and name in metrics
    ]
    for name in body.get("metrics") or []:
        if not isinstance(name, str) or name not in metrics:
            ignored.append({"field": str(name), "reason": "not_allowed"})
    filters = []
    for item in body.get("filters") or []:
        if not isinstance(item, dict):
            continue
        column = item.get("column")
        if column not in columns:
            ignored.append({"field": str(column), "reason": "not_allowed"})
            continue
        filters.append(
            {
                "column": column,
                "operator": item.get("operator") or "==",
                "value": item.get("value"),
            }
        )
    return (
        {
            "vizType": viz,
            "dimensions": dimensions,
            "metrics": kept_metrics,
            "timeGrain": body.get("timeGrain"),
            "filters": filters,
        },
        ignored,
    )


def _contains_sql(value: Any) -> bool:
    """True when a snapshot carries a SQL field or a SQL metric expression."""
    if isinstance(value, dict):
        for key, inner in value.items():
            lowered = str(key).lower()
            if lowered in {"sql", "sqlexpression"} or lowered == "expressiontype":
                if lowered == "expressiontype" and str(inner).upper() != "SQL":
                    continue
                return True
            if _contains_sql(inner):
                return True
        return False
    if isinstance(value, list):
        return any(_contains_sql(item) for item in value)
    return False


def usage_cutoff(now: datetime | None = None) -> datetime:
    """Rows older than this are pruned. Retention is 90 days."""
    moment = now or datetime.utcnow()
    return moment - timedelta(days=USAGE_RETENTION_DAYS)
