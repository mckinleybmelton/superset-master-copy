"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardSummary } from "@/lib/types";
import styles from "./Dashboard.module.css";

function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

function formatDollars(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

/** UTC-stable dates so SSR and the browser hydrate the same string. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

type DashboardProps = {
  initialData?: DashboardSummary | null;
  initialError?: string | null;
  initialDays?: number;
};

export function Dashboard({
  initialData = null,
  initialError = null,
  initialDays = 90,
}: DashboardProps) {
  const [data, setData] = useState<DashboardSummary | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(!initialData && !initialError);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(initialDays);
  const [project, setProject] = useState("");
  const [includeInFlight, setIncludeInFlight] = useState(true);
  const skipFirstFetch = useRef(Boolean(initialData));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: String(days),
        inFlight: includeInFlight ? "1" : "0",
      });
      if (project) params.set("project", project);
      const res = await fetch(`/api/dashboard?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DashboardSummary & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [days, includeInFlight, project]);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    void load();
  }, [load]);

  const refresh = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookbackDays: days }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Sync failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const projects = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set(data.issues.map((i) => i.projectKey))].sort();
  }, [data]);

  const maxWeeklyTokens = useMemo(() => {
    if (!data?.weekly.length) return 1;
    return Math.max(...data.weekly.map((w) => w.tokensPerTask ?? 0), 1);
  }, [data]);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.brandRow}>
          <p className={styles.brand}>Impact</p>
          <div className={styles.controls}>
            <label className={styles.field}>
              <span>Range</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Project</span>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">All</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={includeInFlight}
                onChange={(e) => setIncludeInFlight(e.target.checked)}
              />
              Include in-flight
            </label>
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void refresh()}
              disabled={syncing}
            >
              {syncing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <h1 className={styles.headline}>
          Cursor tokens it takes to finish one Jira task
        </h1>
        <p className={styles.lede}>
          Attribute team usage to each issue&apos;s In Progress → Done window so
          leadership can weigh spend against shipped work.
        </p>
        {data?.usingSampleData ? (
          <div className={styles.sampleBanner} role="status">
            Showing sample data. Connect Cursor Admin usage and Jira secrets to
            load live spend.
          </div>
        ) : null}
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading && !data ? (
        <p className={styles.muted}>Loading dashboard…</p>
      ) : null}

      {data ? (
        <>
          <section className={styles.kpis} aria-label="Key metrics">
            <article className={styles.kpiPrimary}>
              <p className={styles.kpiLabel}>Median tokens / completed task</p>
              <p className={styles.kpiValue}>
                {formatTokens(data.medianTokensPerTask)}
              </p>
              <p className={styles.kpiSub}>
                Mean {formatTokens(data.meanTokensPerTask)} ·{" "}
                {data.completedTasks} completed
              </p>
            </article>
            <article className={styles.kpi}>
              <p className={styles.kpiLabel}>Median $ / task</p>
              <p className={styles.kpiValueSm}>
                {formatDollars(data.medianDollarsPerTask)}
              </p>
              <p className={styles.kpiSub}>
                Mean {formatDollars(data.meanDollarsPerTask)}
              </p>
            </article>
            <article className={styles.kpi}>
              <p className={styles.kpiLabel}>Attributed spend</p>
              <p className={styles.kpiValueSm}>
                {formatDollars(data.totalAttributedCents / 100)}
              </p>
              <p className={styles.kpiSub}>
                {formatTokens(data.totalAttributedTokens)} tokens
              </p>
            </article>
            <article className={styles.kpi}>
              <p className={styles.kpiLabel}>Unattributed</p>
              <p className={styles.kpiValueSm}>
                {data.unattributedPct == null
                  ? "—"
                  : `${data.unattributedPct.toFixed(1)}%`}
              </p>
              <p className={styles.kpiSub}>
                {formatDollars(data.unattributedCents / 100)} ·{" "}
                {data.inFlightTasks} in flight
              </p>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Weekly tokens per completed task</h2>
              <p>Median-friendly view of efficiency over the selected range.</p>
            </div>
            <div className={styles.chart}>
              {data.weekly.length === 0 ? (
                <p className={styles.muted}>No completed tasks in range.</p>
              ) : (
                data.weekly.map((w) => {
                  const height =
                    ((w.tokensPerTask ?? 0) / maxWeeklyTokens) * 100;
                  return (
                    <div key={w.weekStart} className={styles.barCol}>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.bar}
                          style={{
                            height: `${Math.max(Number(height.toFixed(2)), 4)}%`,
                          }}
                          title={`${formatTokens(w.tokensPerTask)} tokens/task`}
                        />
                      </div>
                      <span className={styles.barLabel}>
                        {w.weekStart.slice(5)}
                      </span>
                      <span className={styles.barMeta}>
                        {w.completedTasks} tasks
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Tasks</h2>
              <p>
                Spend attributed by assignee email within each issue window.
                Shared means overlapping In Progress work split that hour.
              </p>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Assignee</th>
                    <th>Window</th>
                    <th>Cycle</th>
                    <th>Tokens</th>
                    <th>$</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {data.issues.map((issue) => (
                    <tr key={issue.issueKey}>
                      <td>
                        <a
                          href={issue.jiraUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.issueLink}
                        >
                          {issue.issueKey}
                        </a>
                        <div className={styles.summary}>{issue.summary}</div>
                      </td>
                      <td>
                        <div>{issue.assigneeName ?? "Unassigned"}</div>
                        <div className={styles.mutedSm}>
                          {issue.assigneeEmail ?? "—"}
                        </div>
                      </td>
                      <td className={styles.mono}>
                        {formatDate(issue.startedAt)}
                        {" → "}
                        {issue.completedAt
                          ? formatDate(issue.completedAt)
                          : "open"}
                      </td>
                      <td>{formatHours(issue.cycleHours)}</td>
                      <td className={styles.mono}>
                        {formatTokens(issue.totalTokens)}
                      </td>
                      <td className={styles.mono}>
                        {formatDollars(issue.chargedCents / 100)}
                      </td>
                      <td>
                        <div className={styles.flags}>
                          {!issue.completed ? (
                            <span className={styles.pillWarn}>In flight</span>
                          ) : null}
                          {issue.sharedAttribution ? (
                            <span className={styles.pillShared}>Shared</span>
                          ) : null}
                          {issue.completed && !issue.sharedAttribution ? (
                            <span className={styles.pillOk}>Solo</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.honesty}>
            <h2>Data honesty</h2>
            <ul>
              <li>
                Overlap issues (shared attribution):{" "}
                <strong>{data.overlapIssueCount}</strong>
              </li>
              <li>
                Assignees with windows but no Cursor usage email match:{" "}
                <strong>{data.emailMismatchCount}</strong>
              </li>
              <li>
                Last Cursor sync: {formatWhen(data.lastSync.cursor)}
              </li>
              <li>Last Jira sync: {formatWhen(data.lastSync.jira)}</li>
              <li>
                Last attribution: {formatWhen(data.lastSync.attribute)}
              </li>
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
