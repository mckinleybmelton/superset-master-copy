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
from typing import Callable

from flask import abort, current_app, request
from flask_appbuilder import expose
from flask_login import AnonymousUserMixin, login_user
from flask_wtf.csrf import same_origin

from superset import event_logger, is_feature_enabled
from superset.daos.dashboard import EmbeddedDashboardDAO
from superset.embedded.kit import is_embedded_analytics_kit_enabled, referrer_allowed
from superset.superset_typing import FlaskResponse
from superset.utils import json
from superset.views.base import (
    BaseSupersetView,
    common_bootstrap_payload,
    get_language_pack_template_context,
)


class EmbeddedView(BaseSupersetView):
    """The views for embedded resources to be rendered in an iframe"""

    route_base = "/embedded"

    @expose("/chart/<uuid>")
    def embedded_chart(
        self,
        uuid: str,
        add_extra_log_payload: Callable[..., None] = lambda **kwargs: None,
    ) -> FlaskResponse:
        return self._embedded_kit_shell(
            uuid, kind="chart", add_extra_log_payload=add_extra_log_payload
        )

    @expose("/explore/<uuid>")
    def embedded_explore(
        self,
        uuid: str,
        add_extra_log_payload: Callable[..., None] = lambda **kwargs: None,
    ) -> FlaskResponse:
        return self._embedded_kit_shell(
            uuid, kind="explore", add_extra_log_payload=add_extra_log_payload
        )

    def _embedded_kit_shell(
        self,
        uuid: str,
        kind: str,
        add_extra_log_payload: Callable[..., None] = lambda **kwargs: None,
    ) -> FlaskResponse:
        """Anonymous shell for chart and Explore lite embeds."""
        if not is_embedded_analytics_kit_enabled():
            abort(404)
        from superset.daos.embedded_kit import EmbeddedChartDAO, EmbeddedExploreDAO
        from superset.embedded.usage import record_embed_event

        embed = (
            EmbeddedChartDAO.find_by_id(uuid)
            if kind == "chart"
            else EmbeddedExploreDAO.find_by_id(uuid)
        )
        if embed is None:
            abort(404)
        assert embed is not None
        if not referrer_allowed(
            request.referrer, embed.allowed_domains, allow_empty=False
        ):
            record_embed_event(
                embed_uuid=str(embed.uuid),
                embed_kind=kind,
                event="failure",
                failure_reason="origin_rejected",
            )
            abort(403)
        sec_fetch_dest = request.headers.get("Sec-Fetch-Dest")
        if sec_fetch_dest and sec_fetch_dest not in {
            "iframe",
            "frame",
            "document",
            "empty",
        }:
            abort(403)
        login_user(AnonymousUserMixin(), force=True)
        add_extra_log_payload(embedded_id=str(embed.uuid), embed_kind=kind)
        record_embed_event(embed_uuid=str(embed.uuid), embed_kind=kind, event="load")
        bootstrap_data = {
            "config": {
                "GUEST_TOKEN_HEADER_NAME": current_app.config[
                    "GUEST_TOKEN_HEADER_NAME"
                ],
                "GUEST_TOKEN_HEADER_MAX_BYTES": current_app.config[
                    "GUEST_TOKEN_HEADER_MAX_BYTES"
                ],
            },
            "common": common_bootstrap_payload(),
            "embedded": {
                "kit": kind,
                "uuid": str(embed.uuid),
                "allowed_domains": embed.allowed_domains,
                "theme_id": embed.theme_id,
            },
        }
        return self.render_template(
            "superset/spa.html",
            entry="embedded",
            bootstrap_data=json.dumps(
                bootstrap_data, default=json.pessimistic_json_iso_dttm_ser
            ),
            **get_language_pack_template_context(bootstrap_data["common"]),
        )

    @expose("/<uuid>")
    @event_logger.log_this_with_extra_payload
    def embedded(
        self,
        uuid: str,
        add_extra_log_payload: Callable[..., None] = lambda **kwargs: None,
    ) -> FlaskResponse:
        """
        Server side rendering for the embedded dashboard page
        :param uuid: identifier for embedded dashboard
        :param add_extra_log_payload: added by `log_this_with_manual_updates`, set a
            default value to appease pylint
        """
        if not is_feature_enabled("EMBEDDED_SUPERSET"):
            abort(404)

        embedded = EmbeddedDashboardDAO.find_by_id(uuid)

        if not embedded:
            abort(404)

        assert embedded is not None

        # validate request referrer in allowed domains
        is_referrer_allowed = not embedded.allowed_domains
        for domain in embedded.allowed_domains:
            if same_origin(request.referrer, domain):
                is_referrer_allowed = True
                break

        if not is_referrer_allowed:
            abort(403)

        # Defense in depth: when the browser sends a Sec-Fetch-Dest header,
        # require an embeddable destination (iframe/frame) or a direct
        # document/fetch load, rather than e.g. an <img>/<script>/<object> tag.
        # The header is unforgeable by page script; an absent header (older
        # browsers / non-browser clients) is allowed for compatibility.
        sec_fetch_dest = request.headers.get("Sec-Fetch-Dest")
        if sec_fetch_dest and sec_fetch_dest not in {
            "iframe",
            "frame",
            "document",
            "empty",
        }:
            abort(403)

        # Log in as an anonymous user, just for this view.
        # This view needs to be visible to all users,
        # and building the page fails if g.user and/or ctx.user aren't present.
        login_user(AnonymousUserMixin(), force=True)

        add_extra_log_payload(
            embedded_dashboard_id=uuid,
            dashboard_version="v2",
        )

        bootstrap_data = {
            "config": {
                "GUEST_TOKEN_HEADER_NAME": current_app.config[
                    "GUEST_TOKEN_HEADER_NAME"
                ],
                "GUEST_TOKEN_HEADER_MAX_BYTES": current_app.config[
                    "GUEST_TOKEN_HEADER_MAX_BYTES"
                ],
            },
            "common": common_bootstrap_payload(),
            "embedded": {
                "dashboard_id": embedded.dashboard_id,
                # The list of domains allowed to embed this dashboard. An empty
                # list means any domain is allowed (no restriction). The frontend
                # uses this to validate the origin of incoming postMessage events.
                "allowed_domains": embedded.allowed_domains,
            },
        }

        # This page renders before any guest token has been presented, and the
        # Referer / Sec-Fetch-Dest checks above are browser cooperation only --
        # a non-browser client can forge or omit both. Serve a neutral shell:
        # no dashboard title or description here; the embedded SPA fetches
        # dashboard metadata through the guest-token-authenticated API.
        return self.render_template(
            "superset/spa.html",
            entry="embedded",
            bootstrap_data=json.dumps(
                bootstrap_data, default=json.pessimistic_json_iso_dttm_ser
            ),
            **get_language_pack_template_context(bootstrap_data["common"]),
        )
