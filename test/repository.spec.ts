import { execFile } from "node:child_process";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisPolicy } from "../src/contracts.js";
import { RepositoryReader } from "../src/repository.js";

const exec = promisify(execFile);
const roots: string[] = [];
const policy: AnalysisPolicy = {
  tasks: ["documentation"],
  include: ["src/**"],
  exclude: ["src/private/**"],
  limits: { maxFiles: 10, maxReadBytes: 100_000, maxToolCalls: 10 },
};

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("central readable-path policy", () => {
  it("applies includes and exclusions to listing, reads, searches, and evidence", async () => {
    const root = await fixture();
    const reader = new RepositoryReader(root, policy);
    expect(await reader.listFiles()).toEqual(["src/index.ts"]);
    await expect(reader.readText("README.md")).rejects.toThrow("excluded");
    await expect(reader.readText("src/private/key.ts")).rejects.toThrow(
      "excluded",
    );
    await expect(
      reader.assertEvidencePaths(["src/private/key.ts"]),
    ).rejects.toThrow("excluded");
    await expect(
      reader.assertEvidence([
        { path: "src/index.ts", startLine: 2, endLine: 2 },
      ]),
    ).rejects.toThrow("invalid lines");
    expect(await reader.searchText("visible")).toEqual([
      { path: "src/index.ts", line: 1, text: "visible" },
    ]);
  });

  it("rejects traversal, secret files, binary files, and symlinks", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "src/.env"), "TOKEN=value");
    await writeFile(path.join(root, "src/image.png"), "\u0000");
    await writeFile(path.join(root, "src/opaque.data"), "\u0000binary");
    await symlink(
      path.join(root, "src/index.ts"),
      path.join(root, "src/link.ts"),
    );
    const reader = new RepositoryReader(root, policy);
    await expect(reader.readText("../outside")).rejects.toThrow();
    await expect(reader.readText("src/.env")).rejects.toThrow("excluded");
    await expect(reader.readText("src/image.png")).rejects.toThrow("excluded");
    await expect(reader.readText("src/opaque.data")).rejects.toThrow("Binary");
    await expect(reader.readText("src/link.ts")).rejects.toThrow("Symlink");
    expect(await reader.listFiles()).not.toContain("src/opaque.data");
  });

  it("filters excluded paths out of Git diffs", async () => {
    const root = await fixture();
    await exec("git", ["init"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    await exec("git", ["config", "user.name", "Test"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    const base = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    await writeFile(path.join(root, "src/index.ts"), "visible changed");
    await writeFile(path.join(root, "src/private/key.ts"), "SECRET_CHANGED");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "change"], { cwd: root });
    const head = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    const diff = await new RepositoryReader(root, policy).diff(base, head);
    expect(diff).toContain("visible changed");
    expect(diff).not.toContain("SECRET_CHANGED");
    expect(diff).not.toContain("src/private/key.ts");
  });
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "loopa-reader-"));
  roots.push(root);
  await mkdir(path.join(root, "src/private"), { recursive: true });
  await writeFile(path.join(root, "src/index.ts"), "visible");
  await writeFile(path.join(root, "src/private/key.ts"), "SECRET");
  await writeFile(path.join(root, "README.md"), "outside include");
  return root;
}
