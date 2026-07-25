import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  actionConfigSchema,
  modelOutputSchema,
  modelProposalSchema,
  normalizeModelOutput,
} from '../src/contracts.js';

function expectAllObjectPropertiesRequired(schema: unknown): void {
  if (Array.isArray(schema)) {
    for (const item of schema) expectAllObjectPropertiesRequired(item);
    return;
  }
  if (!schema || typeof schema !== 'object') return;
  const object = schema as Record<string, unknown>;
  if (object.properties && typeof object.properties === 'object') {
    const propertyNames = Object.keys(object.properties);
    expect(object.required).toEqual(expect.arrayContaining(propertyNames));
    expect(object.required).toHaveLength(propertyNames.length);
  }
  for (const value of Object.values(object)) {
    expectAllObjectPropertiesRequired(value);
  }
}

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

  it('uses a strict structured-output schema for model providers', () => {
    expectAllObjectPropertiesRequired(z.toJSONSchema(modelOutputSchema));
  });

  it('removes nullable placeholders from the uploaded report', () => {
    const report = normalizeModelOutput(
      modelOutputSchema.parse({
        summary: 'One documentation gap found.',
        warnings: [],
        proposals: [
          {
            proposalKey: 'missing-operations-guide',
            kind: 'update-recommendation',
            title: 'Document the deployment process',
            summary: 'The deployment workflow is undocumented.',
            rationale: 'Operators need a reliable deployment reference.',
            draftMarkdown: null,
            targetHints: {
              titles: ['Deployment'],
              domains: ['operations'],
              paths: ['.github/workflows/deploy.yml'],
            },
            evidence: [
              {
                path: '.github/workflows/deploy.yml',
                startLine: null,
                endLine: null,
                commitSha: null,
                description: 'Production deployment workflow.',
              },
            ],
            confidence: 0.9,
          },
        ],
      }),
    );

    expect(report.proposals[0]).not.toHaveProperty('draftMarkdown');
    expect(report.proposals[0]?.evidence[0]).not.toHaveProperty('startLine');
    expect(report.proposals[0]?.evidence[0]).not.toHaveProperty('endLine');
    expect(report.proposals[0]?.evidence[0]).not.toHaveProperty('commitSha');
  });
});
