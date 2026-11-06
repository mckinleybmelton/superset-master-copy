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
from superset.embedded.kit import (
    is_embedded_analytics_kit_enabled,
    normalize_domains,
    validate_allowed_domains,
    validate_explore_snapshot,
)
from superset.embedded.usage import range_start, summarize_usage
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


def _kit_disabled() -> bool:
    return not is_embedded_analytics_kit_enabled()


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
        db.session.commit()
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
        db.session.delete(embed)
        db.session.commit()
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
        from math import ceil

        embed.guest_token_revoked_before = ceil(
            security_manager._get_current_epoch_time()
        )  # noqa: SLF001
        db.session.commit()
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
        db.session.commit()
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
        db.session.delete(embed)
        db.session.commit()
        return self.response(200, result="OK")

    @expose("/scope/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def list_scopes(self) -> Response:
        if _kit_disabled():
            return self.response_404()
        scopes = db.session.query(EmbedScope).all()
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
                db.session.rollback()
                return self.response_400(
                    message="Semantic views can't be embedded in this version."
                )
            db.session.add(
                EmbedScopeDataset(scope_id=scope.uuid, dataset_id=dataset.id)
            )
        db.session.commit()
        return self.response(200, result={"uuid": str(scope.uuid), "name": scope.name})


class EmbeddedKitGuestRestApi(BaseSupersetApi):
    """Guest-readable chart and explore surfaces."""

    resource_name = "embedded_kit"
    class_permission_name = "EmbeddedKitGuestRestApi"
    allow_browser_login = True
    openapi_spec_tag = "Embedded Analytics Kit Guest"
    method_permission_name = {
        "chart_bootstrap": "bootstrap",
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
        return self.response(
            200,
            result={
                "uuid": str(embed.uuid),
                "chart_id": embed.chart_id,
                "hide_title": bool(embed.hide_title),
                "show_download": bool(embed.show_download),
                "filters": json.loads(embed.filters) if embed.filters else [],
                "theme_id": embed.theme_id,
                "allowed_domains": embed.allowed_domains,
            },
        )

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
        resources = list(guest.resources or []) if guest else []
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
        allowed_viz = (
            json.loads(embed.viz_types)
            if embed.viz_types
            else list(DEFAULT_EXPLORE_VIZ_TYPES)
        )
        columns = {column.column_name for column in dataset.columns}
        metrics = {metric.metric_name for metric in dataset.metrics}
        try:
            snapshot, ignored_state = validate_explore_snapshot(
                request.json or {},
                allowed_viz=allowed_viz,
                columns=columns,
                metrics=metrics,
            )
        except ValueError as ex:
            return self.response_400(message=str(ex))
        if not snapshot.get("metrics"):
            return self.response(
                200,
                result={
                    "message": "Choose a metric.",
                    "ignored_state": ignored_state,
                    "data": [],
                },
            )
        return self.response(
            200,
            result={
                "snapshot": snapshot,
                "ignored_state": ignored_state,
                "ignored_filters": [],
            },
        )


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
    return security_manager.is_admin()
