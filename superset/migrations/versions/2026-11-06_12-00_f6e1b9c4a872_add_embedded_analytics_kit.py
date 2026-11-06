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
"""add embedded analytics kit tables

Revision ID: f6e1b9c4a872
Revises: 1072de5ed955, 3740c7bcb2c6, b8f3a2c91d64, d7cecc48bd55, e4a7c2b9d1f3
Create Date: 2026-11-06 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy_utils import UUIDType

revision = "f6e1b9c4a872"
down_revision = (
    "1072de5ed955",
    "3740c7bcb2c6",
    "b8f3a2c91d64",
    "d7cecc48bd55",
    "e4a7c2b9d1f3",
)


def upgrade() -> None:
    op.create_table(
        "embed_scopes",
        sa.Column("created_on", sa.DateTime(), nullable=True),
        sa.Column("changed_on", sa.DateTime(), nullable=True),
        sa.Column("uuid", UUIDType(binary=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_fk", sa.Integer(), nullable=True),
        sa.Column("changed_by_fk", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "embed_scope_datasets",
        sa.Column("scope_id", UUIDType(binary=True), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["tables.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["scope_id"], ["embed_scopes.uuid"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("scope_id", "dataset_id"),
    )
    op.create_table(
        "embedded_charts",
        sa.Column("created_on", sa.DateTime(), nullable=True),
        sa.Column("changed_on", sa.DateTime(), nullable=True),
        sa.Column("uuid", UUIDType(binary=True), nullable=False),
        sa.Column("chart_id", sa.Integer(), nullable=False),
        sa.Column("allow_domain_list", sa.Text(), nullable=True),
        sa.Column("guest_token_revoked_before", sa.Integer(), nullable=True),
        sa.Column("theme_id", sa.Integer(), nullable=True),
        sa.Column("hide_title", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("show_download", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filters", sa.Text(), nullable=True),
        sa.Column("scope_id", UUIDType(binary=True), nullable=True),
        sa.Column("created_by_fk", sa.Integer(), nullable=True),
        sa.Column("changed_by_fk", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["chart_id"], ["slices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["scope_id"], ["embed_scopes.uuid"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["theme_id"], ["themes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("chart_id"),
    )
    op.create_table(
        "embedded_explores",
        sa.Column("created_on", sa.DateTime(), nullable=True),
        sa.Column("changed_on", sa.DateTime(), nullable=True),
        sa.Column("uuid", UUIDType(binary=True), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("allow_domain_list", sa.Text(), nullable=True),
        sa.Column("guest_token_revoked_before", sa.Integer(), nullable=True),
        sa.Column("theme_id", sa.Integer(), nullable=True),
        sa.Column("viz_types", sa.Text(), nullable=True),
        sa.Column("initial_state", sa.Text(), nullable=True),
        sa.Column("filters", sa.Text(), nullable=True),
        sa.Column("scope_id", UUIDType(binary=True), nullable=True),
        sa.Column("created_by_fk", sa.Integer(), nullable=True),
        sa.Column("changed_by_fk", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["tables.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["scope_id"], ["embed_scopes.uuid"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["theme_id"], ["themes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("dataset_id"),
    )
    op.create_table(
        "embed_usage_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("embed_uuid", sa.String(length=64), nullable=False),
        sa.Column("embed_kind", sa.String(length=32), nullable=False),
        sa.Column("event", sa.String(length=32), nullable=False),
        sa.Column("failure_reason", sa.String(length=64), nullable=True),
        sa.Column("guest_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_embed_usage_uuid_created",
        "embed_usage_events",
        ["embed_uuid", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_embed_usage_uuid_created", table_name="embed_usage_events")
    op.drop_table("embed_usage_events")
    op.drop_table("embedded_explores")
    op.drop_table("embedded_charts")
    op.drop_table("embed_scope_datasets")
    op.drop_table("embed_scopes")
