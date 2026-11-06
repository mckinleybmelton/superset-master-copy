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
"""Product usage events for the embedded analytics console."""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from superset.embedded.kit import guest_label_hash, usage_cutoff

logger = logging.getLogger(__name__)


def record_embed_event(
    *,
    embed_uuid: str,
    embed_kind: str,
    event: str,
    failure_reason: str | None = None,
    username: str | None = None,
) -> None:
    """Insert one usage row. Failures here never break the caller."""
    # pylint: disable=import-outside-toplevel
    from superset import db
    from superset.models.embedded_kit import EmbedUsageEvent

    try:
        db.session.add(
            EmbedUsageEvent(
                embed_uuid=str(embed_uuid),
                embed_kind=embed_kind,
                event=event,
                failure_reason=failure_reason,
                guest_hash=guest_label_hash(username, str(embed_uuid)),
                created_at=datetime.utcnow(),
            )
        )
        db.session.commit()  # pylint: disable=consider-using-transaction
    except Exception:  # pylint: disable=broad-except
        logger.warning("Could not record embed usage", exc_info=True)
        db.session.rollback()  # pylint: disable=consider-using-transaction


def summarize_usage(rows: list[Any], *, range_key: str) -> dict[str, Any]:
    """Aggregate event rows into the console payload. No username or token."""
    counts: Counter[str] = Counter()
    failures: Counter[str] = Counter()
    last: datetime | None = None
    for row in rows:
        counts[row.event] += 1
        if row.event == "failure" and row.failure_reason:
            failures[row.failure_reason] += 1
        created = getattr(row, "created_at", None)
        if created is not None and (last is None or created > last):
            last = created
    return {
        "range": range_key,
        "tokens_minted": counts.get("mint", 0),
        "loads": counts.get("load", 0),
        "queries": counts.get("query", 0),
        "failed_loads": counts.get("failure", 0),
        "failures": {
            "token_rejected": failures.get("token_rejected", 0),
            "origin_rejected": failures.get("origin_rejected", 0),
            "dataset_not_in_scope": failures.get("dataset_not_in_scope", 0),
            "other": failures.get("other", 0),
        },
        "last_activity": last.isoformat() if last else None,
    }


def range_start(range_key: str, now: datetime | None = None) -> datetime:
    moment = now or datetime.utcnow()
    hours = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30}.get(range_key, 24 * 7)
    return moment - timedelta(hours=hours)


def prune_embed_usage_events(now: datetime | None = None) -> int:
    """Delete usage rows older than 90 days. Returns the deleted count."""
    # pylint: disable=import-outside-toplevel
    from superset import db
    from superset.models.embedded_kit import EmbedUsageEvent

    cutoff = usage_cutoff(now)
    deleted = (
        db.session.query(EmbedUsageEvent)
        .filter(EmbedUsageEvent.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.session.commit()  # pylint: disable=consider-using-transaction
    return int(deleted)
