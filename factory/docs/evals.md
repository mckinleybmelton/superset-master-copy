# Factory evals

The runner in `eval-runner/` checks factory behavior that is already implemented: stage tools, Jira intake tools, artifact contract tools, and the skill files those peers follow. It writes a JSON report. The dashboard renders that report.

It does not call Jira, GitHub, or a model. Rows that were not executed stay `blocked` or are omitted. Example fixtures are not scored as factory runs.

## Run

From `factory/`:

```bash
npm install
npm run evals
npm run evals:test
npm run evals:check
```

`npm run evals` writes:

- `eval-results/latest.json` — last report
- `eval-results/runs/<runId>/report.json` — one file per run (gitignored)

Exit code is 1 when any row has status `failed`. `noted`, `blocked`, and `fixture` rows do not fail the process.

### Model trajectory files

`agents/*/evals/*.eval.ts` are Agent SDK cases. They need a Cursor credential (`CURSOR_API_KEY`, `CURSOR_API_KEY_FILE`, or `CURSOR_SERVICE_ACCOUNT_KEY`) and are not reproducible without a model. The default runner lists them with:

```bash
node node_modules/@grok/agent-sdk/dist/bin/agent-serve.js eval --dir agents/<peer> --list --json
```

Listed cases are `blocked` and have no score. To attach a real Agent SDK batch you already ran:

```bash
npx @grok/agent-sdk@0.6.0 eval --dir agents/orchestrator --json --no-stream --no-artifacts --out /tmp/orchestrator-evals.json
npm run evals -- --trajectory-file /tmp/orchestrator-evals.json
```

`--trajectory-file` must be one Agent SDK `eval --json` document. Verdicts in that file replace the matching blocked rows. Cases absent from the file stay blocked. Do not hand-edit scores.

`--skip-trajectory` omits the list. Use it when the Agent SDK binary is not installed.

## Dashboard

```bash
npm run evals:dashboard
```

Open http://127.0.0.1:8787/ . The process reads `eval-results/latest.json`.

| Variable | Default |
| --- | --- |
| `FACTORY_EVAL_RESULTS` | `factory/eval-results` |
| `FACTORY_EVAL_DASHBOARD_PORT` | `8787` |
| `FACTORY_EVAL_DASHBOARD_HOST` | `0.0.0.0` |

- `GET /` renders the latest report
- `GET /runs/<runId>` renders one stored run
- `GET /api/report` returns `latest.json`
- `GET /api/runs` lists run ids
- `GET /api/runs/<runId>` returns that report

There is no recorded score until `npm run evals` has been run. The empty page says so.

## What is scored

| Suite | What it executes |
| --- | --- |
| `stage-machine` | `apply_stage`, `assert_stage`, `get_stage`, `route_for_stage` |
| `jira-intake` | `start_factory_ticket`, `record_gate`, `jira_config` |
| `artifact-contracts` | `prd_contract`, `review_packet_contract`, `require_pr_before_review`, `product_repo_config` |
| `artifact-procedures` | Required phrases in peer skill files |
| `model-trajectory` | Discovery of `*.eval.ts`. Individual cases stay blocked unless a results file is supplied |
| `example-fixtures` | Shape of `fixtures/github/pull_request.labeled.json` |

The scored pass rate is `passed / (passed + failed)` among rows with classification `executed`. Noted limitations, blocked model cases, and example fixtures are outside that rate.

`stage.adjacency_not_enforced` is a noted limitation: `apply_stage` lets a human plan `done` from `prd_draft`. That is not a successful transition.

## Report shape

`schemaVersion` is `1`. Each case has `id`, `suite`, `title`, `classification` (`executed`, `limitation`, `blocked`, `example_fixture`), `status` (`passed`, `failed`, `noted`, `blocked`, `fixture`), `criterion`, `scope`, `evidence`, and `failure` (`message`, `expected`, `actual`).

`git.sha` is `HEAD` when the run started, before `latest.json` was written. A later commit that only adds the report will not match that sha.
