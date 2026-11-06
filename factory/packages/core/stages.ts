/**
 * Canonical factory stage labels and transition rules.
 *
 * Ownership is enforced here so peers cannot self-approve or skip gates.
 */

export const FACTORY_STAGES = [
  "prd_draft",
  "prd_review",
  "design_draft",
  "design_review",
  "architecture_draft",
  "architecture_review",
  "implementation",
  "pr_review",
  "done",
] as const;

export type FactoryStage = (typeof FACTORY_STAGES)[number];

export type StageActor =
  | "orchestrator"
  | "product"
  | "design"
  | "architect"
  | "implementer"
  | "reviewer"
  | "human";

const STAGE_SET = new Set<string>(FACTORY_STAGES);

/** Who may apply each stage label after a successful artifact/gate. */
export const STAGE_WRITERS: Record<FactoryStage, readonly StageActor[]> = {
  // Orchestrator may set prd_draft once at Jira intake (find/create).
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

/** Specialist the orchestrator should ask for each active stage. */
export const STAGE_PEER: Partial<
  Record<FactoryStage, Exclude<StageActor, "orchestrator" | "human">>
> = {
  prd_draft: "product",
  design_draft: "design",
  architecture_draft: "architect",
  implementation: "implementer",
  pr_review: "reviewer",
};

/** Legal next stages on submit / approve / reject. */
export const TRANSITIONS = {
  submit: {
    prd_draft: "prd_review",
    design_draft: "design_review",
    architecture_draft: "architecture_review",
    implementation: "pr_review",
  },
  approve: {
    prd_review: "design_draft",
    design_review: "architecture_draft",
    architecture_review: "implementation",
    pr_review: "done",
  },
  reject: {
    prd_review: "prd_draft",
    design_review: "design_draft",
    architecture_review: "architecture_draft",
    pr_review: "implementation",
  },
} as const satisfies Record<
  string,
  Partial<Record<FactoryStage, FactoryStage>>
>;

export function isFactoryStage(value: string): value is FactoryStage {
  return STAGE_SET.has(value);
}

export function extractStage(labels: readonly string[]): {
  stage: FactoryStage | null;
  extras: string[];
} {
  const found = labels.filter(isFactoryStage);
  if (found.length === 0) {
    return { stage: null, extras: [] };
  }
  return { stage: found[0]!, extras: found.slice(1) };
}

export function assertStage(
  labels: readonly string[],
  expected: FactoryStage,
): { ok: true; stage: FactoryStage } | { ok: false; error: string } {
  const { stage, extras } = extractStage(labels);
  if (extras.length > 0) {
    return {
      ok: false,
      error: `Multiple factory stage labels present: ${[stage, ...extras].join(", ")}`,
    };
  }
  if (stage === null) {
    return { ok: false, error: "No factory stage label on the issue" };
  }
  if (stage !== expected) {
    return {
      ok: false,
      error: `Expected stage ${expected}, found ${stage}`,
    };
  }
  return { ok: true, stage };
}

export function canActorWrite(
  actor: StageActor,
  stage: FactoryStage,
): boolean {
  return STAGE_WRITERS[stage].includes(actor);
}

export type ApplyStageResult =
  | {
      ok: true;
      from: FactoryStage | null;
      to: FactoryStage;
      remove: string[];
      add: string[];
    }
  | { ok: false; error: string };

/**
 * Plan a label mutation. Callers apply `remove`/`add` via Jira labels MCP.
 * `pr_review` requires `prExists === true`.
 */
export function planApplyStage(input: {
  labels: readonly string[];
  nextStage: FactoryStage;
  actor: StageActor;
  prExists?: boolean;
}): ApplyStageResult {
  const { labels, nextStage, actor } = input;
  if (!canActorWrite(actor, nextStage)) {
    return {
      ok: false,
      error: `Actor ${actor} may not write stage label ${nextStage}`,
    };
  }
  if (nextStage === "pr_review" && input.prExists !== true) {
    return {
      ok: false,
      error: "pr_review requires an existing pull request (prExists must be true)",
    };
  }
  const { stage, extras } = extractStage(labels);
  if (extras.length > 0) {
    return {
      ok: false,
      error: `Multiple factory stage labels present: ${[stage, ...extras].join(", ")}`,
    };
  }
  const remove = labels.filter(isFactoryStage);
  return {
    ok: true,
    from: stage,
    to: nextStage,
    remove,
    add: remove.includes(nextStage) ? [] : [nextStage],
  };
}

export function routePeerForStage(stage: FactoryStage): {
  peer: string | null;
  gate: boolean;
  note: string;
} {
  if (stage.endsWith("_review") || stage === "done") {
    return {
      peer: null,
      gate: true,
      note:
        stage === "done"
          ? "Ticket is done. Do not ask specialists."
          : `Human gate at ${stage}. Do not ask specialists until a human approves or rejects.`,
    };
  }
  const peer = STAGE_PEER[stage] ?? null;
  return {
    peer,
    gate: false,
    note: peer
      ? `Ask the ${peer} peer via MCP ask, then stop when they submit for review.`
      : `No specialist mapped for ${stage}.`,
  };
}
