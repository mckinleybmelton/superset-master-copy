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

export const EMBED_COMMS = '__embedded_comms__';

export type EmbedRefusal = { code: string; message: string };

export function reportEmbedError(refusal: EmbedRefusal): void {
  window.parent?.postMessage(
    { type: EMBED_COMMS, embeddedError: refusal },
    '*',
  );
}

type ErrorBody = {
  error_type?: string;
  errorType?: string;
  message?: string;
  errors?: { error_type?: string; message?: string }[];
  originalError?: { errors?: { error_type?: string; message?: string }[] };
  json?: () => Promise<unknown>;
};

function asRefusal(
  code: string | undefined,
  message: string | undefined,
): EmbedRefusal | null {
  if (!code?.startsWith('EMBED_')) {
    return null;
  }
  return { code, message: message || '' };
}

export async function refusalFromClientError(
  error: unknown,
): Promise<EmbedRefusal | null> {
  const candidate = error as ErrorBody;
  const direct = asRefusal(
    candidate?.errorType || candidate?.error_type,
    candidate?.message,
  );
  if (direct) {
    return direct;
  }
  const original = candidate?.originalError?.errors?.[0];
  const fromOriginal = asRefusal(original?.error_type, original?.message);
  if (fromOriginal) {
    return fromOriginal;
  }
  try {
    const body =
      typeof candidate?.json === 'function'
        ? ((await candidate.json()) as ErrorBody)
        : candidate;
    const first = body?.errors?.[0];
    return asRefusal(first?.error_type, first?.message || body?.message);
  } catch {
    return null;
  }
}
