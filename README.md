# Loopa Workspace Analysis

Loopa analyzes a frozen workspace of 1–50 GitHub repositories from an
administrator-created SaaS run. The customer coordinator contains only a
required `request_id` input and a call to this reusable workflow at an immutable
commit.

The reusable workflow is independent from deployment workflows and runs on
standard GitHub-hosted runners:

- `prepare` verifies GitHub OIDC and emits the frozen source matrix.
- `extract` runs with `max-parallel: 2`, creates one source-scoped reader App
  token per checkout, applies the centralized readable-path policy, calls the
  customer’s LLM provider directly, and emits a signed capsule of at most
  64 KiB.
- `synthesize` requires every signed capsule, reduces deterministic batches of
  at most 512 KiB sequentially, performs a final synthesis capped at 1 MiB, and
  returns structured question answers, proposals, exact repository identities,
  evidence, warnings, and aggregate usage.

Prompts, questions, policies, model selection, provider options, and credential
version are frozen by Loopa before dispatch. A healthy customer-managed provider
credential is decrypted only after OIDC verification, masked immediately, and
kept only in Action process memory. Loopa-managed credentials are never sent to
GitHub. The backend exposes no inference gateway.

The customer-owned reader GitHub App has `Contents: read` and is installed only
on selected repositories. Its client ID and private key remain in the
coordinator’s GitHub variable and secret.

Public repositories use standard GitHub-hosted runners without minute charges.
Private repositories consume the owner’s GitHub Actions minutes and artifact
storage. GitHub Free currently includes 2,000 private-repository minutes per
month.

Use **Loopa → Admin → Integrations → GitHub** to download the caller workflow,
manifest, and installation guide. See [SECURITY.md](SECURITY.md) to report
security issues.
