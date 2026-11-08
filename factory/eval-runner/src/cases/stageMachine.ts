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
import { FACTORY_STAGES } from "@superset-factory/core";
import type { FactoryStage, StageActor } from "@superset-factory/core";
import applyStageTool from "../../../packages/core/tools/apply_stage.ts";
import assertStageTool from "../../../packages/core/tools/assert_stage.ts";
import getStageTool from "../../../packages/core/tools/get_stage.ts";
import routeStageTool from "../../../packages/core/tools/route_for_stage.ts";
import { asRecord, asTool, evalHost } from "../host.ts";
import type { CaseDefinition } from "../types.ts";

/**
 * Documented writer matrix from factory/AGENTS.md and factory-stages.md.
 * Kept independent of STAGE_WRITERS so a drift in the planner fails this suite.
 */
const SPEC_WRITERS: Record<FactoryStage, readonly StageActor[]> = {
  prd_draft: ["orchestrator", "product", "human"],
  prd_review: ["product"],
  design_draft: ["product", "human"],
  design_review: ["design"],
  architecture_draft: ["product", "human"],
  architecture_review: ["architect"],
  implementation: ["product", "human"],
  pr_review: ["implementer"],
  done: ["product", "human"],
};

const SPEC_ROUTE: Record<FactoryStage, { peer: string | null; gate: boolean }> = {
  prd_draft: { peer: "product", gate: false },
  prd_review: { peer: null, gate: true },
  design_draft: { peer: "design", gate: false },
  design_review: { peer: null, gate: true },
  architecture_draft: { peer: "architect", gate: false },
  architecture_review: { peer: null, gate: true },
  implementation: { peer: "implementer", gate: false },
  pr_review: { peer: null, gate: true },
  done: { peer: null, gate: true },
};

const ACTORS: readonly StageActor[] = [
  "orchestrator",
  "product",
  "design",
  "architect",
  "implementer",
  "reviewer",
  "human",
];

const SUITE = "stage-machine";
const SCOPE =
  "Calls the factoryCore stage tools (apply_stage, assert_stage, get_stage, route_for_stage). Does not write Jira labels.";

export function stageMachineCases(): CaseDefinition[] {
  return [
    stageOrder(),
    ownershipMatrix(),
    prReviewRequiresPullRequest(),
    singleStageLabel(),
    routing(),
    unknownActorRejected(),
    adjacencyNotEnforced(),
  ];
}

function stageOrder(): CaseDefinition {
  return {
    id: "stage.order",
    suite: SUITE,
    title: "Factory stage order matches the documented SDLC",
    classification: "executed",
    criterion:
      "FACTORY_STAGES is prd_draft through done with no extra or missing labels.",
    scope: SCOPE,
    async run() {
      assert.deepEqual([...FACTORY_STAGES], Object.keys(SPEC_WRITERS));
      return { evidence: { stages: [...FACTORY_STAGES] } };
    },
  };
}

function ownershipMatrix(): CaseDefinition {
  const applyStage = asTool(applyStageTool);
  return {
    id: "stage.ownership_matrix",
    suite: SUITE,
    title: "Only the documented actor may plan each stage label",
    classification: "executed",
    criterion:
      "apply_stage accepts a writer from the documented matrix and rejects every other actor. pr_review is checked with prExists true so the denial is ownership, not a missing PR.",
    scope: SCOPE,
    async run() {
      const { ctx } = evalHost();
      const mismatches: {
        stage: FactoryStage;
        actor: StageActor;
        allowed: boolean;
        ok: boolean;
        error?: unknown;
      }[] = [];
      for (const stage of FACTORY_STAGES) {
        for (const actor of ACTORS) {
          const allowed = SPEC_WRITERS[stage].includes(actor);
          const result = asRecord(
            await applyStage.execute(
              {
                labels: [],
                nextStage: stage,
                actor,
                ...(stage === "pr_review" ? { prExists: true } : {}),
              },
              ctx,
            ),
            "apply_stage",
          );
          const ok = result.ok === true;
          if (ok !== allowed) {
            mismatches.push({
              stage,
              actor,
              allowed,
              ok,
              error: result.error,
            });
          }
        }
      }
      assert.deepEqual(mismatches, []);
      return {
        evidence: {
          checked: FACTORY_STAGES.length * ACTORS.length,
          mismatches,
        },
      };
    },
  };
}

function prReviewRequiresPullRequest(): CaseDefinition {
  const applyStage = asTool(applyStageTool);
  return {
    id: "stage.pr_review_requires_pr",
    suite: SUITE,
    title: "Implementer cannot plan pr_review without a pull request",
    classification: "executed",
    criterion:
      "apply_stage with actor implementer and nextStage pr_review returns an error unless prExists is true, then it removes implementation and adds pr_review.",
    scope: SCOPE,
    async run() {
      const { ctx } = evalHost();
      const missing = asRecord(
        await applyStage.execute(
          {
            labels: ["implementation", "factory"],
            nextStage: "pr_review",
            actor: "implementer",
          },
          ctx,
        ),
        "apply_stage missing PR",
      );
      assert.equal(missing.ok, false);
      assert.match(String(missing.error), /pr_review requires an existing pull request/);

      const ready = asRecord(
        await applyStage.execute(
          {
            labels: ["implementation", "factory"],
            nextStage: "pr_review",
            actor: "implementer",
            prExists: true,
          },
          ctx,
        ),
        "apply_stage with PR",
      );
      assert.equal(ready.ok, true);
      assert.deepEqual(ready.remove, ["implementation"]);
      assert.deepEqual(ready.add, ["pr_review"]);
      return { evidence: { missing, ready } };
    },
  };
}

