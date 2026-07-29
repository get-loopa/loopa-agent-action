import { describe, expect, it } from "vitest";
import type { ProviderEnvelope } from "../src/contracts.js";
import { resolveModel } from "../src/provider.js";

const base = {
  modelId: "test-model",
  credential: "customer-managed-test-key",
  promptVersion: "sha256:test",
  credentialVersion: "credential-v1",
} as const;

const envelopes: ProviderEnvelope[] = [
  { ...base, adapterKey: "openai", endpointOptions: {} },
  { ...base, adapterKey: "anthropic", endpointOptions: {} },
  { ...base, adapterKey: "google", endpointOptions: {} },
  {
    ...base,
    adapterKey: "azure-openai",
    endpointOptions: { azureResourceName: "customer-resource" },
  },
  { ...base, adapterKey: "openrouter", endpointOptions: {} },
  { ...base, adapterKey: "fireworks", endpointOptions: {} },
  { ...base, adapterKey: "huggingface", endpointOptions: {} },
  {
    ...base,
    adapterKey: "opencode-go",
    endpointOptions: { transport: "openai-compatible" },
  },
  {
    ...base,
    adapterKey: "opencode-go",
    endpointOptions: { transport: "anthropic-compatible" },
  },
  {
    ...base,
    adapterKey: "openai-compatible",
    endpointOptions: { baseUrl: "https://llm.customer.example/v1" },
  },
];

describe("direct customer provider adapters", () => {
  it.each(envelopes)(
    "constructs $adapterKey without contacting the Loopa backend",
    (envelope) => {
      const model = resolveModel(envelope);
      expect(model).toBeDefined();
      expect(typeof model).not.toBe("string");
      expect((model as { modelId: string }).modelId).toBe("test-model");
    },
  );

  it("requires a public endpoint for a generic compatible provider", () => {
    expect(() =>
      resolveModel({
        ...base,
        adapterKey: "openai-compatible",
        endpointOptions: {},
      }),
    ).toThrow(/public base URL/i);
  });
});
