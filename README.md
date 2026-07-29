# Loopa Agent Action

Analyze repository changes with the organization's AI settings in Loopa and send a structured, reviewable report. Repository tools run inside GitHub Actions, while provider credentials remain encrypted in Loopa and are never sent to the runner.

The recommended installation path is the generated setup download in **Loopa → Admin → Integrations → GitHub**. It creates a workflow pinned to an immutable release SHA and a `.github/loopa.yml` analysis configuration.

## Provider routing

New setups do not configure a provider, model, or LLM secret in GitHub. The
Action authenticates with GitHub OIDC, receives a short-lived run-scoped Loopa
token, and sends bounded model requests through Loopa. Each new run uses the
organization's current structured-output model; a provider change needs no
workflow update.

Legacy workflows that already pass `provider`, `model`, and `llm-api-key`
continue to call OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Fireworks,
OpenCode Go, or an OpenAI-compatible API directly. Regenerate those workflows
from Loopa to move them to credentialless routing.

## Security model

- GitHub OIDC authenticates bootstrap and report delivery; no Loopa or provider
  API key is stored in GitHub.
- Loopa issues an opaque token scoped to one connection, repository, workflow,
  run, and attempt. The token is short-lived, hashed at rest, usage-limited, and
  masked in runner logs.
- Provider credentials are decrypted only in backend memory for the selected
  organization and are never returned by an Action endpoint.
- The model receives only bounded list, read, search, and diff tools.
- Client-specific analysis guidance is fetched from Loopa with GitHub OIDC. It
  cannot override the bundled security prompt, tools, repository read limits, or
  output schema.
- Credentialless runs fail visibly when Loopa or the selected provider is
  unavailable; they never fall back to another credential or provider.
- Mandatory credential, binary, dependency, and generated-file exclusions cannot be disabled.
- Reports contain generated proposals and evidence references, not repository source blobs.
- The Action does not receive existing Loopa documents.

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
