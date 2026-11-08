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

import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultResultsDir } from "../paths.ts";
import { renderReport } from "../render.ts";
import type { EvalReport } from "../types.ts";

const RUN_ID = /^[A-Za-z0-9._-]+$/;

export type DashboardHandle = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export async function startDashboard(options: {
  resultsDir: string;
  port?: number;
  host?: string;
}): Promise<DashboardHandle> {
  const host = options.host ?? "127.0.0.1";
  const server = createServer((request, response) => {
    void handle(options.resultsDir, request.url ?? "/", response);
  });
  await listen(server, options.port ?? 0, host);
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  return {
    port,
    url: `http://${host}:${port}/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handle(
  resultsDir: string,
  rawUrl: string,
  response: import("node:http").ServerResponse,
): Promise<void> {
  const url = new URL(rawUrl, "http://127.0.0.1");
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const report = await readLatest(resultsDir);
      sendHtml(response, 200, renderReport(report));
      return;
    }
    const runPage = url.pathname.match(/^\/runs\/([^/]+)$/);
    if (runPage?.[1]) {
      const report = await readRun(resultsDir, runPage[1]);
      sendHtml(response, report ? 200 : 404, renderReport(report, "That run id is not in eval-results/runs."));
      return;
    }
    if (url.pathname === "/api/report") {
      const report = await readLatest(resultsDir);
      sendJson(response, report ? 200 : 404, report ?? { error: "No latest.json" });
      return;
    }
    if (url.pathname === "/api/runs") {
      sendJson(response, 200, await listRuns(resultsDir));
      return;
    }
    const apiRun = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (apiRun?.[1]) {
      const report = await readRun(resultsDir, apiRun[1]);
      sendJson(response, report ? 200 : 404, report ?? { error: "Run not found" });
      return;
    }
    sendHtml(response, 404, renderReport(null, `No page at ${url.pathname}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendHtml(response, 500, renderReport(null, message));
  }
}

async function readLatest(resultsDir: string): Promise<EvalReport | null> {
  return readJson(path.join(resultsDir, "latest.json"));
}

async function readRun(resultsDir: string, runId: string): Promise<EvalReport | null> {
  if (!RUN_ID.test(runId)) {
    return null;
  }
  return readJson(path.join(resultsDir, "runs", runId, "report.json"));
}

async function listRuns(resultsDir: string): Promise<{ runs: string[] }> {
  const { readdir } = await import("node:fs/promises");
  try {
    const names = await readdir(path.join(resultsDir, "runs"));
    return { runs: names.filter((name) => RUN_ID.test(name)).sort() };
  } catch {
    return { runs: [] };
  }
}

async function readJson(file: string): Promise<EvalReport | null> {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text) as EvalReport;
  } catch (error) {
    const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sendHtml(response: import("node:http").ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

const entry = process.argv[1];
if (entry && pathToFileURL(path.resolve(entry)).href === import.meta.url) {
  const resultsDir = process.env.FACTORY_EVAL_RESULTS ?? defaultResultsDir();
  const port = Number(process.env.FACTORY_EVAL_DASHBOARD_PORT ?? 8787);
  const handle = await startDashboard({
    resultsDir,
    port: Number.isFinite(port) ? port : 8787,
    host: process.env.FACTORY_EVAL_DASHBOARD_HOST ?? "0.0.0.0",
  });
  process.stdout.write(`Factory eval dashboard listening on ${handle.url}\n`);
  process.stdout.write(`Open http://127.0.0.1:${handle.port}/\n`);
  process.stdout.write(`Reading ${resultsDir}\n`);
}
