import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJiraKey,
  normalizeJiraSummary,
  shouldAutoBindSearchHit,
} from "./jiraConfig.ts";

test("extractJiraKey finds PROJ-123", () => {
  assert.equal(extractJiraKey("please continue ASF-12 tomorrow"), "ASF-12");
  assert.equal(extractJiraKey("no key here"), null);
});

test("normalizeJiraSummary collapses whitespace and truncates", () => {
  assert.equal(normalizeJiraSummary("  hello   world  "), "hello world");
  const long = "x".repeat(300);
  const out = normalizeJiraSummary(long);
  assert.equal(out.length, 255);
  assert.ok(out.endsWith("..."));
});

test("shouldAutoBindSearchHit requires exact unique summary match", () => {
  const title = "Add SqlLab badge";
  assert.deepEqual(
    shouldAutoBindSearchHit({
      normalizedTitle: title,
      candidates: [{ key: "ASF-1", summary: "Add SqlLab badge" }],
    }),
    { action: "bind", key: "ASF-1" },
  );
  assert.deepEqual(
    shouldAutoBindSearchHit({
      normalizedTitle: title,
      candidates: [
        { key: "ASF-1", summary: "Add SqlLab badge somehow" },
        { key: "ASF-2", summary: "Other" },
      ],
    }),
    { action: "create" },
  );
});
