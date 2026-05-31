import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scanRepo.js";

describe("scanRepo", () => {
  it("detects next.js/tailwind/pnpm stack for a real next fixture repo", async () => {
    const repoRoot = path.resolve("tests/fixtures/next-tailwind");
    const facts = await scanRepo(repoRoot);

    const ids = facts.frameworks.map((framework) => framework.id);
    expect(ids).toContain("nextjs");
    expect(ids).toContain("react");
    expect(ids).toContain("tailwind");

    const managers = facts.packageManagers.map((manager) => manager.id);
    expect(managers).toContain("pnpm");
    expect(facts.frameworks[0]?.evidence[0]).toMatchObject({
      path: expect.any(String),
      scope: expect.any(String),
      reason: expect.any(String)
    });

    expect(facts.readiness.score).toBeGreaterThan(0);
  });

  it("detects python project basics", async () => {
    const repoRoot = path.resolve("tests/fixtures/fastapi");
    const facts = await scanRepo(repoRoot);

    expect(facts.languages).toContain("Python");
    expect(facts.packageManagers.map((manager) => manager.id)).toContain("pip");
  });

  it("keeps fixture-only stacks out of primary facts while preserving them as secondary facts", async () => {
    const repoRoot = path.resolve("tests/fixtures/mixed-repo");
    const facts = await scanRepo(repoRoot);

    const primaryFrameworkIds = facts.frameworks.map((framework) => framework.id);
    expect(primaryFrameworkIds).not.toContain("react");
    expect(primaryFrameworkIds).not.toContain("nextjs");
    expect(primaryFrameworkIds).not.toContain("tailwind");
    expect(primaryFrameworkIds).not.toContain("fastapi");
    expect(primaryFrameworkIds).toContain("typescript");

    expect(facts.languages).toContain("TypeScript");
    expect(facts.languages).not.toContain("Python");

    const primaryFacts = facts.primaryFacts;
    expect(primaryFacts).toBeDefined();
    expect(primaryFacts?.projectTypes.map((projectType) => projectType.id)).toEqual(
      expect.arrayContaining(["cli", "package"])
    );
    expect(primaryFacts?.buildTools.map((tool) => tool.id)).toContain("tsup");
    expect(primaryFacts?.testTools.map((tool) => tool.id)).toContain("vitest");

    const commandRoles = new Map((primaryFacts?.commands ?? []).map((command) => [command.name, command.role]));
    expect(commandRoles.get("build")).toBe("build");
    expect(commandRoles.get("dev")).toBe("dev");
    expect(commandRoles.get("test")).toBe("test");
    expect(commandRoles.get("typecheck")).toBe("typecheck");
    expect(commandRoles.get("prepack")).toBe("prepack");
    expect(commandRoles.get("prepublishOnly")).toBe("prepublish");

    const buildCommand = primaryFacts?.commands.find((command) => command.name === "build");
    expect(buildCommand?.evidence[0]).toMatchObject({
      path: "package.json",
      scope: "root"
    });

    const secondaryFacts = facts.secondaryFacts;
    expect(secondaryFacts).toBeDefined();
    const secondaryFrameworkIds = secondaryFacts?.frameworks.map((framework) => framework.id) ?? [];
    expect(secondaryFrameworkIds).toEqual(expect.arrayContaining(["react", "nextjs", "tailwind", "fastapi", "pytest"]));
    const secondaryLanguages = secondaryFacts?.languages.map((language) => language.id) ?? [];
    expect(secondaryLanguages).toContain("Python");

    const fixtureNext = secondaryFacts?.frameworks.find((framework) => framework.id === "nextjs");
    expect(fixtureNext?.evidence[0]).toMatchObject({
      path: expect.stringContaining("tests/fixtures/next-tailwind"),
      scope: "fixture",
      reason: expect.any(String)
    });
  });
});
