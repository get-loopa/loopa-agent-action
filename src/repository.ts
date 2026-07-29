import { execFile } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import picomatch from "picomatch";
import type { AnalysisPolicy } from "./contracts.js";

const execFileAsync = promisify(execFile);
const MAX_SINGLE_READ = 256 * 1024;
const MAX_DIFF_BYTES = 512 * 1024;
const MANDATORY_EXCLUDES = [
  "**/.git/**",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/*.keystore",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/*credentials*",
  "**/*secret*",
  "**/.npmrc",
  "**/.pypirc",
  "**/.netrc",
  "**/node_modules/**",
  "**/vendor/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
];
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".doc",
  ".docx",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".so",
  ".tar",
  ".tiff",
  ".webp",
  ".xls",
  ".xlsx",
  ".zip",
]);

export class RepositoryReader {
  private bytesRead = 0;
  private readonly readFiles = new Set<string>();
  private readonly includeMatchers;
  private readonly excludeMatchers;
  private rootRealpath?: string;

  constructor(
    private readonly workspace: string,
    private readonly policy: AnalysisPolicy,
  ) {
    this.includeMatchers = policy.include.map((pattern) =>
      picomatch(normalizePattern(pattern), { dot: true }),
    );
    this.excludeMatchers = [...MANDATORY_EXCLUDES, ...policy.exclude].map(
      (pattern) =>
        picomatch(normalizePattern(pattern), { dot: true, nocase: true }),
    );
  }

  async listFiles(pattern = "**"): Promise<string[]> {
    const requested = picomatch(normalizePattern(pattern), { dot: true });
    const files = await fg(this.policy.include, {
      cwd: this.workspace,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
      ignore: [...MANDATORY_EXCLUDES, ...this.policy.exclude],
    });
    const readable: string[] = [];
    for (const file of files.sort()) {
      if (readable.length >= this.policy.limits.maxFiles) break;
      const normalized = normalizeRelative(file);
      if (!requested(normalized) || !this.allows(normalized)) continue;
      try {
        await this.resolveReadable(normalized);
        readable.push(normalized);
      } catch {
        // Invalid, binary, symlinked, or escaped paths are never listed.
      }
    }
    return readable;
  }

  async readText(
    file: string,
    startLine = 1,
    endLine?: number,
  ): Promise<string> {
    const normalized = normalizeRelative(file);
    if (!this.allows(normalized)) throw new Error("Path is excluded by policy");
    const absolute = await this.resolveReadable(normalized);
    if (
      !this.readFiles.has(normalized) &&
      this.readFiles.size >= this.policy.limits.maxFiles
    ) {
      throw new Error("Repository file-count budget exhausted");
    }
    this.readFiles.add(normalized);
    const remaining = this.policy.limits.maxReadBytes - this.bytesRead;
    if (remaining <= 0) throw new Error("Repository read budget exhausted");
    const stat = await lstat(absolute);
    if (stat.size > this.policy.limits.maxReadBytes) {
      throw new Error("File exceeds repository read budget");
    }
    const source = await readFile(absolute, "utf8");
    if (source.includes("\u0000")) throw new Error("Binary file detected");
    const lines = source.split("\n");
    const selected = lines
      .slice(Math.max(0, startLine - 1), endLine)
      .join("\n");
    const bytes = Math.min(
      Buffer.byteLength(selected),
      MAX_SINGLE_READ,
      remaining,
    );
    this.bytesRead += bytes;
    return Buffer.from(selected).subarray(0, bytes).toString("utf8");
  }

