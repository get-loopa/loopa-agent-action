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
        appUrl: 'https://getloopa.com',
      }).chat(modelId),
    };
  }
  if (provider === 'fireworks') {
    return {
      provider,
      model: createFireworks({ apiKey: input.apiKey })(modelId),
    };
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
