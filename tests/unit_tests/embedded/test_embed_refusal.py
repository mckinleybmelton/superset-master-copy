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
"""Embed refusals are typed and do not use the generic backend error."""

from __future__ import annotations

from superset.embedded.guest_errors import embed_error, LINK_EXPIRED
from superset.embedded.view import embed_refusal
from superset.errors import SupersetErrorType
from superset.utils import json


def test_origin_refusal_is_html_without_the_generic_issue() -> None:
    response = embed_refusal(
        "EMBED_ORIGIN_NOT_ALLOWED",
        "This embed isn't allowed on this site.",
    )
    body = response.get_data(as_text=True)
    assert response.status_code == 403
    assert response.mimetype == "text/html"
    assert "This embed isn't allowed on this site." in body
    assert "EMBED_ORIGIN_NOT_ALLOWED" in body
    assert "GENERIC_BACKEND_ERROR" not in body
    assert "1011" not in body


def test_token_refusal_keeps_its_type() -> None:
    response = embed_error(
        SupersetErrorType.EMBED_TOKEN_INVALID,
        LINK_EXPIRED,
        401,
    )
    payload = json.loads(response.get_data(as_text=True))
    error = payload["errors"][0]
    assert error["error_type"] == "EMBED_TOKEN_INVALID"
    assert error["message"] == LINK_EXPIRED
    assert "1011" not in response.get_data(as_text=True)
    assert "GENERIC_BACKEND_ERROR" not in response.get_data(as_text=True)