  async searchText(
    query: string,
  ): Promise<Array<{ path: string; line: number; text: string }>> {
    if (!query.trim() || query.length > 200) {
      throw new Error("Invalid search query");
    }
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const file of await this.listFiles()) {
      if (matches.length >= 100) break;
      try {
        const source = await this.readText(file);
        source.split("\n").forEach((text, index) => {
          if (
            matches.length < 100 &&
            text.toLowerCase().includes(query.toLowerCase())
          ) {
            matches.push({
              path: file,
              line: index + 1,
              text: text.slice(0, 500),
            });
          }
        });
      } catch {
        // A policy or byte-limit failure cannot make a file readable.
      }
    }
    return matches;
  }

  async assertEvidencePaths(paths: string[]): Promise<void> {
    for (const file of new Set(paths)) {
      const normalized = normalizeRelative(file);
      if (!this.allows(normalized)) {
        throw new Error(`Evidence references excluded path: ${file}`);
      }
      await this.resolveReadable(normalized);
    }
  }

  async assertEvidence(
    evidence: Array<{
      path: string;
      startLine: number | null;
      endLine: number | null;
    }>,
  ): Promise<void> {
    for (const item of evidence) {
      const normalized = normalizeRelative(item.path);
      if (!this.allows(normalized)) {
        throw new Error(`Evidence references excluded path: ${item.path}`);
      }
      const absolute = await this.resolveReadable(normalized);
      const lineCount = (await readFile(absolute, "utf8")).split("\n").length;
      if (
        (item.startLine !== null && item.startLine > lineCount) ||
        (item.endLine !== null &&
          (item.startLine === null ||
            item.endLine < item.startLine ||
            item.endLine > lineCount))
      ) {
        throw new Error(`Evidence references invalid lines: ${item.path}`);
      }
    }
  }

  async diff(baseSha: string | undefined, headSha: string): Promise<string> {
    const head = safeRef(headSha);
    const nameArgs = baseSha
      ? ["diff", "--name-only", safeRef(baseSha), head, "--"]
      : ["show", "--format=", "--name-only", head, "--"];
    const candidates = (
      await execFileAsync("git", nameArgs, {
        cwd: this.workspace,
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
      })
    ).stdout
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean)
      .map(normalizeRelative);
    const names: string[] = [];
    for (const name of candidates) {
      if (!this.allows(name)) continue;
      if (
        !this.readFiles.has(name) &&
        this.readFiles.size >= this.policy.limits.maxFiles
      ) {
        break;
      }
      try {
        await this.resolveReadable(name);
      } catch {
        continue;
      }
      this.readFiles.add(name);
      names.push(name);
    }
    if (!names.length) return "";
    const args = baseSha
      ? [
          "diff",
          "--no-ext-diff",
          "--unified=2",
          safeRef(baseSha),
          head,
          "--",
          ...names,
        ]
      : [
          "show",
          "--no-ext-diff",
          "--format=fuller",
          "--unified=2",
          head,
          "--",
          ...names,
        ];
    const { stdout } = await execFileAsync("git", args, {
      cwd: this.workspace,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 30_000,
    });
    const remaining = this.policy.limits.maxReadBytes - this.bytesRead;
    if (remaining <= 0) throw new Error("Repository read budget exhausted");
    const bytes = Math.min(
      Buffer.byteLength(stdout),
      MAX_DIFF_BYTES,
      remaining,
    );
    this.bytesRead += bytes;
    return Buffer.from(stdout).subarray(0, bytes).toString("utf8");
  }

  private allows(relative: string): boolean {
    return (
      !BINARY_EXTENSIONS.has(path.posix.extname(relative).toLowerCase()) &&
      this.includeMatchers.some((match) => match(relative)) &&
      !this.excludeMatchers.some((match) => match(relative))
    );
  }

  private async resolveReadable(relative: string): Promise<string> {
    const absolute = path.resolve(this.workspace, relative);
    const lexical = path.relative(this.workspace, absolute);
    if (lexical.startsWith("..") || path.isAbsolute(lexical)) {
      throw new Error("Requested path is outside the repository");
    }
    await this.assertNoSymlinkComponents(absolute);
    const root = (this.rootRealpath ??= await realpath(this.workspace));
    const resolved = await realpath(absolute);
    const contained = path.relative(root, resolved);
    if (contained.startsWith("..") || path.isAbsolute(contained)) {
      throw new Error("Requested path escapes the repository");
    }
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Only regular non-symlink files can be read");
    }
    const handle = await open(absolute, "r");
    try {
      const prefix = Buffer.alloc(Math.min(stat.size, 8 * 1024));
      const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
      if (prefix.subarray(0, bytesRead).includes(0)) {
        throw new Error("Binary files cannot be read");
      }
    } finally {
      await handle.close();
    }
    return absolute;
  }

  private async assertNoSymlinkComponents(absolute: string): Promise<void> {
    const relative = path.relative(this.workspace, absolute);
    let current = this.workspace;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error("Symlink paths cannot be read");
      }
    }
  }
}

function normalizeRelative(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Invalid repository-relative path");
  }
  return normalized;
}

function normalizePattern(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "") || "**";
}

function safeRef(value: string): string {
  if (!/^[a-fA-F0-9]{7,64}$/.test(value)) {
    throw new Error("Git reference must be a commit SHA");
  }
  return value;
}
