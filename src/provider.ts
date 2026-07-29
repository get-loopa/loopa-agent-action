import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { ProviderEnvelope } from "./contracts.js";

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

export function resolveModel(envelope: ProviderEnvelope): LanguageModel {
  const modelId = envelope.modelId;
  const apiKey = envelope.credential;
  if (envelope.adapterKey === "openai") {
    return createOpenAI({ apiKey })(modelId);
  }
  if (envelope.adapterKey === "anthropic") {
    return createAnthropic({ apiKey })(modelId);
  }
  if (envelope.adapterKey === "google") {
    return createGoogleGenerativeAI({ apiKey })(modelId);
  }
  if (envelope.adapterKey === "azure-openai") {
    const resourceName = envelope.endpointOptions.azureResourceName;
    if (!resourceName) {
      throw new Error("Azure OpenAI resource name is required");
    }
    return createAzure({
      apiKey,
      resourceName,
      apiVersion: envelope.endpointOptions.azureApiVersion,
    })(modelId);
  }
  if (envelope.adapterKey === "openrouter") {
    return createOpenRouter({
      apiKey,
      compatibility: "strict",
      appName: "Loopa GitHub Analysis",
      appUrl: "https://getloopa.co",
    }).chat(modelId);
  }
  if (envelope.adapterKey === "fireworks") {
    return createFireworks({ apiKey })(modelId);
  }
  if (envelope.adapterKey === "huggingface") {
    return createHuggingFace({ apiKey })(modelId);
  }
  if (
    envelope.adapterKey === "opencode-go" &&
    envelope.endpointOptions.transport === "anthropic-compatible"
  ) {
    return createAnthropic({
      apiKey,
      baseURL: envelope.endpointOptions.baseUrl ?? OPENCODE_GO_BASE_URL,
    })(modelId);
  }
  const baseURL =
    envelope.adapterKey === "opencode-go"
      ? (envelope.endpointOptions.baseUrl ?? OPENCODE_GO_BASE_URL)
      : envelope.endpointOptions.baseUrl;
  if (!baseURL) {
    throw new Error(
      "The direct-compatible provider requires a public base URL",
    );
  }
  return createOpenAICompatible({
    name:
      envelope.adapterKey === "opencode-go"
        ? "opencode-go"
        : "customer-provider",
    apiKey,
    baseURL: baseURL.replace(/\/+$/, ""),
    supportsStructuredOutputs: true,
  })(modelId);
}
