import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scanRepo.js";

describe("scanRepo", () => {
  it("detects next.js/tailwind/pnpm stack", async () => {
    const repoRoot = path.resolve("tests/fixtures/next-tailwind");
    const facts = await scanRepo(repoRoot);

    const ids = facts.frameworks.map((framework) => framework.id);
    expect(ids).toContain("nextjs");
    expect(ids).toContain("react");
    expect(ids).toContain("tailwind");

    const managers = facts.packageManagers.map((manager) => manager.id);
    expect(managers).toContain("pnpm");

    expect(facts.readiness.score).toBeGreaterThan(0);
  });

  it("detects python project basics", async () => {
    const repoRoot = path.resolve("tests/fixtures/fastapi");
    const facts = await scanRepo(repoRoot);

    expect(facts.languages).toContain("Python");
    expect(facts.packageManagers.map((manager) => manager.id)).toContain("pip");
  });
});
