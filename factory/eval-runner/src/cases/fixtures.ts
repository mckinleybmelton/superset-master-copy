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
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asRecord } from "../host.ts";
import { factoryRoot } from "../paths.ts";
import type { CaseDefinition } from "../types.ts";

const RELATIVE_PATH = "fixtures/github/pull_request.labeled.json";

export function fixtureCases(): CaseDefinition[] {
  return [
    {
      id: "fixture.github.pull_request_labeled",
      suite: "example-fixtures",
      title: "Example GitHub labeled payload parses",
      classification: "example_fixture",
      criterion:
        "The committed example payload has a pull request URL, the factory label, and a placeholder SHA. This is a file-shape check.",
      scope:
        "Example fixture only. It is not a pull request the factory opened, and it is not a review result. CI status is not present in the file and is not inferred.",
      async run() {
        const absolute = path.join(factoryRoot(), RELATIVE_PATH);
        const parsed = JSON.parse(await readFile(absolute, "utf8")) as unknown;
        const body = asRecord(parsed, "fixture");
        const pullRequest = asRecord(body.pull_request, "pull_request");
        const label = asRecord(body.label, "label");
        const repository = asRecord(body.repository, "repository");
        const head = asRecord(pullRequest.head, "head");
        assert.equal(body.action, "labeled");
        const base = asRecord(pullRequest.base, "base");
        assert.match(String(pullRequest.html_url), /^https:\/\/github\.com\/.+\/pull\/\d+$/);
        assert.equal(label.name, "factory");
        assert.equal(typeof repository.full_name, "string");
        assert.equal(head.sha, "0000000000000000000000000000000000000001");
        assert.equal(base.sha, "0000000000000000000000000000000000000000");
        return {
          status: "fixture",
          evidence: {
            path: RELATIVE_PATH,
            action: body.action,
            htmlUrl: pullRequest.html_url,
            label: label.name,
            repository: repository.full_name,
            headSha: head.sha,
            baseSha: base.sha,
            placeholderSha: true,
            scored: false,
          },
        };
      },
    },
  ];
}
