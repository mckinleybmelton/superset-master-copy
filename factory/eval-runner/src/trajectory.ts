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

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { agentSdkBin, factoryRoot } from "./paths.ts";
import type { EvalCaseResult } from "./types.ts";

export const FACTORY_PEERS = [
  "orchestrator",
  "product",
  "design",
  "architect",
  "implementer",
  "reviewer",
] as const;

export type ListedEval = {
  id: string;
  fileId?: string;
  path?: string;
  description?: string;
  tags?: string[];
};

const SUITE = "model-trajectory";
const BLOCKED_SCOPE =
  "Listed from the Agent SDK eval files. Not executed in this run, so there is no pass, fail, or score. A model turn needs a Cursor credential (CURSOR_API_KEY, CURSOR_API_KEY_FILE, or CURSOR_SERVICE_ACCOUNT_KEY).";

export function credentialPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.CURSOR_API_KEY || env.CURSOR_API_KEY_FILE || env.CURSOR_SERVICE_ACCOUNT_KEY,
  );
}

export function buildTrajectoryCases(input: {
  peer: string;
  evalFiles: readonly string[];
  listed: readonly ListedEval[];
  credentials: boolean;
  listError?: string;
}): EvalCaseResult[] {
  const discovery = discoveryCase(input);
  if (input.listError) {
    return [discovery];
  }
  const blocked = input.listed.map((item) => blockedCase(input.peer, item, input.credentials));
  return [discovery, ...blocked];
}

export function isFactoryPeer(value: string): value is (typeof FACTORY_PEERS)[number] {
  return (FACTORY_PEERS as readonly string[]).includes(value);
}

/**
 * Apply one Agent SDK batch to a single peer.
 * Eval ids such as `smoke` are repeated across peers, so matching on id alone
 * would copy one peer's verdict onto the others.
 */
export function applyTrajectoryExecution(
  cases: readonly EvalCaseResult[],
  payload: unknown,
  peer: string,
): EvalCaseResult[] {
  const results = executionRows(payload);
  const byId = new Map(results.map((row) => [row.id, row]));
  return cases.map((entry) => {
    if (entry.classification !== "blocked" || !entry.evidence || typeof entry.evidence !== "object") {
      return entry;
    }
    const evidence = entry.evidence as { evalId?: unknown; peer?: unknown };
    if (evidence.peer !== peer || typeof evidence.evalId !== "string") {
      return entry;
    }
    const row = byId.get(evidence.evalId);
    if (!row) {
      return entry;
    }
    return executedTrajectoryCase(entry, row);
  });
}

export async function listPeerEvals(peer: string, root = factoryRoot()): Promise<ListedEval[]> {
  const peerDir = path.join(root, "agents", peer);
  const stdout = await runSdk(
    [agentSdkBin(root), "eval", "--dir", peerDir, "--list", "--json"],
    root,
  );
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`eval --list for ${peer} did not return an array`);
  }
  return parsed.map((item) => {
    const row = item as ListedEval;
    if (!row || typeof row.id !== "string") {
      throw new Error(`eval --list for ${peer} returned an item without an id`);
    }
    return row;
  });
}

export async function evalFileStems(peer: string, root = factoryRoot()): Promise<string[]> {
  const dir = path.join(root, "agents", peer, "evals");
  const names = await readdir(dir);
  return names.filter((name) => name.endsWith(".eval.ts")).sort();
}

