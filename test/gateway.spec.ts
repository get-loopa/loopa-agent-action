import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { setSecret } = vi.hoisted(() => ({ setSecret: vi.fn() }));
vi.mock('@actions/core', () => ({
  getIDToken: vi.fn().mockResolvedValue('github-oidc-token'),
  setSecret,
}));

import { bootstrapGateway } from '../src/gateway.js';

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
  setSecret.mockClear();
});

describe('Loopa inference gateway', () => {
  it('uses a short-lived Loopa token without receiving provider credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: '1',
            sessionId: '019f7b79-79dd-7c09-a521-26282df31786',
            token: `loopa_gha_${'a'.repeat(43)}`,
            expiresAt: '2026-07-28T23:59:00.000Z',
            route: { provider: 'anthropic', model: 'claude-test' },
            policy: {
              version: '1',
              policyVersion: 'policy-v1',
              tasks: ['architecture'],
              additionalInstructions: null,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: '1',
            content: [{ type: 'text', text: '{"summary":"ok"}' }],
            finishReason: { unified: 'stop' },
            usage: {
              inputTokens: {
                total: 12,
                noCache: 12,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 4, text: 4, reasoning: 0 },
            },
            warnings: [],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const session = await bootstrapGateway({
      apiBase: 'https://api.getloopa.co',
      connectionId: '0196e561-5f4f-7d42-9d48-c6c99df829af',
      context,
    });
    expect(session.provider).toBe('anthropic');
    expect(session.policy.tasks).toEqual(['architecture']);
    expect(setSecret).toHaveBeenCalledWith('github-oidc-token');
    expect(setSecret).toHaveBeenCalledWith(
      `loopa_gha_${'a'.repeat(43)}`,
    );

    if (typeof session.languageModel === 'string') {
      throw new Error('Expected a gateway language model');
    }
    const system = await readFile('prompts/engineering-v1.md', 'utf8');
    const result = await session.languageModel.doGenerate({
      prompt: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Inspect the bounded context.' }],
        },
      ],
    });
    expect(result.content).toEqual([
      { type: 'text', text: '{"summary":"ok"}' },
    ]);
    const inferenceRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(inferenceRequest.headers).toMatchObject({
      authorization: `Bearer loopa_gha_${'a'.repeat(43)}`,
    });
    expect(String(inferenceRequest.body)).not.toContain('provider-api-key');
  });
});
