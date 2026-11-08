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

import type { EvalCaseResult, EvalReport } from "./types.ts";

export function renderReport(report: EvalReport | null, errorMessage?: string): string {
  if (!report) {
    return page({
      title: "Factory eval results",
      body: `
        <header>
          <p class="eyebrow">Superset software factory</p>
          <h1>Evaluation results</h1>
        </header>
        <section class="banner">
          <h2>No recorded run</h2>
          <p>${esc(errorMessage ?? "eval-results/latest.json is not in this directory.")}</p>
          <p>From <code>factory/</code>, run <code>npm run evals</code>, then reload this page.</p>
        </section>`,
    });
  }

  const groups = groupCases(report.cases);
  const failures = report.cases.filter((entry) => entry.status === "failed");
  const rate =
    report.summary.scoredPassRate === null
      ? "n/a"
      : `${Math.round(report.summary.scoredPassRate * 1000) / 10}%`;

  return page({
    title: `Factory eval ${report.runId}`,
    body: `
      <header>
        <p class="eyebrow">Superset software factory</p>
        <h1>Evaluation results</h1>
        <p class="meta">
          <span>${esc(report.runId)}</span>
          <span>git ${esc(report.git.sha ?? "unknown")}${report.git.dirty ? " (dirty worktree when recorded)" : ""}</span>
          <span>${esc(report.git.branch ?? "unknown branch")}</span>
          <span>${esc(report.startedAt)}</span>
          <span>Node ${esc(report.runner.node)}</span>
          <span>agent-sdk ${esc(report.runner.sdk)}</span>
          <span>trajectory ${esc(report.runner.trajectory)}</span>
        </p>
      </header>
      <section class="stats" aria-label="Run summary">
        ${stat("Scored pass rate", rate, "Executed checks only")}
        ${stat("Passed", String(report.summary.passed), "All passed rows")}
        ${stat("Failed", String(report.summary.failed), "Includes broken fixtures")}
        ${stat("Noted", String(report.summary.noted), "Limitations, not passes")}
        ${stat("Blocked", String(report.summary.blocked), "Not executed")}
        ${stat("Fixtures", String(report.summary.fixtures), "Example files, not runs")}
      </section>
      <section>
        <h2>Scope</h2>
        <ul>
          ${report.limitations.map((item) => `<li>${esc(item)}</li>`).join("")}
        </ul>
      </section>
      ${failures.length === 0 ? "" : renderGroup("Failures", failures, true)}
      ${groups.map(([suite, rows]) => renderGroup(suiteTitle(suite), rows, false)).join("")}
      <footer>
        <p>Regenerate with <code>npm run evals</code> from <code>factory/</code>. Serve this view with <code>npm run evals:dashboard</code>.</p>
      </footer>`,
  });
}

function renderGroup(title: string, rows: readonly EvalCaseResult[], openFailures: boolean): string {
  return `
    <section>
      <h2>${esc(title)}</h2>
      <p class="count">${rows.length} ${rows.length === 1 ? "row" : "rows"}</p>
      ${rows.map((row) => renderCase(row, openFailures || row.status === "failed")).join("")}
    </section>`;
}

function renderCase(row: EvalCaseResult, open: boolean): string {
  const search = `${row.id} ${row.title} ${row.suite} ${row.status} ${row.classification}`.toLowerCase();
  return `
    <details class="case status-${esc(row.status)}" data-search="${esc(search)}" ${open ? "open" : ""}>
      <summary>
        <span class="status">${esc(row.status)}</span>
        <span class="case-title">${esc(row.title)}</span>
        <span class="case-id">${esc(row.id)}</span>
        <span class="duration">${row.durationMs} ms</span>
      </summary>
      <div class="case-body">
        <p><strong>Criterion.</strong> ${esc(row.criterion)}</p>
        <p><strong>Scope.</strong> ${esc(row.scope)}</p>
        <p><strong>Classification.</strong> ${esc(row.classification)}</p>
        ${
          row.failure
            ? `<h3>Failure</h3>
               <p class="failure">${esc(row.failure.message)}</p>
               ${row.failure.expected === undefined ? "" : `<h3>Expected</h3><pre>${esc(json(row.failure.expected))}</pre>`}
               ${row.failure.actual === undefined ? "" : `<h3>Actual</h3><pre>${esc(json(row.failure.actual))}</pre>`}`
            : ""
        }
        ${row.evidence === null || row.evidence === undefined ? "" : `<h3>Evidence</h3><pre>${esc(json(row.evidence))}</pre>`}
      </div>
    </details>`;
}

