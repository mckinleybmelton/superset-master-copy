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

import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultResultsDir, factoryRoot } from "./paths.ts";
import { runEvaluation, writeReport } from "./run.ts";
import { FACTORY_PEERS, isFactoryPeer } from "./trajectory.ts";

type Flags = {
  out: string;
  skipTrajectory: boolean;
  trajectoryFile: string | null;
  trajectoryPeer: string | null;
  help: boolean;
};

const flags = parseArgs(process.argv.slice(2));
if (flags.help) {
  process.stdout.write(`Usage: npm run evals -- [--out dir] [--skip-trajectory] [--trajectory-peer <peer> --trajectory-file results.json]

Writes factory/eval-results/latest.json and runs/<runId>/report.json.
Scored checks call factory tools in-process. Model trajectory evals are listed
and left blocked unless --trajectory-file is paired with --trajectory-peer.
Peers: ${FACTORY_PEERS.join(", ")}.
`);
  process.exit(0);
}

const root = factoryRoot();
const payload = flags.trajectoryFile
  ? JSON.parse(await readFile(path.resolve(root, flags.trajectoryFile), "utf8"))
  : undefined;
const report = await runEvaluation({
  factoryRoot: root,
  includeTrajectory: !flags.skipTrajectory,
  trajectoryPayload: payload,
  trajectoryPeer: flags.trajectoryPeer ?? undefined,
  command: commandOf(flags),
});
await writeReport(report, flags.out);
process.stdout.write(
  `${report.runId} scored ${report.summary.scoredPassRate === null ? "n/a" : report.summary.scoredPassRate} passed=${report.summary.passed} failed=${report.summary.failed} noted=${report.summary.noted} blocked=${report.summary.blocked} fixtures=${report.summary.fixtures}\n`,
);
process.stdout.write(`${path.join(flags.out, "latest.json")}\n`);
process.exit(report.summary.failed > 0 ? 1 : 0);

function parseArgs(argv: string[]): Flags {
  const parsed: Flags = {
    out: defaultResultsDir(),
    skipTrajectory: false,
    trajectoryFile: null,
    trajectoryPeer: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--skip-trajectory") {
      parsed.skipTrajectory = true;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--out requires a directory");
      }
      parsed.out = path.resolve(value);
      index += 1;
    } else if (arg === "--trajectory-file") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--trajectory-file requires a path");
      }
      parsed.trajectoryFile = value;
      index += 1;
    } else if (arg === "--trajectory-peer") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--trajectory-peer requires a peer slug");
      }
      parsed.trajectoryPeer = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (parsed.skipTrajectory && (parsed.trajectoryFile || parsed.trajectoryPeer)) {
    throw new Error("--skip-trajectory cannot be combined with --trajectory-file");
  }
  if (parsed.trajectoryFile && !parsed.trajectoryPeer) {
    throw new Error(
      "--trajectory-file requires --trajectory-peer. Eval ids such as smoke exist on more than one peer.",
    );
  }
  if (parsed.trajectoryPeer && !parsed.trajectoryFile) {
    throw new Error("--trajectory-peer requires --trajectory-file");
  }
  if (parsed.trajectoryPeer && !isFactoryPeer(parsed.trajectoryPeer)) {
    throw new Error(
      `Unknown peer ${parsed.trajectoryPeer}. Expected one of ${FACTORY_PEERS.join(", ")}.`,
    );
  }
  return parsed;
}

function commandOf(flags: Flags): string {
  if (flags.skipTrajectory) {
    return "npm run evals -- --skip-trajectory";
  }
  if (flags.trajectoryFile && flags.trajectoryPeer) {
    return `npm run evals -- --trajectory-peer ${flags.trajectoryPeer} --trajectory-file ${flags.trajectoryFile}`;
  }
  return "npm run evals";
}
