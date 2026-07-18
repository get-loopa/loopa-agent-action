import * as core from '@actions/core';
import { analyzeRepository, PROMPT_VERSION } from './agent.js';
import { loadConfig } from './config.js';
import { reportSchema } from './contracts.js';
import { githubRunContext } from './github-context.js';
import { resolveModel } from './provider.js';
import { RepositoryReader } from './repository.js';
import { uploadReport } from './upload.js';

const ACTION_VERSION = '1.0.1';

async function run(): Promise<void> {
  const apiKey = core.getInput('llm-api-key', { required: true });
  core.setSecret(apiKey);
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error('GITHUB_WORKSPACE is required');
  const connectionId = core.getInput('connection-id', { required: true });
  const providerInput = core.getInput('provider', { required: true });
  const modelId = core.getInput('model', { required: true });
  const config = await loadConfig(
    workspace,
    core.getInput('config-path') || '.github/loopa.yml',
  );
  const context = await githubRunContext();
  const resolved = resolveModel({
    provider: providerInput,
    model: modelId,
    apiKey,
    baseUrl: core.getInput('base-url') || undefined,
    azureEndpoint: core.getInput('azure-endpoint') || undefined,
    azureApiVersion: core.getInput('azure-api-version') || undefined,
  });
  const reader = new RepositoryReader(workspace, config);
  const analyzed = await analyzeRepository({
    model: resolved.model,
    reader,
    config,
    context,
  });
  const report = reportSchema.parse({
    schemaVersion: '1',
    connectionId,
    ...context,
    agent: {
      provider: resolved.provider,
      model: modelId,
      actionVersion: ACTION_VERSION,
      promptVersion: PROMPT_VERSION,
    },
    ...analyzed.report,
    usage: analyzed.usage,
  });
  const delivered = await uploadReport(
    core.getInput('loopa-api-url') || 'https://api.getloopa.com',
    report,
  );
  core.setOutput('report-id', delivered.reportId);
  core.setOutput('proposal-count', report.proposals.length.toString());
  core.setOutput('status', delivered.status);
  core.info(
    `Loopa accepted report ${delivered.reportId} with ${report.proposals.length} proposal(s).`,
  );
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
