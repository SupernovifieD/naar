import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scanRepo.js";

function ids<T extends { id: string }>(values: T[]): string[] {
  return values.map((value) => value.id);
}

describe("scanRepo ecosystem coverage", () => {
  it("detects Next.js + Tailwind stack in primary scope", async () => {
    const facts = await scanRepo(path.resolve("tests/fixtures/next-tailwind"));

    expect(ids(facts.frameworks)).toEqual(expect.arrayContaining(["nextjs", "react", "tailwind"]));
    expect(ids(facts.packageManagers)).toContain("pnpm");
    expect(ids(facts.primaryFacts?.projectTypes ?? [])).toContain("web-app");
    expect(facts.frameworks[0]?.evidence[0]).toMatchObject({
      path: expect.any(String),
      scope: expect.any(String),
      reason: expect.any(String),
      exists: true
    });
  });

  it("covers JS/TS app, API, CLI, and monorepo fixtures", async () => {
    const viteFacts = await scanRepo(path.resolve("tests/fixtures/vite-react"));
    expect(ids(viteFacts.frameworks)).toEqual(expect.arrayContaining(["react", "tailwind"]));
    expect(ids(viteFacts.primaryFacts?.buildTools ?? [])).toEqual(expect.arrayContaining(["vite", "eslint", "tsc"]));
    expect(ids(viteFacts.primaryFacts?.testTools ?? [])).toContain("vitest");

    const expressFacts = await scanRepo(path.resolve("tests/fixtures/express-api"));
    expect(ids(expressFacts.frameworks)).toEqual(expect.arrayContaining(["express", "prisma", "jest"]));
    expect(ids(expressFacts.primaryFacts?.projectTypes ?? [])).toContain("api");
    expect((expressFacts.primaryFacts?.commands ?? []).map((command) => command.name)).toContain("dev");

    const nestFacts = await scanRepo(path.resolve("tests/fixtures/nestjs-api"));
    expect(ids(nestFacts.frameworks)).toContain("nestjs");

    const cliFacts = await scanRepo(path.resolve("tests/fixtures/ts-cli-package"));
    expect(ids(cliFacts.primaryFacts?.projectTypes ?? [])).toEqual(expect.arrayContaining(["cli", "package"]));
    const commandRoles = new Map((cliFacts.primaryFacts?.commands ?? []).map((command) => [command.name, command.role]));
    expect(commandRoles.get("prepack")).toBe("prepack");
    expect(commandRoles.get("typecheck")).toBe("typecheck");
    expect(commandRoles.get("test")).toBe("test");

    const monorepoFacts = await scanRepo(path.resolve("tests/fixtures/js-monorepo"));
    expect(ids(monorepoFacts.primaryFacts?.projectTypes ?? [])).toContain("monorepo");
    expect(ids(monorepoFacts.frameworks)).toEqual(expect.arrayContaining(["nextjs", "fastify"]));
    expect(ids(monorepoFacts.primaryFacts?.buildTools ?? [])).toContain("turborepo");
  });

  it("covers Python ecosystem package managers, frameworks, and tools", async () => {
    const fastapiFacts = await scanRepo(path.resolve("tests/fixtures/fastapi"));
    expect(fastapiFacts.languages).toContain("Python");
    expect(ids(fastapiFacts.packageManagers)).toContain("pip");
    expect(ids(fastapiFacts.frameworks)).toContain("fastapi");

    const djangoFacts = await scanRepo(path.resolve("tests/fixtures/django-app"));
    expect(ids(djangoFacts.frameworks)).toContain("django");
    expect(ids(djangoFacts.primaryFacts?.testTools ?? [])).toContain("pytest");
    expect(ids(djangoFacts.primaryFacts?.buildTools ?? [])).toContain("ruff");

    const flaskFacts = await scanRepo(path.resolve("tests/fixtures/flask-app"));
    expect(ids(flaskFacts.frameworks)).toContain("flask");
    expect(ids(flaskFacts.primaryFacts?.buildTools ?? [])).toEqual(expect.arrayContaining(["black", "mypy"]));

    const toolsFacts = await scanRepo(path.resolve("tests/fixtures/python-tools"));
    expect(ids(toolsFacts.packageManagers)).toEqual(expect.arrayContaining(["uv", "conda", "hatch", "pdm"]));
    expect(ids(toolsFacts.frameworks)).toEqual(expect.arrayContaining(["fastapi", "sqlalchemy", "alembic", "celery", "pandas", "numpy", "scikit-learn"]));
    expect(ids(toolsFacts.primaryFacts?.projectTypes ?? [])).toContain("data-science");
  });

  it("covers Go ecosystem modules, frameworks, tools, and command classification", async () => {
    const goModuleFacts = await scanRepo(path.resolve("tests/fixtures/go-module"));
    expect(goModuleFacts.languages).toContain("Go");
    expect(ids(goModuleFacts.primaryFacts?.projectTypes ?? [])).toContain("package");

    const ginFacts = await scanRepo(path.resolve("tests/fixtures/go-gin-api"));
    expect(ids(ginFacts.frameworks)).toContain("gin");
    expect(ids(ginFacts.primaryFacts?.testTools ?? [])).toContain("testify");
    expect(ids(ginFacts.primaryFacts?.projectTypes ?? [])).toContain("api");

    const cobraFacts = await scanRepo(path.resolve("tests/fixtures/go-cobra-cli"));
    expect(ids(cobraFacts.frameworks)).toContain("cobra");
    expect(ids(cobraFacts.primaryFacts?.projectTypes ?? [])).toContain("cli");

    const makeFacts = await scanRepo(path.resolve("tests/fixtures/go-makefile"));
    expect(ids(makeFacts.primaryFacts?.buildTools ?? [])).toEqual(expect.arrayContaining(["go-build", "golangci-lint", "gofmt"]));
    const commandRoles = new Map((makeFacts.primaryFacts?.commands ?? []).map((command) => [command.name, command.role]));
    expect(commandRoles.get("test")).toBe("test");
    expect(commandRoles.get("build")).toBe("build");
    expect(commandRoles.get("lint")).toBe("lint");
  });

  it("covers PHP ecosystem frameworks, CMS, package manager, and command classification", async () => {
    const laravelFacts = await scanRepo(path.resolve("tests/fixtures/php-laravel"));
    expect(laravelFacts.languages).toContain("PHP");
    expect(ids(laravelFacts.packageManagers)).toContain("composer");
    expect(ids(laravelFacts.frameworks)).toContain("laravel");
    expect(ids(laravelFacts.primaryFacts?.buildTools ?? [])).toEqual(expect.arrayContaining(["phpstan", "php-cs-fixer"]));
    const laravelRoles = new Map((laravelFacts.primaryFacts?.commands ?? []).map((command) => [command.name, command.role]));
    expect(laravelRoles.get("migrate")).toBe("migrate");
    expect(laravelRoles.get("serve")).toBe("start");

    const symfonyFacts = await scanRepo(path.resolve("tests/fixtures/php-symfony"));
    expect(ids(symfonyFacts.frameworks)).toContain("symfony");

    const slimFacts = await scanRepo(path.resolve("tests/fixtures/php-slim-api"));
    expect(ids(slimFacts.frameworks)).toContain("slim");
    expect(ids(slimFacts.primaryFacts?.projectTypes ?? [])).toContain("api");

    const composerLibraryFacts = await scanRepo(path.resolve("tests/fixtures/php-composer-library"));
    expect(ids(composerLibraryFacts.primaryFacts?.projectTypes ?? [])).toEqual(expect.arrayContaining(["package", "library"]));

    const wordpressFacts = await scanRepo(path.resolve("tests/fixtures/php-wordpress"));
    expect(ids(wordpressFacts.frameworks)).toContain("wordpress");
    expect(ids(wordpressFacts.primaryFacts?.projectTypes ?? [])).toContain("cms");
  });

  it("keeps fixture/example/docs/generated/vendor ecosystem signals out of primary facts", async () => {
    const mixedFacts = await scanRepo(path.resolve("tests/fixtures/mixed-repo"));
    expect(ids(mixedFacts.frameworks)).not.toEqual(expect.arrayContaining(["react", "nextjs", "tailwind", "fastapi"]));
    expect(ids(mixedFacts.secondaryFacts?.frameworks ?? [])).toEqual(expect.arrayContaining(["react", "nextjs", "tailwind", "fastapi"]));

    const jsFixtureOnly = await scanRepo(path.resolve("tests/fixtures/js-fixture-only"));
    expect(ids(jsFixtureOnly.frameworks)).not.toEqual(expect.arrayContaining(["react", "nextjs"]));
    expect(ids(jsFixtureOnly.secondaryFacts?.frameworks ?? [])).toEqual(expect.arrayContaining(["react", "nextjs"]));

    const pythonFixtureOnly = await scanRepo(path.resolve("tests/fixtures/python-fixture-only"));
    expect(pythonFixtureOnly.languages).toContain("TypeScript");
    expect(pythonFixtureOnly.languages).not.toContain("Python");
    expect(ids(pythonFixtureOnly.secondaryFacts?.languages ?? [])).toContain("Python");

    const scopePollution = await scanRepo(path.resolve("tests/fixtures/scope-pollution"));
    const secondaryFrameworkIds = ids(scopePollution.secondaryFacts?.frameworks ?? []);
    expect(secondaryFrameworkIds).toEqual(
      expect.arrayContaining(["react", "nextjs", "docusaurus", "fastify", "laravel"])
    );
    expect(ids(scopePollution.frameworks)).not.toEqual(
      expect.arrayContaining(["react", "nextjs", "docusaurus", "fastify", "laravel"])
    );
  });

  it("retains Naar self-scan identity as TS npm cli/package", async () => {
    const facts = await scanRepo(path.resolve("."));

    expect(facts.languages).toContain("TypeScript");
    expect(ids(facts.packageManagers)).toContain("npm");
    expect(ids(facts.primaryFacts?.projectTypes ?? [])).toEqual(expect.arrayContaining(["cli", "package"]));
    expect(ids(facts.primaryFacts?.buildTools ?? [])).toEqual(expect.arrayContaining(["tsup", "tsc"]));
    expect(ids(facts.primaryFacts?.testTools ?? [])).toContain("vitest");
    expect(ids(facts.primaryFacts?.ci ?? [])).toContain("github-actions");
    expect(ids(facts.frameworks)).not.toEqual(expect.arrayContaining(["react", "nextjs", "fastapi", "django", "laravel"]));
  });
});
