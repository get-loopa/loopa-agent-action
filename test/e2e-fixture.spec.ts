import { describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: ai.generateText,
}));

import {
  createCapsule,
  synthesizeHierarchically,
} from "../src/workspace.js";

const question = {
  id: "019fac5a-0264-7402-a2d7-e0d23bbde700",
  position: 0,
  text: "How do the services work together?",
};

describe("three-repository GitHub integration fixture", () => {
  it("reduces coordinator and source capsules through a mock direct LLM", async () => {
    const capsules = [
      fixtureCapsule(
        "019fac5a-0264-7402-a2d7-e0d23bbde701",
        "101",
        "acme/coordinator",
      ),
      fixtureCapsule(
        "019fac5a-0264-7402-a2d7-e0d23bbde702",
        "102",
        "acme/api",
      ),
      fixtureCapsule(
        "019fac5a-0264-7402-a2d7-e0d23bbde703",
        "103",
        "acme/web",
      ),
    ];
    const evidenceKey = capsules[0]!.evidence[0]!.key;
    const output = {
      summary: "The coordinator dispatches work to the API and web services.",
      proposals: [
        {
          proposalKey: "workspace-architecture",
          kind: "new-document",
          title: "Workspace architecture",
          summary: "Document the three-service topology.",
          rationale: "The relationship spans repositories.",
          draftMarkdown: "# Workspace architecture",
          targetHints: { titles: [], domains: [], paths: [] },
          evidenceRefs: [evidenceKey],
          confidence: 0.9,
        },
      ],
      answers: [
        {
          questionId: question.id,
          answer: "The coordinator starts analysis for the API and web services.",
          evidenceRefs: [evidenceKey],
          status: "answered",
        },
      ],
      warnings: [],
    } as const;
    ai.generateText
      .mockResolvedValueOnce({
        output,
        usage: { inputTokens: 100, outputTokens: 20 },
      })
      .mockResolvedValueOnce({
        output,
        usage: { inputTokens: 60, outputTokens: 15 },
      });

    const result = await synthesizeHierarchically({
      model: {} as never,
      systemPrompt: "Frozen synthesis prompt.",
      questions: [question],
      capsules,
    });

    expect(ai.generateText).toHaveBeenCalledTimes(2);
    expect(result.report.answers).toEqual(output.answers);
    expect(result.report.proposals[0]?.evidence[0]?.key).toBe(evidenceKey);
    expect(result.report.usage).toEqual({
      inputTokens: 163,
      outputTokens: 38,
    });
  });
});

function fixtureCapsule(
  connectionId: string,
  repositoryId: string,
  repository: string,
) {
  return createCapsule({
    connectionId,
    repositoryId,
    repository,
    ref: "main",
    headSha: repositoryId.padStart(40, "a"),
    extractionPromptVersion: "sha256:extract",
    credentialVersion: "credential-v1",
    output: {
      summary: `${repository} summary`,
      proposals: [
        {
          proposalKey: `${repositoryId}-architecture`,
          kind: "new-document",
          title: `${repository} architecture`,
          summary: "Document this service.",
          rationale: "The service is operationally important.",
          draftMarkdown: null,
          targetHints: { titles: [], domains: [], paths: [] },
          evidence: [
            {
              path: "src/index.ts",
              startLine: 1,
              endLine: 1,
              description: "Service entry point",
            },
          ],
          confidence: 0.8,
        },
      ],
      answers: [
        {
          questionId: question.id,
          answer: `${repository} participates in the workspace.`,
          status: "answered",
          evidence: [
            {
              path: "src/index.ts",
              startLine: 1,
              endLine: 1,
              description: "Service entry point",
            },
          ],
        },
      ],
      warnings: [],
    },
    usage: { inputTokens: 1, outputTokens: 1 },
  });
}
