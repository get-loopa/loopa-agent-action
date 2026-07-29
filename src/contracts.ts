import { z } from "zod";

export const CONTRACT_VERSION = "3" as const;

export const providerSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "azure-openai",
  "openrouter",
  "fireworks",
  "huggingface",
  "opencode-go",
  "openai-compatible",
]);

export const questionSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().min(0).max(49),
  text: z.string().min(1).max(2_000),
});

export const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().min(1).max(8_000),
  evidenceRefs: z.array(z.string().regex(/^ev_[a-f0-9]{32}$/)).max(100),
  status: z.enum(["answered", "not-found", "conflicting"]),
});

export const policySchema = z.object({
  tasks: z
    .array(
      z.enum(["documentation", "architecture", "operations", "release-notes"]),
    )
    .min(1)
    .max(4),
  include: z.array(z.string().min(1).max(500)).min(1).max(50),
  exclude: z.array(z.string().min(1).max(500)).max(100),
  additionalInstructions: z.string().max(8_000).optional(),
  limits: z.object({
    maxFiles: z.number().int().positive().max(1_000),
    maxReadBytes: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
    maxToolCalls: z.number().int().positive().max(20),
  }),
});

export const sourceSchema = z.object({
  connectionId: z.string().uuid(),
  repositoryId: z.string().min(1).max(40),
  repository: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/)
    .max(300),
  owner: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  ref: z.string().min(1).max(500),
});

export const providerEnvelopeSchema = z
  .object({
    adapterKey: providerSchema,
    modelId: z.string().min(1).max(300),
    endpointOptions: z
      .object({
        baseUrl: z.string().url().optional(),
        azureResourceName: z.string().min(1).max(200).optional(),
        azureApiVersion: z.string().min(1).max(100).optional(),
        transport: z
          .enum(["openai-compatible", "anthropic-compatible"])
          .optional(),
      })
      .strict(),
    credential: z.string().min(1).max(20_000),
    promptVersion: z.string().min(1).max(100),
    credentialVersion: z.string().min(1).max(200),
  })
  .strict();

const runtimeBase = z.object({
  version: z.literal(CONTRACT_VERSION),
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
});

export const prepareRuntimeSchema = runtimeBase.extend({
  phase: z.literal("prepare"),
  sources: z.array(sourceSchema).min(1).max(50),
});

export const extractRuntimeSchema = runtimeBase.extend({
  phase: z.literal("extract"),
  source: sourceSchema,
  policy: policySchema,
  prompt: z.object({
    version: z.string().min(1).max(100),
    text: z.string().min(1).max(30_000),
  }),
  questions: z.array(questionSchema).max(50),
  provider: providerEnvelopeSchema,
  capsuleSigningKey: z.string().min(32).max(200),
});

export const synthesizeRuntimeSchema = runtimeBase.extend({
  phase: z.literal("synthesize"),
  sources: z.array(sourceSchema).min(1).max(50),
  prompt: z.object({
    version: z.string().min(1).max(100),
    text: z.string().min(1).max(30_000),
  }),
  questions: z.array(questionSchema).max(50),
  provider: providerEnvelopeSchema,
  capsuleSigningKey: z.string().min(32).max(200),
  capsuleManifest: z.array(
    z.object({
      connectionId: z.string().uuid(),
      repositoryId: z.string().min(1).max(40),
    }),
  ),
});

export const proposalKindSchema = z.enum([
  "new-document",
  "update-recommendation",
  "adr",
  "runbook",
  "release-notes",
  "documentation-gap",
]);

const modelEvidenceSchema = z.object({
  path: z.string().min(1).max(500),
  startLine: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable(),
  description: z.string().min(1).max(1_000),
});

const modelProposalSchema = z.object({
  proposalKey: z.string().min(1).max(160),
  kind: proposalKindSchema,
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(4_000),
  rationale: z.string().min(1).max(4_000),
  draftMarkdown: z.string().max(200_000).nullable(),
  targetHints: z.object({
    titles: z.array(z.string().max(240)).max(20),
    domains: z.array(z.string().max(160)).max(20),
    paths: z.array(z.string().max(500)).max(50),
  }),
  evidence: z.array(modelEvidenceSchema).min(1).max(100),
  confidence: z.number().min(0).max(1),
});

export const extractionOutputSchema = z.object({
  summary: z.string().min(1).max(8_000),
  proposals: z.array(modelProposalSchema).max(50),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string().min(1).max(8_000),
        status: z.enum(["answered", "not-found", "conflicting"]),
        evidence: z.array(modelEvidenceSchema).max(100),
      }),
    )
    .max(50),
  warnings: z.array(z.string().max(2_000)).max(50),
});

export const evidenceSchema = z.object({
  key: z.string().regex(/^ev_[a-f0-9]{32}$/),
  repositoryId: z.string().min(1).max(40),
  repository: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/)
    .max(300),
  path: z.string().min(1).max(500),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  commitSha: z.string().regex(/^[a-fA-F0-9]{40,64}$/),
  description: z.string().min(1).max(1_000),
});

