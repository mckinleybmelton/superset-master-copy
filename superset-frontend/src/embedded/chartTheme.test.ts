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
import { chartDataRequestBody, themeStack } from './chartTheme';

test('theme stack keeps the named theme, then mode, then chrome tokens', () => {
  const stack = themeStack(
    { token: { colorText: '#111', colorPrimary: '#00f' } },
    'dark',
    { colorText: '#222', colorSeries: '#f00' },
  );

  expect(stack.mode).toBe('dark');
  expect(stack.namedConfig.theme_default.token?.colorText).toBe('#111');
  expect(stack.namedConfig.theme_default.token?.colorPrimary).toBe('#00f');
  expect(stack.chromeConfig.theme_default.token?.colorText).toBe('#222');
  expect(stack.chromeConfig.theme_default.token?.colorPrimary).toBe('#00f');
  expect(stack.chromeConfig.theme_default.token?.colorSeries).toBeUndefined();
  expect(stack.ignored).toEqual(['colorSeries']);
});

test('chart data requests carry filters and no form data', () => {
  expect(chartDataRequestBody({ region: 'east' })).toEqual({
    filters: { region: 'east' },
  });
});
