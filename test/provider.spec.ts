import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPENCODE_GO_BASE_URL,
  openCodeGoTransport,
  resolveModel,
} from '../src/provider.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenCode Go provider', () => {
  it('uses the OpenAI-compatible chat endpoint and Bearer authentication', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: 'chatcmpl_test',
        object: 'chat.completion',
        created: 1,
        model: 'grok-4.5',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'OK' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const resolved = resolveModel({
      provider: 'opencode-go',
      model: 'grok-4.5',
      apiKey: 'organization-a-secret',
    });
    await generateText({ model: resolved.model, prompt: 'Reply OK.' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${OPENCODE_GO_BASE_URL}/chat/completions`);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer organization-a-secret',
    );
    expect(resolved.provider).toBe('opencode-go');
  });

  it('uses the Anthropic-compatible messages endpoint and x-api-key authentication', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'minimax-m3',
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const resolved = resolveModel({
      provider: 'opencode-go',
      model: 'minimax-m3',
      apiKey: 'organization-b-secret',
    });
    await generateText({ model: resolved.model, prompt: 'Reply OK.' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${OPENCODE_GO_BASE_URL}/messages`);
    expect(new Headers(init?.headers).get('x-api-key')).toBe(
      'organization-b-secret',
    );
    expect(resolved.provider).toBe('opencode-go');
  });

  it('rejects models that have not been validated for a transport', () => {
    expect(() => openCodeGoTransport('new-unvalidated-model')).toThrow(
      /Unsupported OpenCode Go model/,
    );
  });
});
