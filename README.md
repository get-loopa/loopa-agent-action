# Loopa Agent Action

Analyze repository changes with a customer-selected LLM provider and send a structured, reviewable report to Loopa. Repository contents are read inside GitHub Actions; the provider key remains in GitHub Secrets and is never sent to Loopa.

The recommended installation path is the generated setup download in **Loopa → Admin → Integrations → GitHub**. It creates a workflow pinned to an immutable release SHA and a `.github/loopa.yml` analysis configuration.

## Supported providers

OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Fireworks, and OpenAI-compatible APIs.

## Security model

- GitHub OIDC authenticates report delivery; no Loopa API key is stored in GitHub.
- The model receives only bounded list, read, search, and diff tools.
- Mandatory credential, binary, dependency, and generated-file exclusions cannot be disabled.
- Reports contain generated proposals and evidence references, not repository source blobs.
- The Action does not receive existing Loopa documents.

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
