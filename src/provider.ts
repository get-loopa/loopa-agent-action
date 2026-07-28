import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createFireworks } from '@ai-sdk/fireworks';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import {
  providerSchema,
  type ProviderName,
} from './contracts.js';

export type ProviderInput = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
};

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';

export const OPENCODE_GO_MODEL_TRANSPORTS = {
  'grok-4.5': 'openai-compatible',
  'glm-5.2': 'openai-compatible',
  'glm-5.1': 'openai-compatible',
  'kimi-k3': 'openai-compatible',
  'kimi-k2.7-code': 'openai-compatible',
  'kimi-k2.6': 'openai-compatible',
  'deepseek-v4-pro': 'openai-compatible',
  'deepseek-v4-flash': 'openai-compatible',
  'mimo-v2.5': 'openai-compatible',
  'mimo-v2.5-pro': 'openai-compatible',
  hy3: 'openai-compatible',
  'minimax-m3': 'anthropic-compatible',
  'minimax-m2.7': 'anthropic-compatible',
  'minimax-m2.5': 'anthropic-compatible',
  'qwen3.7-max': 'anthropic-compatible',
  'qwen3.7-plus': 'anthropic-compatible',
  'qwen3.6-plus': 'anthropic-compatible',
} as const satisfies Record<
  string,
  'openai-compatible' | 'anthropic-compatible'
>;

export type OpenCodeGoModelId = keyof typeof OPENCODE_GO_MODEL_TRANSPORTS;

export function openCodeGoTransport(
  modelId: string,
): (typeof OPENCODE_GO_MODEL_TRANSPORTS)[OpenCodeGoModelId] {
  const transport =
    OPENCODE_GO_MODEL_TRANSPORTS[modelId as OpenCodeGoModelId];
  if (!transport) {
    throw new Error(
      `Unsupported OpenCode Go model "${modelId}". Regenerate the Loopa workflow after selecting an available model.`,
    );
  }
  return transport;
}

export function resolveModel(input: ProviderInput): {
  provider: ProviderName;
  model: LanguageModel;
} {
  const provider = providerSchema.parse(input.provider);
  const modelId = input.model.trim();
  if (!modelId) throw new Error('model is required');

  if (provider === 'openai') {
    return { provider, model: createOpenAI({ apiKey: input.apiKey })(modelId) };
  }
  if (provider === 'anthropic') {
    return {
      provider,
      model: createAnthropic({ apiKey: input.apiKey })(modelId),
    };
  }
  if (provider === 'google') {
    return {
      provider,
      model: createGoogleGenerativeAI({ apiKey: input.apiKey })(modelId),
    };
  }
  if (provider === 'azure-openai') {
    if (!input.azureEndpoint) {
      throw new Error('azure-endpoint is required for azure-openai');
    }
    const endpoint = new URL(input.azureEndpoint);
    const resourceName = endpoint.hostname.split('.')[0];
    if (!resourceName) throw new Error('azure-endpoint is invalid');
    return {
      provider,
      model: createAzure({
        apiKey: input.apiKey,
        resourceName,
        apiVersion: input.azureApiVersion,
      })(modelId),
    };
  }
  if (provider === 'openrouter') {
    return {
      provider,
      model: createOpenRouter({
        apiKey: input.apiKey,
        compatibility: 'strict',
        appName: 'Loopa GitHub Action',
        appUrl: 'https://getloopa.co',
      }).chat(modelId),
    };
  }
  if (provider === 'fireworks') {
    return {
      provider,
      model: createFireworks({ apiKey: input.apiKey })(modelId),
    };
  }
  if (provider === 'opencode-go') {
    const transport = openCodeGoTransport(modelId);
    if (transport === 'anthropic-compatible') {
      return {
        provider,
        model: createAnthropic({
          apiKey: input.apiKey,
          baseURL: OPENCODE_GO_BASE_URL,
        })(modelId),
      };
    }
    const openCodeGo = createOpenAICompatible({
      name: 'opencode-go',
      apiKey: input.apiKey,
      baseURL: OPENCODE_GO_BASE_URL,
      supportsStructuredOutputs: true,
    });
    return { provider, model: openCodeGo(modelId) };
  }
  if (!input.baseUrl) {
    throw new Error('base-url is required for openai-compatible');
  }
  const compatible = createOpenAICompatible({
    name: 'customer-provider',
    apiKey: input.apiKey,
    baseURL: input.baseUrl.replace(/\/+$/, ''),
    supportsStructuredOutputs: true,
  });
  return { provider, model: compatible(modelId) };
}
