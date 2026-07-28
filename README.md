# Loopa Agent Action

Analyze repository changes with a customer-selected LLM provider and send a structured, reviewable report to Loopa. Repository contents are read inside GitHub Actions; the provider key remains in GitHub Secrets and is never sent to Loopa.

The recommended installation path is the generated setup download in **Loopa → Admin → Integrations → GitHub**. It creates a workflow pinned to an immutable release SHA and a `.github/loopa.yml` analysis configuration.

## Supported providers

OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Fireworks, OpenCode Go, and OpenAI-compatible APIs.

OpenCode Go uses the official `https://opencode.ai/zen/go/v1` endpoint. Set
`provider: opencode-go`, use one of the supported raw model IDs, and provide the
organization's OpenCode Go key through a GitHub Actions secret such as
`OPENCODE_GO_API_KEY`. Loopa never receives that secret. The Action selects the
documented OpenAI-compatible or Anthropic-compatible wire format for the model;
both formats remain reported as the `opencode-go` provider.

## Security model

- GitHub OIDC authenticates report delivery; no Loopa API key is stored in GitHub.
- The model receives only bounded list, read, search, and diff tools.
- Client-specific analysis guidance is fetched from Loopa with GitHub OIDC. It
  cannot override the bundled security prompt, tools, repository read limits, or
  output schema.
- Policy retrieval falls back to the checked-in `.github/loopa.yml` tasks when
  Loopa is unavailable or returns an invalid policy.
- Mandatory credential, binary, dependency, and generated-file exclusions cannot be disabled.
- Reports contain generated proposals and evidence references, not repository source blobs.
- The Action does not receive existing Loopa documents.

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
