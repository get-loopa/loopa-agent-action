import { afterEach, describe, expect, it } from 'vitest';
import { createToolBudget, loadSystemPrompt } from '../src/agent.js';

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

describe('repository tool budget', () => {
  it('allows the configured number of calls and rejects any additional call', async () => {
    const budget = createToolBudget(2);

    await expect(budget.run(() => 'first')).resolves.toBe('first');
    await expect(budget.run(() => 'second')).resolves.toBe('second');
    expect(budget.exhausted()).toBe(true);
    await expect(budget.run(() => 'third')).rejects.toThrow(
      'Repository tool-call limit reached (2)',
    );
  });
});
