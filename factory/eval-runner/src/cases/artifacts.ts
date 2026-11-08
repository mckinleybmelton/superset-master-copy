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
import requirePrTool from "../../../agents/implementer/bot/tools/require_pr_before_review.ts";
import productRepoTool from "../../../agents/implementer/bot/tools/product_repo_config.ts";
import prdContractTool from "../../../agents/product/bot/tools/prd_contract.ts";
import reviewPacketTool from "../../../agents/reviewer/bot/tools/review_packet_contract.ts";
import { asRecord, asTool, evalHost, withEnv } from "../host.ts";
import { factoryRoot } from "../paths.ts";
import type { CaseDefinition, CaseOutcome } from "../types.ts";

const TOOL_SUITE = "artifact-contracts";
const TOOL_SCOPE =
  "Executes peer artifact tools. A valid payload here is a contract check, not a model-written PRD, design, or review.";

const PROCEDURE_SUITE = "artifact-procedures";
const PROCEDURE_SCOPE =
  "Checks that the peer skill files still declare the sections and stage rules those peers follow. Does not score generated prose.";

const VALID_PRD = {
  problem: "People cannot see which factory stage an open ticket is in.",
  goals: ["Show the current stage"],
  nonGoals: [],
  userStories: ["As a developer I see the stage on the ticket"],
  requirements: ["Read-only stage badge"],
  successMetrics: ["Stage is visible without opening Jira"],
  openQuestions: [],
};

const EXAMPLE_PR_URL = "https://github.com/mckinleybmelton/superset-master-copy/pull/1";

export function artifactCases(): CaseDefinition[] {
  return [
    prdAcceptsCompleteContract(),
    prdRejectsEmptyGoals(),
    reviewPacketAcceptsContract(),
    reviewPacketRejectsBadRecommendation(),
    requirePrAbortsWithoutUrl(),
    requirePrPlansLabelWhenUrlPresent(),
    productRepoDefaults(),
    ...procedureCases(),
  ];
}

function prdAcceptsCompleteContract(): CaseDefinition {
  return toolCase(
    "artifact.prd_contract_accepts",
    "prd_contract accepts a complete PRD payload",
    "execute returns ok true and echoes the contract section names.",
    async () => {
      const tool = asTool(prdContractTool);
      const result = asRecord(
        await tool.execute(VALID_PRD, evalHost().ctx),
        "prd_contract",
      );
      assert.equal(result.ok, true);
      assert.equal(result.storyCount, 1);
      assert.deepEqual(result.sections, Object.keys(VALID_PRD));
      return { evidence: result };
    },
  );
}

function prdRejectsEmptyGoals(): CaseDefinition {
  return toolCase(
    "artifact.prd_contract_rejects_empty_goals",
    "prd_contract rejects a PRD with no goals",
    "The input schema fails before a PRD with goals: [] can be treated as valid.",
    async () => {
      const tool = asTool(prdContractTool);
      const parsed = tool.inputSchema?.safeParse({ ...VALID_PRD, goals: [] });
      assert.ok(parsed);
      assert.equal(parsed.success, false);
      const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
      return { evidence: { messages } };
    },
  );
}

function reviewPacketAcceptsContract(): CaseDefinition {
  return toolCase(
    "artifact.review_packet_accepts",
    "review_packet_contract accepts a packet with a PR URL and a recommendation",
    "execute returns ok true and preserves the recommendation. The sample URL is the example fixture URL, not a reviewed pull request.",
    async () => {
      const tool = asTool(reviewPacketTool);
      const packet = {
        prUrl: EXAMPLE_PR_URL,
        matches: ["Badge is read-only"],
        gaps: [],
        ciStatus: "not-checked-by-this-eval",
        recommendation: "comment" as const,
      };
      const result = asRecord(await tool.execute(packet, evalHost().ctx), "review_packet");
      assert.equal(result.ok, true);
      assert.equal(result.recommendation, "comment");
      return {
        evidence: {
          recommendation: result.recommendation,
          sampleUrl: EXAMPLE_PR_URL,
          note: "ciStatus is an input to the contract tool. This eval does not query GitHub checks.",
        },
      };
    },
  );
}

