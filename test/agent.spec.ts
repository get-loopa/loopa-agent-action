import { afterEach, describe, expect, it } from 'vitest';
import { loadSystemPrompt } from '../src/agent.js';

const originalActionPath = process.env.GITHUB_ACTION_PATH;

afterEach(() => {
  if (originalActionPath === undefined) {
    delete process.env.GITHUB_ACTION_PATH;
  } else {
    process.env.GITHUB_ACTION_PATH = originalActionPath;
  }
});

describe('system prompt discovery', () => {
  it('loads the prompt from the installed Action root without GITHUB_ACTION_PATH', async () => {
    delete process.env.GITHUB_ACTION_PATH;

    await expect(loadSystemPrompt()).resolves.toContain(
      "You are Loopa's repository analysis agent.",
    );
  });
});
