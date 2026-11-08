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

import { AssertionError } from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { artifactCases } from "./cases/artifacts.ts";
import { fixtureCases } from "./cases/fixtures.ts";
import { intakeCases } from "./cases/intake.ts";
import { stageMachineCases } from "./cases/stageMachine.ts";
import { agentSdkVersion, factoryRoot } from "./paths.ts";
import {
  FACTORY_PEERS,
  applyTrajectoryExecution,
  buildTrajectoryCases,
  credentialPresent,
  evalFileStems,
  listPeerEvals,
} from "./trajectory.ts";
import type {
  CaseDefinition,
  CaseFailure,
  EvalCaseResult,
  EvalReport,
  EvalSummary,
} from "./types.ts";

const execFileAsync = promisify(execFile);

export const LIMITATIONS = [
  "Scored checks execute factory TypeScript: stage tools, Jira intake tools, artifact contract tools, and the skill files those peers follow. They do not call Jira, GitHub, or a model.",
  "Model trajectory files under agents/*/evals are listed by the Agent SDK. Without a Cursor credential they stay blocked and have no score.",
  "fixtures/github/pull_request.labeled.json is an example payload. Its row checks file shape only and is excluded from the scored pass rate.",
  "apply_stage checks the writer and the pr_review pull-request rule. It does not reject hops that skip TRANSITIONS. That gap is a noted limitation, not a pass.",
] as const;

export type RunOptions = {
  factoryRoot?: string;
  includeTrajectory?: boolean;
  trajectoryPayload?: unknown;
  startedAt?: Date;
  git?: EvalReport["git"];
  command?: string;
};

export async function runEvaluation(options: RunOptions = {}): Promise<EvalReport> {
  const root = options.factoryRoot ?? factoryRoot();
  const startedAt = options.startedAt ?? new Date();
  const includeTrajectory = options.includeTrajectory === true;
  const definitions = [
    ...stageMachineCases(),
    ...intakeCases(),
    ...artifactCases(),
    ...fixtureCases(),
  ];
  const cases: EvalCaseResult[] = [];
  for (const definition of definitions) {
    cases.push(await executeCase(definition));
  }
  if (includeTrajectory) {
    cases.push(...(await collectTrajectory(root, options.trajectoryPayload)));
  }
  const finishedAt = new Date();
  const git = options.git ?? (await readGit(root));
  return {
    schemaVersion: 1,
    runId: runId(startedAt, git.sha),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    git,
    runner: {
      node: process.version,
      sdk: agentSdkVersion(root),
      command: options.command ?? "factory-eval",
      trajectory: includeTrajectory
        ? options.trajectoryPayload === undefined
          ? "listed"
          : "executed"
        : "skipped",
    },
    summary: summarize(cases),
    limitations: LIMITATIONS,
    cases,
  };
}

export async function executeCase(definition: CaseDefinition): Promise<EvalCaseResult> {
  const started = performance.now();
  try {
    const outcome = await definition.run();
    return {
      id: definition.id,
      suite: definition.suite,
      title: definition.title,
      classification: definition.classification,
      status: outcome?.status ?? defaultStatus(definition.classification),
      durationMs: elapsed(started),
      criterion: definition.criterion,
      scope: definition.scope,
      evidence: outcome?.evidence ?? null,
      failure: null,
    };
  } catch (error) {
    return {
      id: definition.id,
      suite: definition.suite,
      title: definition.title,
      classification: definition.classification,
      status: "failed",
      durationMs: elapsed(started),
      criterion: definition.criterion,
      scope: definition.scope,
      evidence: null,
      failure: failureOf(error),
    };
  }
}

export function summarize(cases: readonly EvalCaseResult[]): EvalSummary {
  const scored = cases.filter(
    (entry) =>
      entry.classification === "executed" &&
      (entry.status === "passed" || entry.status === "failed"),
  );
  const scoredPassed = scored.filter((entry) => entry.status === "passed").length;
  return {
    passed: cases.filter((entry) => entry.status === "passed").length,
    failed: cases.filter((entry) => entry.status === "failed").length,
    noted: cases.filter((entry) => entry.status === "noted").length,
    blocked: cases.filter((entry) => entry.status === "blocked").length,
    fixtures: cases.filter((entry) => entry.classification === "example_fixture").length,
    scoredPassRate: scored.length === 0 ? null : scoredPassed / scored.length,
    scoredTotal: scored.length,
  };
}

export async function writeReport(report: EvalReport, resultsDir: string): Promise<void> {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  const runDir = path.join(resultsDir, "runs", report.runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "report.json"), body, "utf8");
  await writeFile(path.join(resultsDir, "latest.json"), body, "utf8");
}

async function collectTrajectory(root: string, payload: unknown): Promise<EvalCaseResult[]> {
  const credentials = credentialPresent();
  const rows: EvalCaseResult[] = [];
  for (const peer of FACTORY_PEERS) {
    let listed: Awaited<ReturnType<typeof listPeerEvals>> = [];
    let listError: string | undefined;
    let evalFiles: string[] = [];
    try {
      evalFiles = await evalFileStems(peer, root);
      listed = await listPeerEvals(peer, root);
    } catch (error) {
      listError = error instanceof Error ? error.message : String(error);
    }
    rows.push(
      ...buildTrajectoryCases({
        peer,
        evalFiles,
        listed,
        credentials,
        listError,
      }),
    );
  }
  if (payload === undefined) {
    return rows;
  }
  return applyTrajectoryExecution(rows, payload);
}

function defaultStatus(classification: CaseDefinition["classification"]): EvalCaseResult["status"] {
  switch (classification) {
    case "executed":
      return "passed";
    case "limitation":
      return "noted";
    case "blocked":
      return "blocked";
    case "example_fixture":
      return "fixture";
  }
}

function failureOf(error: unknown): CaseFailure {
  if (error instanceof AssertionError) {
    return {
      message: error.message,
      expected: "expected" in error ? error.expected : undefined,
      actual: "actual" in error ? error.actual : undefined,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}

function runId(started: Date, sha: string | null): string {
  const stamp = started.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `eval-${stamp}-${sha ? sha.slice(0, 7) : "nosha"}`;
}

async function readGit(root: string): Promise<EvalReport["git"]> {
  const sha = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await git(root, ["status", "--short"]);
  return {
    sha,
    branch,
    dirty: status !== null && status.length > 0,
  };
}

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root });
    const text = stdout.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
