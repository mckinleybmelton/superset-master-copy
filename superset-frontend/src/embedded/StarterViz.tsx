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
import { ReactElement } from 'react';
import { t } from '@apache-superset/core/translation';

export const STARTER_VIZ_TYPES = [
  'table',
  'big_number_total',
  'echarts_timeseries_bar',
  'echarts_timeseries_line',
  'echarts_area',
  'pie',
] as const;

export type StarterVizType = (typeof STARTER_VIZ_TYPES)[number];

export type ExploreRow = Record<string, string | number | null>;

type Point = { label: string; value: number };

type Props = {
  vizType: string;
  rows: ExploreRow[];
  metric?: string;
};

function points(rows: ExploreRow[], metric?: string): Point[] {
  return rows.map((row, index) => {
    const keys = Object.keys(row);
    const valueKey =
      metric && metric in row
        ? metric
        : (keys.find(key => typeof row[key] === 'number') ?? keys[0]);
    const labelKey = keys.find(key => key !== valueKey) ?? keys[0];
    const raw = valueKey ? row[valueKey] : 0;
    const value = typeof raw === 'number' ? raw : Number(raw) || 0;
    const label = labelKey ? String(row[labelKey] ?? index) : String(index);
    return { label, value };
  });
}

function TableViz({ rows }: { rows: ExploreRow[] }) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return (
    <table data-test="starter-viz-table">
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={String(row[columns[0]] ?? index)}>
            {columns.map(column => (
              <td key={column}>
                {row[column] == null ? '' : String(row[column])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BarViz({ series }: { series: Point[] }) {
  const max = Math.max(...series.map(item => item.value), 1);
  return (
    <svg
      data-test="starter-viz-echarts_timeseries_bar"
      aria-label={t('Bar chart')}
      width="320"
      height="160"
    >
      {series.map((item, index) => (
        <rect
          key={item.label}
          x={16 + index * 48}
          y={140 - (item.value / max) * 120}
          width="32"
          height={(item.value / max) * 120}
          fill="currentColor"
        >
          <title>{`${item.label}: ${item.value}`}</title>
        </rect>
      ))}
    </svg>
  );
}

function LineViz({ series, filled }: { series: Point[]; filled: boolean }) {
  const max = Math.max(...series.map(item => item.value), 1);
  const coords = series.map((item, index) => {
    const x =
      series.length === 1 ? 160 : 16 + (index * 288) / (series.length - 1);
    const y = 140 - (item.value / max) * 120;
    return `${x},${y}`;
  });
  const line = coords.join(' ');
  return (
    <svg
      data-test={
        filled
          ? 'starter-viz-echarts_area'
          : 'starter-viz-echarts_timeseries_line'
      }
      aria-label={filled ? t('Area chart') : t('Line chart')}
      width="320"
      height="160"
    >
      {filled ? (
        <polygon
          points={`16,140 ${line} 304,140`}
          fill="currentColor"
          opacity="0.35"
        />
      ) : null}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function PieViz({ series }: { series: Point[] }) {
  const total =
    series.reduce((sum, item) => sum + Math.max(item.value, 0), 0) || 1;
  let cursor = 0;
  return (
    <svg
      data-test="starter-viz-pie"
      aria-label={t('Pie chart')}
      width="160"
      height="160"
    >
      {series.map(item => {
        const start = cursor;
        const sweep = (Math.max(item.value, 0) / total) * Math.PI * 2;
        cursor += sweep;
        const large = sweep > Math.PI ? 1 : 0;
        const x1 = 80 + Math.cos(start) * 60;
        const y1 = 80 + Math.sin(start) * 60;
        const x2 = 80 + Math.cos(start + sweep) * 60;
        const y2 = 80 + Math.sin(start + sweep) * 60;
        return (
          <path
            key={item.label}
            d={`M 80 80 L ${x1} ${y1} A 60 60 0 ${large} 1 ${x2} ${y2} Z`}
            fill="currentColor"
            stroke="currentColor"
          >
            <title>{`${item.label}: ${item.value}`}</title>
          </path>
        );
      })}
    </svg>
  );
}

export default function StarterViz({
  vizType,
  rows,
  metric,
}: Props): ReactElement {
  if (!rows.length) {
    return <p data-test="starter-viz-empty">{t('No results')}</p>;
  }
  if (vizType === 'table') {
    return <TableViz rows={rows} />;
  }
  const series = points(rows, metric);
  if (vizType === 'big_number_total') {
    const total = series.reduce((sum, item) => sum + item.value, 0);
    return <p data-test="starter-viz-big_number_total">{total}</p>;
  }
  if (vizType === 'echarts_timeseries_line') {
    return <LineViz series={series} filled={false} />;
  }
  if (vizType === 'echarts_area') {
    return <LineViz series={series} filled />;
  }
  if (vizType === 'pie') {
    return <PieViz series={series} />;
  }
  return <BarViz series={series} />;
}
