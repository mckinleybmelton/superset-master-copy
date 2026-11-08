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
import jiraConfigTool from "../../../agents/orchestrator/bot/tools/jira_config.ts";
import recordGateTool from "../../../agents/orchestrator/bot/tools/record_gate.ts";
import startFactoryTicketTool from "../../../agents/orchestrator/bot/tools/start_factory_ticket.ts";
import { asRecord, asTool, evalHost, withEnv } from "../host.ts";
import type { CaseDefinition, CaseOutcome } from "../types.ts";

const SUITE = "jira-intake";
const SCOPE =
  "Executes orchestrator intake tools in-process with an eval host kv. Does not call the Atlassian API.";

const CLEAR_JIRA = {
  FACTORY_JIRA_PROJECT: undefined,
  JIRA_PROJECT_KEY: undefined,
  FACTORY_JIRA_LABEL: undefined,
  FACTORY_ISSUE_LABEL: undefined,
};

export function intakeCases(): CaseDefinition[] {
  return [
    bindExplicitKey(),
    refuseCreateWithoutProject(),
    createWhenProjectConfigured(),
    bindExactSearchHit(),
    doNotBindAmbiguousHits(),
    truncateSummary(),
    recordGate(),
    jiraConfigDefaults(),
  ];
}

function bindExplicitKey(): CaseDefinition {
  return caseDef(
    "intake.bind_explicit_key",
    "A description that contains a Jira key binds that issue at prd_draft",
    "start_factory_ticket mode is bind, the label plan adds only prd_draft, and host kv stores factory:ticket:<key>.",
    async () => {
      const { ctx, kv } = evalHost();
      const tool = asTool(startFactoryTicketTool);
      let result: Record<string, unknown> = {};
      await withEnv(CLEAR_JIRA, async () => {
        result = asRecord(
          await tool.execute(
            { description: "ASF-12: add a read-only factory stage badge" },
            ctx,
          ),
          "start_factory_ticket",
        );
      });
      assert.equal(result.ok, true);
      assert.equal(result.mode, "bind");
      assert.equal(result.jiraKey, "ASF-12");
      assert.equal(result.stage, "prd_draft");
      assert.equal(result.summary, "add a read-only factory stage badge");
      const plan = asRecord(result.labelPlan, "labelPlan");
      assert.equal(plan.ok, true);
      assert.deepEqual(plan.add, ["prd_draft"]);
      assert.equal(kv.has("factory:ticket:ASF-12"), true);
      return { evidence: { mode: result.mode, jiraKey: result.jiraKey, kvKeys: [...kv.keys()] } };
    },
  );
}

function refuseCreateWithoutProject(): CaseDefinition {
  return caseDef(
    "intake.refuse_create_without_project",
    "Intake fails closed when there is no key and no Jira project",
    "start_factory_ticket returns ok false and names FACTORY_JIRA_PROJECT.",
    async () => {
      const { ctx, kv } = evalHost();
      const tool = asTool(startFactoryTicketTool);
      let result: Record<string, unknown> = {};
      await withEnv(CLEAR_JIRA, async () => {
        result = asRecord(
          await tool.execute(
            { description: "Add a read-only factory stage badge to SqlLab" },
            ctx,
          ),
          "start_factory_ticket",
        );
      });
      assert.equal(result.ok, false);
      assert.match(String(result.error), /FACTORY_JIRA_PROJECT/);
      assert.equal(kv.size, 0);
      return { evidence: { error: result.error, kvKeys: [...kv.keys()] } };
    },
  );
}

function createWhenProjectConfigured(): CaseDefinition {
  return caseDef(
    "intake.create_when_project_configured",
    "A configured project with no search hit plans a new prd_draft issue",
    "mode is create, createPayload labels are factory and prd_draft, and searchHint names the project.",
    async () => {
      const { ctx, kv } = evalHost();
      const tool = asTool(startFactoryTicketTool);
      let result: Record<string, unknown> = {};
      await withEnv({ ...CLEAR_JIRA, FACTORY_JIRA_PROJECT: "ASF" }, async () => {
        result = asRecord(
          await tool.execute(
            { description: "Add a read-only factory stage badge to SqlLab" },
            ctx,
          ),
          "start_factory_ticket",
        );
      });
      assert.equal(result.ok, true);
      assert.equal(result.mode, "create");
      assert.equal(result.jiraKey, null);
      const payload = asRecord(result.createPayload, "createPayload");
      assert.equal(payload.projectKey, "ASF");
      assert.deepEqual(payload.labels, ["factory", "prd_draft"]);
      const hint = asRecord(result.searchHint, "searchHint");
      assert.match(String(hint.jql), /project = ASF/);
      assert.equal(kv.size, 0);
      return {
        evidence: {
          mode: result.mode,
          labels: payload.labels,
          jql: hint.jql,
        },
      };
    },
  );
}

