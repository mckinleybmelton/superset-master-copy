import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  extractJiraKey,
  normalizeJiraSummary,
  readJiraFactoryConfig,
  shouldAutoBindSearchHit,
} from "@superset-factory/core/jiraConfig";
import { planApplyStage } from "@superset-factory/core";

/**
 * Plan Jira intake: parse key / decide bind vs create / return payloads.
 * Live Jira fetch/search/create is done by the model via Atlassian MCP using this plan.
 */
export default defineTool({
  description:
    "Plan factory Jira intake from a user change description. Returns whether to bind an existing key, create a new issue, search criteria, and the prd_draft label plan. Does not call Jira itself.",
  effect: "idempotent",
  inputSchema: z.object({
    description: z.string().min(1),
    /** Optional search hits already fetched from Jira (key + summary). */
    searchHits: z
      .array(
        z.object({
          key: z.string(),
          summary: z.string(),
        }),
      )
      .optional(),
  }),
  async execute({ description, searchHits }, ctx) {
    const jira = readJiraFactoryConfig();
    const explicitKey = extractJiraKey(description);
    const summary = normalizeJiraSummary(
      description
        .replace(/\b[A-Z][A-Z0-9]+-\d+\b/gi, " ")
        .replace(/^[\s:;,\-–—]+/, "")
        .trim() || description,
    );

    const labelPlan = planApplyStage({
      labels: [],
      nextStage: "prd_draft",
      actor: "orchestrator",
    });

    if (explicitKey) {
      const value = {
        mode: "bind" as const,
        jiraKey: explicitKey,
        summary,
        projectKey: jira.projectKey,
        factoryLabel: jira.factoryLabel,
        stage: "prd_draft" as const,
        labelPlan,
        productHandoff: {
          jiraKey: explicitKey,
          description,
          summary,
        },
      };
      await ctx.host.kv.put(`factory:ticket:${explicitKey}`, {
        at: new Date().toISOString(),
        sessionId: ctx.session.id,
        summary,
      });
      return { ok: true as const, ...value };
    }

    if (searchHits && searchHits.length > 0) {
      const decision = shouldAutoBindSearchHit({
        normalizedTitle: summary,
        candidates: searchHits,
      });
      if (decision.action === "bind") {
        await ctx.host.kv.put(`factory:ticket:${decision.key}`, {
          at: new Date().toISOString(),
          sessionId: ctx.session.id,
          summary,
        });
        return {
          ok: true as const,
          mode: "bind" as const,
          jiraKey: decision.key,
          summary,
          projectKey: jira.projectKey,
          factoryLabel: jira.factoryLabel,
          stage: "prd_draft" as const,
          labelPlan,
          productHandoff: {
            jiraKey: decision.key,
            description,
            summary,
          },
        };
      }
    }

    if (!jira.projectKey) {
      return {
        ok: false as const,
        error:
          "FACTORY_JIRA_PROJECT is not set. Set it in factory/.env.factory, or pass a Jira key in the message.",
        createPayload: {
          summary,
          description,
          labels: [jira.factoryLabel, "prd_draft"],
        },
      };
    }

    return {
      ok: true as const,
      mode: "create" as const,
      jiraKey: null,
      summary,
      projectKey: jira.projectKey,
      factoryLabel: jira.factoryLabel,
      stage: "prd_draft" as const,
      labelPlan,
      createPayload: {
        projectKey: jira.projectKey,
        summary,
        description,
        labels: [jira.factoryLabel, "prd_draft"],
      },
      productHandoff: {
        jiraKey: null,
        description,
        summary,
      },
      searchHint: {
        jql: `project = ${jira.projectKey} AND resolution = Unresolved`,
        textSearch: summary,
        note: "Before create, search open issues with textSearch; re-call this tool with searchHits. If still mode=create, create the issue.",
      },
    };
  },
});
