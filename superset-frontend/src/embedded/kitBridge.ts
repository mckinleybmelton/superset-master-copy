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

import { partitionChrome } from './chartTheme';

export type HostFilterValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | { from: string; to: string };

export type IgnoredFilter = { key: string; reason: string };

export type KitHandlers = {
  applyHostFilters: (
    filters: Record<string, HostFilterValue>,
  ) => Promise<{ ignored: IgnoredFilter[] }>;
  setChrome: (chrome: Record<string, string | number>) => string[];
  setThemeMode: (mode: 'default' | 'dark' | 'system') => void;
  getExploreState: () => Record<string, unknown>;
};

let handlers: KitHandlers | null = null;
let desiredMode: 'default' | 'dark' | 'system' = 'default';
let desiredChrome: Record<string, string | number> = {};
let resolveReady: ((next: KitHandlers) => void) | null = null;
const ready: Promise<KitHandlers> = new Promise(resolve => {
  resolveReady = resolve;
});

export function registerKitHandlers(next: KitHandlers): void {
  handlers = next;
  resolveReady?.(next);
}

export function waitForKitHandlers(): Promise<KitHandlers> {
  if (handlers) {
    return Promise.resolve(handlers);
  }
  return ready;
}

export function initialThemeRequest(): {
  mode: 'default' | 'dark' | 'system';
  chrome: Record<string, string | number>;
} {
  return { mode: desiredMode, chrome: desiredChrome };
}

export function queueThemeMode(mode: 'default' | 'dark' | 'system'): void {
  desiredMode = mode;
  handlers?.setThemeMode(mode);
}

export function queueChrome(chrome: Record<string, string | number>): string[] {
  const { applied, ignored } = partitionChrome(chrome);
  desiredChrome = applied;
  if (handlers) {
    return handlers.setChrome(applied);
  }
  return ignored;
}
