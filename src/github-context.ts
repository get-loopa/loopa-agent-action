export type GithubRunContext = {
  repository: { id: string; fullName: string };
  run: {
    id: string;
    attempt: number;
    event: string;
    ref: string;
    headSha: string;
    baseSha?: string;
    workflowRef: string;
  };
};

export async function githubRunContext(): Promise<GithubRunContext> {
  return {
    repository: {
      id: process.env.GITHUB_REPOSITORY_ID ?? "",
      fullName: process.env.GITHUB_REPOSITORY ?? "",
    },
    run: {
      id: process.env.GITHUB_RUN_ID ?? "",
      attempt: Number.parseInt(process.env.GITHUB_RUN_ATTEMPT ?? "1", 10),
      event: process.env.GITHUB_EVENT_NAME ?? "",
      ref: process.env.GITHUB_REF ?? "",
      headSha: process.env.GITHUB_SHA ?? "",
      workflowRef: process.env.GITHUB_WORKFLOW_REF ?? "",
    },
  };
}
