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
"""Embed configs for the analytics kit. Dashboard embeds stay on EmbeddedDashboard."""

from __future__ import annotations

import uuid

from flask_appbuilder import Model
from sqlalchemy import Column, DateTime, ForeignKey, func, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy_utils import UUIDType

from superset.models.helpers import AuditMixinNullable

DEFAULT_EXPLORE_VIZ_TYPES = (
    "table",
    "big_number_total",
    "echarts_timeseries_bar",
    "echarts_timeseries_line",
    "echarts_area",
    "pie",
)


class EmbedScope(Model, AuditMixinNullable):
    """Named dataset list copied onto a guest token at mint time."""

    __tablename__ = "embed_scopes"

    uuid = Column(UUIDType(binary=True), default=uuid.uuid4, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    datasets = relationship(
        "EmbedScopeDataset",
        cascade="all, delete-orphan",
        back_populates="scope",
    )


class EmbedScopeDataset(Model):
    """SQL dataset membership of a named scope."""

    __tablename__ = "embed_scope_datasets"

    scope_id = Column(
        UUIDType(binary=True),
        ForeignKey("embed_scopes.uuid", ondelete="CASCADE"),
        primary_key=True,
    )
    dataset_id = Column(
        Integer,
        ForeignKey("tables.id", ondelete="CASCADE"),
        primary_key=True,
    )
    scope = relationship("EmbedScope", back_populates="datasets")


class EmbeddedChart(Model, AuditMixinNullable):
    """One embed configuration for a saved chart."""

    __tablename__ = "embedded_charts"

    uuid = Column(UUIDType(binary=True), default=uuid.uuid4, primary_key=True)
    chart_id = Column(
        Integer,
        ForeignKey("slices.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    allow_domain_list = Column(Text, nullable=True)
    guest_token_revoked_before = Column(Integer, nullable=True)
    theme_id = Column(
        Integer,
        ForeignKey("themes.id", ondelete="SET NULL"),
        nullable=True,
    )
    hide_title = Column(Integer, nullable=False, default=0)
    show_download = Column(Integer, nullable=False, default=0)
    filters = Column(Text, nullable=True)
    scope_id = Column(
        UUIDType(binary=True),
        ForeignKey("embed_scopes.uuid", ondelete="SET NULL"),
        nullable=True,
    )

    @property
    def allowed_domains(self) -> list[str]:
        return self.allow_domain_list.split(",") if self.allow_domain_list else []


class EmbeddedExplore(Model, AuditMixinNullable):
    """One Explore lite configuration for a SQL dataset."""

    __tablename__ = "embedded_explores"

    uuid = Column(UUIDType(binary=True), default=uuid.uuid4, primary_key=True)
    dataset_id = Column(
        Integer,
        ForeignKey("tables.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    allow_domain_list = Column(Text, nullable=True)
    guest_token_revoked_before = Column(Integer, nullable=True)
    theme_id = Column(
        Integer,
        ForeignKey("themes.id", ondelete="SET NULL"),
        nullable=True,
    )
    viz_types = Column(Text, nullable=True)
    initial_state = Column(Text, nullable=True)
    filters = Column(Text, nullable=True)
    scope_id = Column(
        UUIDType(binary=True),
        ForeignKey("embed_scopes.uuid", ondelete="SET NULL"),
        nullable=True,
    )

    @property
    def allowed_domains(self) -> list[str]:
        return self.allow_domain_list.split(",") if self.allow_domain_list else []


class EmbedUsageEvent(Model):
    """Append-only embed usage. No token, username, or RLS text."""

    __tablename__ = "embed_usage_events"
    __table_args__ = (
        Index("idx_embed_usage_uuid_created", "embed_uuid", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    embed_uuid = Column(String(64), nullable=False)
    embed_kind = Column(String(32), nullable=False)
    event = Column(String(32), nullable=False)
    failure_reason = Column(String(64), nullable=True)
    guest_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
