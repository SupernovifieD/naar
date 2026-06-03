import { describe, expect, it } from "vitest";
import { createCliProgram } from "../../src/cli.js";

describe("search CLI registration", () => {
  it("registers naar search as discovery-only", () => {
    const program = createCliProgram();
    const command = program.commands.find((item) => item.name() === "search");
    const help = command?.helpInformation() ?? "";

    expect(command).toBeTruthy();
    expect(command?.aliases()).toContain("s");
    expect(command?.description()).toBe("Search provider catalogs for skills");
    expect(help).toContain("--include-installed");
    expect(help).not.toContain("--install");
    expect(help).not.toContain("--reinstall");
    expect(help).not.toContain("--apply");
    expect(help).not.toContain("--allow-risky");
    expect(help).toContain("--limit <n>");
    expect(help).toContain("--all");
  });

  it("exposes the s alias on the main program", () => {
    const program = createCliProgram();
    const alias = program.commands.find((item) => item.aliases().includes("s"));

    expect(alias?.name()).toBe("search");
    expect(alias?.usage()).toContain("<query...>");
  });
});
