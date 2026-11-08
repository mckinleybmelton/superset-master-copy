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

export type SchemaResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: { message: string }[] } };

export type FactoryTool = {
  inputSchema?: {
    safeParse: (input: unknown) => SchemaResult;
  };
  execute: (input: unknown, ctx?: unknown) => Promise<unknown>;
};

export type EvalHost = {
  ctx: {
    session: { id: string; purpose: "eval" };
    host: {
      kv: {
        put: (key: string, value: unknown) => Promise<void>;
        get: (key: string) => Promise<unknown>;
        delete: (key: string) => Promise<void>;
      };
    };
  };
  kv: Map<string, unknown>;
};

export function asTool(mod: unknown): FactoryTool {
  if (isTool(mod)) {
    return mod;
  }
  if (mod !== null && typeof mod === "object" && "default" in mod) {
    return asTool((mod as { default: unknown }).default);
  }
  throw new Error("Module is not a factory tool");
}

export function evalHost(): EvalHost {
  const kv = new Map<string, unknown>();
  return {
    kv,
    ctx: {
      session: { id: "factory-eval", purpose: "eval" },
      host: {
        kv: {
          async put(key, value) {
            kv.set(key, value);
          },
          async get(key) {
            return kv.get(key);
          },
          async delete(key) {
            kv.delete(key);
          },
        },
      },
    },
  };
}

export async function withEnv(
  patch: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    const value = patch[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${label} was not an object`);
}

function isTool(value: unknown): value is FactoryTool {
  return (
    value !== null &&
    typeof value === "object" &&
    "execute" in value &&
    typeof value.execute === "function"
  );
}
