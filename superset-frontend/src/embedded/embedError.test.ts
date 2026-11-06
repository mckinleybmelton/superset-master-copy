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
import { refusalFromClientError } from './embedError';

test('a typed client error keeps its embed code', async () => {
  const refusal = await refusalFromClientError({
    errorType: 'EMBED_TOKEN_INVALID',
    message: "This embed link isn't valid.",
  });
  expect(refusal).toEqual({
    code: 'EMBED_TOKEN_INVALID',
    message: "This embed link isn't valid.",
  });
});

test('a response body keeps its embed code', async () => {
  const refusal = await refusalFromClientError({
    json: async () => ({
      errors: [
        {
          error_type: 'EMBED_DATASET_NOT_IN_SCOPE',
          message: "This embed can't use that dataset.",
        },
      ],
    }),
  });
  expect(refusal?.code).toBe('EMBED_DATASET_NOT_IN_SCOPE');
});

test('a generic backend error is not treated as an embed refusal', async () => {
  const refusal = await refusalFromClientError({
    errorType: 'GENERIC_BACKEND_ERROR',
    message: 'Issue 1011',
  });
  expect(refusal).toBeNull();
});
