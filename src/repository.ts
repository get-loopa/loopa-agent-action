import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import type { ActionConfig } from './contracts.js';

const execFileAsync = promisify(execFile);
const MAX_SINGLE_READ = 256 * 1024;
const MANDATORY_EXCLUDES = [
  '**/.git/**',
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa*',
  '**/node_modules/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
];

const BINARY_EXTENSIONS = new Set([
  '.7z', '.avi', '.bin', '.bmp', '.class', '.dll', '.doc', '.docx', '.exe',
  '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.mov', '.mp3', '.mp4',
  '.pdf', '.png', '.ppt', '.pptx', '.so', '.tar', '.tiff', '.webp', '.xls',
  '.xlsx', '.zip',
]);

function safeRef(value: string): string {
  if (!/^[a-fA-F0-9]{7,64}$/.test(value)) {
    throw new Error('Git reference must be a commit SHA');
  }
  return value;
}

export class RepositoryReader {
  private bytesRead = 0;
  private readonly excludes: string[];

  constructor(
    private readonly workspace: string,
    private readonly config: ActionConfig,
  ) {
    this.excludes = [...MANDATORY_EXCLUDES, ...config.analysis.exclude];
  }

  private resolveFile(file: string): string {
    const absolute = path.resolve(this.workspace, file);
    const relative = path.relative(this.workspace, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Requested path is outside GITHUB_WORKSPACE');
    }
    if (BINARY_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
      throw new Error('Binary files cannot be read');
    }
    return absolute;
  }

  async listFiles(pattern = '**'): Promise<string[]> {
    const patterns = this.config.analysis.include.map((include) =>
      pattern === '**' ? include : pattern,
    );
    const files = await fg(patterns, {
      cwd: this.workspace,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
      ignore: this.excludes,
    });
    return files
      .filter((file) => !BINARY_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .sort()
      .slice(0, this.config.limits['max-files']);
  }

  async readText(
    file: string,
    startLine = 1,
    endLine?: number,
  ): Promise<string> {
    const absolute = this.resolveFile(file);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Only regular non-symlink files can be read');
    }
    const remaining = this.config.limits['max-read-bytes'] - this.bytesRead;
    if (remaining <= 0) throw new Error('Repository read budget exhausted');
    const source = await readFile(absolute, 'utf8');
    if (source.includes('\u0000')) throw new Error('Binary file detected');
    const lines = source.split('\n');
    const selected = lines.slice(Math.max(0, startLine - 1), endLine).join('\n');
    const bytes = Math.min(Buffer.byteLength(selected), MAX_SINGLE_READ, remaining);
    this.bytesRead += bytes;
    return Buffer.from(selected).subarray(0, bytes).toString('utf8');
  }

  async searchText(query: string): Promise<Array<{ path: string; line: number; text: string }>> {
    if (!query.trim() || query.length > 200) throw new Error('Invalid search query');
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const file of await this.listFiles()) {
      if (matches.length >= 100) break;
      try {
        const source = await this.readText(file);
        source.split('\n').forEach((text, index) => {
          if (matches.length < 100 && text.toLowerCase().includes(query.toLowerCase())) {
            matches.push({ path: file, line: index + 1, text: text.slice(0, 500) });
          }
        });
      } catch {
        // Unreadable, binary, and budget-exhausted files are intentionally skipped.
      }
    }
    return matches;
  }

  async diff(baseSha: string | undefined, headSha: string): Promise<string> {
    const head = safeRef(headSha);
    const args = baseSha
      ? ['diff', '--no-ext-diff', '--unified=2', safeRef(baseSha), head, '--']
      : ['show', '--no-ext-diff', '--format=fuller', '--unified=2', head, '--'];
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.workspace,
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    return stdout.slice(0, 512 * 1024);
  }
}
