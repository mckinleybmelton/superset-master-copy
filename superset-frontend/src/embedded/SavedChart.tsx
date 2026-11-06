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
import { QueryData, QueryFormData, SuperChart } from '@superset-ui/core';

type Props = {
  formData: QueryFormData;
  queries: QueryData[];
};

export default function SavedChart({ formData, queries }: Props): ReactElement {
  return (
    <div
      data-test="embedded-saved-chart"
      data-viz-type={String(formData.viz_type || '')}
      data-color-scheme={String(formData.color_scheme || '')}
    >
      <SuperChart
        chartType={formData.viz_type}
        enableNoResults
        formData={formData}
        queriesData={queries}
        height={360}
        width="100%"
      />
    </div>
  );
}
