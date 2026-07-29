import * as core from "@actions/core";
import path from "node:path";
import { analyzeRepository } from "./agent.js";
import { reportSchema } from "./contracts.js";
import { githubRunContext } from "./github-context.js";
import { resolveModel } from "./provider.js";
import { RepositoryReader } from "./repository.js";
import {
  extractRuntime,
  prepareRuntime,
  synthesizeRuntime,
} from "./runtime.js";
import { uploadReport } from "./upload.js";
import {
  createCapsule,
  readSignedCapsules,
  sourceHeadSha,
  synthesizeHierarchically,
  writeSignedCapsule,
} from "./workspace.js";

const ACTION_VERSION = "3.0.0";

async function run(): Promise<void> {
  const mode = core.getInput("mode", { required: true });
  if (mode === "prepare") return runPrepare();
  if (mode === "extract") return runExtract();
  if (mode === "synthesize") return runSynthesize();
  throw new Error(`Unsupported Loopa Action mode: ${mode}`);
}

async function runPrepare(): Promise<void> {
  const context = await githubRunContext();
  assertRun(context.run.attempt, context.run.event);
  const runtime = await prepareRuntime({
    apiBase: loopaApiBase(),
    workspaceId: requiredInput("workspace-id"),
    requestId: requiredInput("request-id"),
    context,
  });
  core.setOutput("source-matrix", JSON.stringify(runtime.sources));
  core.setOutput("request-id", runtime.requestId);
  core.setOutput("status", "prepared");
  core.info(`Authorized ${runtime.sources.length} workspace source(s).`);
}

async function runExtract(): Promise<void> {
  const workspace = requiredWorkspace();
  const context = await githubRunContext();
  assertRun(context.run.attempt, context.run.event);
  const workspaceId = requiredInput("workspace-id");
  const requestId = requiredInput("request-id");
  const connectionId = requiredInput("connection-id");
  const repository = requiredInput("source-repository").toLowerCase();
  const runtime = await extractRuntime({
    apiBase: loopaApiBase(),
    workspaceId,
    requestId,
    sourceConnectionId: connectionId,
    context,
  });
  if (
    runtime.source.connectionId !== connectionId ||
    runtime.source.repository.toLowerCase() !== repository
  ) {
    throw new Error("Source input does not match the frozen run");
  }
  const sourceRoot = path.resolve(
    workspace,
    core.getInput("source-root") || "source",
  );
  const relativeRoot = path.relative(workspace, sourceRoot);
  if (relativeRoot.startsWith("..") || path.isAbsolute(relativeRoot)) {
    throw new Error("source-root must resolve inside GITHUB_WORKSPACE");
  }
  const headSha = await sourceHeadSha(sourceRoot);
  const repositoryId = runtime.source.repositoryId;
  const model = resolveModel(runtime.provider);
  const reader = new RepositoryReader(sourceRoot, runtime.policy);
  const analyzed = await analyzeRepository({
    model,
    systemPrompt: runtime.prompt.text,
    questions: runtime.questions,
    reader,
    policy: runtime.policy,
    context: {
      repository: { id: repositoryId, fullName: repository },
      run: {
        ...context.run,
        ref: runtime.source.ref,
        headSha,
        baseSha: undefined,
      },
    },
  });
  const capsule = createCapsule({
    connectionId,
    repositoryId,
    repository,
    ref: runtime.source.ref,
    headSha,
    extractionPromptVersion: runtime.prompt.version,
    credentialVersion: runtime.provider.credentialVersion,
    output: analyzed.output,
    usage: analyzed.usage,
  });
  const output = await writeSignedCapsule(
    workspace,
    capsule,
    runtime.capsuleSigningKey,
  );
  core.setOutput("capsule-path", output);
  core.setOutput("request-id", runtime.requestId);
  core.setOutput("status", "extracted");
  core.info(`Created signed capsule for ${repository}@${headSha}.`);
}

async function runSynthesize(): Promise<void> {
  const workspace = requiredWorkspace();
  const context = await githubRunContext();
  assertRun(context.run.attempt, context.run.event);
  const workspaceId = requiredInput("workspace-id");
  const requestId = requiredInput("request-id");
  const runtime = await synthesizeRuntime({
    apiBase: loopaApiBase(),
    workspaceId,
    requestId,
    context,
  });
  const capsules = await readSignedCapsules({
    workspace,
    capsulesPath: core.getInput("capsules-path") || "capsules",
    sources: runtime.sources,
    manifest: runtime.capsuleManifest,
    signingKey: runtime.capsuleSigningKey,
  });
  const extractionPromptVersions = new Set(
    capsules.map((capsule) => capsule.extractionPromptVersion),
  );
  const credentialVersions = new Set(
    capsules.map((capsule) => capsule.credentialVersion),
  );
  if (
    extractionPromptVersions.size !== 1 ||
    credentialVersions.size !== 1 ||
    !credentialVersions.has(runtime.provider.credentialVersion)
  ) {
    throw new Error("Capsules do not share the frozen AI configuration");
  }
  const synthesized = await synthesizeHierarchically({
    model: resolveModel(runtime.provider),
    systemPrompt: runtime.prompt.text,
    questions: runtime.questions,
    capsules,
  });
  const coordinator = runtime.sources.find(
    (source) =>
      source.repository.toLowerCase() ===
      context.repository.fullName.toLowerCase(),
  );
  if (!coordinator) {
    throw new Error("Coordinator repository is not in the frozen source set");
  }
  const report = reportSchema.parse({
    schemaVersion: "3",
    workspaceId,
    requestId,
    coordinatorConnectionId: coordinator.connectionId,
    run: {
      id: context.run.id,
      attempt: 1,
      event: "workflow_dispatch",
      ref: context.run.ref,
      headSha: context.run.headSha,
      workflowRef: context.run.workflowRef,
    },
    agent: {
      provider: runtime.provider.adapterKey,
      model: runtime.provider.modelId,
      actionVersion: ACTION_VERSION,
      extractionPromptVersion: [...extractionPromptVersions][0],
      synthesisPromptVersion: runtime.prompt.version,
      credentialVersion: runtime.provider.credentialVersion,
    },
    ...synthesized.report,
    sources: capsules.map((capsule) => ({
      connectionId: capsule.source.connectionId,
      repository: capsule.source.repository,
      ref: capsule.source.ref,
      headSha: capsule.source.headSha,
      summary: capsule.summary,
      warnings: capsule.warnings,
    })),
  });
  const delivered = await uploadReport(loopaApiBase(), report);
  core.setOutput("report-id", delivered.reportId);
  core.setOutput("proposal-count", report.proposals.length.toString());
  core.setOutput("request-id", runtime.requestId);
  core.setOutput("status", delivered.status);
  core.info(`Loopa accepted report ${delivered.reportId}.`);
}

function assertRun(attempt: number, event: string): void {
  if (attempt !== 1 || event !== "workflow_dispatch") {
    throw new Error(
      "Loopa analysis requires the original administrator-dispatched workflow run",
    );
  }
}

function requiredInput(name: string): string {
  const value = core.getInput(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredWorkspace(): string {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error("GITHUB_WORKSPACE is required");
  return workspace;
}

function loopaApiBase(): string {
  return core.getInput("loopa-api-url") || "https://api.getloopa.co";
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
