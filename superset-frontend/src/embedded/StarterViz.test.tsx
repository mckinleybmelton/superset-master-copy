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
import { createWrapper } from 'spec/helpers/testing-library';
import StarterViz, { STARTER_VIZ_TYPES } from './StarterViz';

const wrapper = createWrapper({ useTheme: true });

const rows = [
  { region: 'east', revenue: 10 },
  { region: 'west', revenue: 5 },
];

test('starter viz types draw the query rows', () => {
  STARTER_VIZ_TYPES.forEach(vizType => {
    const { unmount } = render(
      <StarterViz vizType={vizType} rows={rows} metric="revenue" />,
      { wrapper },
    );
    const drawn = screen.getByTestId(`starter-viz-${vizType}`);
    expect(drawn).toBeTruthy();
    if (vizType === 'big_number_total') {
      expect(drawn.textContent).toBe('15');
    }
    if (vizType === 'table') {
      expect(drawn.textContent).toContain('east');
      expect(drawn.textContent).toContain('10');
    }
    if (vizType === 'pie') {
      const fills = Array.from(drawn.querySelectorAll('path')).map(path =>
        path.getAttribute('fill'),
      );
      expect(fills[0]).not.toBe(fills[1]);
      expect(fills[0]).not.toBe('#000');
      expect(fills[0]).not.toBe('#000000');
    }
    unmount();
  });
});
