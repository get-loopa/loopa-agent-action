import { describe, expect, it } from "vitest";
import {
  extractRuntimeSchema,
  prepareRuntimeSchema,
  reportSchema,
} from "../src/contracts.js";

const workspaceId = "019fac5a-0264-7402-a2d7-e0d23bbde7e8";
const requestId = "019fac5a-0264-7402-a2d7-e0d23bbde7e9";
const connectionId = "019fac5a-0264-7402-a2d7-e0d23bbde7ea";
const source = {
  connectionId,
  repositoryId: "123",
  repository: "acme/api",
  owner: "acme",
  name: "api",
  ref: "main",
};

describe("v3 contracts", () => {
  it.each([1, 2, 10, 50])("supports %i frozen sources", (count) => {
    const sources = Array.from({ length: count }, (_, index) => ({
      ...source,
      connectionId: `019fac5a-0264-7402-a2d7-${(0xe0d23bbde7ea + index)
        .toString(16)
        .padStart(12, "0")}`,
      repositoryId: String(index + 1),
      repository: `acme/repo-${index}`,
      name: `repo-${index}`,
    }));
    expect(
      prepareRuntimeSchema.parse({
        version: "3",
        workspaceId,
        requestId,
        phase: "prepare",
        sources,
      }).sources,
    ).toHaveLength(count);
  });

  it("accepts only an explicit whitelisted provider envelope", () => {
    const parsed = extractRuntimeSchema.parse({
      version: "3",
      workspaceId,
      requestId,
      phase: "extract",
      source,
      policy: {
        tasks: ["documentation"],
        include: ["src/**"],
        exclude: ["src/private/**"],
        limits: {
          maxFiles: 100,
          maxReadBytes: 100_000,
          maxToolCalls: 10,
        },
      },
      prompt: { version: "sha256:test", text: "Analyze safely." },
      questions: [],
      provider: {
        adapterKey: "openai",
        modelId: "gpt-test",
        endpointOptions: {},
        credential: "customer-key",
        promptVersion: "sha256:test",
        credentialVersion: "v1",
      },
      capsuleSigningKey: "x".repeat(32),
    });
    expect(parsed.provider).not.toHaveProperty("config");
  });

  it("requires stable structured answers in reports", () => {
    expect(() =>
      reportSchema.parse({
        schemaVersion: "3",
        workspaceId,
        requestId,
        coordinatorConnectionId: connectionId,
        run: {
          id: "99",
          attempt: 1,
          event: "workflow_dispatch",
          ref: "refs/heads/main",
          headSha: "a".repeat(40),
          workflowRef:
            "acme/api/.github/workflows/loopa-workspace-analysis.yml@refs/heads/main",
        },
        agent: {
          provider: "openai",
          model: "gpt-test",
          actionVersion: "3.0.0",
          extractionPromptVersion: "sha256:a",
          synthesisPromptVersion: "sha256:b",
          credentialVersion: "v1",
        },
        sources: [
          {
            connectionId,
            repository: { id: "123", fullName: "acme/api" },
            ref: "main",
            headSha: "b".repeat(40),
            summary: "Summary",
            warnings: [],
          },
        ],
        summary: "Summary",
        proposals: [],
        warnings: [],
      }),
    ).toThrow();
  });
});
