/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { executeCase, runEvaluation } from "../src/run.ts";

test("scored factory checks pass and do not invent trajectory scores", async () => {
  const report = await runEvaluation({
    includeTrajectory: false,
    git: { sha: "abc1234", branch: "test", dirty: false },
    startedAt: new Date("2026-01-02T03:04:05.000Z"),
  });

  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.scoredPassRate, 1);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.runner.trajectory, "skipped");
  assert.equal(report.cases.some((entry) => entry.suite === "model-trajectory"), false);

  const noted = report.cases.find((entry) => entry.id === "stage.adjacency_not_enforced");
  assert.ok(noted);
  assert.equal(noted.status, "noted");
  assert.equal(noted.classification, "limitation");

  const fixture = report.cases.find((entry) => entry.id === "fixture.github.pull_request_labeled");
  assert.ok(fixture);
  assert.equal(fixture.status, "fixture");
  assert.equal(fixture.classification, "example_fixture");
  assert.equal(report.summary.fixtures, 1);
  assert.equal(
    report.summary.scoredTotal,
    report.cases.filter((entry) => entry.classification === "executed").length,
  );
});

test("a failed assertion keeps expected and actual", async () => {
  const result = await executeCase({
    id: "sample.mismatch",
    suite: "sample",
    title: "mismatch",
    classification: "executed",
    criterion: "1 equals 2",
    scope: "unit",
    async run() {
      assert.equal(1, 2);
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure?.expected, 2);
  assert.equal(result.failure?.actual, 1);
});
