import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("reusable multi-repository workflow", () => {
  it("is deployment-independent and limits extraction to two jobs", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/workspace-analysis.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("max-parallel: 2");
    expect(workflow).toContain("fail-fast: true");
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).not.toMatch(/^\s*concurrency:/m);
    expect(workflow).not.toMatch(/^\s*environment:/m);
    expect(workflow).not.toMatch(/\bdeploy(?:ment)?\b/i);
  });

  it("creates one repository-scoped token per matrix checkout", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/workspace-analysis.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("actions/create-github-app-token@");
    expect(workflow).toContain("repositories: ${{ matrix.source.name }}");
    expect(workflow).toContain("permission-contents: read");
    expect(workflow).not.toContain("reader-token:");
  });

  it("retains signed capsules for one day and synthesizes only on success", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/workspace-analysis.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("retention-days: 1");
    expect(workflow).toContain("needs: [prepare, extract]");
    expect(workflow).toContain("if: ${{ success() }}");
  });
});
