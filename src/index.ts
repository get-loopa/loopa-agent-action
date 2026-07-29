import * as core from '@actions/core';
import { analyzeRepository, PROMPT_VERSION } from './agent.js';
import { loadConfig } from './config.js';
import { reportSchema } from './contracts.js';
import { githubRunContext } from './github-context.js';
import { bootstrapGateway } from './gateway.js';
import { resolveModel } from './provider.js';
import { fetchAnalysisPolicy } from './policy.js';
import { RepositoryReader } from './repository.js';
import { uploadReport } from './upload.js';

const ACTION_VERSION = '1.3.0';

async function run(): Promise<void> {
  const apiKey = core.getInput('llm-api-key');
  if (apiKey) core.setSecret(apiKey);
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error('GITHUB_WORKSPACE is required');
  const connectionId = core.getInput('connection-id', { required: true });
  const providerInput = core.getInput('provider');
  const modelId = core.getInput('model');
  const config = await loadConfig(
    workspace,
    core.getInput('config-path') || '.github/loopa.yml',
  );
  const context = await githubRunContext();
  const loopaApiUrl =
    core.getInput('loopa-api-url') || 'https://api.getloopa.co';
  const gateway = apiKey
    ? null
    : await bootstrapGateway({
        apiBase: loopaApiUrl,
        connectionId,
        context,
      });
  const policyResult = gateway
    ? { policy: gateway.policy }
    : await fetchAnalysisPolicy({
        apiBase: loopaApiUrl,
        connectionId,
        context,
      });
  if (policyResult.warning) core.warning(policyResult.warning);
  const resolved = gateway
    ? {
        provider: gateway.provider,
        model: gateway.languageModel,
        modelId: gateway.model,
      }
    : {
        ...resolveModel({
          provider: providerInput,
          model: modelId,
          apiKey,
          baseUrl: core.getInput('base-url') || undefined,
          azureEndpoint: core.getInput('azure-endpoint') || undefined,
          azureApiVersion: core.getInput('azure-api-version') || undefined,
        }),
        modelId,
      };
  const reader = new RepositoryReader(workspace, config);
  const analyzed = await analyzeRepository({
    model: resolved.model,
    reader,
    config,
    context,
    policy: policyResult.policy,
  });
  const report = reportSchema.parse({
    schemaVersion: '1',
    connectionId,
    ...context,
    agent: {
      provider: resolved.provider,
      model: resolved.modelId,
      ...(gateway ? { inferenceSessionId: gateway.sessionId } : {}),
      actionVersion: ACTION_VERSION,
      promptVersion: PROMPT_VERSION,
      ...(policyResult.policy
        ? { policyVersion: policyResult.policy.policyVersion }
        : {}),
    },
    ...analyzed.report,
    warnings: [
      ...(policyResult.warning ? [policyResult.warning] : []),
      ...analyzed.report.warnings,
    ].slice(0, 50),
    usage: analyzed.usage,
  });
  const delivered = await uploadReport(
    loopaApiUrl,
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
