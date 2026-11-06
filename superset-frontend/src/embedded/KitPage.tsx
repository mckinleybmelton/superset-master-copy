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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { Alert } from '@apache-superset/core/components';
import { ThemeMode } from '@apache-superset/core/theme';
import { SupersetClient } from '@superset-ui/core';
import { Loading } from '@superset-ui/core/components';
import getBootstrapData from 'src/utils/getBootstrapData';
import { getThemeController } from './EmbeddedContextProviders';
import StarterViz, {
  ExploreRow,
  STARTER_VIZ_TYPES,
  StarterVizType,
} from './StarterViz';

const CHROME_KEYS = new Set([
  'colorBgContainer',
  'colorText',
  'colorTextSecondary',
  'colorBorder',
  'fontFamily',
  'borderRadius',
]);

type Ignored = { key: string; reason: string };

type SnapshotFilter = {
  column: string;
  operator: string;
  value: string | number | null;
};

type ExplorePayload = {
  result?: {
    data?: ExploreRow[];
    snapshot?: { vizType?: string; metrics?: string[] };
    ignored_filters?: Ignored[];
    message?: string;
  };
};

type BootstrapPayload = {
  result?: {
    viz_types?: string[];
    columns?: string[];
    metrics?: string[];
    initial_state?: {
      vizType?: string;
      dimensions?: string[];
      metrics?: string[];
      filters?: SnapshotFilter[];
    };
  };
};

type Props = { kind: 'chart' | 'explore'; uuid: string };

function isStarterViz(value: string | undefined): value is StarterVizType {
  return STARTER_VIZ_TYPES.some(item => item === value);
}

/**
 * Chart and Explore lite shell. The server applies locked filters.
 * Explore draws the six starter charts from the snapshot query.
 */
export default function KitPage({ kind, uuid }: Props) {
  const bootstrap = getBootstrapData();
  const kitDisabled = !bootstrap.common?.feature_flags?.EMBEDDED_ANALYTICS_KIT;
  const [ignored, setIgnored] = useState<Ignored[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(ThemeMode.DEFAULT);
  const [rows, setRows] = useState<ExploreRow[]>([]);
  const [vizType, setVizType] = useState<StarterVizType>('table');
  const [metric, setMetric] = useState<string>();
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [vizChoices, setVizChoices] = useState<StarterVizType[]>([
    ...STARTER_VIZ_TYPES,
  ]);
  const [loading, setLoading] = useState(kind === 'explore');
  const [error, setError] = useState('');

  const loadExplore = useCallback(
    (
      nextViz: StarterVizType,
      nextDimensions: string[],
      nextMetrics: string[],
    ) => {
      setLoading(true);
      setError('');
      SupersetClient.post({
        endpoint: `/api/v1/embedded_kit/explore/${uuid}/data/`,
        body: JSON.stringify({
          vizType: nextViz,
          dimensions: nextDimensions,
          metrics: nextMetrics,
          filters: [],
        }),
        headers: { 'Content-Type': 'application/json' },
      })
        .then(({ json }: { json: ExplorePayload }) => {
          const { result } = json;
          setRows(result?.data || []);
          setIgnored(result?.ignored_filters || []);
          const returned = result?.snapshot?.vizType;
          if (isStarterViz(returned)) {
            setVizType(returned);
          }
          setMetric(result?.snapshot?.metrics?.[0]);
        })
        .catch(() => setError(t('The dataset query failed.')))
        .finally(() => setLoading(false));
    },
    [uuid],
  );

  useEffect(() => {
    if (kind !== 'explore' || kitDisabled) {
      return undefined;
    }
    let cancelled = false;
    SupersetClient.get({
      endpoint: `/api/v1/embedded_kit/explore/${uuid}/bootstrap/`,
    })
      .then(({ json }: { json: BootstrapPayload }) => {
        if (cancelled) {
          return;
        }
        const result = json.result || {};
        const initial = result.initial_state || {};
        const nextViz = isStarterViz(initial.vizType)
          ? initial.vizType
          : (result.viz_types || []).find(isStarterViz) || 'table';
        const nextDimensions =
          initial.dimensions || (result.columns || []).slice(0, 1);
        const nextMetrics =
          initial.metrics || (result.metrics || []).slice(0, 1);
        const choices = (result.viz_types || [...STARTER_VIZ_TYPES]).filter(
          isStarterViz,
        );
        setVizType(nextViz);
        setDimensions(nextDimensions);
        setMetrics(nextMetrics);
        setVizChoices(choices.length ? choices : [...STARTER_VIZ_TYPES]);
        loadExplore(nextViz, nextDimensions, nextMetrics);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('Explore embeds are not enabled.'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, kitDisabled, uuid, loadExplore]);

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
      {kind === 'explore' ? (
        <>
          <div>
            {vizChoices.map(choice => (
              <button
                type="button"
                key={choice}
                data-test={`viz-${choice}`}
                aria-pressed={choice === vizType}
                onClick={() => loadExplore(choice, dimensions, metrics)}
              >
                {choice}
              </button>
            ))}
          </div>
          {error ? <Alert type="error" message={error} /> : null}
          {loading ? <Loading /> : null}
          {!loading && !error ? (
            <StarterViz vizType={vizType} rows={rows} metric={metric} />
          ) : null}
        </>
      ) : null}
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
