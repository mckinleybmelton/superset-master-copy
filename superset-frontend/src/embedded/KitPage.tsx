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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { Alert } from '@apache-superset/core/components';
import {
  type SupersetThemeConfig,
  ThemeMode,
} from '@apache-superset/core/theme';
import { QueryData, QueryFormData, SupersetClient } from '@superset-ui/core';
import { Button, ButtonGroup, Loading } from '@superset-ui/core/components';
import getBootstrapData from 'src/utils/getBootstrapData';
import { getThemeController } from './EmbeddedContextProviders';
import {
  chartDataRequestBody,
  NamedTheme,
  themeStack,
  ThemeModeName,
} from './chartTheme';
import {
  HostFilterValue,
  initialThemeRequest,
  registerKitHandlers,
} from './kitBridge';
import { refusalFromClientError, reportEmbedError } from './embedError';
import SavedChart from './SavedChart';
import StarterViz, {
  ExploreRow,
  STARTER_VIZ_TYPES,
  StarterVizType,
} from './StarterViz';

type Ignored = { key: string; reason: string };

type SnapshotFilter = {
  column: string;
  operator: string;
  value: string | number | null;
};

type ExplorePayload = {
  result?: {
    data?: ExploreRow[];
    snapshot?: {
      vizType?: string;
      metrics?: string[];
      dimensions?: string[];
    };
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

type ChartPayload = {
  result?: {
    form_data?: QueryFormData;
    queries?: QueryData[];
    ignored_filters?: Ignored[];
    theme?: NamedTheme | null;
    hide_title?: boolean;
    slice_name?: string;
  };
};

type Props = { kind: 'chart' | 'explore'; uuid: string };

function modeName(mode: ThemeMode): ThemeModeName {
  if (mode === ThemeMode.DARK) {
    return 'dark';
  }
  if (mode === ThemeMode.SYSTEM) {
    return 'system';
  }
  return 'default';
}

function themeMode(mode: ThemeModeName): ThemeMode {
  if (mode === 'dark') {
    return ThemeMode.DARK;
  }
  if (mode === 'system') {
    return ThemeMode.SYSTEM;
  }
  return ThemeMode.DEFAULT;
}

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
  const [loading, setLoading] = useState(
    kind === 'explore' || kind === 'chart',
  );
  const [error, setError] = useState('');
  const [namedTheme, setNamedTheme] = useState<NamedTheme | null>(null);
  const [chrome, setChrome] = useState<Record<string, string | number>>({});
  const [hideTitle, setHideTitle] = useState(false);
  const [chartName, setChartName] = useState('');
  const chartArea = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(420);
  const [savedForm, setSavedForm] = useState<QueryFormData | null>(null);
  const [queries, setQueries] = useState<QueryData[]>([]);
  const snapshotRef = useRef({
    vizType: 'table',
    dimensions: [] as string[],
    metrics: [] as string[],
    filters: [] as SnapshotFilter[],
  });

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
          snapshotRef.current = {
            vizType: isStarterViz(returned) ? returned : nextViz,
            dimensions: nextDimensions,
            metrics: nextMetrics,
            filters: [],
          };
        })
        .catch(async failure => {
          const refusal = await refusalFromClientError(failure);
          const message = refusal?.message || t('The dataset query failed.');
          if (refusal) {
            reportEmbedError(refusal);
          }
          setError(message);
        })
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

  const loadChart = useCallback(
    (filters: Record<string, HostFilterValue>) => {
      setLoading(true);
      setError('');
      return SupersetClient.post({
        endpoint: `/api/v1/embedded_kit/chart/${uuid}/data/`,
        body: JSON.stringify(chartDataRequestBody(filters)),
        headers: { 'Content-Type': 'application/json' },
      })
        .then(({ json }: { json: ChartPayload }) => {
          const { result } = json;
          const ignoredFilters = result?.ignored_filters || [];
          setIgnored(ignoredFilters);
          setDismissed(false);
          if (result?.form_data?.viz_type) {
            setSavedForm(result.form_data);
          }
          setQueries(result?.queries || []);
          if (result?.slice_name) {
            setChartName(result.slice_name);
          }
          return { ignored: ignoredFilters };
        })
        .catch(async failure => {
          const refusal = await refusalFromClientError(failure);
          const message = refusal?.message || t('The chart query failed.');
          if (refusal) {
            reportEmbedError(refusal);
          }
          setError(message);
          return { ignored: [] as Ignored[] };
        })
        .finally(() => setLoading(false));
    },
    [uuid],
  );

  useEffect(() => {
    if (kind !== 'chart' || kitDisabled) {
      return undefined;
    }
    let cancelled = false;
    SupersetClient.get({
      endpoint: `/api/v1/embedded_kit/chart/${uuid}/bootstrap/`,
    })
      .then(({ json }: { json: ChartPayload }) => {
        if (cancelled) {
          return;
        }
        const { result } = json;
        setNamedTheme(result?.theme || null);
        setHideTitle(Boolean(result?.hide_title));
        setChartName(result?.slice_name || '');
        if (result?.form_data?.viz_type) {
          setSavedForm(result.form_data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('Embedded charts are not enabled.'));
        }
      });
    loadChart({});
    return () => {
      cancelled = true;
    };
  }, [kind, kitDisabled, uuid, loadChart]);

  useEffect(() => {
    const controller = getThemeController();
    const stack = themeStack(namedTheme, modeName(mode), chrome);
    try {
      controller.setThemeConfig(stack.namedConfig as SupersetThemeConfig);
      controller.setThemeMode(mode);
      controller.setThemeConfig(stack.chromeConfig as SupersetThemeConfig);
      controller.setThemeMode(mode);
    } catch {
      // A guest with a single theme cannot change mode. Chrome still applied
      // when setThemeConfig succeeded before the mode call.
    }
  }, [namedTheme, mode, chrome]);

  useEffect(() => {
    const queued = initialThemeRequest();
    setMode(themeMode(queued.mode));
    setChrome(queued.chrome);
    registerKitHandlers({
      applyHostFilters: filters => loadChart(filters),
      setChrome: next => {
        const stack = themeStack(null, modeName(mode), next);
        setChrome(stack.chromeConfig.theme_default.token || {});
        return stack.ignored;
      },
      setThemeMode: next => setMode(themeMode(next)),
      getExploreState: () => snapshotRef.current,
    });
  }, [loadChart, mode, namedTheme]);

  const title = useMemo(() => {
    if (kind === 'chart') {
      return chartName;
    }
    return t('Explore');
  }, [chartName, kind]);

  useEffect(() => {
    const node = chartArea.current;
    if (!node) {
      return undefined;
    }
    const measure = () => setChartHeight(Math.max(node.clientHeight, 280));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, savedForm, error]);

  if (kitDisabled) {
    return (
      <p>
        {kind === 'chart'
          ? t('Embedded charts are not enabled.')
          : t('Explore embeds are not enabled.')}
      </p>
    );
  }

  return (
    <div
      data-test="embedded-kit"
      data-embed-id={uuid}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
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
      {!hideTitle && title ? (
        <h1 style={{ margin: '12px 16px' }}>{title}</h1>
      ) : null}
      {kind === 'chart' ? (
        <>
          {error ? <Alert type="error" message={error} /> : null}
          {loading ? <Loading /> : null}
          <div ref={chartArea} style={{ flex: 1, minHeight: 280 }}>
            {!loading && !error && savedForm ? (
              <SavedChart
                formData={savedForm}
                queries={queries}
                height={chartHeight}
              />
            ) : null}
          </div>
        </>
      ) : null}
      {kind === 'explore' ? (
        <>
          <ButtonGroup>
            {vizChoices.map(choice => (
              <Button
                key={choice}
                buttonStyle={choice === vizType ? 'primary' : 'secondary'}
                data-test={`viz-${choice}`}
                aria-pressed={choice === vizType}
                onClick={() => loadExplore(choice, dimensions, metrics)}
              >
                {choice}
              </Button>
            ))}
          </ButtonGroup>
          {error ? <Alert type="error" message={error} /> : null}
          {loading ? <Loading /> : null}
          {!loading && !error ? (
            <StarterViz vizType={vizType} rows={rows} metric={metric} />
          ) : null}
        </>
      ) : null}
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