async function runSdk(args: string[], cwd: string): Promise<string> {
  const child = spawn(process.execPath, args, {
    cwd,
    signal: AbortSignal.timeout(30_000),
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    throw new Error(Buffer.concat(stderr).toString("utf8").trim() || Buffer.concat(stdout).toString("utf8"));
  }
  return Buffer.concat(stdout).toString("utf8");
}

function discoveryCase(input: {
  peer: string;
  evalFiles: readonly string[];
  listed: readonly ListedEval[];
  listError?: string;
}): EvalCaseResult {
  const stems = input.evalFiles.map((name) => name.replace(/\.eval\.ts$/, ""));
  const listedIds = new Set(
    input.listed.flatMap((item) => [item.id, item.fileId].filter((value): value is string => Boolean(value))),
  );
  const missing = stems.filter((stem) => !listedIds.has(stem));
  const failed = Boolean(input.listError) || missing.length > 0;
  return {
    id: `trajectory.${input.peer}.discovered`,
    suite: SUITE,
    title: `${input.peer} eval files are listed by the Agent SDK`,
    classification: "executed",
    status: failed ? "failed" : "passed",
    durationMs: 0,
    criterion: "Every agents/<peer>/evals/*.eval.ts stem appears in `agent-sdk eval --list`.",
    scope:
      "Discovery only. A passing row means the file is registered. It does not mean the model trajectory passed.",
    evidence: {
      peer: input.peer,
      files: [...input.evalFiles],
      listedIds: [...listedIds],
      missing,
      listError: input.listError ?? null,
    },
    failure: failed
      ? {
          message: input.listError ?? `Agent SDK did not list: ${missing.join(", ")}`,
          expected: stems,
          actual: [...listedIds],
        }
      : null,
  };
}

function blockedCase(peer: string, item: ListedEval, credentials: boolean): EvalCaseResult {
  const safeId = item.id.replace(/[^a-zA-Z0-9._-]+/g, ".");
  return {
    id: `trajectory.${peer}.${safeId}`,
    suite: SUITE,
    title: item.description?.trim() || `${peer} ${item.id}`,
    classification: "blocked",
    status: "blocked",
    durationMs: 0,
    criterion: "Model trajectory gate defined for this peer.",
    scope: BLOCKED_SCOPE,
    evidence: {
      peer,
      evalId: item.id,
      tags: item.tags ?? [],
      description: item.description ?? null,
      path: item.path ?? null,
      credentialPresent: credentials,
      executed: false,
    },
    failure: null,
  };
}

type ExecutionRow = {
  id: string;
  verdict: string;
  ok: boolean;
  durationMs: number | null;
  error: string | null;
  assertions: unknown;
};

function executionRows(payload: unknown): ExecutionRow[] {
  if (payload === null || typeof payload !== "object" || !("results" in payload)) {
    throw new Error("Agent SDK eval JSON has no results array");
  }
  const results = (payload as { results: unknown }).results;
  if (!Array.isArray(results)) {
    throw new Error("Agent SDK eval JSON results was not an array");
  }
  return results.flatMap((item) => {
    if (item === null || typeof item !== "object" || !("id" in item)) {
      return [];
    }
    const row = item as {
      id?: unknown;
      verdict?: unknown;
      ok?: unknown;
      durationMs?: unknown;
      error?: unknown;
      assertions?: unknown;
    };
    if (typeof row.id !== "string") {
      return [];
    }
    const verdict = typeof row.verdict === "string" ? row.verdict : row.ok === true ? "passed" : "failed";
    return [
      {
        id: row.id,
        verdict,
        ok: row.ok === true,
        durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
        error: typeof row.error === "string" ? row.error : null,
        assertions: row.assertions ?? [],
      },
    ];
  });
}

function executedTrajectoryCase(entry: EvalCaseResult, row: ExecutionRow): EvalCaseResult {
  if (row.verdict === "passed") {
    return {
      ...entry,
      classification: "executed",
      status: "passed",
      durationMs: row.durationMs ?? entry.durationMs,
      scope: "Executed by the Agent SDK. Verdict passed is the harness result for this case.",
      evidence: { ...(entry.evidence as object), executed: true, verdict: row.verdict, assertions: row.assertions },
      failure: null,
    };
  }
  if (row.verdict === "scored" || row.verdict === "skipped") {
    return {
      ...entry,
      classification: "executed",
      status: "noted",
      durationMs: row.durationMs ?? entry.durationMs,
      scope:
        row.verdict === "skipped"
          ? "The Agent SDK skipped this case. It is not counted as a pass or a hard failure."
          : "The Agent SDK returned a soft scored verdict. It is not counted as a hard pass or fail.",
      evidence: { ...(entry.evidence as object), executed: true, verdict: row.verdict, assertions: row.assertions },
      failure: null,
    };
  }
  return {
    ...entry,
    classification: "executed",
    status: "failed",
    durationMs: row.durationMs ?? entry.durationMs,
    scope: "Executed by the Agent SDK. The harness reported a failed gate.",
    evidence: { ...(entry.evidence as object), executed: true, verdict: row.verdict, assertions: row.assertions },
    failure: {
      message: row.error ?? `Agent SDK verdict ${row.verdict} for ${row.id}`,
      actual: row.assertions,
    },
  };
}
