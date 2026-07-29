import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getIDToken: vi.fn(),
  setSecret: vi.fn(),
}));

vi.mock("@actions/core", () => actions);

import { extractRuntime } from "../src/runtime.js";

const workspaceId = "019fac5a-0264-7402-a2d7-e0d23bbde7e8";
const requestId = "019fac5a-0264-7402-a2d7-e0d23bbde7e9";
const connectionId = "019fac5a-0264-7402-a2d7-e0d23bbde7ea";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("credential runtime lease", () => {
  it("fetches the v3 runtime directly and masks secrets immediately", async () => {
    actions.getIDToken.mockResolvedValue("github-oidc-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "3",
          workspaceId,
          callerConnectionId: connectionId,
          requestId,
          phase: "extract",
          source: {
            connectionId,
            repositoryId: "123",
            repository: "acme/api",
            owner: "acme",
            name: "api",
            ref: "main",
          },
          policy: {
            tasks: ["documentation"],
            include: ["src/**"],
            exclude: [],
            limits: {
              maxFiles: 100,
              maxReadBytes: 100_000,
              maxToolCalls: 10,
            },
          },
          prompt: { version: "sha256:extract", text: "Analyze." },
          questions: [],
          provider: {
            adapterKey: "openai",
            modelId: "gpt-test",
            endpointOptions: {},
            credential: "customer-secret",
            promptVersion: "sha256:extract",
            credentialVersion: "credential-v1",
          },
          capsuleSigningKey: "capsule-signing-key-with-at-least-32-bytes",
        }),
        {
          status: 200,
          headers: { "cache-control": "no-store" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const runtime = await extractRuntime({
      apiBase: "https://api.getloopa.co",
      workspaceId,
      requestId,
      sourceConnectionId: connectionId,
      sourceRepositoryId: "123",
      context: {
        repository: { id: "123", fullName: "acme/api" },
        run: {
          id: "456",
          attempt: 1,
          event: "workflow_dispatch",
          ref: "refs/heads/main",
          headSha: "a".repeat(40),
          workflowRef:
            "acme/api/.github/workflows/loopa-workspace-analysis.yml@refs/heads/main",
        },
      },
    });

    expect(runtime.provider.credential).toBe("customer-secret");
    expect(actions.setSecret).toHaveBeenCalledWith("github-oidc-token");
    expect(actions.setSecret).toHaveBeenCalledWith("customer-secret");
    expect(actions.setSecret).toHaveBeenCalledWith(
      "capsule-signing-key-with-at-least-32-bytes",
    );
    expect(fetchMock.mock.calls[0]?.[0].toString()).toMatch(
      /\/api\/github\/actions\/runtime$/,
    );
    expect(fetchMock.mock.calls[0]?.[0].toString()).not.toContain("inference");
  });
});
