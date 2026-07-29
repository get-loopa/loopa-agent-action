import { afterEach, describe, expect, it } from "vitest";
import { githubRunContext } from "../src/github-context.js";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("githubRunContext", () => {
  it("uses only the original workflow-dispatch identity", async () => {
    process.env.GITHUB_EVENT_NAME = "workflow_dispatch";
    process.env.GITHUB_REPOSITORY_ID = "123";
    process.env.GITHUB_REPOSITORY = "get-loopa/backend";
    process.env.GITHUB_RUN_ID = "456";
    process.env.GITHUB_RUN_ATTEMPT = "1";
    process.env.GITHUB_SHA = "a".repeat(40);
    process.env.GITHUB_REF = "refs/heads/main";
    process.env.GITHUB_WORKFLOW_REF =
      "get-loopa/backend/.github/workflows/loopa-workspace-analysis.yml@refs/heads/main";
    expect(await githubRunContext()).toEqual({
      repository: { id: "123", fullName: "get-loopa/backend" },
      run: {
        id: "456",
        attempt: 1,
        event: "workflow_dispatch",
        ref: "refs/heads/main",
        headSha: "a".repeat(40),
        workflowRef:
          "get-loopa/backend/.github/workflows/loopa-workspace-analysis.yml@refs/heads/main",
      },
    });
  });
});