function reviewPacketRejectsBadRecommendation(): CaseDefinition {
  return toolCase(
    "artifact.review_packet_rejects_recommendation",
    "review_packet_contract rejects a recommendation outside the enum",
    "Schema enum is approve, changes_requested, or comment.",
    async () => {
      const tool = asTool(reviewPacketTool);
      const parsed = tool.inputSchema?.safeParse({
        prUrl: EXAMPLE_PR_URL,
        matches: ["Badge is read-only"],
        gaps: [],
        ciStatus: "success",
        recommendation: "ship_it",
      });
      assert.ok(parsed);
      assert.equal(parsed.success, false);
      return {
        evidence: {
          messages: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
        },
      };
    },
  );
}

function requirePrAbortsWithoutUrl(): CaseDefinition {
  return toolCase(
    "artifact.require_pr_aborts",
    "require_pr_before_review aborts when no PR URL is supplied",
    "The tool returns ok false and does not plan a pr_review label.",
    async () => {
      const tool = asTool(requirePrTool);
      const result = asRecord(
        await tool.execute({ labels: ["implementation"] }, evalHost().ctx),
        "require_pr_before_review",
      );
      assert.equal(result.ok, false);
      assert.match(String(result.error), /pr_review requires an existing pull request URL/);
      assert.equal("add" in result, false);
      return { evidence: { error: result.error } };
    },
  );
}

function requirePrPlansLabelWhenUrlPresent(): CaseDefinition {
  return toolCase(
    "artifact.require_pr_plans_review",
    "require_pr_before_review plans pr_review when a URL is present",
    "From implementation, the implementer plan removes implementation and adds pr_review.",
    async () => {
      const tool = asTool(requirePrTool);
      const result = asRecord(
        await tool.execute(
          { labels: ["implementation", "factory"], prUrl: EXAMPLE_PR_URL },
          evalHost().ctx,
        ),
        "require_pr_before_review",
      );
      assert.equal(result.ok, true);
      assert.equal(result.prUrl, EXAMPLE_PR_URL);
      assert.deepEqual(result.remove, ["implementation"]);
      assert.deepEqual(result.add, ["pr_review"]);
      return {
        evidence: {
          prUrl: result.prUrl,
          remove: result.remove,
          add: result.add,
          note: "The URL is the example fixture. No pull request was opened or reviewed.",
        },
      };
    },
  );
}

function productRepoDefaults(): CaseDefinition {
  return toolCase(
    "artifact.product_repo_defaults",
    "product_repo_config reads the product repo and default branch",
    "Unset env falls back to mckinleybmelton/superset-master-copy and master. FACTORY_PRODUCT_REPO overrides the repo.",
    async () => {
      const tool = asTool(productRepoTool);
      const clear = {
        FACTORY_PRODUCT_REPO: undefined,
        FACTORY_PRODUCT_DEFAULT_BRANCH: undefined,
        FACTORY_PRODUCT_REPO_PATH: undefined,
      };
      let defaults: Record<string, unknown> = {};
      let override: Record<string, unknown> = {};
      await withEnv(clear, async () => {
        defaults = asRecord(await tool.execute({}, evalHost().ctx), "product_repo_config");
      });
      await withEnv(
        { ...clear, FACTORY_PRODUCT_REPO: "example/superset", FACTORY_PRODUCT_DEFAULT_BRANCH: "main" },
        async () => {
          override = asRecord(await tool.execute({}, evalHost().ctx), "product_repo_config override");
        },
      );
      assert.equal(defaults.repo, "mckinleybmelton/superset-master-copy");
      assert.equal(defaults.defaultBranch, "master");
      assert.equal(defaults.localPath, null);
      assert.equal(override.repo, "example/superset");
      assert.equal(override.defaultBranch, "main");
      return { evidence: { defaults, override } };
    },
  );
}

