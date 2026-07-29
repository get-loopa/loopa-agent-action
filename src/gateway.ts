import * as core from '@actions/core';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import {
  analysisPolicySchema,
  providerSchema,
  type AnalysisPolicy,
  type ProviderName,
} from './contracts.js';
import type { GithubRunContext } from './github-context.js';

const ACTION_VERSION = '1.3.0';
const MAX_BOOTSTRAP_BYTES = 64 * 1024;
const MAX_INFERENCE_BYTES = 2 * 1024 * 1024;

type V3LanguageModel = Extract<
  Exclude<LanguageModel, string>,
  { specificationVersion: 'v3' }
>;
type V3CallOptions = Parameters<V3LanguageModel['doGenerate']>[0];
type V3GenerateResult = Awaited<
  ReturnType<V3LanguageModel['doGenerate']>
>;

const bootstrapSchema = z.object({
  version: z.literal('1'),
  sessionId: z.string().uuid(),
  token: z.string().min(32).max(300),
  expiresAt: z.string().datetime(),
  route: z.object({
    provider: providerSchema,
    model: z.string().min(1).max(300),
  }),
  policy: analysisPolicySchema,
});

const generateResultSchema = z.object({
  version: z.literal('1'),
  content: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({ type: z.literal('reasoning'), text: z.string() }),
      z.object({
        type: z.literal('tool-call'),
        toolCallId: z.string(),
        toolName: z.string(),
        input: z.string(),
        providerExecuted: z.literal(false).optional(),
        dynamic: z.literal(false).optional(),
      }),
    ]),
  ),
  finishReason: z.object({
    unified: z.enum([
      'stop',
      'length',
      'content-filter',
      'tool-calls',
      'error',
      'other',
    ]),
    raw: z.string().optional(),
  }),
  usage: z.object({
    inputTokens: z.object({
      total: z.number().optional(),
      noCache: z.number().optional(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
    }),
    outputTokens: z.object({
      total: z.number().optional(),
      text: z.number().optional(),
      reasoning: z.number().optional(),
    }),
    raw: z.record(z.string(), z.unknown()).optional(),
  }),
  warnings: z.array(z.unknown()),
  response: z
    .object({
      id: z.string().optional(),
      modelId: z.string().optional(),
    })
    .optional(),
});

export type GatewaySession = {
  sessionId: string;
  provider: ProviderName;
  model: string;
  policy: AnalysisPolicy;
  languageModel: LanguageModel;
};

export async function bootstrapGateway(input: {
  apiBase: string;
  connectionId: string;
  context: GithubRunContext;
}): Promise<GatewaySession> {
  const state = {
    bootstrap: await requestBootstrap(input),
  };
  return {
    sessionId: state.bootstrap.sessionId,
    provider: state.bootstrap.route.provider,
    model: state.bootstrap.route.model,
    policy: state.bootstrap.policy,
    languageModel: gatewayLanguageModel(input.apiBase, state, () =>
      requestBootstrap(input),
    ),
  };
}

function gatewayLanguageModel(
  apiBase: string,
  state: { bootstrap: z.infer<typeof bootstrapSchema> },
  refresh: () => Promise<z.infer<typeof bootstrapSchema>>,
): V3LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'loopa-gateway',
    modelId: state.bootstrap.route.model,
    supportedUrls: {},
    async doGenerate(options: V3CallOptions): Promise<V3GenerateResult> {
      const call = serializableCall(options);
      let response = await requestInference(
        apiBase,
        state.bootstrap,
        call,
      );
      if (response.status === 401) {
        state.bootstrap = await refresh();
        response = await requestInference(
          apiBase,
          state.bootstrap,
          call,
        );
      }
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          error.message ??
            `Loopa inference request failed (${response.status})`,
        );
      }
      const source = await response.text();
      if (Buffer.byteLength(source) > MAX_INFERENCE_BYTES) {
        throw new Error('Loopa inference response exceeded 2 MiB');
      }
      const parsed = generateResultSchema.parse(JSON.parse(source));
      const { version: _version, ...result } = parsed;
      return result as V3GenerateResult;
    },
    async doStream() {
      throw new Error('Loopa Action gateway does not support streaming');
    },
  };
}

async function requestBootstrap(input: {
  apiBase: string;
  connectionId: string;
  context: GithubRunContext;
}) {
  const base = validatedBase(input.apiBase);
  const audience = new URL('/github-actions', base)
    .toString()
    .replace(/\/$/, '');
  const oidcToken = await core.getIDToken(audience);
  core.setSecret(oidcToken);
  const response = await fetch(new URL('/api/github/actions/bootstrap', base), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${oidcToken}`,
      'content-type': 'application/json',
      'user-agent': `loopa-agent-action/${ACTION_VERSION}`,
    },
    body: JSON.stringify({
      connectionId: input.connectionId,
      repository: input.context.repository,
      run: {
        id: input.context.run.id,
        attempt: input.context.run.attempt,
        workflowRef: input.context.run.workflowRef,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      error.message ?? `Loopa bootstrap request failed (${response.status})`,
    );
  }
  const source = await response.text();
  if (Buffer.byteLength(source) > MAX_BOOTSTRAP_BYTES) {
    throw new Error('Loopa bootstrap response exceeded 64 KiB');
  }
  const bootstrap = bootstrapSchema.parse(JSON.parse(source));
  core.setSecret(bootstrap.token);
  return bootstrap;
}

function requestInference(
  apiBase: string,
  bootstrap: z.infer<typeof bootstrapSchema>,
  call: Record<string, unknown>,
) {
  const base = validatedBase(apiBase);
  return fetch(new URL('/api/github/actions/inference', base), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bootstrap.token}`,
      'content-type': 'application/json',
      'user-agent': `loopa-agent-action/${ACTION_VERSION}`,
    },
    body: JSON.stringify({
      version: '1',
      sessionId: bootstrap.sessionId,
      promptVersion: 'engineering-v1',
      call,
    }),
    signal: AbortSignal.timeout(120_000),
  });
}

function serializableCall(options: V3CallOptions): Record<string, unknown> {
  return {
    prompt: options.prompt,
    ...(options.maxOutputTokens != null
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
    ...(options.temperature != null
      ? { temperature: options.temperature }
      : {}),
    ...(options.stopSequences ? { stopSequences: options.stopSequences } : {}),
    ...(options.topP != null ? { topP: options.topP } : {}),
    ...(options.topK != null ? { topK: options.topK } : {}),
    ...(options.presencePenalty != null
      ? { presencePenalty: options.presencePenalty }
      : {}),
    ...(options.frequencyPenalty != null
      ? { frequencyPenalty: options.frequencyPenalty }
      : {}),
    ...(options.responseFormat
      ? { responseFormat: options.responseFormat }
      : {}),
    ...(options.seed != null ? { seed: options.seed } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.toolChoice ? { toolChoice: options.toolChoice } : {}),
  };
}

function validatedBase(value: string): URL {
  const base = new URL(value);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('loopa-api-url must use HTTPS');
  }
  return base;
}