function page(input: { title: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1c1917;
      --muted: #57534e;
      --line: #e7e5e4;
      --paper: #fafaf9;
      --card: #ffffff;
      --pass: #166534;
      --fail: #9f1239;
      --noted: #92400e;
      --blocked: #3f3f46;
      --fixture: #1e3a5f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.45;
    }
    header, section, footer { max-width: 980px; margin: 0 auto; padding: 0 1.25rem; }
    header { padding-top: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 650; margin: 0.2rem 0 0.6rem; }
    h2 { font-size: 1.15rem; margin: 1.5rem 0 0.4rem; }
    h3 { font-size: 0.95rem; margin: 0.8rem 0 0.3rem; }
    .eyebrow { margin: 0; letter-spacing: 0.04em; text-transform: uppercase; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; color: var(--muted); }
    .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; color: var(--muted); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.85rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; padding-top: 1.25rem; }
    .stat { background: var(--card); border: 1px solid var(--line); padding: 0.75rem 0.85rem; }
    .stat b { display: block; font-size: 1.4rem; font-family: ui-sans-serif, system-ui, sans-serif; }
    .stat span, .count { color: var(--muted); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.8rem; }
    .banner, .case { background: var(--card); border: 1px solid var(--line); padding: 0.8rem 1rem; margin: 0.6rem 0; }
    .case summary { cursor: pointer; display: grid; grid-template-columns: 6.5rem 1fr auto auto; gap: 0.75rem; align-items: baseline; }
    .status { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .status-passed .status { color: var(--pass); }
    .status-failed .status { color: var(--fail); }
    .status-noted .status { color: var(--noted); }
    .status-blocked .status { color: var(--blocked); }
    .status-fixture .status { color: var(--fixture); }
    .case-id, .duration { font-family: ui-monospace, monospace; font-size: 0.75rem; color: var(--muted); }
    .failure { color: var(--fail); }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--paper); border: 1px solid var(--line); padding: 0.6rem; font-size: 0.8rem; }
    code { font-family: ui-monospace, monospace; font-size: 0.9em; }
    footer { padding-bottom: 3rem; color: var(--muted); }
    label.search { display: block; margin-top: 1rem; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.85rem; }
    input[type="search"] { width: min(100%, 24rem); margin-top: 0.3rem; padding: 0.4rem 0.5rem; border: 1px solid var(--line); font: inherit; }
    @media (max-width: 720px) {
      .case summary { grid-template-columns: 1fr; gap: 0.15rem; }
    }
  </style>
</head>
<body>
  <label class="search" style="max-width:980px;margin:1rem auto 0;padding:0 1.25rem;display:block">
    Filter rows
    <input id="filter" type="search" placeholder="id, suite, or status">
  </label>
  ${input.body}
  <script>
    const filter = document.getElementById("filter");
    filter?.addEventListener("input", () => {
      const query = filter.value.trim().toLowerCase();
      document.querySelectorAll("[data-search]").forEach((node) => {
        const haystack = node.getAttribute("data-search") || "";
        node.hidden = query.length > 0 && !haystack.includes(query);
      });
    });
  </script>
</body>
</html>`;
}

function stat(label: string, value: string, note: string): string {
  return `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b><span>${esc(note)}</span></div>`;
}

function groupCases(cases: readonly EvalCaseResult[]): [string, EvalCaseResult[]][] {
  const groups = new Map<string, EvalCaseResult[]>();
  for (const entry of cases) {
    const rows = groups.get(entry.suite) ?? [];
    rows.push(entry);
    groups.set(entry.suite, rows);
  }
  return [...groups.entries()];
}

function suiteTitle(suite: string): string {
  switch (suite) {
    case "stage-machine":
      return "Stage machine";
    case "jira-intake":
      return "Jira intake";
    case "artifact-contracts":
      return "Artifact contracts";
    case "artifact-procedures":
      return "Artifact procedures";
    case "model-trajectory":
      return "Model trajectory (not scored unless executed)";
    case "example-fixtures":
      return "Example fixtures (not factory run results)";
    default:
      return suite;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
