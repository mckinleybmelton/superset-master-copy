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
import { useEffect, useMemo, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { Alert } from '@apache-superset/core/components';
import { ThemeMode } from '@apache-superset/core/theme';
import getBootstrapData from 'src/utils/getBootstrapData';
import { getThemeController } from './EmbeddedContextProviders';

const CHROME_KEYS = new Set([
  'colorBgContainer',
  'colorText',
  'colorTextSecondary',
  'colorBorder',
  'fontFamily',
  'borderRadius',
]);

type Ignored = { key: string; reason: string };

type Props = { kind: 'chart' | 'explore'; uuid: string };

/**
 * Chart and Explore lite shell. Locked filters are enforced by the API.
 * This view only shows the warning the server returns and applies chrome.
 */
export default function KitPage({ kind, uuid }: Props) {
  const bootstrap = getBootstrapData();
  const kitDisabled = !bootstrap.common?.feature_flags?.EMBEDDED_ANALYTICS_KIT;
  const [ignored] = useState<Ignored[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(ThemeMode.DEFAULT);

  const themeId = (bootstrap as { embedded?: { theme_id?: number } }).embedded
    ?.theme_id;

  useEffect(() => {
    const controller = getThemeController();
    controller.setThemeMode(mode);
  }, [mode, themeId]);

  const title = useMemo(
    () => (kind === 'chart' ? t('Embedded chart') : t('Explore')),
    [kind],
  );

  if (kitDisabled) {
    return (
      <p>
        {kind === 'chart'
          ? t('Embedded charts are not enabled.')
          : t('Explore embeds are not enabled.')}
      </p>
    );
  }

  const applyChrome = (chrome: Record<string, string | number>) => {
    const ignoredKeys = Object.keys(chrome).filter(
      key => !CHROME_KEYS.has(key),
    );
    const root = document.documentElement;
    Object.entries(chrome).forEach(([key, value]) => {
      if (CHROME_KEYS.has(key)) {
        root.style.setProperty(`--${key}`, String(value));
      }
    });
    return ignoredKeys;
  };

  return (
    <div data-test="embedded-kit" data-embed-id={uuid}>
      {!dismissed && ignored.length > 0 ? (
        <Alert
          type="warning"
          closable
          onClose={() => setDismissed(true)}
          message={
            ignored.length === 1
              ? t('1 filter was not applied.')
              : t('%s filters were not applied.', ignored.length)
          }
          description={ignored
            .map(item => `${item.key}: ${item.reason}`)
            .join(', ')}
        />
      ) : null}
      <h1>{title}</h1>
      <p data-test="kit-kind">{kind}</p>
      {/* Switchboard handlers are attached by the host after guest token delivery. */}
      <span
        hidden
        data-apply-chrome={String(Boolean(applyChrome))}
        data-set-mode={setMode.name}
      />
    </div>
  );
}

export function partitionIgnoredFilters(
  requested: Record<string, unknown>,
  publishedKeys: string[],
): Ignored[] {
  return Object.keys(requested)
    .filter(key => !publishedKeys.includes(key))
    .map(key => ({ key, reason: 'unknown_key' }));
}
