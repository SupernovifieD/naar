import { describe, expect, it } from "vitest";
import { classifyPathScope } from "../../src/scanner/scope.js";

describe("classifyPathScope", () => {
  it("classifies supported scopes deterministically", () => {
    expect(classifyPathScope("package.json")).toBe("root");
    expect(classifyPathScope("src/cli.ts")).toBe("src");
    expect(classifyPathScope("tests/unit/foo.test.ts")).toBe("test");
    expect(classifyPathScope("tests/fixtures/next-tailwind/package.json")).toBe("fixture");
    expect(classifyPathScope("examples/react-app/package.json")).toBe("example");
    expect(classifyPathScope("docs/usage.md")).toBe("docs");
    expect(classifyPathScope("dist/index.js")).toBe("generated");
    expect(classifyPathScope("node_modules/react/index.js")).toBe("vendor");
  });

  it("keeps AGENTS.md as root scope", () => {
    expect(classifyPathScope("AGENTS.md")).toBe("root");
  });
});
