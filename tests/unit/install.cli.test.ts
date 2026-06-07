import { describe, expect, it } from "vitest";
import { createCliProgram } from "../../src/program.js";

describe("install CLI registration", () => {
  it("registers install with positional refs and reinstall option", () => {
    const program = createCliProgram();
    const command = program.commands.find((item) => item.name() === "install");
    const help = command?.helpInformation() ?? "";

    expect(command).toBeTruthy();
    expect(command?.usage()).toContain("[refs...]");
    expect(command?.description()).toBe("Install explicit provider skill refs with preview and confirmation");
    expect(help).toContain("--reinstall");
    expect(help).not.toContain("--from");
    expect(help).not.toContain("--from-plan");
  });
});
