import { describe, expect, it } from "vitest";
import { createCliProgram } from "../../src/cli.js";

describe("search CLI registration", () => {
  it("registers naar search with include-installed option", () => {
    const program = createCliProgram();
    const command = program.commands.find((item) => item.name() === "search");

    expect(command).toBeTruthy();
    expect(command?.aliases()).toContain("s");
    expect(command?.description()).toBe("Search provider catalogs for skills");
    expect(command?.helpInformation()).toContain("--include-installed");
    expect(command?.helpInformation()).toContain("--install");
  });

  it("exposes the s alias on the main program", () => {
    const program = createCliProgram();
    const alias = program.commands.find((item) => item.aliases().includes("s"));

    expect(alias?.name()).toBe("search");
    expect(alias?.usage()).toContain("<query...>");
  });
});
