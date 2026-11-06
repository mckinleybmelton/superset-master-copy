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

export const CHROME_KEYS = [
  'colorBgContainer',
  'colorText',
  'colorTextSecondary',
  'colorBorder',
  'fontFamily',
  'borderRadius',
] as const;

export type ChromeKey = (typeof CHROME_KEYS)[number];

export type ThemeModeName = 'default' | 'dark' | 'system';

export type NamedTheme = {
  token?: Record<string, string | number>;
  algorithm?: string;
};

const CHROME_KEY_SET = new Set<string>(CHROME_KEYS);

export function partitionChrome(chrome: Record<string, unknown> | undefined): {
  applied: Partial<Record<ChromeKey, string | number>>;
  ignored: string[];
} {
  const applied: Partial<Record<ChromeKey, string | number>> = {};
  const ignored: string[] = [];
  Object.entries(chrome || {}).forEach(([key, value]) => {
    if (
      CHROME_KEY_SET.has(key) &&
      (typeof value === 'string' || typeof value === 'number')
    ) {
      applied[key as ChromeKey] = value;
    } else {
      ignored.push(key);
    }
  });
  return { applied, ignored: ignored.sort() };
}

/**
 * Theme order is the named theme, then the mode, then the six chrome tokens.
 * Series colors stay on the saved chart and are not part of this stack.
 */
export function themeStack(
  named: NamedTheme | null,
  mode: ThemeModeName,
  chrome: Record<string, unknown> | undefined,
): {
  mode: ThemeModeName;
  ignored: string[];
  namedConfig: { theme_default: NamedTheme; theme_dark: NamedTheme };
  chromeConfig: { theme_default: NamedTheme; theme_dark: NamedTheme };
} {
  const { applied, ignored } = partitionChrome(chrome);
  const base: NamedTheme = named ? { ...named, token: { ...named.token } } : {};
  const withChrome: NamedTheme = {
    ...base,
    token: { ...base.token, ...applied },
  };
  return {
    mode,
    ignored,
    namedConfig: { theme_default: base, theme_dark: base },
    chromeConfig: { theme_default: withChrome, theme_dark: withChrome },
  };
}

export function chartDataRequestBody(filters: Record<string, unknown>): {
  filters: Record<string, unknown>;
} {
  return { filters };
}
