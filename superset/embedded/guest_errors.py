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
"""Typed refusals for embedded guests."""

from __future__ import annotations

import logging

import jwt
from flask import current_app, request, Response

from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from superset.views.error_handling import json_error_response

logger = logging.getLogger(__name__)

LINK_INVALID = "This embed link isn't valid."
LINK_EXPIRED = "This embed link has expired."


def embed_error(code: SupersetErrorType, message: str, status: int = 403) -> Response:
    """JSON refusal whose type survives guest redaction and has no issue 1011."""
    return json_error_response(
        [
            SupersetError(
                message=message,
                error_type=code,
                level=ErrorLevel.ERROR,
            )
        ],
        status=status,
    )


def refusal_for_raw_guest_token() -> Response | None:
    """Reject a present but unusable guest token before the view runs.

    A missing header is left alone so session auth still works. An expired
    or invalid token returns ``EMBED_TOKEN_INVALID`` instead of a generic 401.
    """
    if not request.path.startswith("/api/"):
        return None
    header = current_app.config.get("GUEST_TOKEN_HEADER_NAME", "X-GuestToken")
    raw = request.headers.get(header)
    if not raw:
        return None
    # pylint: disable=import-outside-toplevel
    from superset import security_manager

    try:
        token = security_manager.parse_jwt_guest_token(raw)
    except jwt.ExpiredSignatureError:
        logger.info("Expired guest token")
        return embed_error(SupersetErrorType.EMBED_TOKEN_INVALID, LINK_EXPIRED, 401)
    except Exception:  # pylint: disable=broad-except
        logger.info("Invalid guest token")
        return embed_error(SupersetErrorType.EMBED_TOKEN_INVALID, LINK_INVALID, 401)
    if security_manager._is_guest_token_revoked(token):  # noqa: SLF001
        return embed_error(SupersetErrorType.EMBED_TOKEN_INVALID, LINK_INVALID, 401)
    return None
