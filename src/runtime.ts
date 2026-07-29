import * as core from "@actions/core";
import {
  extractRuntimeSchema,
  prepareRuntimeSchema,
  synthesizeRuntimeSchema,
} from "./contracts.js";
import type { GithubRunContext } from "./github-context.js";

const ACTION_VERSION = "3.0.0";
const MAX_RUNTIME_BYTES = 256 * 1024;

export async function prepareRuntime(input: RuntimeInput) {
  return prepareRuntimeSchema.parse(
    await requestRuntime({ ...input, phase: "prepare" }),
  );
}

export async function extractRuntime(
  input: RuntimeInput & { sourceConnectionId: string },
) {
  const response = extractRuntimeSchema.parse(
    await requestRuntime({ ...input, phase: "extract" }),
  );
  core.setSecret(response.provider.credential);
  core.setSecret(response.capsuleSigningKey);
  return response;
}

export async function synthesizeRuntime(input: RuntimeInput) {
  const response = synthesizeRuntimeSchema.parse(
    await requestRuntime({ ...input, phase: "synthesize" }),
  );
  core.setSecret(response.provider.credential);
  core.setSecret(response.capsuleSigningKey);
  return response;
}

type RuntimeInput = {
  apiBase: string;
  workspaceId: string;
  requestId: string;
  context: GithubRunContext;
};

async function requestRuntime(
  input: RuntimeInput & {
    phase: "prepare" | "extract" | "synthesize";
    sourceConnectionId?: string;
  },
): Promise<unknown> {
  const base = validatedBase(input.apiBase);
  const audience = new URL("/github-actions", base)
    .toString()
    .replace(/\/$/, "");
  const body = JSON.stringify({
    version: "3",
    workspaceId: input.workspaceId,
    requestId: input.requestId,
    phase: input.phase,
    ...(input.sourceConnectionId
      ? { sourceConnectionId: input.sourceConnectionId }
      : {}),
    run: {
      id: input.context.run.id,
      attempt: input.context.run.attempt,
    },
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const oidcToken = await core.getIDToken(audience);
    core.setSecret(oidcToken);
    const response = await fetch(new URL("/api/github/actions/runtime", base), {
      method: "POST",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "content-type": "application/json",
        "user-agent": `loopa-agent-action/${ACTION_VERSION}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const source = await response.text();
    if (Buffer.byteLength(source) > MAX_RUNTIME_BYTES) {
      throw new Error("Loopa runtime response exceeded 256 KiB");
    }
    if (response.ok) return JSON.parse(source);
    const retryable =
      input.phase === "prepare" &&
      [401, 409, 425, 503].includes(response.status);
    if (!retryable || attempt === 5) {
      throw new Error(
        `Loopa runtime authorization failed (${response.status})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new Error("Loopa runtime authorization failed");
}

function validatedBase(value: string): URL {
  const base = new URL(value);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("loopa-api-url must use HTTPS");
  }
  return base;
}
