import { readFile } from 'node:fs/promises';

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

export async function githubRunContext(): Promise<GithubRunContext> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const payload: EventPayload = eventPath
    ? (JSON.parse(await readFile(eventPath, 'utf8')) as EventPayload)
    : {};
  const event = process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch';
  const baseSha =
    nestedString(payload, ['pull_request', 'base', 'sha']) ??
    nestedString(payload, ['before']);
  const headSha =
    nestedString(payload, ['pull_request', 'head', 'sha']) ??
    nestedString(payload, ['after']) ??
    process.env.GITHUB_SHA ??
    '';
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