function bindExactSearchHit(): CaseDefinition {
  return caseDef(
    "intake.bind_exact_search_hit",
    "One exact summary match binds the existing issue instead of creating",
    "shouldAutoBindSearchHit, via start_factory_ticket, binds a single case-insensitive exact summary.",
    async () => {
      const { ctx } = evalHost();
      const tool = asTool(startFactoryTicketTool);
      let result: Record<string, unknown> = {};
      await withEnv({ ...CLEAR_JIRA, FACTORY_JIRA_PROJECT: "ASF" }, async () => {
        result = asRecord(
          await tool.execute(
            {
              description: "Add a SqlLab badge",
              searchHits: [{ key: "ASF-3", summary: "add a sqllab badge" }],
            },
            ctx,
          ),
          "start_factory_ticket",
        );
      });
      assert.equal(result.ok, true);
      assert.equal(result.mode, "bind");
      assert.equal(result.jiraKey, "ASF-3");
      return { evidence: { mode: result.mode, jiraKey: result.jiraKey } };
    },
  );
}

function doNotBindAmbiguousHits(): CaseDefinition {
  return caseDef(
    "intake.do_not_bind_ambiguous_hits",
    "Near matches and duplicate titles do not auto-bind",
    "Two different summaries, or two identical exact summaries, stay on mode create.",
    async () => {
      const tool = asTool(startFactoryTicketTool);
      let near: Record<string, unknown> = {};
      let duplicate: Record<string, unknown> = {};
      await withEnv({ ...CLEAR_JIRA, FACTORY_JIRA_PROJECT: "ASF" }, async () => {
        near = asRecord(
          await tool.execute(
            {
              description: "Add a SqlLab badge",
              searchHits: [
                { key: "ASF-1", summary: "Add a SqlLab badge somehow" },
                { key: "ASF-2", summary: "Other" },
              ],
            },
            evalHost().ctx,
          ),
          "near hits",
        );
        duplicate = asRecord(
          await tool.execute(
            {
              description: "Add a SqlLab badge",
              searchHits: [
                { key: "ASF-1", summary: "Add a SqlLab badge" },
                { key: "ASF-2", summary: "Add a SqlLab badge" },
              ],
            },
            evalHost().ctx,
          ),
          "duplicate hits",
        );
      });
      assert.equal(near.mode, "create");
      assert.equal(duplicate.mode, "create");
      return { evidence: { near: near.mode, duplicate: duplicate.mode } };
    },
  );
}

function truncateSummary(): CaseDefinition {
  return caseDef(
    "intake.truncate_summary",
    "Jira summaries are capped at 255 characters",
    "normalizeJiraSummary, via start_factory_ticket, keeps a 255-character summary ending in an ellipsis.",
    async () => {
      const tool = asTool(startFactoryTicketTool);
      const description = "x".repeat(300);
      let result: Record<string, unknown> = {};
      await withEnv({ ...CLEAR_JIRA, FACTORY_JIRA_PROJECT: "ASF" }, async () => {
        result = asRecord(
          await tool.execute({ description }, evalHost().ctx),
          "start_factory_ticket",
        );
      });
      assert.equal(typeof result.summary, "string");
      assert.equal(String(result.summary).length, 255);
      assert.ok(String(result.summary).endsWith("..."));
      return { evidence: { length: String(result.summary).length } };
    },
  );
}

function recordGate(): CaseDefinition {
  return caseDef(
    "intake.record_gate",
    "A human gate decision is stored under factory:gate:<issue>:<stage>",
    "record_gate writes the decision into host kv and rejects a decision outside approve|reject.",
    async () => {
      const tool = asTool(recordGateTool);
      const host = evalHost();
      const result = asRecord(
        await tool.execute(
          {
            issue: "ASF-12",
            stage: "prd_review",
            decision: "approve",
            notes: "PRD matches the badge request",
          },
          host.ctx,
        ),
        "record_gate",
      );
      assert.equal(result.ok, true);
      assert.equal(result.key, "factory:gate:ASF-12:prd_review");
      const stored = asRecord(host.kv.get(String(result.key)), "kv value");
      assert.equal(stored.decision, "approve");
      assert.equal(stored.sessionId, "factory-eval");
      const rejected = tool.inputSchema?.safeParse({
        issue: "ASF-12",
        stage: "prd_review",
        decision: "ship",
      });
      assert.ok(rejected);
      assert.equal(rejected.success, false);
      return { evidence: { key: result.key, storedDecision: stored.decision } };
    },
  );
}

function jiraConfigDefaults(): CaseDefinition {
  return caseDef(
    "intake.jira_config_defaults",
    "jira_config reports the project key and defaults the marker label to factory",
    "With FACTORY_JIRA_PROJECT unset the project is null. With ASF set, projectKey is ASF and factoryLabel is factory.",
    async () => {
      const tool = asTool(jiraConfigTool);
      let missing: Record<string, unknown> = {};
      let configured: Record<string, unknown> = {};
      await withEnv(CLEAR_JIRA, async () => {
        missing = asRecord(await tool.execute({}, evalHost().ctx), "jira_config");
      });
      await withEnv({ ...CLEAR_JIRA, FACTORY_JIRA_PROJECT: "ASF" }, async () => {
        configured = asRecord(await tool.execute({}, evalHost().ctx), "jira_config");
      });
      assert.equal(missing.projectKey, null);
      assert.equal(missing.factoryLabel, "factory");
      assert.equal(configured.projectKey, "ASF");
      assert.equal(configured.factoryLabel, "factory");
      return { evidence: { missing, configured } };
    },
  );
}

function caseDef(
  id: string,
  title: string,
  criterion: string,
  run: () => Promise<CaseOutcome | void>,
): CaseDefinition {
  return {
    id,
    suite: SUITE,
    title,
    classification: "executed",
    criterion,
    scope: SCOPE,
    run,
  };
}
