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
import { useCallback, useEffect, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { SupersetClient } from '@superset-ui/core';
import { Alert } from '@apache-superset/core/components';
import { Button, Input, Loading } from '@superset-ui/core/components';

type EmbedRow = {
  uuid: string;
  kind: string;
  name: string;
  domains: string[];
  any_origin?: boolean;
};

type Usage = {
  tokens_minted: number;
  loads: number;
  queries: number;
  failed_loads: number;
  failures: Record<string, number>;
  last_activity: string | null;
};

export default function EmbeddedAnalytics() {
  const [rows, setRows] = useState<EmbedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<EmbedRow | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [token, setToken] = useState('');
  const [datasets, setDatasets] = useState('');
  const [scopeName, setScopeName] = useState('');
  const [scopeDatasets, setScopeDatasets] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    SupersetClient.get({ endpoint: '/api/v1/embedded_analytics/embeds/' })
      .then(({ json }) => setRows(json.result || []))
      .catch(() => setError(t('You don’t have access to embedded analytics.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openUsage = (row: EmbedRow) => {
    setSelected(row);
    setToken('');
    SupersetClient.get({
      endpoint: `/api/v1/embedded_analytics/embeds/${row.uuid}/usage/?range=7d`,
    }).then(({ json }) => setUsage(json.result));
  };

  const mint = () => {
    if (!selected) return;
    const datasetIds = datasets
      .split(',')
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    SupersetClient.post({
      endpoint: '/api/v1/security/guest_token/',
      body: JSON.stringify({
        user: { username: '<guest-username>' },
        resources: [{ type: selected.kind, id: selected.uuid }],
        rls: [],
        datasets: datasetIds,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
      .then(({ json }) => setToken(json.token || ''))
      .catch(() => setError(t('You don’t have access to this embed.')));
  };

  const createScope = () => {
    const datasetIds = scopeDatasets
      .split(',')
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    SupersetClient.post({
      endpoint: '/api/v1/embedded_analytics/scope/',
      body: JSON.stringify({ name: scopeName, dataset_ids: datasetIds }),
      headers: { 'Content-Type': 'application/json' },
    }).then(() => {
      setScopeName('');
      setScopeDatasets('');
    });
  };

  if (loading) return <Loading />;

  return (
    <div css={{ padding: 24 }}>
      <h1>{t('Embedded analytics')}</h1>
      <p>
        {t(
          'Minting copies dataset ids onto the token. Editing a scope does not change tokens that were already issued.',
        )}
      </p>
      {error ? <Alert type="error" message={error} /> : null}
      {rows.length === 0 ? (
        <p>
          {t(
            'No embeds yet. Add a chart or an Explore dataset, or enable embedding on a dashboard.',
          )}
        </p>
      ) : (
        <ul>
          {rows.map(row => (
            <li key={row.uuid}>
              <button type="button" onClick={() => openUsage(row)}>
                {row.name} ({row.kind}){' '}
                {row.any_origin
                  ? t('Any origin')
                  : (row.domains || []).join(', ')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && usage ? (
        <section>
          <h2>
            {selected.name} <code>{selected.uuid}</code>
          </h2>
          <p>
            {t('Pass this id to embedChart or embedExplore.')}{' '}
            {t('Tokens minted')}: {usage.tokens_minted}. {t('Loads')}:{' '}
            {usage.loads}. {t('Queries')}: {usage.queries}. {t('Failed loads')}:{' '}
            {usage.failed_loads}.
          </p>
          <p>
            {usage.last_activity
              ? usage.last_activity
              : t('No activity in the last 7 days.')}
          </p>
          <label htmlFor="kit-datasets">{t('Dataset ids')}</label>
          <Input
            id="kit-datasets"
            value={datasets}
            onChange={event => setDatasets(event.target.value)}
          />
          <Button onClick={mint}>{t('Mint token')}</Button>
          {token ? (
            <>
              <p>
                {t(
                  'This token is shown once. It is not stored in the console.',
                )}
              </p>
              <Input.TextArea value={token} readOnly />
              <Button onClick={() => setToken('')}>{t('Hide token')}</Button>
            </>
          ) : null}
        </section>
      ) : null}
      <section>
        <h2>{t('Scopes')}</h2>
        <Input
          aria-label={t('Scope name')}
          value={scopeName}
          onChange={event => setScopeName(event.target.value)}
        />
        <Input
          aria-label={t('Scope dataset ids')}
          value={scopeDatasets}
          onChange={event => setScopeDatasets(event.target.value)}
        />
        <Button onClick={createScope}>{t('New scope')}</Button>
      </section>
    </div>
  );
}
