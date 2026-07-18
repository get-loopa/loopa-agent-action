import { z } from 'zod';

export const providerSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'azure-openai',
  'openrouter',
  'fireworks',
  'openai-compatible',
]);

export const proposalKindSchema = z.enum([
  'new-document',
  'update-recommendation',
  'adr',
  'runbook',
  'release-notes',
  'documentation-gap',
]);

export const evidenceSchema = z.object({
  path: z.string().min(1).max(500),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  commitSha: z.string().max(64).optional(),
  description: z.string().min(1).max(1_000),
});

export const modelProposalSchema = z
  .object({
    proposalKey: z.string().min(1).max(160),
    kind: proposalKindSchema,
    title: z.string().min(1).max(240),
    summary: z.string().min(1).max(4_000),
    rationale: z.string().min(1).max(4_000),
    draftMarkdown: z.string().max(200_000).optional(),
    targetHints: z
      .object({
        titles: z.array(z.string().max(240)).max(20).default([]),
        domains: z.array(z.string().max(160)).max(20).default([]),
        paths: z.array(z.string().max(500)).max(50).default([]),
      })
      .optional(),
    evidence: z.array(evidenceSchema).min(1).max(100),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((proposal, ctx) => {
    if (
      ['new-document', 'adr', 'runbook', 'release-notes'].includes(
        proposal.kind,
      ) &&
      !proposal.draftMarkdown?.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['draftMarkdown'],
        message: 'A complete Markdown draft is required for this proposal kind.',
      });
    }
  });

export const modelReportSchema = z.object({
  summary: z.string().min(1).max(8_000),
  proposals: z.array(modelProposalSchema).max(50),
  warnings: z.array(z.string().max(2_000)).max(50).default([]),
});

export const reportSchema = modelReportSchema.extend({
  schemaVersion: z.literal('1'),
  connectionId: z.string().uuid(),
  repository: z.object({
    id: z.string().min(1).max(40),
    fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/).max(300),
  }),
  run: z.object({
    id: z.string().min(1).max(40),
    attempt: z.number().int().positive(),
    event: z.string().min(1).max(100),
    ref: z.string().max(500),
    headSha: z.string().max(64),
    baseSha: z.string().max(64).optional(),
    workflowRef: z.string().min(1).max(1_000),
  }),
  agent: z.object({
    provider: providerSchema,
    model: z.string().min(1).max(300),
    actionVersion: z.string().min(1).max(100),
    promptVersion: z.string().min(1).max(100),
  }),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type ProviderName = z.infer<typeof providerSchema>;
export type ModelReport = z.infer<typeof modelReportSchema>;
export type LoopaReport = z.infer<typeof reportSchema>;

export const actionConfigSchema = z.object({
  version: z.literal(1),
  analysis: z
    .object({
      tasks: z
        .array(
          z.enum([
            'documentation',
            'architecture',
            'operations',
            'release-notes',
          ]),
        )
        .min(1)
        .default(['documentation', 'architecture', 'operations']),
      include: z.array(z.string().min(1).max(500)).max(50).default(['**']),
      exclude: z.array(z.string().min(1).max(500)).max(100).default([]),
    })
    .default({
      tasks: ['documentation', 'architecture', 'operations'],
      include: ['**'],
      exclude: [],
    }),
  limits: z
    .object({
      'max-files': z.number().int().positive().max(1_000).default(250),
      'max-read-bytes': z
        .number()
        .int()
        .positive()
        .max(5 * 1024 * 1024)
        .default(1024 * 1024),
      'max-tool-calls': z.number().int().positive().max(20).default(20),
    })
    .default({
      'max-files': 250,
      'max-read-bytes': 1024 * 1024,
      'max-tool-calls': 20,
    }),
});

export type ActionConfig = z.infer<typeof actionConfigSchema>;
