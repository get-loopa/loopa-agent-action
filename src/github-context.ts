import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type EventPayload = Record<string, unknown>;

function nestedString(payload: EventPayload, path: string[]): string | undefined {
  let value: unknown = payload;
  for (const key of path) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' && value ? value : undefined;
}

export type GithubRunContext = {
  repository: { id: string; fullName: string };
  run: {
    id: string;
    attempt: number;
    event: string;
    ref: string;
    headSha: string;
    baseSha?: string;
    workflowRef: string;
  };
};

async function previousReleaseSha(headSha: string): Promise<string | undefined> {
  if (!/^[a-fA-F0-9]{7,64}$/.test(headSha)) return undefined;
  try {
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const { stdout: tagOutput } = await execFileAsync(
      'git',
      ['describe', '--tags', '--abbrev=0', `${headSha}^`],
      { cwd: workspace, timeout: 30_000 },
    );
    const tag = tagOutput.trim();
    if (!tag) return undefined;
    const { stdout: shaOutput } = await execFileAsync(
      'git',
      ['rev-list', '-n', '1', tag],
      { cwd: workspace, timeout: 30_000 },
    );
    const sha = shaOutput.trim();
    return /^[a-fA-F0-9]{40,64}$/.test(sha) ? sha : undefined;
  } catch {
    // A repository's first release has no earlier tag and uses a single-commit analysis.
    return undefined;
  }
}

export async function githubRunContext(): Promise<GithubRunContext> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const payload: EventPayload = eventPath
    ? (JSON.parse(await readFile(eventPath, 'utf8')) as EventPayload)
    : {};
  const event = process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch';
  let baseSha =
    nestedString(payload, ['pull_request', 'base', 'sha']) ??
    nestedString(payload, ['before']);
  const headSha =
    nestedString(payload, ['pull_request', 'head', 'sha']) ??
    nestedString(payload, ['after']) ??
    process.env.GITHUB_SHA ??
    '';
  if (event === 'release' && !baseSha) {
    baseSha = await previousReleaseSha(headSha);
  }
  return {
    repository: {
      id: process.env.GITHUB_REPOSITORY_ID ?? '',
      fullName: process.env.GITHUB_REPOSITORY ?? '',
    },
    run: {
      id: process.env.GITHUB_RUN_ID ?? '',
      attempt: Number.parseInt(process.env.GITHUB_RUN_ATTEMPT ?? '1', 10),
      event,
      ref: process.env.GITHUB_REF ?? '',
      headSha,
      ...(baseSha && !/^0+$/.test(baseSha) ? { baseSha } : {}),
      workflowRef: process.env.GITHUB_WORKFLOW_REF ?? '',
    },
  };
}
