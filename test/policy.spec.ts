import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  getIDToken: vi.fn().mockResolvedValue('oidc-token'),
  setSecret: vi.fn(),
}));

import { fetchAnalysisPolicy } from '../src/policy.js';

const context = {
  repository: { id: '123', fullName: 'get-loopa/backend' },
  run: {
    id: '456',
    attempt: 1,
    event: 'push',
    ref: 'refs/heads/main',
    headSha: 'a'.repeat(40),
    workflowRef:
      'get-loopa/backend/.github/workflows/loopa-analysis.yml@refs/heads/main',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dynamic analysis policy', () => {
  it('accepts a validated bounded policy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: '1',
            policyVersion: 'policy-v7',
            tasks: ['architecture'],
            additionalInstructions: 'Focus on rollback behavior.',
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await fetchAnalysisPolicy({
      apiBase: 'https://api.getloopa.co',
      connectionId: '0196e561-5f4f-7d42-9d48-c6c99df829af',
      context,
    });

    expect(result.warning).toBeUndefined();
    expect(result.policy?.policyVersion).toBe('policy-v7');
  });

  it('falls back without throwing when the policy is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: '1',
            policyVersion: 'invalid',
            tasks: [],
            additionalInstructions: null,
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await fetchAnalysisPolicy({
      apiBase: 'https://api.getloopa.co',
      connectionId: '0196e561-5f4f-7d42-9d48-c6c99df829af',
      context,
    });

    expect(result.policy).toBeNull();
    expect(result.warning).toContain('local repository settings were used');
  });
});