export const capsuleSchema = z.object({
  schemaVersion: z.literal(CONTRACT_VERSION),
  extractionPromptVersion: z.string().min(1).max(100),
  credentialVersion: z.string().min(1).max(200),
  source: z.object({
    connectionId: z.string().uuid(),
    repository: z.object({
      id: z.string().min(1).max(40),
      fullName: z
        .string()
        .regex(/^[^/\s]+\/[^/\s]+$/)
        .max(300),
    }),
    ref: z.string().min(1).max(500),
    headSha: z.string().regex(/^[a-fA-F0-9]{40,64}$/),
  }),
  summary: z.string().min(1).max(8_000),
  findings: z
    .array(
      z.object({
        proposalKey: z.string().min(1).max(160),
        kind: proposalKindSchema,
        title: z.string().min(1).max(240),
        statement: z.string().min(1).max(4_000),
        rationale: z.string().min(1).max(4_000),
        draftMarkdown: z.string().max(200_000).nullable(),
        targetHints: z.object({
          titles: z.array(z.string().max(240)).max(20),
          domains: z.array(z.string().max(160)).max(20),
          paths: z.array(z.string().max(500)).max(50),
        }),
        evidenceRefs: z
          .array(z.string().regex(/^ev_[a-f0-9]{32}$/))
          .min(1)
          .max(100),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(50),
  answers: z.array(answerSchema).max(50),
  evidence: z.array(evidenceSchema).max(500),
  warnings: z.array(z.string().max(2_000)).max(50),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const signedCapsuleSchema = z.object({
  capsule: capsuleSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export const synthesisOutputSchema = z.object({
  summary: z.string().min(1).max(8_000),
  proposals: z
    .array(
      z.object({
        proposalKey: z.string().min(1).max(160),
        kind: proposalKindSchema,
        title: z.string().min(1).max(240),
        summary: z.string().min(1).max(4_000),
        rationale: z.string().min(1).max(4_000),
        draftMarkdown: z.string().max(200_000).nullable(),
        targetHints: z.object({
          titles: z.array(z.string().max(240)).max(20),
          domains: z.array(z.string().max(160)).max(20),
          paths: z.array(z.string().max(500)).max(50),
        }),
        evidenceRefs: z
          .array(z.string().regex(/^ev_[a-f0-9]{32}$/))
          .min(1)
          .max(100),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(50),
  answers: z.array(answerSchema).max(50),
  warnings: z.array(z.string().max(2_000)).max(100),
});

export const reportSchema = z.object({
  schemaVersion: z.literal(CONTRACT_VERSION),
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  coordinatorConnectionId: z.string().uuid(),
  run: z.object({
    id: z.string().min(1).max(40),
    attempt: z.literal(1),
    event: z.literal("workflow_dispatch"),
    ref: z.string().max(500),
    headSha: z.string().regex(/^[a-fA-F0-9]{40,64}$/),
    workflowRef: z.string().min(1).max(1_000),
  }),
  agent: z.object({
    provider: providerSchema,
    model: z.string().min(1).max(300),
    actionVersion: z.literal("3.0.0"),
    extractionPromptVersion: z.string().min(1).max(100),
    synthesisPromptVersion: z.string().min(1).max(100),
    credentialVersion: z.string().min(1).max(200),
  }),
  sources: z
    .array(
      z.object({
        connectionId: z.string().uuid(),
        repository: z.object({
          id: z.string().min(1).max(40),
          fullName: z
            .string()
            .regex(/^[^/\s]+\/[^/\s]+$/)
            .max(300),
        }),
        ref: z.string().min(1).max(500),
        headSha: z.string().regex(/^[a-fA-F0-9]{40,64}$/),
        summary: z.string().min(1).max(8_000),
        warnings: z.array(z.string().max(2_000)).max(50),
      }),
    )
    .min(1)
    .max(50),
  summary: z.string().min(1).max(8_000),
  evidence: z.array(evidenceSchema).max(5_000),
  proposals: z.array(
    z.object({
      proposalKey: z.string().min(1).max(160),
      kind: proposalKindSchema,
      title: z.string().min(1).max(240),
      summary: z.string().min(1).max(4_000),
      rationale: z.string().min(1).max(4_000),
      draftMarkdown: z.string().max(200_000).optional(),
      targetHints: z
        .object({
          titles: z.array(z.string().max(240)).max(20),
          domains: z.array(z.string().max(160)).max(20),
          paths: z.array(z.string().max(500)).max(50),
        })
        .optional(),
      evidence: z.array(evidenceSchema).min(1).max(100),
      confidence: z.number().min(0).max(1),
    }),
  ),
  answers: z.array(answerSchema).max(50),
  warnings: z.array(z.string().max(2_000)).max(100),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type ProviderEnvelope = z.infer<typeof providerEnvelopeSchema>;
export type AnalysisPolicy = z.infer<typeof policySchema>;
export type Question = z.infer<typeof questionSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Capsule = z.infer<typeof capsuleSchema>;
export type LoopaReport = z.infer<typeof reportSchema>;
