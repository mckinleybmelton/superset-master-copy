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
"""The kit migration is the single Alembic head and reverses cleanly."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "superset"
    / "migrations"
    / "versions"
    / "2026-11-06_12-00_f6e1b9c4a872_add_embedded_analytics_kit.py"
)
KIT_TABLES = {
    "embed_scopes",
    "embed_scope_datasets",
    "embedded_charts",
    "embedded_explores",
    "embed_usage_events",
}


def _load_migration():
    spec = importlib.util.spec_from_file_location("kit_migration", MIGRATION)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_kit_migration_is_the_only_head() -> None:
    script = ScriptDirectory(str(MIGRATION.parents[1]))
    assert script.get_heads() == ["f6e1b9c4a872"]


def test_kit_migration_upgrade_and_downgrade() -> None:
    module = _load_migration()
    engine = create_engine("sqlite://", future=True)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE slices (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE tables (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE themes (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            module.upgrade()
        names = set(inspect(connection).get_table_names())
        assert KIT_TABLES <= names
        with Operations.context(context):
            module.downgrade()
        names = set(inspect(connection).get_table_names())
        assert not KIT_TABLES & names
        assert {"slices", "tables", "themes"} <= names