function singleStageLabel(): CaseDefinition {
  const assertStage = asTool(assertStageTool);
  const getStage = asTool(getStageTool);
  return {
    id: "stage.single_label",
    suite: SUITE,
    title: "Exactly one factory stage label is valid",
    classification: "executed",
    criterion:
      "get_stage ignores the factory marker, assert_stage accepts a single expected stage, and both reject two stage labels.",
    scope: SCOPE,
    async run() {
      const { ctx } = evalHost();
      const one = asRecord(
        await getStage.execute(
          { labels: ["factory", "bug", "design_draft"] },
          ctx,
        ),
        "get_stage",
      );
      assert.equal(one.ok, true);
      assert.equal(one.stage, "design_draft");
      assert.deepEqual(one.extras, []);

      const none = asRecord(
        await getStage.execute({ labels: ["factory"] }, ctx),
        "get_stage empty",
      );
      assert.equal(none.ok, false);
      assert.equal(none.stage, null);

      const asserted = asRecord(
        await assertStage.execute(
          { labels: ["factory", "prd_draft"], expected: "prd_draft" },
          ctx,
        ),
        "assert_stage",
      );
      assert.equal(asserted.ok, true);

      const many = asRecord(
        await assertStage.execute(
          { labels: ["prd_draft", "prd_review"], expected: "prd_draft" },
          ctx,
        ),
        "assert_stage multiple",
      );
      assert.equal(many.ok, false);
      assert.match(String(many.error), /Multiple factory stage labels/);
      return { evidence: { one, none, asserted, many } };
    },
  };
}

function routing(): CaseDefinition {
  const route = asTool(routeStageTool);
  return {
    id: "stage.routing",
    suite: SUITE,
    title: "Draft stages route to one peer and review stages are human gates",
    classification: "executed",
    criterion:
      "route_for_stage returns the documented peer for draft and implementation stages, and gate=true with peer=null for every *_review stage and done.",
    scope: SCOPE,
    async run() {
      const { ctx } = evalHost();
      const actual: Record<string, { peer: string | null; gate: boolean }> = {};
      for (const stage of FACTORY_STAGES) {
        const result = asRecord(
          await route.execute({ stage }, ctx),
          "route_for_stage",
        );
        const peer = result.peer === null || typeof result.peer === "string" ? result.peer : "invalid";
        assert.equal(typeof result.gate, "boolean");
        assert.equal(typeof result.note, "string");
        assert.ok(String(result.note).length > 0);
        actual[stage] = { peer, gate: result.gate === true };
      }
      assert.deepEqual(actual, SPEC_ROUTE);
      return { evidence: actual };
    },
  };
}

function unknownActorRejected(): CaseDefinition {
  const applyStage = asTool(applyStageTool);
  return {
    id: "stage.actor_schema",
    suite: SUITE,
    title: "apply_stage rejects an actor outside the factory roster",
    classification: "executed",
    criterion: "The apply_stage input schema rejects actor values other than the seven factory actors.",
    scope: SCOPE,
    async run() {
      const parsed = applyStage.inputSchema?.safeParse({
        labels: [],
        nextStage: "prd_draft",
        actor: "stranger",
      });
      assert.ok(parsed);
      assert.equal(parsed.success, false);
      const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
      return { evidence: { messages } };
    },
  };
}

function adjacencyNotEnforced(): CaseDefinition {
  const applyStage = asTool(applyStageTool);
  return {
    id: "stage.adjacency_not_enforced",
    suite: SUITE,
    title: "Stage planner does not reject hops that skip TRANSITIONS",
    classification: "limitation",
    criterion:
      "planApplyStage enforces the writer and the pr_review pull-request rule. It does not consult TRANSITIONS, so a human can plan done directly from prd_draft.",
    scope:
      "Recorded limitation of the tool, not a successful SDLC transition. If apply_stage starts rejecting this hop, this row fails until the criterion is reclassified as a scored rejection.",
    async run() {
      const { ctx } = evalHost();
      const result = asRecord(
        await applyStage.execute(
          {
            labels: ["prd_draft"],
            nextStage: "done",
            actor: "human",
          },
          ctx,
        ),
        "apply_stage hop",
      );
      assert.equal(
        result.ok,
        true,
        "apply_stage rejected a non-adjacent hop. Reclassify stage.adjacency_not_enforced as a scored rejection.",
      );
      return {
        status: "noted",
        evidence: {
          from: "prd_draft",
          to: "done",
          actor: "human",
          result,
          meaning:
            "Ownership passed. The tool did not require the approve path prd_review → design_draft → architecture_draft → implementation → pr_review → done.",
        },
      };
    },
  };
}
