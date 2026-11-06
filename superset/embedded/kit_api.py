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
"""Operator and guest APIs for the embedded analytics kit."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from flask import request, Response
from flask_appbuilder.api import expose, protect, safe

from superset import db, security_manager
from superset.connectors.sqla.models import SqlaTable
from superset.daos.embedded_kit import EmbeddedChartDAO, EmbeddedExploreDAO
from superset.embedded.chart_embed import run_saved_chart, saved_theme
from superset.embedded.explore_query import ExploreQueryError, run_explore_snapshot
from superset.embedded.kit import (
    is_embedded_analytics_kit_enabled,
    normalize_domains,
    validate_allowed_domains,
)
from superset.embedded.usage import range_start, record_embed_event, summarize_usage
from superset.exceptions import SupersetSecurityException
from superset.models.embedded_dashboard import EmbeddedDashboard
from superset.models.embedded_kit import (
    DEFAULT_EXPLORE_VIZ_TYPES,
    EmbeddedChart,
    EmbeddedExplore,
    EmbedScope,
    EmbedScopeDataset,
    EmbedUsageEvent,
)
from superset.models.slice import Slice
from superset.utils import json
from superset.views.base_api import BaseSupersetApi, statsd_metrics

logger = logging.getLogger(__name__)


def _embed_error(ex: SupersetSecurityException) -> Response:
    """Return a typed embed refusal. The message is safe to show to a guest."""
    from superset.views.error_handling import json_error_response

    return json_error_response([ex.error], status=ex.status or 403)


def _kit_disabled() -> bool:
    return not is_embedded_analytics_kit_enabled()


def _can_access(**kwargs: Any) -> bool:
    """True when raise_for_access allows this object. Admins pass that check."""
    try:
        security_manager.raise_for_access(**kwargs)
    except SupersetSecurityException:
        return False
    return True


def _chart_by_id(chart_id: int | None) -> Any:
    if chart_id is None:
        return None
    return db.session.query(Slice).filter(Slice.id == chart_id).one_or_none()


def _dataset_by_id(dataset_id: int | None) -> Any:
    if dataset_id is None:
        return None
    return db.session.query(SqlaTable).filter(SqlaTable.id == dataset_id).one_or_none()


def _can_read_chart_embed(embed: EmbeddedChart) -> bool:
    chart = _chart_by_id(embed.chart_id)
    return chart is not None and _can_access(chart=chart)


def _can_read_explore_embed(embed: EmbeddedExplore) -> bool:
    dataset = _dataset_by_id(embed.dataset_id)
    return dataset is not None and _can_access(datasource=dataset)


def _can_read_dashboard_embed(embed: Any) -> bool:
    dashboard = getattr(embed, "dashboard", None)
    return dashboard is not None and _can_access(dashboard=dashboard)


def _guest_owns(kind: str, embed_uuid: str) -> bool:
    """True when the current guest token names this embed."""
    guest = security_manager.get_current_guest_user_if_guest()
    if guest is None:
        return False
    return any(
        str(item.get("type")) == kind and str(item.get("id")) == embed_uuid
        for item in guest.resources or []
    )


class EmbeddedKitRestApi(BaseSupersetApi):
    """Console APIs. Same permission as guest-token minting."""

    resource_name = "embedded_analytics"
    class_permission_name = "SecurityRestApi"
    allow_browser_login = True
    openapi_spec_tag = "Embedded Analytics Kit"
    method_permission_name = {
        "embeds": "grant_guest_token",
        "usage": "grant_guest_token",
        "revoke_all": "grant_guest_token",
        "create_chart": "grant_guest_token",
        "get_chart": "grant_guest_token",
        "delete_chart": "grant_guest_token",
        "revoke_chart": "grant_guest_token",
        "create_explore": "grant_guest_token",
        "get_explore": "grant_guest_token",
        "delete_explore": "grant_guest_token",
        "create_scope": "grant_guest_token",
        "list_scopes": "grant_guest_token",
    }

    @expose("/embeds/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def embeds(self) -> Response:
        """List dashboard, chart, and explore embeds the caller can mint for."""
        if _kit_disabled():
            return self.response_404()
        rows: list[dict[str, Any]] = []
        for dashboard_embed in db.session.query(EmbeddedDashboard).all():
            rows.append(
                {
                    "uuid": str(dashboard_embed.uuid),
                    "kind": "dashboard",
                    "name": f"Dashboard {dashboard_embed.dashboard_id}",
                    "domains": dashboard_embed.allowed_domains,
                    "any_origin": not dashboard_embed.allowed_domains,
                }
            )
        for chart_embed in db.session.query(EmbeddedChart).all():
            rows.append(_chart_row(chart_embed))
        for explore_embed in db.session.query(EmbeddedExplore).all():
            rows.append(_explore_row(explore_embed))
        if not security_manager.is_admin():
            rows = [row for row in rows if _caller_can_read_row(row)]
        return self.response(200, result=rows)

    @expose("/embeds/<uuid>/usage/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def usage(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        range_key = request.args.get("range", "7d")
        if range_key not in {"24h", "7d", "30d"}:
            range_key = "7d"
        if not _caller_can_read_usage(uuid):
            return self.response_403()
        rows = (
            db.session.query(EmbedUsageEvent)
            .filter(
                EmbedUsageEvent.embed_uuid == uuid,
                EmbedUsageEvent.created_at >= range_start(range_key),
            )
            .all()
        )
        return self.response(200, result=summarize_usage(rows, range_key=range_key))

    @expose("/revoke_all/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def revoke_all(self) -> Response:
        if _kit_disabled():
            return self.response_404()
        if not security_manager.is_admin():
            return self.response(403, message="Global revocation is admin-only")
        version = security_manager.bump_guest_token_revocation_version()
        return self.response(200, result={"version": version})

    @expose("/chart/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def create_chart(self) -> Response:
        if _kit_disabled():
            return self.response_404()
        body = request.json or {}
        domains = body.get("allowed_domains") or []
        if error := validate_allowed_domains(domains):
            return self.response_400(message=error)
        chart = (
            db.session.query(Slice)
            .filter(Slice.id == body.get("chart_id"))
            .one_or_none()
        )
        if chart is None:
            return self.response_404()
        if str(getattr(chart, "datasource_type", "")) == "semantic_view":
            return self.response_400(
                message="Semantic views can't be embedded in this version."
            )
        try:
            security_manager.raise_for_access(chart=chart)
        except SupersetSecurityException:
            return self.response(
                403, message=f"You don't have access to {chart.slice_name}"
            )
        existing = (
            db.session.query(EmbeddedChart)
            .filter(EmbeddedChart.chart_id == chart.id)
            .one_or_none()
        )
        embed = existing or EmbeddedChart(uuid=uuid.uuid4(), chart_id=chart.id)
        embed.allow_domain_list = normalize_domains(domains)
        embed.filters = json.dumps(body.get("filters") or [])
        embed.hide_title = 1 if body.get("hide_title") else 0
        embed.show_download = 1 if body.get("show_download") else 0
        db.session.add(embed)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(200, result=_chart_row(embed))

    @expose("/chart/<uuid>/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def get_chart(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedChartDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _can_read_chart_embed(embed):
            return self.response_403()
        return self.response(200, result=_chart_row(embed))

    @expose("/chart/<uuid>/", methods=("DELETE",))
    @protect()
    @safe
    @statsd_metrics
    def delete_chart(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedChartDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _can_read_chart_embed(embed):
            return self.response_403()
        db.session.delete(embed)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(200, result="OK")

    @expose("/chart/<uuid>/revoke/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def revoke_chart(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedChartDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _can_read_chart_embed(embed):
            return self.response_403()
        from math import ceil

        embed.guest_token_revoked_before = ceil(
            security_manager._get_current_epoch_time()
        )  # noqa: SLF001
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(200, result="OK")

    @expose("/explore/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def create_explore(self) -> Response:
        if _kit_disabled():
            return self.response_404()
        body = request.json or {}
        domains = body.get("allowed_domains") or []
        if error := validate_allowed_domains(domains):
            return self.response_400(message=error)
        dataset = (
            db.session.query(SqlaTable)
            .filter(SqlaTable.id == body.get("dataset_id"))
            .one_or_none()
        )
        if dataset is None:
            return self.response_404()
        if not _can_access(datasource=dataset):
            return self.response(403, message="You don't have access to this dataset")
        existing = (
            db.session.query(EmbeddedExplore)
            .filter(EmbeddedExplore.dataset_id == dataset.id)
            .one_or_none()
        )
        embed = existing or EmbeddedExplore(uuid=uuid.uuid4(), dataset_id=dataset.id)
        embed.allow_domain_list = normalize_domains(domains)
        embed.viz_types = json.dumps(
            body.get("viz_types") or list(DEFAULT_EXPLORE_VIZ_TYPES)
        )
        embed.initial_state = json.dumps(body.get("initial_state") or {})
        embed.filters = json.dumps(body.get("filters") or [])
        db.session.add(embed)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(200, result=_explore_row(embed))

    @expose("/explore/<uuid>/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def get_explore(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedExploreDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _can_read_explore_embed(embed):
            return self.response_403()
        return self.response(200, result=_explore_row(embed))

    @expose("/explore/<uuid>/", methods=("DELETE",))
    @protect()
    @safe
    @statsd_metrics
    def delete_explore(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedExploreDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _can_read_explore_embed(embed):
            return self.response_403()
        db.session.delete(embed)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(200, result="OK")

    @expose("/scope/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def list_scopes(self) -> Response:
        if _kit_disabled():
            return self.response_404()
        scopes = db.session.query(EmbedScope).all()
        if not security_manager.is_admin():
            scopes = [scope for scope in scopes if _scope_visible(scope)]
        return self.response(
            200,
            result=[
                {
                    "uuid": str(scope.uuid),
                    "name": scope.name,
                    "description": scope.description,
                    "dataset_ids": [row.dataset_id for row in scope.datasets],
                }
                for scope in scopes
            ],
        )

    @expose("/scope/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def create_scope(self) -> Response:
        if _kit_disabled():
            return self.response_404()
        body = request.json or {}
        name = (body.get("name") or "").strip()
        if not name:
            return self.response_400(message="Name is required")
        scope = EmbedScope(
            uuid=uuid.uuid4(), name=name, description=body.get("description")
        )
        db.session.add(scope)
        db.session.flush()
        for dataset_id in body.get("dataset_ids") or []:
            dataset = (
                db.session.query(SqlaTable)
                .filter(SqlaTable.id == dataset_id)
                .one_or_none()
            )
            if dataset is None:
                db.session.rollback()  # pylint: disable=consider-using-transaction
                return self.response_400(
                    message="Semantic views can't be embedded in this version."
                )
            if not _can_access(datasource=dataset):
                db.session.rollback()  # pylint: disable=consider-using-transaction
                return self.response(
                    403, message="You don't have access to this dataset"
                )
            db.session.add(
                EmbedScopeDataset(scope_id=scope.uuid, dataset_id=dataset.id)
            )
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(200, result={"uuid": str(scope.uuid), "name": scope.name})


class EmbeddedKitGuestRestApi(BaseSupersetApi):
    """Guest-readable chart and explore surfaces."""

    resource_name = "embedded_kit"
    class_permission_name = "EmbeddedKitGuestRestApi"
    allow_browser_login = True
    openapi_spec_tag = "Embedded Analytics Kit Guest"
    method_permission_name = {
        "chart_bootstrap": "bootstrap",
        "chart_data": "data",
        "explore_bootstrap": "bootstrap",
        "explore_data": "data",
    }

    @expose("/chart/<uuid>/bootstrap/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def chart_bootstrap(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedChartDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _guest_owns("chart", str(embed.uuid)):
            return self.response_403()
        chart = db.session.query(Slice).filter(Slice.id == embed.chart_id).one_or_none()
        return self.response(
            200,
            result={
                "uuid": str(embed.uuid),
                "chart_id": embed.chart_id,
                "hide_title": bool(embed.hide_title),
                "show_download": bool(embed.show_download),
                "filters": json.loads(embed.filters) if embed.filters else [],
                "theme_id": embed.theme_id,
                "theme": saved_theme(embed.theme_id),
                "form_data": chart.form_data if chart is not None else {},
                "slice_name": getattr(chart, "slice_name", None),
                "allowed_domains": embed.allowed_domains,
            },
        )

    @expose("/chart/<uuid>/data/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def chart_data(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        """Run the saved chart. The body may carry host filters, not form data."""
        if _kit_disabled():
            return self.response_404()
        if not security_manager.is_guest_user():
            return self.response_403()
        embed = EmbeddedChartDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _guest_owns("chart", str(embed.uuid)):
            return self.response_403()
        try:
            payload = run_saved_chart(embed, request.json or {})
        except SupersetSecurityException as ex:
            return _embed_error(ex)
        except ExploreQueryError as ex:
            return self.response_400(message=str(ex))
        return self.response(200, result=payload)

    @expose("/explore/<uuid>/bootstrap/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def explore_bootstrap(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        if _kit_disabled():
            return self.response_404()
        embed = EmbeddedExploreDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        if not _guest_owns("explore", str(embed.uuid)):
            return self.response_403()
        dataset = (
            db.session.query(SqlaTable)
            .filter(SqlaTable.id == embed.dataset_id)
            .one_or_none()
        )
        columns = [
            column.column_name for column in getattr(dataset, "columns", []) or []
        ]
        metrics = [
            metric.metric_name for metric in getattr(dataset, "metrics", []) or []
        ]
        return self.response(
            200,
            result={
                "uuid": str(embed.uuid),
                "dataset_id": embed.dataset_id,
                "viz_types": json.loads(embed.viz_types)
                if embed.viz_types
                else list(DEFAULT_EXPLORE_VIZ_TYPES),
                "initial_state": json.loads(embed.initial_state)
                if embed.initial_state
                else {},
                "filters": json.loads(embed.filters) if embed.filters else [],
                "columns": columns,
                "metrics": metrics,
                "theme_id": embed.theme_id,
            },
        )

    @expose("/explore/<uuid>/data/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    def explore_data(self, uuid: str) -> Response:  # pylint: disable=redefined-builtin
        """Run an Explore lite snapshot. SQL payloads are rejected."""
        if _kit_disabled():
            return self.response_404()
        if not security_manager.is_guest_user():
            return self.response_403()
        embed = EmbeddedExploreDAO.find_by_id(uuid)
        if embed is None:
            return self.response_404()
        guest = security_manager.get_current_guest_user_if_guest()
        if guest is None:
            return self.response_403()
        resources = list(guest.resources or [])
        if not any(
            str(item.get("type")) == "explore"
            and str(item.get("id")) == str(embed.uuid)
            for item in resources
        ):
            return self.response_403()
        dataset = (
            db.session.query(SqlaTable)
            .filter(SqlaTable.id == embed.dataset_id)
            .one_or_none()
        )
        if dataset is None:
            return self.response_404()
        try:
            payload = run_explore_snapshot(
                embed,
                dataset,
                guest,
                request.json or {},
            )
        except ValueError as ex:
            return self.response_400(message=str(ex))
        except SupersetSecurityException as ex:
            return _embed_error(ex)
        except ExploreQueryError as ex:
            return self.response_400(message=str(ex))
        payload.pop("sql", None)
        record_embed_event(
            embed_uuid=str(embed.uuid),
            embed_kind="explore",
            event="query",
            username=(guest.guest_token.get("user") or {}).get("username"),
        )
        return self.response(200, result=payload)


def _chart_row(embed: EmbeddedChart) -> dict[str, Any]:
    chart = db.session.query(Slice).filter(Slice.id == embed.chart_id).one_or_none()
    return {
        "uuid": str(embed.uuid),
        "kind": "chart",
        "name": getattr(chart, "slice_name", None) or f"Chart {embed.chart_id}",
        "chart_id": embed.chart_id,
        "domains": embed.allowed_domains,
        "any_origin": False,
        "filters": json.loads(embed.filters) if embed.filters else [],
        "hide_title": bool(embed.hide_title),
        "show_download": bool(embed.show_download),
    }


def _explore_row(embed: EmbeddedExplore) -> dict[str, Any]:
    dataset = (
        db.session.query(SqlaTable)
        .filter(SqlaTable.id == embed.dataset_id)
        .one_or_none()
    )
    return {
        "uuid": str(embed.uuid),
        "kind": "explore",
        "name": getattr(dataset, "table_name", None) or f"Dataset {embed.dataset_id}",
        "dataset_id": embed.dataset_id,
        "domains": embed.allowed_domains,
        "any_origin": False,
        "viz_types": json.loads(embed.viz_types) if embed.viz_types else [],
    }


def _scope_visible(scope: EmbedScope) -> bool:
    """A non-admin sees a scope only when they can read every dataset on it."""
    for row in scope.datasets:
        dataset = _dataset_by_id(row.dataset_id)
        if dataset is None or not _can_access(datasource=dataset):
            return False
    return True


def _caller_can_read_usage(embed_uuid: str) -> bool:
    """Usage is readable only for an embed whose object the caller can read."""
    if security_manager.is_admin():
        return True
    if (chart := EmbeddedChartDAO.find_by_id(embed_uuid)) is not None:
        return _can_read_chart_embed(chart)
    if (explore := EmbeddedExploreDAO.find_by_id(embed_uuid)) is not None:
        return _can_read_explore_embed(explore)
    # pylint: disable=import-outside-toplevel
    from superset.daos.dashboard import EmbeddedDashboardDAO

    if (dashboard := EmbeddedDashboardDAO.find_by_id(embed_uuid)) is not None:
        return _can_read_dashboard_embed(dashboard)
    return False


def _caller_can_read_row(row: dict[str, Any]) -> bool:
    """Non-admins only see embeds they can already read."""
    try:
        if row["kind"] == "chart":
            chart = (
                db.session.query(Slice)
                .filter(Slice.id == row.get("chart_id"))
                .one_or_none()
            )
            if chart is None:
                return False
            security_manager.raise_for_access(chart=chart)
            return True
        if row["kind"] == "explore":
            dataset = (
                db.session.query(SqlaTable)
                .filter(SqlaTable.id == row.get("dataset_id"))
                .one_or_none()
            )
            if dataset is None:
                return False
            security_manager.raise_for_access(datasource=dataset)
            return True
    except SupersetSecurityException:
        return False
    if row["kind"] == "dashboard":
        from superset.daos.dashboard import EmbeddedDashboardDAO

        embed = EmbeddedDashboardDAO.find_by_id(str(row.get("uuid")))
        return embed is not None and _can_read_dashboard_embed(embed)
    return False
