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
import { applyTrajectoryExecution, buildTrajectoryCases } from "../src/trajectory.ts";

test("listing trajectory files does not assign a model score", () => {
  const cases = buildTrajectoryCases({
    peer: "orchestrator",
    evalFiles: ["smoke.eval.ts"],
    listed: [
      {
        id: "smoke",
        fileId: "smoke",
        description: "Intake smoke",
        tags: ["smoke"],
      },
    ],
    credentials: false,
  });
  assert.equal(cases[0]?.status, "passed");
  assert.equal(cases[0]?.id, "trajectory.orchestrator.discovered");
  const smoke = cases.find((entry) => entry.id === "trajectory.orchestrator.smoke");
  assert.ok(smoke);
  assert.equal(smoke.status, "blocked");
  assert.equal(smoke.classification, "blocked");
  assert.equal(smoke.failure, null);
});

test("a missing eval file is a discovery failure", () => {
  const cases = buildTrajectoryCases({
    peer: "product",
    evalFiles: ["smoke.eval.ts"],
    listed: [],
    credentials: false,
  });
  assert.equal(cases[0]?.status, "failed");
  assert.match(cases[0]?.failure?.message ?? "", /smoke/);
  assert.equal(cases.length, 1);
});

test("an Agent SDK result file replaces blocked rows with the real verdict", () => {
  const listed = buildTrajectoryCases({
    peer: "reviewer",
    evalFiles: ["smoke.eval.ts"],
    listed: [{ id: "smoke", description: "packet" }],
    credentials: true,
  });
  const applied = applyTrajectoryExecution(listed, {
    ok: false,
    results: [
      {
        id: "smoke",
        ok: false,
        verdict: "failed",
        durationMs: 12,
        error: "gate missed",
        assertions: [{ name: "calledTool", passed: false, detail: "review_packet_contract" }],
      },
    ],
  });
  const smoke = applied.find((entry) => entry.id === "trajectory.reviewer.smoke");
  assert.ok(smoke);
  assert.equal(smoke.status, "failed");
  assert.equal(smoke.classification, "executed");
  assert.match(smoke.failure?.message ?? "", /gate missed/);
});
