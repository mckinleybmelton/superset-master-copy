/*
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

import { Switchboard } from "@superset-ui/switchboard";
import { IFRAME_COMMS_MESSAGE_TYPE } from "./const";
import { getGuestTokenRefreshTiming } from "./guestTokenRefresh";

export type GuestTokenFetchFn = () => Promise<string>;

export const CHROME_KEYS = [
  "colorBgContainer",
  "colorText",
  "colorTextSecondary",
  "colorBorder",
  "fontFamily",
  "borderRadius",
] as const;

export type ChromeOverrides = Partial<
  Record<(typeof CHROME_KEYS)[number], string | number>
>;

export type FilterValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | { from: string; to: string };

export type IgnoredFilterReport = {
  ignored: Array<{
    key: string;
    reason: "not_allowed" | "out_of_bounds" | "unknown_key";
  }>;
};

export type EmbedErrorCode =
  | "EMBED_ORIGIN_NOT_ALLOWED"
  | "EMBED_TOKEN_INVALID"
  | "EMBED_DATASET_NOT_IN_SCOPE"
  | "EMBED_EXPLORE_CHART_DATA_DENIED"
  | "kit_disabled"
  | "token_rejected"
  | "origin_not_allowed"
  | "dataset_not_in_scope"
  | "embed_not_found"
  | "not_configured";

export class EmbedRefusal extends Error {
  code: EmbedErrorCode;

  constructor(error: EmbedError) {
    super(error.message);
    this.name = "EmbedRefusal";
    this.code = error.code;
  }
}

export type EmbedError = { code: EmbedErrorCode; message: string };

export type ExploreSnapshot = {
  vizType: string;
  dimensions: string[];
  metrics: string[];
  timeGrain?: string;
  filters: Array<{ column: string; operator: string; value: FilterValue }>;
};

export function filterChrome(chrome: Record<string, unknown> | undefined): {
  applied: ChromeOverrides;
  ignored: string[];
} {
  const applied: ChromeOverrides = {};
  const ignored: string[] = [];
  Object.entries(chrome || {}).forEach(([key, value]) => {
    if ((CHROME_KEYS as readonly string[]).includes(key)) {
      (applied as Record<string, unknown>)[key] = value;
    } else {
      ignored.push(key);
    }
  });
  return { applied, ignored: ignored.sort() };
}

type Surface = "chart" | "explore";

export type EmbedSurfaceParams = {
  id: string;
  supersetDomain: string;
  mountPoint: HTMLElement;
  fetchGuestToken: GuestTokenFetchFn;
  surface: Surface;
  iframeTitle?: string;
  onError?: (error: EmbedError) => void;
  onIgnoredFilters?: (report: IgnoredFilterReport) => void;
  onIgnoredThemeKeys?: (keys: string[]) => void;
  onIgnoredState?: (report: { ignored: Array<{ field: string; reason: string }> }) => void;
};

export type EmbeddedSurface = {
  unmount: () => void;
  setFilters: (filters: Record<string, FilterValue>) => Promise<IgnoredFilterReport>;
  setThemeMode: (mode: "default" | "dark" | "system") => void;
  setChrome: (chrome: ChromeOverrides) => Promise<string[]>;
  getExploreState: () => Promise<ExploreSnapshot>;
};

const SANDBOX = [
  "allow-same-origin",
  "allow-scripts",
  "allow-presentation",
  "allow-downloads",
  "allow-forms",
  "allow-popups",
];

/**
 * Mount a chart or Explore lite iframe. `embedDashboard` is intentionally
 * not routed through here, so its parameters and tests stay unchanged.
 */
export async function embedSurface({
  id,
  supersetDomain,
  mountPoint,
  fetchGuestToken,
  surface,
  iframeTitle,
  onError,
  onIgnoredFilters,
  onIgnoredThemeKeys,
  onIgnoredState,
}: EmbedSurfaceParams): Promise<EmbeddedSurface> {
  const domain = supersetDomain.endsWith("/")
    ? supersetDomain.slice(0, -1)
    : supersetDomain;
  const iframe = document.createElement("iframe");
  iframe.title = iframeTitle || (surface === "chart" ? "Embedded chart" : "Explore");
  iframe.setAttribute("sandbox", SANDBOX.join(" "));
  const path = surface === "chart" ? "chart" : "explore";
  let switchboard: Switchboard | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refusalSeen: EmbedError | null = null;

  const clearRefresh = () => {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  };
  let settled = false;
  const refusal = new Promise<EmbedError>(resolve => {
    window.addEventListener("message", function onEmbedError(event: MessageEvent) {
      if (event.source !== iframe.contentWindow) return;
      const error = event.data?.embeddedError;
      if (event.data?.type !== IFRAME_COMMS_MESSAGE_TYPE || !error?.code) return;
      const refusalError: EmbedError = {
        code: error.code,
        message: error.message || "",
      };
      refusalSeen = refusalError;
      onError?.(refusalError);
      if (!settled) resolve(refusalError);
    });
  });
  const ready = new Promise<void>((resolve, reject) => {
    iframe.addEventListener("load", () => {
      // The refusal document posts during parse, before load. Defer the
      // success path so that message is applied before this promise settles.
      window.setTimeout(() => {
        if (!iframe.contentWindow) return;
        if (refusalSeen) {
          reject(refusalSeen);
          return;
        }
        const channel = new MessageChannel();
        iframe.contentWindow.postMessage(
          { type: IFRAME_COMMS_MESSAGE_TYPE, handshake: "port transfer" },
          domain,
          [channel.port2],
        );
        switchboard = new Switchboard({
          port: channel.port1,
          name: "superset-embedded-sdk",
          debug: false,
        });
        switchboard.start();
        resolve();
      }, 0);
    });
  });
  iframe.style.width = "100%";
  iframe.style.minHeight = "480px";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.src = `${domain}/embedded/${path}/${id}`;
  mountPoint.replaceChildren(iframe);
  let first: EmbedError | null = null;
  try {
    first = await Promise.race([
      refusal.then(error => error),
      ready.then(() => null),
    ]);
  } catch (error) {
    first = (error as EmbedError) || refusalSeen;
  }
  settled = true;
  if (first) {
    clearRefresh();
    throw new EmbedRefusal(first);
  }

  const sendToken = async () => {
    try {
      const guestToken = await fetchGuestToken();
      switchboard?.emit("guestToken", { guestToken });
      clearRefresh();
      refreshTimer = setTimeout(() => {
        void sendToken();
      }, getGuestTokenRefreshTiming(guestToken));
    } catch (error) {
      onError?.({
        code: "token_rejected",
        message: error instanceof Error ? error.message : "token rejected",
      });
    }
  };
  await sendToken();

  return {
    unmount: () => {
      clearRefresh();
      mountPoint.replaceChildren();
    },
    setFilters: async filters => {
      const report = (await switchboard?.get("applyHostFilters", { filters })) as
        | IgnoredFilterReport
        | undefined;
      const safe = report || { ignored: [] };
      if (safe.ignored.length) onIgnoredFilters?.(safe);
      return safe;
    },
    setThemeMode: mode => {
      switchboard?.emit("setThemeMode", { mode });
    },
    setChrome: async chrome => {
      const { applied, ignored } = filterChrome(chrome as Record<string, unknown>);
      if (ignored.length) onIgnoredThemeKeys?.(ignored);
      await switchboard?.get("setChrome", { chrome: applied });
      return ignored;
    },
    getExploreState: async () =>
      (await switchboard?.get("getExploreState", {})) as ExploreSnapshot,
  };
}
