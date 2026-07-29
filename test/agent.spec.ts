import { describe, expect, it } from "vitest";
import { createToolBudget } from "../src/agent.js";

describe("repository tool budget", () => {
  it("rejects work after the frozen limit", async () => {
    const budget = createToolBudget(1);
    await expect(budget.run(() => "ok")).resolves.toBe("ok");
    await expect(budget.run(() => "no")).rejects.toThrow(
      "tool-call limit reached",
    );
    expect(budget.exhausted()).toBe(true);
  });
});