function procedureCases(): CaseDefinition[] {
  const files: { id: string; title: string; relativePath: string; needles: string[] }[] = [
    {
      id: "procedure.draft_prd",
      title: "PRD skill declares the contract sections and does not self-approve",
      relativePath: "agents/product/bot/skills/draft-prd.md",
      needles: ["Problem", "Goals", "User stories", "Requirements", "Success metrics", "Open questions", "prd_review"],
    },
    {
      id: "procedure.post_prd",
      title: "Posting a PRD moves prd_draft to prd_review as product",
      relativePath: "agents/product/bot/skills/post-prd-to-jira.md",
      needles: ["prd_draft", "prd_review", "actor: product"],
    },
    {
      id: "procedure.manage_backlog",
      title: "Backlog skill forbids self-approving review gates",
      relativePath: "agents/product/bot/skills/manage-backlog.md",
      needles: ["Never approve", "*_review"],
    },
    {
      id: "procedure.draft_design",
      title: "Design skill declares UX sections and does not self-approve",
      relativePath: "agents/design/bot/skills/draft-design.md",
      needles: ["Personas", "User flows", "Screens", "Empty", "Accessibility", "design_review"],
    },
    {
      id: "procedure.post_design",
      title: "Posting a design moves design_draft to design_review as design",
      relativePath: "agents/design/bot/skills/post-design-to-jira.md",
      needles: ["design_draft", "design_review", "actor: design"],
    },
    {
      id: "procedure.draft_architecture",
      title: "Architecture skill declares the design sections and does not self-approve",
      relativePath: "agents/architect/bot/skills/draft-architecture.md",
      needles: ["Context", "Components", "Boundaries", "Dependency", "Risks", "Test plan", "architecture_review"],
    },
    {
      id: "procedure.post_architecture",
      title: "Posting architecture moves architecture_draft to architecture_review as architect",
      relativePath: "agents/architect/bot/skills/post-architecture-to-jira.md",
      needles: ["architecture_draft", "architecture_review", "actor: architect"],
    },
    {
      id: "procedure.implement_change",
      title: "Implementer skill stays on implementation until open-pr",
      relativePath: "agents/implementer/bot/skills/implement-change.md",
      needles: ["implementation", "product_repo_config", "factory/", "open-pr"],
    },
    {
      id: "procedure.open_pr",
      title: "open-pr requires a PR URL before pr_review and does not merge",
      relativePath: "agents/implementer/bot/skills/open-pr.md",
      needles: ["require_pr_before_review", "pr_review", "Never merge"],
    },
    {
      id: "procedure.review_pr",
      title: "Review skill validates a packet at pr_review",
      relativePath: "agents/reviewer/bot/skills/review-pr.md",
      needles: ["pr_review", "review_packet_contract"],
    },
    {
      id: "procedure.post_review_packet",
      title: "Reviewer posts the packet and does not change stage labels",
      relativePath: "agents/reviewer/bot/skills/post-review-packet.md",
      needles: ["Do not", "change Jira stage labels", "implementation"],
    },
    {
      id: "procedure.intake_change",
      title: "Orchestrator intake routes prd_draft to product and stops at prd_review",
      relativePath: "agents/orchestrator/bot/skills/intake-change.md",
      needles: ["start_factory_ticket", "prd_draft", "product", "prd_review", "Do **not** write the PRD"],
    },
  ];

  return files.map((file) => ({
    id: file.id,
    suite: PROCEDURE_SUITE,
    title: file.title,
    classification: "executed" as const,
    criterion: `The skill file contains: ${file.needles.join(", ")}.`,
    scope: PROCEDURE_SCOPE,
    async run() {
      const absolute = path.join(factoryRoot(), file.relativePath);
      const text = await readFile(absolute, "utf8");
      const missing = file.needles.filter((needle) => !text.includes(needle));
      assert.deepEqual(missing, [], `missing phrases in ${file.relativePath}`);
      return {
        evidence: {
          path: file.relativePath,
          bytes: Buffer.byteLength(text),
          checked: file.needles,
        },
      };
    },
  }));
}

function toolCase(
  id: string,
  title: string,
  criterion: string,
  run: () => Promise<CaseOutcome | void>,
): CaseDefinition {
  return {
    id,
    suite: TOOL_SUITE,
    title,
    classification: "executed",
    criterion,
    scope: TOOL_SCOPE,
    run,
  };
}
