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

/** How a row should be read. Scored rows are the only pass-rate inputs. */
export type CaseClassification =
  | "executed"
  | "limitation"
  | "blocked"
  | "example_fixture";

export type CaseStatus = "passed" | "failed" | "noted" | "blocked" | "fixture";

export type CaseFailure = {
  message: string;
  expected?: unknown;
  actual?: unknown;
};

export type EvalCaseResult = {
  id: string;
  suite: string;
  title: string;
  classification: CaseClassification;
  status: CaseStatus;
  durationMs: number;
  criterion: string;
  scope: string;
  evidence: unknown;
  failure: CaseFailure | null;
};

export type EvalSummary = {
  /** Executed cases that passed. */
  passed: number;
  /** Any case whose status is failed, including a broken example fixture. */
  failed: number;
  noted: number;
  blocked: number;
  fixtures: number;
  /** passed / (passed + failed) among classification "executed" only. */
  scoredPassRate: number | null;
  scoredTotal: number;
};

export type EvalReport = {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  finishedAt: string;
  git: {
    sha: string | null;
    branch: string | null;
    dirty: boolean;
  };
  runner: {
    node: string;
    sdk: string;
    command: string;
    trajectory: "skipped" | "listed" | "executed";
  };
  summary: EvalSummary;
  limitations: readonly string[];
  cases: EvalCaseResult[];
};

export type CaseOutcome = {
  status?: CaseStatus;
  evidence?: unknown;
};

export type CaseDefinition = {
  id: string;
  suite: string;
  title: string;
  classification: CaseClassification;
  criterion: string;
  scope: string;
  run: () => Promise<CaseOutcome | void>;
};
