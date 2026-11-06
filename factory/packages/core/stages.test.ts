import assert from "node:assert/strict";
import test from "node:test";
import {
  assertStage,
  planApplyStage,
  routePeerForStage,
} from "./stages.ts";

test("extracts and asserts a single stage", () => {
  const ok = assertStage(["factory", "prd_draft"], "prd_draft");
  assert.equal(ok.ok, true);
});

test("rejects multiple stage labels", () => {
  const bad = assertStage(["prd_draft", "prd_review"], "prd_draft");
  assert.equal(bad.ok, false);
});

test("route_for_stage sends draft work to peers and review to gates", () => {
  assert.equal(routePeerForStage("prd_draft").peer, "product");
  assert.equal(routePeerForStage("prd_review").gate, true);
  assert.equal(routePeerForStage("implementation").peer, "implementer");
  assert.equal(routePeerForStage("pr_review").peer, null);
});

test("only implementer may plan pr_review when PR exists", () => {
  const denied = planApplyStage({
    labels: ["implementation"],
    nextStage: "pr_review",
    actor: "reviewer",
    prExists: true,
  });
  assert.equal(denied.ok, false);

  const missingPr = planApplyStage({
    labels: ["implementation"],
    nextStage: "pr_review",
    actor: "implementer",
  });
  assert.equal(missingPr.ok, false);

  const ok = planApplyStage({
    labels: ["implementation"],
    nextStage: "pr_review",
    actor: "implementer",
    prExists: true,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.remove, ["implementation"]);
    assert.deepEqual(ok.add, ["pr_review"]);
  }
});

test("design alone writes design_review", () => {
  const denied = planApplyStage({
    labels: ["design_draft"],
    nextStage: "design_review",
    actor: "product",
  });
  assert.equal(denied.ok, false);

  const ok = planApplyStage({
    labels: ["design_draft"],
    nextStage: "design_review",
    actor: "design",
  });
  assert.equal(ok.ok, true);
});

test("orchestrator may set prd_draft at intake", () => {
  const ok = planApplyStage({
    labels: [],
    nextStage: "prd_draft",
    actor: "orchestrator",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.add, ["prd_draft"]);
  }
});

test("reviewer still cannot write stage labels", () => {
  const denied = planApplyStage({
    labels: ["prd_draft"],
    nextStage: "prd_review",
    actor: "reviewer",
  });
  assert.equal(denied.ok, false);
});
