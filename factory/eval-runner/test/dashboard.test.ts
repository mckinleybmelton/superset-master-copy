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
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startDashboard } from "../src/dashboard/server.ts";
import { renderReport } from "../src/render.ts";
import type { EvalReport } from "../src/types.ts";

const report: EvalReport = {
  schemaVersion: 1,
  runId: "eval-sample",
  startedAt: "2026-01-02T03:04:05.000Z",
  finishedAt: "2026-01-02T03:04:06.000Z",
  git: { sha: "abc1234", branch: "test", dirty: false },
  runner: { node: "v22.0.0", sdk: "0.6.0", command: "test", trajectory: "listed" },
  summary: {
    passed: 1,
    failed: 1,
    noted: 0,
    blocked: 1,
    fixtures: 1,
    scoredPassRate: 0.5,
    scoredTotal: 2,
  },
  limitations: ["Blocked rows have no score."],
  cases: [
    {
      id: "stage.sample",
      suite: "stage-machine",
      title: "Sample <script>",
      classification: "executed",
      status: "failed",
      durationMs: 3,
      criterion: "show the mismatch",
      scope: "test",
      evidence: null,
      failure: { message: "expected <b>ok</b>", expected: "ok", actual: "bad" },
    },
    {
      id: "fixture.sample",
      suite: "example-fixtures",
      title: "Example payload",
      classification: "example_fixture",
      status: "fixture",
      durationMs: 1,
      criterion: "file shape",
      scope: "not a factory run",
      evidence: { scored: false },
      failure: null,
    },
    {
      id: "trajectory.orchestrator.smoke",
      suite: "model-trajectory",
      title: "smoke",
      classification: "blocked",
      status: "blocked",
      durationMs: 0,
      criterion: "model gate",
      scope: "not executed",
      evidence: { executed: false },
      failure: null,
    },
  ],
};

test("rendered html escapes failure text and separates fixtures", () => {
  const html = renderReport(report);
  assert.match(html, /Sample &lt;script&gt;/);
  assert.equal(html.includes("Sample <script>"), false);
  assert.match(html, /expected &lt;b&gt;ok&lt;\/b&gt;/);
  assert.match(html, /Example fixtures \(not factory run results\)/);
  assert.match(html, /Model trajectory \(not scored unless executed\)/);
  assert.match(html, /50%/);
});

test("dashboard serves the recorded report and rejects path traversal", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "factory-evals-"));
  await mkdir(path.join(dir, "runs", report.runId), { recursive: true });
  const body = `${JSON.stringify(report)}\n`;
  await writeFile(path.join(dir, "latest.json"), body);
  await writeFile(path.join(dir, "runs", report.runId, "report.json"), body);
  const dashboard = await startDashboard({ resultsDir: dir, host: "127.0.0.1", port: 0 });
  try {
    const page = await fetch(dashboard.url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /eval-sample/);
    assert.match(html, /expected &lt;b&gt;ok&lt;\/b&gt;/);

    const api = await fetch(`${dashboard.url}api/report`);
    const json = (await api.json()) as EvalReport;
    assert.equal(json.runId, "eval-sample");
    assert.equal(json.summary.failed, 1);

    const missing = await fetch(`${dashboard.url}api/runs/..%2F..%2Fetc%2Fpasswd`);
    assert.equal(missing.status, 404);

    const emptyDir = await mkdtemp(path.join(tmpdir(), "factory-evals-empty-"));
    const empty = await startDashboard({ resultsDir: emptyDir, host: "127.0.0.1", port: 0 });
    try {
      const blank = await fetch(empty.url);
      const blankHtml = await blank.text();
      assert.match(blankHtml, /No recorded run/);
      assert.equal(blankHtml.includes("eval-sample"), false);
      assert.equal(blankHtml.includes("Scored pass rate"), false);
    } finally {
      await empty.close();
    }
  } finally {
    await dashboard.close();
  }
});
