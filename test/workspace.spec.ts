import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCapsule,
  deterministicBatches,
  readSignedCapsules,
  writeSignedCapsule,
} from "../src/workspace.js";

const roots: string[] = [];
const connectionId = "019fac5a-0264-7402-a2d7-e0d23bbde7ea";
const signingKey = "capsule-test-key-with-at-least-32-bytes";

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("signed repository capsules", () => {
  it("round-trips a signed capsule against the exact manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "loopa-capsule-"));
    roots.push(root);
    await mkdir(path.join(root, "capsules"));
    const capsule = sampleCapsule();
    const file = await writeSignedCapsule(root, capsule, signingKey);
    const { copyFile } = await import("node:fs/promises");
    await copyFile(file, path.join(root, "capsules", "capsule.json"));
    const read = await readSignedCapsules({
      workspace: root,
      capsulesPath: "capsules",
      sources: [
        {
          connectionId,
          repositoryId: "123",
          repository: "acme/api",
          owner: "acme",
          name: "api",
          ref: "main",
        },
      ],
      manifest: [{ connectionId, repositoryId: "123" }],
      signingKey,
    });
    expect(read).toEqual([capsule]);
  });

  it("rejects the wrong signing key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "loopa-capsule-"));
    roots.push(root);
    await mkdir(path.join(root, "capsules"));
    const file = await writeSignedCapsule(root, sampleCapsule(), signingKey);
    const { copyFile } = await import("node:fs/promises");
    await copyFile(file, path.join(root, "capsules", "capsule.json"));
    await expect(
      readSignedCapsules({
        workspace: root,
        capsulesPath: "capsules",
        sources: [
          {
            connectionId,
            repositoryId: "123",
            repository: "acme/api",
            owner: "acme",
            name: "api",
            ref: "main",
          },
        ],
        manifest: [{ connectionId, repositoryId: "123" }],
        signingKey: "different-key-with-at-least-32-bytes",
      }),
    ).rejects.toThrow("signature");
  });

  it("batches deterministically under 512 KiB", () => {
    const capsules = [sampleCapsule(), sampleCapsule()];
    capsules[1] = {
      ...capsules[1]!,
      source: {
        ...capsules[1]!.source,
        connectionId: "019fac5a-0264-7402-a2d7-e0d23bbde7eb",
      },
    };
    expect(
      deterministicBatches(capsules)
        .flat()
        .map((item) => item.source.connectionId),
    ).toEqual([
      "019fac5a-0264-7402-a2d7-e0d23bbde7ea",
      "019fac5a-0264-7402-a2d7-e0d23bbde7eb",
    ]);
  });
});

function sampleCapsule() {
  return createCapsule({
    connectionId,
    repositoryId: "123",
    repository: "acme/api",
    ref: "main",
    headSha: "a".repeat(40),
    extractionPromptVersion: "sha256:extract",
    credentialVersion: "v1",
    output: {
      summary: "Repository summary",
      proposals: [
        {
          proposalKey: "api-docs",
          kind: "new-document",
          title: "API guide",
          summary: "Document the API.",
          rationale: "Readers need it.",
          draftMarkdown: "# API",
          targetHints: { titles: [], domains: [], paths: [] },
          evidence: [
            {
              path: "src/index.ts",
              startLine: 1,
              endLine: 1,
              description: "Entry point",
            },
          ],
          confidence: 0.9,
        },
      ],
      answers: [],
      warnings: [],
    },
  });
}
