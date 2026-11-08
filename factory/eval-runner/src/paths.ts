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

import path from "node:path";
import { readFileSync } from "node:fs";

/** factory/ directory that contains agents, packages, and fixtures. */
export function factoryRoot(): string {
  return path.resolve(import.meta.dirname, "../..");
}

export function defaultResultsDir(root = factoryRoot()): string {
  return path.join(root, "eval-results");
}

export function agentSdkVersion(root = factoryRoot()): string {
  try {
    const file = path.join(root, "node_modules/@grok/agent-sdk/package.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function agentSdkBin(root = factoryRoot()): string {
  return path.join(root, "node_modules/@grok/agent-sdk/dist/bin/agent-serve.js");
}
