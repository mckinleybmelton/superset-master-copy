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

// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import { embedChart, embedDashboard, embedExplore, filterChrome } from "./index";

vi.mock("@superset-ui/switchboard", () => {
  class Switchboard {
    start = vi.fn();

    emit = vi.fn();

    get = vi.fn(async () => ({
      ignored: [{ key: "status", reason: "not_allowed" }],
    }));
  }
  return { Switchboard };
});

describe("embedded analytics kit sdk", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("an origin refusal rejects the embed and calls onError", async () => {
    const mountPoint = document.createElement("div");
    document.body.appendChild(mountPoint);
    const onError = vi.fn();
    const pending = embedChart({
      id: "embed-uuid",
      supersetDomain: "https://superset.example.com",
      mountPoint,
      fetchGuestToken: async () => "token",
      onError,
    });
    const iframe = mountPoint.querySelector("iframe");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "__embedded_comms__",
          embeddedError: {
            code: "EMBED_ORIGIN_NOT_ALLOWED",
            message: "This embed isn't allowed on this site.",
          },
        },
        source: iframe?.contentWindow,
      }),
    );
    await expect(pending).rejects.toMatchObject({
      code: "EMBED_ORIGIN_NOT_ALLOWED",
    });
    expect(onError).toHaveBeenCalledWith({
      code: "EMBED_ORIGIN_NOT_ALLOWED",
      message: "This embed isn't allowed on this site.",
    });
  });

  test("filterChrome reports keys outside the chrome allowlist", () => {
    const { applied, ignored } = filterChrome({
      colorText: "#111",
      colorSeries: "#f00",
    });
    expect(applied.colorText).toBe("#111");
    expect(ignored).toEqual(["colorSeries"]);
  });

  test("embedChart and embedExplore keep embedDashboard and use the embed uuid", async () => {
    expect(typeof embedDashboard).toBe("function");
    const mountPoint = document.createElement("div");
    document.body.appendChild(mountPoint);
    const onIgnoredFilters = vi.fn();
    const onIgnoredThemeKeys = vi.fn();
    const pending = embedChart({
      id: "embed-uuid",
      supersetDomain: "https://superset.example.com",
      mountPoint,
      fetchGuestToken: async () => "token",
      onIgnoredFilters,
      onIgnoredThemeKeys,
    });
    const iframe = mountPoint.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      "https://superset.example.com/embedded/chart/embed-uuid",
    );
    iframe?.dispatchEvent(new Event("load"));
    const handle = await pending;
    const report = await handle.setFilters({ status: "open" });
    expect(report.ignored[0].key).toBe("status");
    expect(onIgnoredFilters).toHaveBeenCalled();
    const ignoredThemeKeys = await handle.setChrome({
      colorText: "#111",
      colorSeries: "#f00",
    });
    expect(ignoredThemeKeys).toEqual(["colorSeries"]);
    expect(onIgnoredThemeKeys).toHaveBeenCalledWith(["colorSeries"]);
    handle.unmount();

    const explorePoint = document.createElement("div");
    document.body.appendChild(explorePoint);
    const explorePending = embedExplore({
      id: "explore-uuid",
      supersetDomain: "https://superset.example.com/",
      mountPoint: explorePoint,
      fetchGuestToken: async () => "token",
    });
    const exploreFrame = explorePoint.querySelector("iframe");
    expect(exploreFrame?.getAttribute("src")).toBe(
      "https://superset.example.com/embedded/explore/explore-uuid",
    );
    exploreFrame?.dispatchEvent(new Event("load"));
    const exploreHandle = await explorePending;
    exploreHandle.unmount();
  });
});
