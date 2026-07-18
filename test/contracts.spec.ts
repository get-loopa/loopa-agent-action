import { describe, expect, it } from 'vitest';
import { actionConfigSchema, modelProposalSchema } from '../src/contracts.js';

describe('contracts', () => {
  it('applies safe default limits', () => {
    const parsed = actionConfigSchema.parse({ version: 1 });
    expect(parsed.limits['max-files']).toBe(250);
    expect(parsed.limits['max-read-bytes']).toBe(1024 * 1024);
    expect(parsed.limits['max-tool-calls']).toBe(20);
  });

  it('requires Markdown for new documents', () => {
    expect(() =>
      modelProposalSchema.parse({
        proposalKey: 'architecture-overview',
        kind: 'new-document',
        title: 'Architecture overview',
        summary: 'Document the architecture.',
        rationale: 'No overview exists.',
        evidence: [{ path: 'src/index.ts', description: 'Application entry point' }],
        confidence: 0.9,
      }),
    ).toThrow(/Markdown draft/);
  });
});
