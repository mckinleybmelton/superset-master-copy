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
import { render, screen } from '@testing-library/react';
import { QueryFormData } from '@superset-ui/core';
import SavedChart from './SavedChart';

jest.mock('@superset-ui/core', () => {
  const actual = jest.requireActual('@superset-ui/core');
  return {
    ...actual,
    SuperChart: ({
      chartType,
      formData,
    }: {
      chartType: string;
      formData: QueryFormData;
    }) => (
      <div
        data-test="super-chart"
        data-chart-type={chartType}
        data-color-scheme={formData.color_scheme}
      />
    ),
  };
});

test('saved chart renders the server viz type and series colors', () => {
  render(
    <SavedChart
      formData={
        {
          datasource: '1__table',
          viz_type: 'big_number_total',
          color_scheme: 'supersetColors',
        } as QueryFormData
      }
      queries={[{ data: [{ revenue: 10 }] }]}
      height={320}
    />,
  );

  const chart = screen.getByTestId('super-chart');
  expect(chart.getAttribute('data-chart-type')).toBe('big_number_total');
  expect(chart.getAttribute('data-color-scheme')).toBe('supersetColors');
});
