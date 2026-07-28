import * as core from '@actions/core';
import { analysisPolicySchema, type AnalysisPolicy } from './contracts.js';
import type { GithubRunContext } from './github-context.js';

const MAX_POLICY_BYTES = 32 * 1024;

export async function fetchAnalysisPolicy(input: {
  apiBase: string;
  connectionId: string;
  context: GithubRunContext;
}): Promise<{ policy: AnalysisPolicy | null; warning?: string }> {
  try {
    const base = new URL(input.apiBase);
    if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
      throw new Error('loopa-api-url must use HTTPS');
    }
    const audience = new URL('/github-actions', base)
      .toString()
      .replace(/\/$/, '');
    const token = await core.getIDToken(audience);
    core.setSecret(token);
    const response = await fetch(new URL('/api/github/actions/policy', base), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'loopa-agent-action/1.2.0',
      },
      body: JSON.stringify({
        connectionId: input.connectionId,
        repository: input.context.repository,
        run: {
          id: input.context.run.id,
          attempt: input.context.run.attempt,
          workflowRef: input.context.run.workflowRef,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`policy request returned ${response.status}`);
    }
    const source = await response.text();
    if (Buffer.byteLength(source) > MAX_POLICY_BYTES) {
      throw new Error('policy response exceeded 32 KiB');
    }
    return { policy: analysisPolicySchema.parse(JSON.parse(source)) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      policy: null,
      warning:
        `Dynamic Loopa analysis policy was unavailable; local repository settings were used (${detail}).`.slice(
          0,
          2_000,
        ),
    };
  }
}
